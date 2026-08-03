// src/core/constants.ts

// Single source of truth for all scannable file extensions and their properties.
// This prevents the kind of sync mismatch that caused the .less bug.
const EXTENSION_CONFIG = [
  { ext: '.css', cssLike: true },
  { ext: '.scss', cssLike: true },
  { ext: '.less', cssLike: true },
  { ext: '.html', cssLike: false },
  { ext: '.ts', cssLike: false },
  { ext: '.js', cssLike: false },
];

export const SCAN_CONFIG = {
  // All scannable extensions, derived from a single config.
  extensions: EXTENSION_CONFIG.map(c => c.ext),

  // Extensions that use PostCSS AST parsing (CSS, SCSS, Less), derived from config.
  cssLikeExtensions: EXTENSION_CONFIG.filter(c => c.cssLike).map(c => c.ext),

  // Folders to Ignore (Scanning node_modules or build folders would crash our tool or slow it down.)
  exclude: ['node_modules', 'dist', '.git', 'vendor', 'out', 'bin'],

  // Files where colors are DEFINED (They shouldn't be flagged as ERRORS.)
  sourceOfTruth: ['_variables.scss', '_variables-new.scss'],
  
  // The "Eyes" of the Scanner: Regular Expressions (These patterns detect hard-coded colors.)
patterns: {
    // Captures 3, 4, 6, and 8-digit hex 
    hex: /#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})\b/g,
    
    // Captures rgb/rgba with commas or modern slashes
    rgb: /rgba?\((\s*\d+%?\s*[,/]?\s*){2,3}\s*\d+%?(\s*[/,]\s*[\d.]+%?)?\s*\)/gi,
    
    // Captures hsl/hsla for the theming palettes
    hsl: /hsla?\((\s*\d+\s*(deg|rad|grad|turn)?\s*[,/]?\s*(\s*\d+%\s*[,/]?\s*){1,2}\s*([\d.]+%?)?\s*)\)/gi,
    
    // Captures specific named color debt (case-insensitive: WHITE, Red, etc. all count)
    named: /\b(white|black|transparent|currentColor|gr[ae]y|red|blue|teal|green|yellow|orange)\b/gi
  }
};

// Git commands used by getChangedFiles() to discover modified/staged/untracked files.
// --diff-filter=d excludes deletions; --relative keeps paths relative to cwd, not repo root.
export const GIT_CHANGED_FILES_COMMANDS = [
  'git diff --name-only --diff-filter=d --relative',           // unstaged modifications
  'git diff --name-only --cached --diff-filter=d --relative',  // staged modifications
  'git ls-files --others --exclude-standard',                  // untracked (new) files — already cwd-relative
];