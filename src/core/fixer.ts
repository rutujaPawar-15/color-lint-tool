// src/core/fixer.ts
//
// Rewrites hardcoded colors in CSS/SCSS files into their design tokens. Detection
// mirrors the scanner (same patterns + named-color guard); replacement happens on the
// PostCSS AST so surrounding formatting is preserved and only the exact color span is
// touched. The decision for a color that maps to several valid tokens is delegated to an
// injected resolver, which keeps this module free of I/O and prompting so it is unit-testable.

import postcss from 'postcss';
import scssPostcss from 'postcss-scss';
import chalk from 'chalk';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { SCAN_CONFIG, precededByIdentifierChar } from './constants';
import { TokenMap } from './token-map';

// Context passed to the resolver when a color has more than one valid candidate.
export interface FixContext {
  file: string;
  line: number;
  column: number;
  property: string;
  value: string;      // the hardcoded color, e.g. "#fff"
  lineText: string;   // the full source line the color sits on, for context
  candidates: string[]; // valid token forms for this file, e.g. ["$a", "var(--b)"]
}

// Returns the chosen token, or null to leave the color unchanged. May be async (prompting).
export type AmbiguityResolver = (ctx: FixContext) => string | null | Promise<string | null>;

export interface AppliedFix {
  line: number;
  column: number;
  from: string;
  to: string;
}

export interface UnresolvedColor {
  line: number;
  column: number;
  value: string;
  reason: 'ambiguous' | 'no-valid-form';
}

export interface FixOutcome {
  text: string;
  applied: AppliedFix[];
  unresolved: UnresolvedColor[];
}

export interface FixFileResult extends FixOutcome {
  file: string;
  changed: boolean;
}

// A single color occurrence located within a declaration value.
interface ColorMatch {
  index: number;
  text: string;
}

// Only var(--x) forms are valid in plain CSS; SCSS accepts both $vars and var(--x).
function validForExt(candidate: string, ext: string): boolean {
  if (ext === '.scss') return true;
  return candidate.startsWith('var(');
}

// Finds every color occurrence in a declaration value, applying the same named-color
// guard as the scanner (so "blue" inside "$primary-blue" is ignored) and dropping
// overlapping matches so each span is handled once.
function findColorMatches(value: string): ColorMatch[] {
  const matches: ColorMatch[] = [];

  for (const patternKey in SCAN_CONFIG.patterns) {
    const regex = SCAN_CONFIG.patterns[patternKey as keyof typeof SCAN_CONFIG.patterns];
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(value)) !== null) {
      if (precededByIdentifierChar(value, m.index)) continue;
      matches.push({ index: m.index, text: m[0] });
    }
  }

  // Sort by position and drop any match that overlaps one already kept.
  matches.sort((a, b) => a.index - b.index);
  const deduped: ColorMatch[] = [];
  let end = -1;
  for (const match of matches) {
    if (match.index >= end) {
      deduped.push(match);
      end = match.index + match.text.length;
    }
  }
  return deduped;
}

/**
 * Rewrites `cssText`, replacing hardcoded colors with tokens from `tokenMap`. Colors with
 * exactly one valid token for `ext` are replaced automatically; colors with several valid
 * tokens are passed to `resolve`; colors with no valid token are recorded as unresolved.
 * Pure of file I/O — returns the new text and what happened.
 */
export async function applyFixes(
  cssText: string,
  ext: string,
  tokenMap: TokenMap,
  resolve: AmbiguityResolver,
  file = '<input>',
): Promise<FixOutcome> {
  const applied: AppliedFix[] = [];
  const unresolved: UnresolvedColor[] = [];
  const sourceLines = cssText.split('\n');

  let root;
  try {
    root = postcss().process(cssText, { syntax: scssPostcss }).root;
  } catch {
    // Mirror the scanner/token-map resilience: a file that fails to parse is left
    // untouched rather than aborting the whole run.
    return { text: cssText, applied, unresolved };
  }

  // walkDecls does not support async callbacks, so gather the declarations first and
  // process them sequentially (the resolver may await user input).
  const decls: postcss.Declaration[] = [];
  root.walkDecls((decl) => { decls.push(decl); });

  for (const decl of decls) {
    const line = decl.source?.start?.line ?? 0;
    // Column of the declaration's value, so each match's column can be offset from here.
    const between = decl.raws.between ?? ': ';
    const valueColumn = (decl.source?.start?.column ?? 1) + decl.prop.length + between.length;
    const lineText = sourceLines[line - 1] ?? '';

    const matches = findColorMatches(decl.value);
    if (matches.length === 0) continue;

    let rebuilt = '';
    let last = 0;

    for (const match of matches) {
      rebuilt += decl.value.slice(last, match.index);
      last = match.index + match.text.length;

      // Per-occurrence column: value start + the match's offset within the value.
      const column = valueColumn + match.index;

      const allCandidates = tokenMap.getSuggestions(match.text);
      const candidates = allCandidates.filter((c) => validForExt(c, ext));

      if (candidates.length === 0) {
        // No token at all is silently left alone; a token that exists but is the wrong
        // form for this file is reported so the developer knows a fix was possible.
        if (allCandidates.length > 0) {
          unresolved.push({ line, column, value: match.text, reason: 'no-valid-form' });
        }
        rebuilt += match.text;
        continue;
      }

      let chosen: string | null;
      if (candidates.length === 1) {
        chosen = candidates[0];
      } else {
        chosen = await resolve({
          file, line, column, property: decl.prop, value: match.text, lineText, candidates,
        });
      }

      if (chosen) {
        applied.push({ line, column, from: match.text, to: chosen });
        rebuilt += chosen;
      } else {
        unresolved.push({ line, column, value: match.text, reason: 'ambiguous' });
        rebuilt += match.text;
      }
    }

    rebuilt += decl.value.slice(last);
    if (rebuilt !== decl.value) decl.value = rebuilt;
  }

  return { text: root.toString(), applied, unresolved };
}

/**
 * Reads a CSS/SCSS file, applies fixes, and (unless dryRun) writes it back in place.
 */
export async function fixFile(
  filePath: string,
  tokenMap: TokenMap,
  resolve: AmbiguityResolver,
  opts: { dryRun?: boolean } = {},
): Promise<FixFileResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    const outcome = await applyFixes(content, ext, tokenMap, resolve, filePath);

    const changed = outcome.applied.length > 0 && outcome.text !== content;
    if (changed && !opts.dryRun) {
      await fs.writeFile(filePath, outcome.text, 'utf-8');
    }

    return { file: filePath, changed, ...outcome };
  } catch (error: any) {
    // Keep one bad file from aborting the whole run (matches scanner.ts behavior).
    console.error(chalk.red(`Fixer Error: Failed to fix ${filePath}`));
    console.error(chalk.dim(`Details: ${error.message}`));
    return { file: filePath, changed: false, text: '', applied: [], unresolved: [] };
  }
}
