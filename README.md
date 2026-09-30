# ColorLint: Detect, Replace, Standardize

Detect hardcoded colors, replace them with design tokens, and standardize your codebase.

## Why You Need It

Hard-coded colors scattered across your codebase make design system compliance impossible to track and turn every rebrand into a manual, error-prone effort. This tool automates detection so violations are caught before they ship.

## What Does This Tool Do

ColorLint scans your project files (`.css`, `.scss`, `.html`, `.ts`, `.js`) for hard-coded color values — hex, RGB, HSL, and named colors — and reports each one as a violation.

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

## Quick Start

Navigate to any project you want to check and run:

```bash
# Scan all supported files in the current directory for hard-coded color violations
color-lint

# Scan only files that are staged, unstaged, or untracked in your working tree and in the current directory
color-lint --changed

# Shorthand for --changed
color-lint -c

# Suggest replacement tokens from a specific design-token file
color-lint --tokens path/to/tokens.scss

# Shorthand for --tokens
color-lint -t path/to/tokens.scss

# Show all available options
color-lint --help

# Shorthand for --help
color-lint -h
```

> **Note:** `--changed` requires Git to be installed and the directory to be a Git repository.

## Token Suggestions

For every violation, ColorLint also suggests the design token that defines the same color, on its own line directly under the violation:

```
  ⚠  Line 4, Col 10  |  color: #0052cc
     Suggestion: $primary-blue
  ⚠  Line 9, Col 3  |  background: #fff
     Suggestion: $white (+2 more)
  ⚠  Line 12, Col 3  |  border-color: #123456
```

- **Where tokens come from:** by default, every `_variables.scss` and `_variables-new.scss` in the current directory (excluded folders like `node_modules/` are skipped). To use a specific file instead, pass `--tokens` (or `-t`):

  ```bash
  # Suggest tokens from this file only (path is relative to the current directory)
  color-lint --tokens src/styles/tokens.scss
  ```

- **What counts as a token:** SCSS variables (`$primary-blue: #0052cc;`, suggested as `$primary-blue`) and CSS custom properties (`--primary-blue: #0052cc;`, suggested as `var(--primary-blue)`).
- **How colors are matched:** by color, not by text. `#0052CC`, `#0052cc`, `rgb(0, 82, 204)` and `hsl(216, 100%, 40%)` all match the same token; `#fff` matches `#ffffff`; named colors like `white` match `#ffffff`. Alpha must match exactly, so `rgba(0, 82, 204, 0.5)` does not match `#0052cc`.
- **No match:** the violation is reported as usual, with no suggestion. `transparent` and `currentColor` never get a suggestion.
- **Several matching tokens:** only the first one is named, followed by how many others also match — `(+2 more)`. "First" means the token declared first; when tokens come from several auto-discovered files, those files are read in alphabetical path order.
- If the `--tokens` file does not exist, or a token file cannot be parsed, ColorLint stops with an error and exit code `1`.

Suggestions never change which violations are reported or the exit code.

## What Gets Ignored

The tool does not flag the following as violations:

- Colors inside comments (`//`, `/* */`, `<!-- -->`)
- Colors defined in `_variables.scss` or `_variables-new.scss` — these are your design token source of truth
- Colors referenced via variables (e.g. `$primary-blue`, `var(--color-white)`)
- Files and folders such as `node_modules/`, `dist/`, `.git/`, `vendor/`, `out/`, `bin/`

---

You are all set! Start scanning, catch violations early, and keep your codebase consistent.

