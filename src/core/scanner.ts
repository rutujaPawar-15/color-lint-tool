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
function maskComments(content: string): string {
  const handlers: Record<MaskMode, (c: string, i: number, s: MaskState, o: string[]) => number> = {
    code: maskCode,
    line: maskLine,
    block: maskBlock,
    html: maskHtml,
    string: maskString,
  };

  const out: string[] = [];
  const state: MaskState = { mode: 'code', stringChar: '' };
  let i = 0;
  while (i < content.length) {
    i = handlers[state.mode](content, i, state, out);
  }

  return out.join('');
}

// Scans .ts, .js, .html files line-by-line using regex on raw text.
async function scanTextFile(filePath: string): Promise<ColorViolation[]> {
  const violations: ColorViolation[] = [];
  const content = await fs.readFile(filePath, 'utf-8');
  // Blank out comments first so colors inside them are not flagged as violations.
  const lines = maskComments(content).split('\n');

  lines.forEach((line, index) => {
    for (const patternKey in SCAN_CONFIG.patterns) {
      const regex = SCAN_CONFIG.patterns[patternKey as keyof typeof SCAN_CONFIG.patterns];
      regex.lastIndex = 0;

      let match;
      while ((match = regex.exec(line)) !== null) {
        violations.push({
          file: filePath,
          line: index + 1,
          column: match.index + 1,
          property: 'inline-style',
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