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

# Register the color-lint and color-lint-fix commands globally so you can run it from any directory
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

## Auto-fixing: `color-lint-fix`

`color-lint` only reports; it never writes files. A second command, `color-lint-fix`, rewrites hard-coded colors into their matching design token. It scans the files itself and takes the same flags:

```bash
# Replace colors in every .scss / .css file in the current directory
color-lint-fix

# Take tokens from a specific file (shorthand: -t)
color-lint-fix --tokens path/to/tokens.scss

# Fix only files that are staged, unstaged, or untracked (shorthand: -c)
color-lint-fix --changed
```

- **One matching token:** replaced without asking.
- **Several matching tokens:** you pick one for **each occurrence**. The output uses the same colors and layout as `color-lint`: one `📄` header per file, then a block per occurrence:

  ```
  📄 src/app.scss
    ⚠  Line 4, Col 3  |  color: #fff
       1) $white
       2) $surface-white
       Pick a token [1-2, s=skip, q=quit]:
  ```

  At the prompt:
  - **a listed number** replaces the color with that token (nothing more is printed);
  - **`s`** skips this occurrence (`Skipped.`);
  - **anything else**, including `0`, an out-of-range number or an empty line, also skips it (`Invalid choice, hence skipped.`). You are not asked again;
  - **`q`** stops the run. Every replacement decided so far is saved, and nothing after that point is processed, including single-match colors. Run `color-lint-fix` again to pick up the rest;
  - **Ctrl+C** does the same as `q`, but the exit code is `130`.

  `s` and `q` are case-insensitive, and surrounding spaces are ignored. If stdin ends (e.g. in CI), the remaining prompts are skipped. That is not a stop.
- **Which files are edited:** only `.scss` and `.css`. `.ts`, `.js` and `.html` are never edited; `color-lint` still reports their violations. Token files (`_variables*.scss`, or the `--tokens` file) are never edited either.
- **Which tokens are used:** `.scss` accepts `$token` and `var(--token)`. `.css` accepts only `var(--token)`, so a color whose only match is a `$token` is left unchanged in `.css`.
- **Only the color text changes.** Formatting, comments and line endings are preserved. There is no backup or dry run. Review the changes with `git diff` and revert with git.
- **Tokens must be in scope.** `color-lint-fix` does not add `@use` / `@import`. You need to make sure an inserted `$token` resolves in the edited file.
- Every run ends with a summary line:

  ```
  Replaced 3 color(s) in 2 file(s); 1 without a matching token, 1 skipped.
  ```

  The replaced count is green, the without-a-match count red and the skipped count yellow. After a `q` or Ctrl+C, a yellow line comes directly before the summary, and the summary counts only the occurrences that were processed:

  ```
  Stopped early: 4 violation(s) not processed.
  Replaced 1 color(s) in 1 file(s); 1 without a matching token, 1 skipped.
  ```

  The exit code is `0` even when violations remain, including after `q`. It is `130` when the run was stopped with Ctrl+C at a prompt. It is `1` only on a fatal error: a missing `--tokens` file, or a file that cannot be parsed. In both cases **no** file is modified.

## What Gets Ignored

The tool does not flag the following as violations:

- Colors inside comments (`//`, `/* */`, `<!-- -->`)
- Colors defined in `_variables.scss` or `_variables-new.scss` — these are your design token source of truth
- Colors referenced via variables (e.g. `$primary-blue`, `var(--color-white)`)
- Files and folders such as `node_modules/`, `dist/`, `.git/`, `vendor/`, `out/`, `bin/`

---

You are all set! Start scanning, catch violations early, and keep your codebase consistent.

