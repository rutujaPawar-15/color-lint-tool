import postcss from 'postcss';
import scssPostcss from 'postcss-scss';
import chalk from 'chalk';
import { SCAN_CONFIG } from './constants';
import { ColorViolation } from './types';
import * as fs from 'node:fs/promises';
import path from 'node:path';

// Scans CSS/SCSS/Less files using the PostCSS AST.
async function scanCssFile(filePath: string): Promise<ColorViolation[]> {
  const violations: ColorViolation[] = [];
  const content = await fs.readFile(filePath, 'utf-8');

  const result = await postcss().process(content, {
    from: filePath,
    syntax: scssPostcss,
  });

  result.root.walkDecls((decl) => {
    for (const patternKey in SCAN_CONFIG.patterns) {
      const regex = SCAN_CONFIG.patterns[patternKey as keyof typeof SCAN_CONFIG.patterns];
      regex.lastIndex = 0;

      let match;
      while ((match = regex.exec(decl.value)) !== null) {
        // Guard against false positives for named colors that appear as part of
        // a variable reference, e.g. "blue" inside "$primary-blue".
        // If the character immediately before the match is a word char or hyphen,
        // it's part of a longer token — skip it.
        const charBefore = decl.value[match.index - 1];
        if (charBefore !== undefined && /[-a-zA-Z0-9_$]/.test(charBefore)) continue;

        violations.push({
          file: filePath,
          line: decl.source?.start?.line ?? 0,
          column: decl.source?.start?.column ?? 0,
          property: decl.prop,
          value: match[0],
        });
      }
    }
  });

  return violations;
}

// Tracks the masking state machine as it walks through file content.
type MaskMode = 'code' | 'line' | 'block' | 'html' | 'string';
interface MaskState {
  mode: MaskMode;
  stringChar: string;
}

// Inside a // line comment: blank everything until the newline.
function maskLine(content: string, i: number, state: MaskState, out: string[]): number {
  const ch = content[i];
  if (ch === '\n') {
    state.mode = 'code';
    out.push(ch);
  } else {
    out.push(' ');
  }
  return i + 1;
}

// Inside a /* block comment */: blank everything until the closing */.
function maskBlock(content: string, i: number, state: MaskState, out: string[]): number {
  if (content[i] === '*' && content[i + 1] === '/') {
    state.mode = 'code';
    out.push('  ');
    return i + 2;
  }
  out.push(content[i] === '\n' ? '\n' : ' ');
  return i + 1;
}

// Inside an <!-- html comment -->: blank everything until the closing -->.
function maskHtml(content: string, i: number, state: MaskState, out: string[]): number {
  if (content[i] === '-' && content[i + 1] === '-' && content[i + 2] === '>') {
    state.mode = 'code';
    out.push('   ');
    return i + 3;
  }
  out.push(content[i] === '\n' ? '\n' : ' ');
  return i + 1;
}

// Inside a string literal: keep characters verbatim, honouring escapes, until the
// matching quote closes it. This prevents tokens like "http://..." from being
// misread as the start of a line comment.
function maskString(content: string, i: number, state: MaskState, out: string[]): number {
  const ch = content[i];
  if (ch === '\\') {
    out.push(ch + (content[i + 1] ?? ''));
    return i + 2;
  }
  if (ch === state.stringChar) state.mode = 'code';
  out.push(ch);
  return i + 1;
}

// Normal code: watch for the start of a string or any comment style.
function maskCode(content: string, i: number, state: MaskState, out: string[]): number {
  const ch = content[i];
  const next = content[i + 1];
  if (ch === '"' || ch === "'" || ch === '`') {
    state.mode = 'string';
    state.stringChar = ch;
    out.push(ch);
    return i + 1;
  }
  if (ch === '/' && next === '/') {
    state.mode = 'line';
    out.push('  ');
    return i + 2;
  }
  if (ch === '/' && next === '*') {
    state.mode = 'block';
    out.push('  ');
    return i + 2;
  }
  if (ch === '<' && next === '!' && content[i + 2] === '-' && content[i + 3] === '-') {
    state.mode = 'html';
    out.push('    ');
    return i + 4;
  }
  out.push(ch);
  return i + 1;
}

// Blanks out comment content (// line, /* block */, and <!-- html --> styles) by
// replacing comment characters with spaces. Character positions, newlines and
// overall length are preserved so downstream line/column reporting stays accurate.
// Also returns a per-character map of which positions fall inside a string literal
// (quoted attribute values count too, e.g. style="color: red") — used to keep the
// "named" color pattern from matching bare identifiers like a variable named `red`.
function maskComments(content: string): { masked: string; inString: boolean[] } {
  const handlers: Record<MaskMode, (c: string, i: number, s: MaskState, o: string[]) => number> = {
    code: maskCode,
    line: maskLine,
    block: maskBlock,
    html: maskHtml,
    string: maskString,
  };

  const out: string[] = [];
  const inString: boolean[] = new Array(content.length).fill(false);
  const state: MaskState = { mode: 'code', stringChar: '' };
  let i = 0;
  while (i < content.length) {
    const modeBefore = state.mode;
    const nextI = handlers[state.mode](content, i, state, out);
    for (let k = i; k < nextI; k++) inString[k] = modeBefore === 'string';
    i = nextI;
  }

  return { masked: out.join(''), inString };
}

// Matches a trailing "property:" or "property=" immediately before a color value,
// e.g. "color: " in style="color: red", "bordercolor= " in a TS field assignment, or
// "background: '" in an object literal where the value itself is quoted.
const PROPERTY_CONTEXT_RE = /([a-zA-Z_$][\w-]*)\s*[:=]\s*['"`]?\s*$/;

// Derives a human-readable property label for a text-scanned match by looking at
// what precedes it on the line. Falls back to 'value' when there's no clear
// property-like prefix (e.g. a bare color word in the middle of an expression).
function extractPropertyLabel(line: string, matchIndex: number): string {
  const before = line.slice(0, matchIndex);
  const propMatch = PROPERTY_CONTEXT_RE.exec(before);
  return propMatch ? propMatch[1] : 'value';
}

// Scans .ts, .js, .html files line-by-line using regex on raw text.
async function scanTextFile(filePath: string): Promise<ColorViolation[]> {
  const violations: ColorViolation[] = [];
  const content = await fs.readFile(filePath, 'utf-8');
  // Blank out comments first so colors inside them are not flagged as violations.
  const { masked, inString } = maskComments(content);
  const lines = masked.split('\n');

  let lineStart = 0;
  lines.forEach((line, index) => {
    const lineInString = inString.slice(lineStart, lineStart + line.length);
    lineStart += line.length + 1; // +1 for the '\n' removed by split

    for (const patternKey in SCAN_CONFIG.patterns) {
      const regex = SCAN_CONFIG.patterns[patternKey as keyof typeof SCAN_CONFIG.patterns];
      regex.lastIndex = 0;

      let match;
      while ((match = regex.exec(line)) !== null) {
        // Named colors (red, blue, ...) are common English/identifier words, so only
        // count them as violations when they appear inside a string/attribute value —
        // e.g. style="color: red" — not as a bare identifier like `let red = 5`.
        if (patternKey === 'named') {
          const withinString = lineInString
            .slice(match.index, match.index + match[0].length)
            .every(Boolean);
          if (!withinString) continue;
        }

        violations.push({
          file: filePath,
          line: index + 1,
          column: match.index + 1,
          property: extractPropertyLabel(line, match.index),
          value: match[0],
        });
      }
    }
  });

  return violations;
}

// Main export — picks the right scanning strategy based on file extension.
export async function scanFile(filePath: string): Promise<ColorViolation[]> {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (SCAN_CONFIG.cssLikeExtensions.includes(ext)) {
      return await scanCssFile(filePath);
    }
    return await scanTextFile(filePath);
  } catch (error: any) {
    console.error(chalk.red(`Scanner Error: Failed to scan ${filePath}`));
    console.error(chalk.dim(`Details: ${error.message}`));
    return [];
  }
}