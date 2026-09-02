import { normalizeColor } from './normalizer';
import type { ColorLintConfig } from './config';

// A lookup keyed by NORMALIZED color, so different spellings of the same color
// (e.g. "rgb(255, 0, 0)", "#FF0000", "#f00") all resolve to the same variable.
export type ColorLookup = Map<string, string>;

// Pre-normalizes a config's colorMap once, so per-color lookups are O(1) instead
// of re-normalizing every key on every call. Build this once, reuse for all scans.
export function buildColorLookup(config: ColorLintConfig): ColorLookup {
  const lookup: ColorLookup = new Map();
  for (const [key, variable] of Object.entries(config.colorMap)) {
    lookup.set(normalizeColor(key), variable);
  }
  return lookup;
}

// Looks up a variable for a color against a pre-built lookup. O(1).
export function lookupVariable(color: string, lookup: ColorLookup): string | null {
  return lookup.get(normalizeColor(color)) ?? null;
}

// Convenience wrapper: suggests a CSS variable for a single color against a config.
// Builds the lookup on each call — fine for one-off use and tests; hot paths should
// build the lookup once with buildColorLookup() and call lookupVariable() directly.
export function suggestVariable(
  color: string,
  config: ColorLintConfig
): string | null {
  return lookupVariable(color, buildColorLookup(config));
}

// Enriches a list of ColorViolations with suggested variables and missing-variable flags.
export function enrichViolationsWithSuggestions(
  violations: import('../types').ColorViolation[],
  config: ColorLintConfig,
  definedVariables: Set<string> = new Set()
): import('../types').ScanSuggestion[] {
  const lookup = buildColorLookup(config);
  return violations.map(v => {
    const suggestedVariable = lookupVariable(v.value, lookup);
    const variableMissing = suggestedVariable !== null && !definedVariables.has(suggestedVariable);
    return {
      ...v,
      suggestedVariable,
      variableMissing,
    };
  });
}

