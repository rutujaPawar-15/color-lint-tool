import path from 'node:path';
import scssPostcss from 'postcss-scss';
import { SCAN_CONFIG } from './constants';
import { ColorViolation } from './types';
import { findColorsInValue } from './scanner';
import { TokenMap, suggestVariable } from './variables';

// A violation plus the absolute offset of its color text in the file content.
export interface ColorOccurrence extends ColorViolation {
  offset: number;
}

export interface ParsedFile {
  file: string;
  content: string;
  occurrences: ColorOccurrence[]; // in file order
}

// Returned by a ChooseToken to stop the run: this and every later occurrence is left unprocessed.
export const STOP = Symbol('stop');

// Picks one of several candidate tokens for a violation; null (or anything not in
// `candidates`) leaves it unchanged, STOP ends processing. Injected so prompting stays out of the core.
export type ChooseToken = (violation: ColorViolation, candidates: string[]) => Promise<string | null | typeof STOP>;

export interface FixResult {
  content: string;     // with only the replacements decided before any STOP
  replaced: number;
  noMatch: number;     // no token valid for this file type
  skipped: number;     // had candidates, but none was picked
  notProcessed: number; // occurrences from the STOP on; > 0 means the run was stopped
}

// Whether color-lint-fix may edit this file type at all (.ts/.js/.html are never edited).
export function isFixable(file: string): boolean {
  return path.extname(file).toLowerCase() in SCAN_CONFIG.fixableTokenPrefixes;
}

// Parses a CSS/SCSS file and locates every color color-lint would flag in it. Throws,
// naming the file, if it cannot be parsed — callers parse everything before writing anything.
export function parseForFix(file: string, content: string): ParsedFile {
  let root;
  try {
    root = scssPostcss.parse(content, { from: file });
  } catch (err: any) {
    throw new Error(`Could not parse ${file}: ${err.reason || err.message}`);
  }

  const occurrences: ColorOccurrence[] = [];
  root.walkDecls((decl) => {
    const start = decl.source?.start;
    if (start?.offset === undefined) return;
    // The value text starts right after the property name and the `: ` between.
    const valueOffset = start.offset + decl.prop.length + (decl.raws.between ?? '').length;

    for (const match of findColorsInValue(decl.value)) {
      const offset = valueOffset + match.index;
      // decl.value can differ from the raw source (e.g. an inline comment inside the value);
      // only edit where the source text really is the matched color.
      if (content.slice(offset, offset + match.text.length) !== match.text) continue;
      occurrences.push({
        file, line: start.line, column: start.column, property: decl.prop, value: match.text, offset,
      });
    }
  });

  occurrences.sort((a, b) => a.offset - b.offset);
  return { file, content, occurrences };
}

// Replaces each occurrence with its matching token: automatically when exactly one token is
// valid for the file type, via `choose` when several are. Returns the new content and counts.
export async function fixFile(parsed: ParsedFile, tokens: TokenMap, choose: ChooseToken): Promise<FixResult> {
  const prefixes = SCAN_CONFIG.fixableTokenPrefixes[path.extname(parsed.file).toLowerCase()] ?? [];
  const edits: { offset: number; length: number; token: string }[] = [];
  let noMatch = 0;
  let skipped = 0;
  let notProcessed = 0;

  for (const [i, occ] of parsed.occurrences.entries()) {
    const { offset, ...violation } = occ;
    const candidates = suggestVariable(occ.value, tokens).filter(
      // Never rewrite a token's own declaration into a reference to itself.
      (t) => prefixes.some((p) => t.startsWith(p)) && t !== occ.property && t !== `var(${occ.property})`
    );

    if (candidates.length === 0) { noMatch++; continue; }
    const token = candidates.length === 1 ? candidates[0] : await choose(violation, candidates);
    if (token === STOP) { notProcessed = parsed.occurrences.length - i; break; }
    if (token === null || !candidates.includes(token)) { skipped++; continue; }

    edits.push({ offset, length: occ.value.length, token });
  }

  // Apply back to front so earlier offsets stay valid.
  let content = parsed.content;
  for (const e of [...edits].reverse()) {
    content = content.slice(0, e.offset) + e.token + content.slice(e.offset + e.length);
  }
  return { content, replaced: edits.length, noMatch, skipped, notProcessed };
}
