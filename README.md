# ColorLint: Detect, Suggest, Fix

Detect hardcoded colors, suggest the design token to use instead, and automatically fix them — to standardize your codebase.

## Why You Need It

Hard-coded colors scattered across your codebase make design system compliance impossible to track and turn every rebrand into a manual, error-prone effort. ColorLint catches violations before they ship, tells you exactly which token to use instead, and can rewrite them for you.

## What Does This Tool Do

1. **Detect** — scans your project files (`.css`, `.scss`, `.html`, `.ts`, `.js`) for hard-coded color values (hex, RGB, HSL, and named colors) and reports each one as a violation.
2. **Suggest** — for each violation, looks up your design tokens and prints which variable to use instead (e.g. `#fff → $color-white`).
3. **Fix** — the `fix` command rewrites hard-coded colors in your `.css`/`.scss` files into the matching token, prompting you when a color maps to more than one token.

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 16+ | `node --version` |
| npm | 7+ | `npm --version` |

## Installation

```bash
git clone https://github.com/rutujaPawar-15/color-lint-tool.git
cd color-lint-tool

# Install all packages required to build and run the tool
npm install

# Verify there are no TypeScript errors in the source code
npm run lint

# Compile TypeScript from src/ into JavaScript in dist/
npm run build

# Register the color-lint command globally so you can run it from any directory
npm link
```

## Design tokens (source of truth)

Suggestions and fixes are based on your **design token source-of-truth** files. By default ColorLint
searches the whole Git repository for `_variables.scss` / `_variables-new.scss` (so they are found
even when you run the command from a subfolder). You can point it at a different file or glob with
`--tokens`.

A token is any variable whose value is a color:

```scss
$color-white: #ffffff;      // suggested as  $color-white
--bg-surface: #ffffff;      // suggested as  var(--bg-surface)
```

Suggestions are shown in the form the token was declared: SCSS variables as `$name`, CSS custom
properties as `var(--name)`. Equivalent spellings are matched automatically — `#fff`, `#ffffff`,
`white`, and `rgb(255,255,255)` all match a token defined as `#FFFFFF`.

## Scan & suggest

Navigate to any project you want to check and run:

```bash
# Scan all supported files and print each violation with its suggested token
color-lint

# Scan only files that are staged, unstaged, or untracked in your working tree
color-lint --changed          # or: color-lint -c

# Scan only a PR's files — those changed on this branch vs a base branch
color-lint --base main        # or: color-lint -b main

# Use a specific token source instead of the auto-discovered _variables files
color-lint --tokens ./src/styles/tokens.css   # or: -t

# Show all available options
color-lint --help             # or: color-lint -h
```

Example output:

```
📄 card.scss (2 violations)
  ⚠  Line 2, Col 10  |  color: #fff
     → $color-white (+2 more)
  ⚠  Line 3, Col 19  |  border-color: #ff0000
     → $brand-red
```

When a color matches several tokens, the first is shown with a `(+N more)` summary. A color with no
matching token is still reported as a violation, just without a suggestion.

## Fix

The `fix` subcommand rewrites hard-coded colors into their token, **in place**, for `.css` and
`.scss` files only (other file types are reported by the scan but never auto-rewritten).

```bash
# Fix all CSS/SCSS files in the current directory
color-lint fix

# Preview what would change — writes nothing and never prompts
color-lint fix --dry-run

# Fix only git-changed files
color-lint fix --changed       # or: color-lint fix -c

# Fix only a PR's files (changed on this branch vs a base branch)
color-lint fix --base main     # or: color-lint fix -b main

# Fix specific file(s) or a glob
color-lint fix src/card.scss
color-lint fix "src/**/*.scss"

# Use a specific token source
color-lint fix --tokens ./src/styles/tokens.css   # or: -t
```

How fixes are applied:

- **One matching token** → applied automatically.
- **Several matching tokens** → you are prompted to pick one, per occurrence (press `s` to skip).
  Press **Ctrl+C** at any prompt to abort the whole run (files already written stay written —
  use `git checkout .` to undo).
- **No valid token for the file type** → left unchanged and reported. (In a `.css` file only
  `var(--x)` tokens are valid; `.scss` accepts both `$x` and `var(--x)`.)
- Formatting is preserved and only the exact color value is replaced (e.g. the `#fff` in
  `border: 1px solid #fff`).

Safeguards:

- Token-definition files (`_variables.scss`, or whatever `--tokens` points at) are **never**
  rewritten, even if you name them directly or a glob matches them.
- An explicit path that is **outside the current directory** or that **does not exist** is rejected
  with a clear error before anything runs.

> **Note:** `--changed` and `--base` require Git and a Git repository. `--changed` looks at your
> working tree (uncommitted edits); `--base <branch>` looks at commits on your branch since it
> diverged from `<branch>` (a PR's files). The two are mutually exclusive — pick one.

## What Gets Ignored

The tool does not flag the following as violations:

- Colors inside comments (`//`, `/* */`, `<!-- -->`)
- Colors defined in the token source-of-truth files (`_variables.scss`, `_variables-new.scss`) — these are where colors are *defined*, not violated
- Colors referenced via variables (e.g. `$primary-blue`, `var(--color-white)`)
- Files and folders such as `node_modules/`, `dist/`, `.git/`, `vendor/`, `out/`, `bin/`

## Development

```bash
npm run build      # compile TypeScript to dist/
npm run lint       # type-check only (tsc --noEmit)
npm test           # run the Vitest unit tests
npm run dev -- fix --dry-run   # run from source via ts-node
```

---

You are all set! Scan to catch violations early, read the suggestions, and run `fix` to keep your codebase consistent.
