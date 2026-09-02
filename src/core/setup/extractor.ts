import { normalizeColor } from '../fixer/normalizer';
import { SCAN_CONFIG } from '../constants';

// A single color variable defined in a stylesheet, e.g. `$color-red: #ff0000;`.
export interface VariableDefinition {
  name: string; // "$color-red" or "--brand"
  rawColor: string; // the literal color as written, e.g. "#FF0000" or "rgb(255, 0, 0)"
  normalizedColor: string; // canonical form, e.g. "#ffffff" or "red"
}

// Matches a variable DEFINITION and captures its name and raw value:
//   $name: <value>;   or   --name: <value>;
// The leading boundary avoids matching a usage like `color: $x`. The value is
// everything up to the terminating `;` or `}` (or end of input).
const VARIABLE_DEFINITION_RE = /(?:^|[\s{;])(\$[\w-]+|--[\w-]+)\s*:\s*([^;}]+)/gm;

// Returns true when a value is a literal CSS color (hex, rgb/rgba, hsl/hsla, or a
// known named color). Reuses the scanner's detection patterns so "what counts as a
// color" stays defined in one place.
function isColorValue(value: string): boolean {
  const v = value.trim();
  // Each pattern is a global regex from SCAN_CONFIG; reset lastIndex before testing.
  for (const pattern of [
    SCAN_CONFIG.patterns.hex,
    SCAN_CONFIG.patterns.rgb,
    SCAN_CONFIG.patterns.hsl,
    SCAN_CONFIG.patterns.named,
  ]) {
    pattern.lastIndex = 0;
    const match = pattern.exec(v);
    // Require the whole value to be the color (not a color embedded in a longer
    // expression), so `8px` or `$other-var` are not treated as colors.
    if (match && match[0] === v) {
      return true;
    }
  }
  return false;
}

// A color that is defined by more than one variable — the setup flow must ask the
// developer which variable the fixer should prefer.
export interface ColorConflict {
  normalizedColor: string;
  variables: string[]; // distinct variable names, in first-seen order
}

// Finds colors defined by two or more DISTINCT variables. Repeated (name, color)
// pairs are duplicates, not conflicts, and are ignored.
export function detectColorConflicts(defs: VariableDefinition[]): ColorConflict[] {
  const byColor = new Map<string, string[]>();
  for (const d of defs) {
    if (!byColor.has(d.normalizedColor)) byColor.set(d.normalizedColor, []);
    const names = byColor.get(d.normalizedColor)!;
    if (!names.includes(d.name)) names.push(d.name);
  }

  const conflicts: ColorConflict[] = [];
  for (const [normalizedColor, variables] of byColor) {
    if (variables.length >= 2) {
      conflicts.push({ normalizedColor, variables });
    }
  }
  return conflicts;
}

// Extracts every color-valued variable definition from a stylesheet's text.
// Non-color variables (spacing, fonts, z-index) and variables that reference
// another variable are skipped.
export function extractVariableDefinitions(content: string): VariableDefinition[] {
  const defs: VariableDefinition[] = [];
  VARIABLE_DEFINITION_RE.lastIndex = 0;
  let match;
  while ((match = VARIABLE_DEFINITION_RE.exec(content)) !== null) {
    const name = match[1];
    const rawColor = match[2].trim();
    if (!isColorValue(rawColor)) continue;
    defs.push({ name, rawColor, normalizedColor: normalizeColor(rawColor) });
  }
  return defs;
}
