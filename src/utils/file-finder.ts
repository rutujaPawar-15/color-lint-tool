import fg from 'fast-glob';
import path from 'node:path';
import { SCAN_CONFIG } from '../core/constants';

// Finds all files in targetDir that match the configured extensions, excluding ignored folders and source-of-truth variable files.
export async function findFiles(targetDir: string): Promise<string[]> {
  const extPattern = SCAN_CONFIG.extensions.map(ext => ext.replace('.', '')).join(',');
  const searchPattern = `**/*.{${extPattern}}`;

  const files = await fg(searchPattern, {
    cwd: targetDir,
    ignore: SCAN_CONFIG.exclude.map(folder => `**/${folder}/**`),
    absolute: true,
  });

  // Filter out source-of-truth files (e.g. _variables.scss). These are where colors are DEFINED, not violated
  return files.filter(file => {
    const fileName = path.basename(file);
    return !SCAN_CONFIG.sourceOfTruth.includes(fileName);
  });
}
