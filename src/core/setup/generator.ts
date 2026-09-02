import { detectColorConflicts, type VariableDefinition } from './extractor';

// A developer's choices for conflicting colors: normalizedColor -> the winning
// variable name. A conflict absent from this map is treated as "skip" (the color
// is left out of the generated colorMap so the fixer only flags, never rewrites it).
export type ConflictResolutions = Record<string, string>;

// Builds the `.color-lint-config.json` colorMap by reversing variable definitions
// (name -> color) into the color -> variable form the fixer consumes.
//
// - Unambiguous colors (defined by exactly one variable) map straight through.
// - Conflicting colors (defined by 2+ variables) use the developer's resolution;
//   if there is none, the color is omitted.
export function buildColorMap(
  defs: VariableDefinition[],
  resolutions: ConflictResolutions
): Record<string, string> {
  const conflictColors = new Set(detectColorConflicts(defs).map(c => c.normalizedColor));
  const map: Record<string, string> = {};

  for (const d of defs) {
    if (conflictColors.has(d.normalizedColor)) {
      const winner = resolutions[d.normalizedColor];
      if (winner) {
        map[d.normalizedColor] = winner;
      }
      // else: no resolution -> skip this conflicting color
    } else {
      map[d.normalizedColor] = d.name;
    }
  }

  return map;
}
