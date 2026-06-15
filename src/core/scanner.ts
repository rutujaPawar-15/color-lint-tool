import postcss from 'postcss';
import scssPostcss from 'postcss-scss';
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

// Scans .ts, .js, .html files line-by-line using regex on raw text.
async function scanTextFile(filePath: string): Promise<ColorViolation[]> {
  const violations: ColorViolation[] = [];
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

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
    console.error(`[Scanner Error] Failed to scan ${filePath}: ${error.message}`);
    return [];
  }
}