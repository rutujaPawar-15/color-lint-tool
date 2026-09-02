import fg from 'fast-glob';
import * as fs from 'node:fs/promises';
import { SCAN_CONFIG } from '../constants';
import { extractVariableDefinitions, type VariableDefinition } from './extractor';

// A stylesheet found during setup that defines at least one color variable.
export interface DiscoveredFile {
  file: string; // absolute path
  definitions: VariableDefinition[];
}

// Scans targetDir for CSS-like stylesheets (.css/.scss/.less) that DEFINE color
// variables, returning each with its parsed definitions, ranked by how many color
// variables it defines (most first). Files with none are excluded. This is what
// lets `setup` propose the project's own variables file instead of asking the
// developer to hand-write a config.
export async function discoverVariableFiles(targetDir: string): Promise<DiscoveredFile[]> {
  const extPattern = SCAN_CONFIG.cssLikeExtensions.map(ext => ext.replace('.', '')).join(',');
  const searchPattern = `**/*.{${extPattern}}`;

  const files = await fg(searchPattern, {
    cwd: targetDir,
    ignore: SCAN_CONFIG.exclude.map(folder => `**/${folder}/**`),
    absolute: true,
  });

  const discovered: DiscoveredFile[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(file, 'utf-8');
    } catch {
      continue; // unreadable file — skip
    }
    const definitions = extractVariableDefinitions(content);
    if (definitions.length > 0) {
      discovered.push({ file, definitions });
    }
  }

  // Most color variables first — the richest file is the likeliest source of truth.
  discovered.sort((a, b) => b.definitions.length - a.definitions.length);
  return discovered;
}
