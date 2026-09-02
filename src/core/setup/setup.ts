import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { discoverVariableFiles } from './discovery';
import { detectColorConflicts } from './extractor';
import { buildColorMap, type ConflictResolutions } from './generator';

// The interactive contract runSetup depends on. The real implementation
// (ReadlinePrompter) wraps node:readline; tests pass a scripted fake. Keeping this
// an injected interface is what makes the whole setup flow unit-testable.
export interface Prompter {
  select(question: string, choices: string[]): Promise<string>;
  confirm(question: string, defaultYes: boolean): Promise<boolean>;
  close(): Promise<void>;
}

// The choice offered (alongside the candidate variables) when a color is defined by
// more than one variable and the developer would rather leave it unmapped.
export const SKIP_CONFLICT = 'Skip (flag this color but do not auto-fix it)';

// Thrown by a Prompter when the developer ends input (EOF / Ctrl+D) mid-flow, so
// the CLI can report a clean cancellation instead of a crash.
export class SetupCancelledError extends Error {
  constructor() {
    super('Setup cancelled by user.');
    this.name = 'SetupCancelledError';
  }
}

const CONFIG_FILENAME = '.color-lint-config.json';

export interface SetupResult {
  status: 'created' | 'aborted' | 'no-variables-found';
  configPath?: string;
  mappingCount?: number;
  skippedConflicts?: number;
}

// Interactively generates a .color-lint-config.json for a project by reading the
// project's OWN variable files and reversing them into color->variable mappings.
// The developer is only asked when there's genuine ambiguity: which file to use
// (if several), whether to overwrite an existing config, and which variable wins
// for a color defined more than once.
export async function runSetup(targetDir: string, prompter: Prompter): Promise<SetupResult> {
  const discovered = await discoverVariableFiles(targetDir);
  if (discovered.length === 0) {
    return { status: 'no-variables-found' };
  }

  // Overwrite guard: never clobber an existing config without consent.
  const configPath = path.join(targetDir, CONFIG_FILENAME);
  if (await fileExists(configPath)) {
    const overwrite = await prompter.confirm(
      `${CONFIG_FILENAME} already exists. Overwrite it?`,
      false
    );
    if (!overwrite) {
      return { status: 'aborted' };
    }
  }

  // Choose the source file: auto-pick when there's only one, otherwise ask.
  let chosen = discovered[0];
  if (discovered.length > 1) {
    const chosenFile = await prompter.select(
      'Which file defines your color variables?',
      discovered.map(d => d.file)
    );
    chosen = discovered.find(d => d.file === chosenFile) ?? chosen;
  }

  // Resolve any color defined by more than one variable.
  const conflicts = detectColorConflicts(chosen.definitions);
  const resolutions: ConflictResolutions = {};
  let skippedConflicts = 0;
  for (const conflict of conflicts) {
    const answer = await prompter.select(
      `${conflict.normalizedColor} is defined by multiple variables. Which should the fixer prefer?`,
      [...conflict.variables, SKIP_CONFLICT]
    );
    if (answer === SKIP_CONFLICT) {
      skippedConflicts++;
    } else {
      resolutions[conflict.normalizedColor] = answer;
    }
  }

  const colorMap = buildColorMap(chosen.definitions, resolutions);

  const config = {
    colorMap,
    sourceOfTruth: [toRelativePosix(targetDir, chosen.file)],
    defaultBehavior: 'strict' as const,
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

  return {
    status: 'created',
    configPath,
    mappingCount: Object.keys(colorMap).length,
    skippedConflicts,
  };
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Relative path from targetDir, always with forward slashes so the generated
// config is portable across OSes.
function toRelativePosix(targetDir: string, file: string): string {
  return path.relative(targetDir, file).split(path.sep).join('/');
}
