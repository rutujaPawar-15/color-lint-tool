// src/core/constants.ts

export const SCAN_CONFIG = {
  //File Extensions to Scan (This tells our universal tool which files are allowed to scan.)
  extensions: ['.css', '.scss', '.html', '.ts', '.js'],

  // File extensions that have proper CSS/SCSS AST and are parsed with PostCSS for accuracy
  cssLikeExtensions: ['.css', '.scss', '.less'],

  // Folders to Ignore (Scanning node_modules or build folders would crash our tool or slow it down.)
  exclude: ['node_modules', 'dist', '.git', 'vendor', 'out', 'bin'],

  // File types color-lint-fix may edit → token reference prefixes that are valid syntax there.
  // Extensions not listed here (.ts, .js, .html) are never edited.
  fixableTokenPrefixes: {
    '.scss': ['$', 'var(--'],
    '.css': ['var(--'],
  } as Record<string, string[]>,

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
    
    // Captures specific named color debt
    named: /\b(white|black|transparent|currentColor|gr[ae]y|red|blue|teal|green|yellow|orange)\b/g
  },

  // Anchored counterparts of `patterns`: test whether a WHOLE string is one color
  // (used to validate/normalize token values and violation values in core/variables.ts).
  valuePatterns: {
    hex: /^#([A-Fa-f0-9]{3,4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/,
    rgb: /^rgba?\((\s*\d+%?\s*[,/]?\s*){2,3}\s*\d+%?(\s*[/,]\s*[\d.]+%?)?\s*\)$/i,
    hsl: /^hsla?\((\s*\d+\s*(deg|rad|grad|turn)?\s*[,/]?\s*(\s*\d+%\s*[,/]?\s*){1,2}\s*([\d.]+%?)?\s*)\)$/i,
  },

  // CSS hex values for the colors in `patterns.named`, used to match named-color violations
  // against tokens. transparent/currentColor are deliberately absent: they never get a suggestion.
  namedColorHex: {
    white: '#ffffff',
    black: '#000000',
    gray: '#808080',
    grey: '#808080',
    red: '#ff0000',
    blue: '#0000ff',
    teal: '#008080',
    green: '#008000',
    yellow: '#ffff00',
    orange: '#ffa500',
  } as Record<string, string>,
};

// Git commands used by getChangedFiles() to discover modified/staged/untracked files.
// --diff-filter=d excludes deletions; --relative keeps paths relative to cwd, not repo root.
export const GIT_CHANGED_FILES_COMMANDS = [
  'git diff --name-only --diff-filter=d --relative',           // unstaged modifications
  'git diff --name-only --cached --diff-filter=d --relative',  // staged modifications
  'git ls-files --others --exclude-standard',                  // untracked (new) files — already cwd-relative
];