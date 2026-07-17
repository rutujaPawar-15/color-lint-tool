import postcss from 'postcss';
import scssPostcss from 'postcss-scss';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { SCAN_CONFIG } from './constants';

export class ColorMap {
  private map: Map<string, string> = new Map();

  // Normalize color strings for consistent matching
  // Removes spaces and converts to lowercase
  private normalize(color: string): string {
    return color.replace(/\s+/g, '').toLowerCase();
  }

  // Parses the "source of truth" files and builds the color-to-variable mapping
  public async build(targetDir: string): Promise<void> {
    for (const sourceFileName of SCAN_CONFIG.sourceOfTruth) {
      const filePath = path.join(targetDir, sourceFileName);
      
      try {
        const stats = await fs.stat(filePath).catch(() => null);
        if (!stats || !stats.isFile()) {
          continue; // File doesn't exist, skip
        }

        const content = await fs.readFile(filePath, 'utf-8');
        
        // Use SCSS syntax parser since variables are typically in SCSS
        const result = await postcss().process(content, {
          from: filePath,
          syntax: scssPostcss,
        });

        result.root.walkDecls((decl) => {
          // Check if the declaration is a variable (SCSS starts with $, CSS starts with --)
          if (decl.prop.startsWith('$') || decl.prop.startsWith('--')) {
            const normalizedValue = this.normalize(decl.value);
            
            // Check if the value itself resembles a color we want to map.
            // If it's another variable or a function like lighten(), we might not map it directly
            // unless we want to map everything. We'll add it unconditionally.
            // If the user hardcodes #ff0000, we want to match it.
            
            // If it's a CSS variable, suggestion format should be var(--name), else $name
            const suggestion = decl.prop.startsWith('--') ? `var(${decl.prop})` : decl.prop;
            
            // Don't overwrite if we already have a primary mapping? 
            // We'll keep the first one found or overwrite, let's just keep the last one or first one.
            // Keeping the first one is usually better if primary colors are defined first.
            if (!this.map.has(normalizedValue)) {
              this.map.set(normalizedValue, suggestion);
            }
          }
        });

      } catch (error) {
        console.warn(`Warning: Failed to parse source of truth file: ${filePath}`);
      }
    }
  }

  // Given a hardcoded color, returns a suggestion if a matching variable exists
  public getSuggestion(hardcodedColor: string): string | undefined {
    const normalized = this.normalize(hardcodedColor);
    return this.map.get(normalized);
  }
}
