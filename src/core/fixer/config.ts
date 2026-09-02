import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface ColorLintConfig {
  colorMap: Record<string, string>;
  sourceOfTruth: string[];
  defaultBehavior: 'strict' | 'lenient';
}

// Error thrown by loadConfig, carrying a `code` so callers (e.g. the CLI) can
// distinguish a missing file from invalid JSON and render an appropriate message.
export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly code: 'CONFIG_NOT_FOUND' | 'CONFIG_INVALID_JSON' | 'CONFIG_INVALID_SHAPE'
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

export async function loadConfig(filePath: string): Promise<ColorLintConfig> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new ConfigError(`Config file not found: ${filePath}`, 'CONFIG_NOT_FOUND');
    }
    throw err;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err: any) {
    throw new ConfigError(`Invalid JSON in config file: ${err.message}`, 'CONFIG_INVALID_JSON');
  }

  if (!parsed.colorMap || typeof parsed.colorMap !== 'object') {
    throw new ConfigError('colorMap is required and must be an object', 'CONFIG_INVALID_SHAPE');
  }

  return {
    colorMap: parsed.colorMap,
    sourceOfTruth: parsed.sourceOfTruth || ['src/styles/_variables.scss', '_variables.scss'],
    defaultBehavior: parsed.defaultBehavior || 'strict',
  };
}

const CONFIG_FILENAME = '.color-lint-config.json';

// Walks up from `startDir` through parent directories looking for
// .color-lint-config.json. Returns the absolute path of the nearest config
// found, or null if none exists anywhere in the tree. This mimics how
// .gitignore, tsconfig.json, and .eslintrc are discovered.
export async function findConfigFile(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Not found in this directory — go up
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      // Reached filesystem root — config not found anywhere
      return null;
    }
    dir = parent;
  }
}

