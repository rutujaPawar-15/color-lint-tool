// src/core/constants.ts

export const DEFAULT_CONFIG = {
  // 1. File Extensions to Scan
  // This tells our universal tool which files are allowed to contain styles.
  extensions: ['.css', '.scss', '.sass', '.less', '.html', '.ts'],
  
  // 2. Folders to Ignore
  // Scanning node_modules or build folders would crash our tool or slow it down.
  exclude: ['node_modules', 'dist', '.git', 'vendor', 'out', 'bin'],
  
  // 3. The "Eyes" of the Scanner: Regular Expressions (Regex)
  // These patterns detect hard-coded colors.
  patterns: {
    // Matches Hex colors: e.g., #FFF, #333, #ff0000, #FAFAFA
    hex: /#([A-Fa-f0-9]{3,6})\b/g,
    
    // Matches RGB/RGBA colors: e.g., rgb(255, 0, 0) or rgba(0, 0, 0, 0.5)
    rgb: /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d?(?:\.\d+)?))?\)/g
  }
};