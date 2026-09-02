# Agent Configuration for color-lint-tool

## Project Overview

ColorLint is a TypeScript CLI tool that detects hard-coded CSS color violations in source files (.css, .scss, .less, .html, .ts, .js) and optionally replaces them with design-token variables. It uses PostCSS for CSS/SCSS AST parsing and regex-based scanning for non-CSS files.

## Rules

1. **NEVER** write implementation code without a failing test first (RED → GREEN → REFACTOR)
2. **ALWAYS** run `npm run validate` after completing any implementation step
3. **ALWAYS** follow the workflow documents in `docs/workflows/`
4. **NEVER** delete or weaken existing tests — test count must be monotonically non-decreasing
5. Use the established module structure: new features go in `src/core/<feature>/`
6. Tests go in `tests/unit/<module>.<unit>.test.ts`
7. Every PRD acceptance criterion must have at least one passing test
8. Preserve all existing comments and docstrings unrelated to your changes

## Technology Stack

| Component       | Technology                  |
|-----------------|-----------------------------|
| Language        | TypeScript (strict mode)    |
| Runtime         | Node.js (≥16)               |
| Test Framework  | Vitest                      |
| Build           | `tsc` → `dist/`             |
| CLI Parser      | Commander.js                |
| CSS Parsing     | PostCSS + postcss-scss      |
| File Discovery  | fast-glob                   |
| Terminal Output | Chalk                       |

## Project Structure

```
color-lint-tool/
├── src/
│   ├── cli.ts                  # CLI entry point (Commander.js)
│   ├── core/
│   │   ├── constants.ts        # Scanner config, regex patterns, git commands
│   │   ├── scanner.ts          # PostCSS AST + regex color detection
│   │   ├── types.ts            # Core interfaces (ColorViolation)
│   │   └── fixer/              # --fix feature modules
│   │       ├── config.ts       # .color-lint-config.json loader
│   │       ├── normalizer.ts   # Color normalization (hex/rgb/hsl/named)
│   │       ├── suggester.ts    # Color→variable lookup (O(1))
│   │       ├── replacer.ts     # Boundary-safe text replacement
│   │       ├── variables.ts    # sourceOfTruth variable extraction
│   │       └── fixer.ts        # Orchestrator: scan→suggest→replace
│   └── utils/
│       ├── file-finder.ts      # File discovery (glob + git-changed)
│       └── reporter.ts         # Console violation reporter
├── tests/
│   ├── unit/                   # All test files: <module>.<unit>.test.ts
│   └── fixtures/               # Test fixture files (.html, .scss, .ts)
├── docs/
│   ├── PRD-*.md                # Product Requirements Documents
│   ├── ANALYSIS-*.md           # Implementation analysis documents
│   ├── tdd-harness.md          # TDD rules and conventions
│   └── workflows/              # Agentic workflow definitions
├── scripts/
│   └── validate-tdd.ps1        # TDD validation gate script
├── bin/
│   └── color-lint-check.js     # Executable wrapper
└── AGENTS.md                   # This file
```

## Workflow Entry Points

| Scenario                        | Workflow Document                                    |
|---------------------------------|------------------------------------------------------|
| New feature idea                | `docs/workflows/workflow-prd-refinement.md`          |
| Approved PRD ready to implement | `docs/workflows/workflow-prd-execution.md`           |
| Validate any code change        | `npm run validate` (runs `scripts/validate-tdd.ps1`) |

## Naming Conventions

| Item                | Convention                              | Example                        |
|---------------------|-----------------------------------------|--------------------------------|
| Source module        | `kebab-case.ts`                        | `file-finder.ts`               |
| Test file            | `<module>.<unit>.test.ts`              | `fixer.replacer.test.ts`       |
| Spec-draft test      | `<feature>.spec-draft.ts`              | `json-output.spec-draft.ts`    |
| PRD document         | `PRD-<feature>.md`                     | `PRD-json-output.md`           |
| Analysis document    | `ANALYSIS-<feature>.md`               | `ANALYSIS-json-output.md`      |
| Feature module dir   | `src/core/<feature>/`                  | `src/core/formatter/`          |
| Config interface     | PascalCase                              | `ColorLintConfig`              |
| Exported function    | camelCase                               | `replaceColorInText`           |

## Exit Code Contract

| Scenario                           | Exit Code |
|------------------------------------|-----------|
| No violations found                | `0`       |
| Violations found (scan or fix)     | `1`       |
| Config error / invalid arguments   | `1`       |

## Key Design Principles

1. **Separation of concerns**: Each module in `src/core/fixer/` has a single responsibility
2. **Typed errors**: Use discriminated error types (e.g., `ConfigError.code`) instead of string matching
3. **Pre-normalization for performance**: Build lookup maps once, use O(1) lookups per violation
4. **Scanner immunity**: Colors in comments and `sourceOfTruth` files are never flagged
5. **Git as undo**: No custom backup mechanism — users rely on `git checkout` to revert
