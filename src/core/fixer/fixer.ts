import * as fs from 'node:fs/promises';
import { scanFile } from '../scanner';
import { buildColorLookup, lookupVariable } from './suggester';
import { normalizeColor } from './normalizer';
import { replaceColorInText } from './replacer';
import { loadDefinedVariables } from './variables';
import { findFiles, getChangedFiles } from '../../utils/file-finder';
import type { ColorViolation } from '../types';
import type { ColorLintConfig } from './config';

export type FixMode = 'suggestions-only' | 'dry-run' | 'auto-replace';

export interface FixOptions {
  mode: FixMode;
  changed?: boolean; // if true, only process changed files
}

// Resolves the two CLI booleans into a single FixMode. Per the PRD (§4.3), when
// both --suggestions-only and --dry-run are passed, --dry-run wins; with neither,
// the default is auto-replace.
export function resolveFixMode(suggestionsOnly: boolean, dryRun: boolean): FixMode {
  if (dryRun) return 'dry-run';
  if (suggestionsOnly) return 'suggestions-only';
  return 'auto-replace';
}

export interface Suggestion extends ColorViolation {
  // The design-token variable recommended for this color, or null if unmapped.
  suggestedVariable: string | null;
  // How many OTHER files (excluding this one) contain the same color value.
  // Drives the "Also appears in N other file(s)" impact line in the PRD output.
  impactOtherFiles: number;
  // True when a variable IS suggested but is not defined in any sourceOfTruth
  // file — used to warn the user (PRD §3.2). Always false when unmapped.
  variableMissing: boolean;
}

export interface LineDiff {
  line: number; // 1-based line number
  before: string;
  after: string;
}

export interface Change {
  file: string;
  before: string;
  after: string;
  // Only the lines that actually changed, for a focused preview (PRD §5.2).
  lineDiffs: LineDiff[];
}

// Computes the per-line diff between two versions of a file. Replacement never
// adds or removes lines, so we compare line-by-line at matching indices.
export function computeLineDiffs(before: string, after: string): LineDiff[] {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const diffs: LineDiff[] = [];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < max; i++) {
    const b = beforeLines[i] ?? '';
    const a = afterLines[i] ?? '';
    if (b !== a) {
      diffs.push({ line: i + 1, before: b, after: a });
    }
  }
  return diffs;
}

export interface FixResult {
  mode: FixMode;
  suggestions?: Suggestion[];
  changes?: Change[];
  violationsFound: number;
  violationsReplaced: number;
  violationsSkipped: number;
  filesModified: number;
  errors: Array<{ file: string; error: string }>;
}

export async function fixFiles(
  targetDir: string,
  config: ColorLintConfig,
  options: FixOptions
): Promise<FixResult> {
  // 1. Find files to scan — either the whole tree, or only git-changed files.
  const result: FixResult = {
    mode: options.mode,
    violationsFound: 0,
    violationsReplaced: 0,
    violationsSkipped: 0,
    filesModified: 0,
    errors: [],
  };

  const files = options.changed
    ? await getChangedFiles(targetDir)
    : await findFiles(targetDir);

  // 2. Scan all files for violations. Record (don't swallow) scan failures so
  // an unreadable/unparseable file surfaces instead of vanishing silently.
  const allViolations: ColorViolation[] = [];
  for (const file of files) {
    try {
      const violations = await scanFile(file);
      allViolations.push(...violations);
    } catch (err: any) {
      result.errors.push({ file, error: err.message });
    }
  }

  // 3. Compute cross-file impact: for each normalized color, the set of distinct
  // files it appears in. Used to report "Also appears in N other file(s)".
  const filesByColor = new Map<string, Set<string>>();
  for (const v of allViolations) {
    const key = normalizeColor(v.value);
    if (!filesByColor.has(key)) filesByColor.set(key, new Set());
    filesByColor.get(key)!.add(v.file);
  }

  // 4. Load the set of variables actually defined in the sourceOfTruth files, so
  // we can warn when a suggested variable isn't defined yet (PRD §3.2).
  const definedVariables = await loadDefinedVariables(config.sourceOfTruth);

  // 5. For each violation, suggest a variable and attach impact + missing-var flag.
  // Build the color lookup once, not per-violation.
  const colorLookup = buildColorLookup(config);
  const suggestions: Suggestion[] = allViolations.map(v => {
    const distinctFiles = filesByColor.get(normalizeColor(v.value))!.size;
    const suggestedVariable = lookupVariable(v.value, colorLookup);
    return {
      ...v,
      suggestedVariable,
      // Exclude this file itself → "other" files.
      impactOtherFiles: Math.max(0, distinctFiles - 1),
      variableMissing: suggestedVariable !== null && !definedVariables.has(suggestedVariable),
    };
  });

  // 6. Build a map of files and their violations
  const violationsByFile = new Map<string, Suggestion[]>();
  for (const suggestion of suggestions) {
    if (!violationsByFile.has(suggestion.file)) {
      violationsByFile.set(suggestion.file, []);
    }
    violationsByFile.get(suggestion.file)!.push(suggestion);
  }

  // 7. Based on mode, take action
  result.violationsFound = suggestions.length;

  if (options.mode === 'suggestions-only') {
    result.suggestions = suggestions;
    return result;
  }

  // For dry-run and auto-replace, compute the changes
  const changes: Change[] = [];
  for (const [file, fileSuggestions] of violationsByFile) {
    try {
      const original = await fs.readFile(file, 'utf-8');
      let modified = original;

      for (const suggestion of fileSuggestions) {
        if (suggestion.suggestedVariable) {
          modified = replaceColorInText(modified, suggestion.value, suggestion.suggestedVariable);
          result.violationsReplaced++;
        } else {
          result.violationsSkipped++;
        }
      }

      if (modified !== original) {
        changes.push({
          file,
          before: original,
          after: modified,
          lineDiffs: computeLineDiffs(original, modified),
        });
      }
    } catch (err: any) {
      result.errors.push({ file, error: err.message });
    }
  }

  result.changes = changes;

  // For dry-run, return without writing
  if (options.mode === 'dry-run') {
    return result;
  }

  // For auto-replace, write files
  if (options.mode === 'auto-replace') {
    for (const change of changes) {
      try {
        await fs.writeFile(change.file, change.after, 'utf-8');
        result.filesModified++;
      } catch (err: any) {
        result.errors.push({ file: change.file, error: err.message });
      }
    }
  }

  return result;
}
