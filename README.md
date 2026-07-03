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

# Show all available options
color-lint --help
```

> **Note:** `--changed` requires Git to be installed and the directory to be a Git repository.

## What Gets Ignored

The tool does not flag the following as violations:

- Colors inside comments (`//`, `/* */`, `<!-- -->`)
- Colors defined in `_variables.scss` or `_variables-new.scss` — these are your design token source of truth
- Colors referenced via variables (e.g. `$primary-blue`, `var(--color-white)`)
- Files and folders such as `node_modules/`, `dist/`, `.git/`, `vendor/`, `out/`, `bin/`

---

You are all set. You are now ready to:

- Scan your codebase for hard-coded colors
- Enforce design system compliance
- Catch violations before they ship
- Keep your code clean and maintainable
