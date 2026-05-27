/**
 * Color detection patterns and logic
 */

export interface ColorFinding {
  type: string;
  color: string;
  line: number;
  column: number;
  lineContent: string;
}

export const COLOR_PATTERNS = {
  // Hex colors: #fff, #ffffff, #AABBCC
  hex3: /#[0-9A-Fa-f]{3}\b/g,
  hex6: /#[0-9A-Fa-f]{6}\b/g,
  hex8: /#[0-9A-Fa-f]{8}\b/g, // With alpha

  // RGB/RGBA: rgb(255, 0, 0), rgba(255, 0, 0, 0.5)
  rgb: /rgba?\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)/gi,

  // HSL/HSLA: hsl(120, 100%, 50%)
  hsl: /hsla?\s*\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(,\s*[\d.]+\s*)?\)/gi,

  // Named colors (subset - add more as needed)
  named: /\b(red|blue|green|white|black|yellow|orange|purple|pink|gray|grey|brown|cyan|magenta|lime|navy|teal|olive|maroon|aqua|silver|gold|indigo|violet|coral|salmon|khaki|crimson|turquoise|lavender|beige|ivory|tan|plum|orchid|peru|sienna|thistle|tomato|wheat)\b/gi // color-lint-disable
};

/**
 * Exceptions - patterns to ignore (CSS variables, etc.)
 */
const IGNORE_PATTERNS: RegExp[] = [
  /var\s*\(.*\)/,           // CSS variables: var(--color)
  /--[\w-]+/,               // CSS custom properties: --primary-color
  /@[\w-]+/,                // SCSS/LESS variables: @primary-color
  /\$[\w-]+/,               // SASS variables: $primary-color
  /url\s*\(/,               // URLs
  /transparent/i,           // transparent keyword is okay
  /currentColor/i,          // currentColor is okay
  /inherit/i                // inherit is okay
];

/**
 * Check if a line should be ignored
 */
function shouldIgnoreLine(line: string): boolean {
  const trimmedLine = line.trim();
  
  // 1. Ignore comments
  if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
    return true;
  }

  // 2. Ignore lines that contain our custom bypass flag
  if (trimmedLine.includes('color-lint-disable')) {
    return true;
  }

  // 3. Check if line contains ignored patterns (CSS variables, etc.)
  return IGNORE_PATTERNS.some(pattern => pattern.test(line));
}

/**
 * Detect hard-coded colors in a line of code
 */
export function detectColors(line: string, lineNumber: number): ColorFinding[] {
  if (shouldIgnoreLine(line)) {
    return [];
  }

  const findings: ColorFinding[] = [];

  // Check each color pattern
  Object.entries(COLOR_PATTERNS).forEach(([type, pattern]) => {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(line)) !== null) {
      const color = match[0];
      const column = match.index;

      // Double-check it's not in an ignored context
      const beforeMatch = line.substring(0, column);
      const isInIgnoredContext = IGNORE_PATTERNS.some(pattern =>
        pattern.test(beforeMatch + color)
      );

      if (!isInIgnoredContext) {
        findings.push({
          type,
          color,
          line: lineNumber,
          column,
          lineContent: line.trim()
        });
      }
    }
  });

  return findings;
}