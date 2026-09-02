import { normalizeColor } from './normalizer';

// Replaces all occurrences of a color with a variable in text.
// Handles case-insensitive matching and different color formats.
// The color and variable are matched/replaced based on their normalized forms.
export function replaceColorInText(
  text: string,
  color: string,
  variable: string
): string {
  const normalizedColor = normalizeColor(color);
  const colorLower = color.toLowerCase().trim();
  let result = text;

  // Strategy:
  // 1. For rgb/hsl: use a flexible pattern that matches variations (spacing, commas vs slashes)
  // 2. For hex colors: use exact case-insensitive replacement
  // 3. For named colors: use word boundary matching (case-insensitive)

  if (colorLower.startsWith('rgb') || colorLower.startsWith('hsl')) {
    // RGB/HSL: use a flexible pattern
    result = replaceRgbOrHslColor(result, color, normalizedColor, variable);
  } else if (normalizedColor.startsWith('#')) {
    // Hex color: replace case-insensitively
    result = replaceHexColor(result, color, variable);
  } else {
    // Named color: use word boundaries
    result = replaceNamedColor(result, normalizedColor, variable);
  }

  return result;
}

function replaceHexColor(text: string, color: string, variable: string): string {
  // For hex colors, match case-insensitively with a boundary on both sides so a
  // shorter hex is never replaced inside a longer one:
  //   - #ff0000 must NOT match inside #ff0000ff (8-digit)
  //   - #fff must NOT match inside #ffffff
  // The leading (?<![0-9a-fA-F#]) guards against extra hex digits or a stray '#'
  // before the match; the trailing (?![0-9a-fA-F]) guards against more hex digits after.
  const escaped = color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![0-9a-fA-F#])${escaped}(?![0-9a-fA-F])`, 'gi');
  return text.replace(pattern, variable);
}

function replaceNamedColor(text: string, normalizedColor: string, variable: string): string {
  // For named colors, use word boundaries to avoid matching inside longer words.
  // Also avoid matching when preceded/followed by hyphens (e.g., don't match "red" in "$primary-red").
  // e.g., "red" should match "color: red;" but not "$primary-red" or "redacted"
  const escaped = normalizedColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Use lookahead/lookbehind to exclude hyphens
  const pattern = new RegExp(`(?<![-\\w])${escaped}(?![-\\w])`, 'gi');
  return text.replace(pattern, variable);
}

function replaceRgbOrHslColor(
  text: string,
  color: string,
  normalizedColor: string,
  variable: string
): string {
  // For rgb/hsl colors, we need to match variations:
  // - rgb(255, 0, 0) should match rgb(255 0 0)
  // - rgba(255, 0, 0, 1) should match rgba(255, 0, 0, 1.0)
  // etc.
  //
  // Strategy: iterate through the text, normalize each color-like substring,
  // and replace it if it matches the normalized input color.
  // (The caller only routes rgb/hsl inputs here, so no prefix guard is needed.)

  // Build a regex to find color patterns in the text
  const colorPattern = /(?:rgb|hsl)a?\s*\([^)]+\)/gi;
  let result = text;

  const matches = [...text.matchAll(colorPattern)];
  // Iterate in reverse so indices don't shift as we replace
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const foundColor = match[0];
    const normalizedFound = normalizeColor(foundColor);

    if (normalizedFound === normalizedColor) {
      // Replace this occurrence
      const before = result.substring(0, match.index);
      const after = result.substring(match.index + foundColor.length);
      result = before + variable + after;
    }
  }

  return result;
}
