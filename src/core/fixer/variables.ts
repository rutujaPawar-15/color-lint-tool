import * as fs from 'node:fs/promises';

// Matches a variable DEFINITION at a declaration position: a SCSS `$name:` or a
// CSS custom property `--name:`, optionally preceded by whitespace/`{`/`;`. The
// leading boundary avoids matching a usage like `color: $x` (where `$x` follows a
// colon rather than starting a declaration).
const VARIABLE_DEFINITION_RE = /(?:^|[\s{;])(\$[\w-]+|--[\w-]+)\s*:/gm;

// Extracts the names of variables DEFINED in a stylesheet's text
// (e.g. "$color-red", "--spacing"), ignoring usages.
export function extractDefinedVariables(content: string): string[] {
  const names: string[] = [];
  let match;
  VARIABLE_DEFINITION_RE.lastIndex = 0;
  while ((match = VARIABLE_DEFINITION_RE.exec(content)) !== null) {
    names.push(match[1]);
  }
  return names;
}

// Reads each sourceOfTruth file and returns the union of variable names defined
// across them. Missing/unreadable files are skipped silently — they are advisory
// (used only to warn), not required for --fix to function.
export async function loadDefinedVariables(paths: string[]): Promise<Set<string>> {
  const defined = new Set<string>();
  for (const p of paths) {
    let content: string;
    try {
      content = await fs.readFile(p, 'utf-8');
    } catch {
      continue; // file missing or unreadable — skip
    }
    for (const name of extractDefinedVariables(content)) {
      defined.add(name);
    }
  }
  return defined;
}
