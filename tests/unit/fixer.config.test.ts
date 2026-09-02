import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig, findConfigFile, type ColorLintConfig } from '../../src/core/fixer/config';

const tmpFiles: string[] = [];

function writeTempConfig(content: string): string {
  const file = path.join(os.tmpdir(), `color-lint-config-${tmpFiles.length}.json`);
  fs.writeFileSync(file, content, 'utf-8');
  tmpFiles.push(file);
  return file;
}

afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    try {
      fs.unlinkSync(f);
    } catch {
      // already gone
    }
  }
});

describe('ConfigLoader: loadConfig', () => {
  it('loads a valid .color-lint-config.json with colorMap', async () => {
    const configFile = writeTempConfig(
      JSON.stringify({
        colorMap: {
          '#ff0000': '$color-red',
          '#00ff00': '$color-green',
          'red': '$color-red',
        },
        defaultBehavior: 'strict',
      })
    );

    const config = await loadConfig(configFile);

    expect(config).toBeDefined();
    expect(config.colorMap['#ff0000']).toBe('$color-red');
    expect(config.colorMap['red']).toBe('$color-red');
    expect(config.defaultBehavior).toBe('strict');
  });

  it('throws a descriptive error when the config file is missing', async () => {
    const nonexistentFile = path.join(os.tmpdir(), 'nonexistent-config.json');

    await expect(loadConfig(nonexistentFile)).rejects.toThrow(
      /config file not found/i
    );
    // The error carries a code so the CLI can render a --fix-specific message.
    await expect(loadConfig(nonexistentFile)).rejects.toMatchObject({
      code: 'CONFIG_NOT_FOUND',
    });
  });

  it('throws a descriptive error when the config is invalid JSON', async () => {
    const configFile = writeTempConfig('{ "colorMap": { invalid json }');

    await expect(loadConfig(configFile)).rejects.toThrow(/invalid json/i);
    await expect(loadConfig(configFile)).rejects.toMatchObject({
      code: 'CONFIG_INVALID_JSON',
    });
  });

  it('throws a descriptive error when colorMap is missing', async () => {
    const configFile = writeTempConfig(
      JSON.stringify({
        defaultBehavior: 'strict',
        // colorMap intentionally omitted
      })
    );

    await expect(loadConfig(configFile)).rejects.toThrow(/colorMap is required/i);
    await expect(loadConfig(configFile)).rejects.toMatchObject({
      code: 'CONFIG_INVALID_SHAPE',
    });
  });

  it('loads sourceOfTruth as an optional array with sensible defaults', async () => {
    const configFile = writeTempConfig(
      JSON.stringify({
        colorMap: { '#ff0000': '$color-red' },
        // sourceOfTruth intentionally omitted
      })
    );

    const config = await loadConfig(configFile);

    expect(config.sourceOfTruth).toBeDefined();
    expect(Array.isArray(config.sourceOfTruth)).toBe(true);
    expect(config.sourceOfTruth.length).toBeGreaterThan(0);
  });
});

describe('ConfigLoader: findConfigFile', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'color-lint-findconfig-'));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('finds config in the current directory', async () => {
    const configPath = path.join(rootDir, '.color-lint-config.json');
    fs.writeFileSync(configPath, JSON.stringify({ colorMap: {} }));

    const found = await findConfigFile(rootDir);
    expect(found).toBe(configPath);
  });

  it('finds config in a parent directory when not in current', async () => {
    // Create config at root
    const configPath = path.join(rootDir, '.color-lint-config.json');
    fs.writeFileSync(configPath, JSON.stringify({ colorMap: {} }));

    // Create a nested subdirectory: root/src/styles/components
    const deepDir = path.join(rootDir, 'src', 'styles', 'components');
    fs.mkdirSync(deepDir, { recursive: true });

    const found = await findConfigFile(deepDir);
    expect(found).toBe(configPath);
  });

  it('finds config in an intermediate parent, not just the root', async () => {
    // Create config at root/src/ (not root itself)
    const srcDir = path.join(rootDir, 'src');
    fs.mkdirSync(srcDir);
    const configPath = path.join(srcDir, '.color-lint-config.json');
    fs.writeFileSync(configPath, JSON.stringify({ colorMap: {} }));

    // Search from root/src/styles/
    const deepDir = path.join(srcDir, 'styles');
    fs.mkdirSync(deepDir);

    const found = await findConfigFile(deepDir);
    expect(found).toBe(configPath);
  });

  it('returns null when no config exists anywhere in the tree', async () => {
    const deepDir = path.join(rootDir, 'a', 'b', 'c');
    fs.mkdirSync(deepDir, { recursive: true });

    const found = await findConfigFile(deepDir);
    expect(found).toBeNull();
  });

  it('picks the nearest config when multiple exist in the tree', async () => {
    // Config at root
    fs.writeFileSync(
      path.join(rootDir, '.color-lint-config.json'),
      JSON.stringify({ colorMap: { root: true } })
    );

    // Config at root/packages/app/
    const appDir = path.join(rootDir, 'packages', 'app');
    fs.mkdirSync(appDir, { recursive: true });
    const nearerConfig = path.join(appDir, '.color-lint-config.json');
    fs.writeFileSync(nearerConfig, JSON.stringify({ colorMap: { app: true } }));

    // Search from root/packages/app/src/
    const srcDir = path.join(appDir, 'src');
    fs.mkdirSync(srcDir);

    const found = await findConfigFile(srcDir);
    expect(found).toBe(nearerConfig);
  });
});
