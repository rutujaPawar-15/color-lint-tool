# AGENTS.md — color-lint-tool

Context file for AI coding agents. Vendor-neutral (`AGENTS.md` is read by Claude Code,
Copilot, Cursor, Codex, Aider, Zed). `CLAUDE.md` is a one-line `@AGENTS.md` import — put
content **here**, never there.

Terse and structured on purpose: this is loaded to give an agent accurate context fast,
not to onboard a human. Human setup instructions live in `README.md`.

---

## 1. What this tool is

A CLI (`color-lint`) that scans a **target project** for hard-coded color values — hex,
rgb/rgba, hsl/hsla, and a fixed list of named colors — and reports each as a *violation*
with file, line, column, property and value.

**Vocabulary**
- **violation** — one hard-coded color occurrence. Shape: `ColorViolation` in `src/core/types.ts`.
- **source of truth** — a design-token file (`_variables.scss`, `_variables-new.scss`) where
  colors are legitimately *defined*. Excluded from discovery, never a violation.
- **target dir** — `process.cwd()` when the CLI runs. This tool is meant to run **against RIB 4.0
  codebases, not against its own repo**. Anything read at scan time (files, tokens) comes from
  the target dir, not from this repo.

## 2. Architecture map

```
cli.ts                      commander entry; owns flags (--changed, --variables), exit codes, summary
  └─ utils/file-finder.ts   findFiles() | getChangedFiles()  → absolute paths to scan
  └─ core/variables.ts      loadVariables() → TokenMap; suggestVariable(value, tokens)
  └─ core/scanner.ts        scanFile(path) → ColorViolation[]
       ├─ scanCssFile()     .css/.scss/.less → PostCSS AST (postcss-scss syntax)
       └─ scanTextFile()    .ts/.js/.html    → maskComments() + regex per line
  └─ utils/reporter.ts      reportViolations() → grouped, chalk-formatted stdout
core/constants.ts           SCAN_CONFIG + GIT_CHANGED_FILES_COMMANDS
core/types.ts               ColorViolation
```

Exit code: `1` if any violation found (or on fatal error), `0` otherwise.

## 3. Two comment-ignoring mechanisms — why

There are deliberately **two** independent ways comments get ignored. Do not try to unify them.

- **CSS-like files** (`scanCssFile`): PostCSS parses comments into `Comment` nodes.
  `walkDecls()` only visits declarations, so comment content is *structurally* unreachable.
  Nothing to mask.
- **Text files** (`scanTextFile`): no AST. `maskComments()` (private to `core/scanner.ts`) is a hand-rolled state machine
  (`code | line | block | html | string`) that replaces comment characters with spaces while
  preserving length, newlines and offsets — so reported line/column stay accurate. The
  `string` mode exists so `"http://x"` is not misread as the start of a `//` comment.

## 4. `SCAN_CONFIG` is the single source of truth

`src/core/constants.ts` → `SCAN_CONFIG` holds `extensions`, `cssLikeExtensions`, `exclude`,
`sourceOfTruth`, `patterns`. Add a file type / ignore folder / color pattern **there**, not at
a call site.

Two pattern sets live there, deliberately: `patterns` is **global and unanchored** — it *finds*
colors inside a larger string (the scanner). `valuePatterns` is **anchored** — it tests whether a
whole string *is* one color, which is what validating a single declared token value needs
(`core/variables.ts`). Keep them in sync: `valuePatterns.hex` currently covers only hex, so the
token loader only ever recognises hex-valued tokens.

⚠️ One rule is *not* centrally applied: the **`sourceOfTruth` filename filter lives only in
`file-finder.ts`** (both `findFiles` and `getChangedFiles` apply it). `scanFile()` has no
knowledge of it — calling `scanFile('_variables.scss')` directly *will* report its declarations
as violations. `tests/scanner.test.ts` asserts exactly this. That is current, intended behavior.

## 5. Commands

| Command | Actually runs | Note |
|---|---|---|
| `npm run lint` | `tsc --noEmit` | **Not a linter.** There is no ESLint config in this repo. |
| `npm run build` | `tsc` | Same type check as `lint`, with emit to `dist/src/`. |
| `npm test` | `vitest run --coverage` | Real assertions + enforced coverage thresholds. |
| `npm run test:watch` | `vitest` | |
| `npm run dev` | `ts-node src/cli.ts` | Runs the CLI against the cwd without building. |

⚠️ **`lint` is a type check.** A "lint error" here is a TypeScript error. Do not add
`eslint-disable` comments (they do nothing), and do not install ESLint to "fix" them.
`lint` and `build` are therefore not two independent gates — they are the same check twice.
Both are kept in the gate for parity with CI.

## 6. Known gaps

- **`.less` is a dead path.** `cssLikeExtensions` includes `.less`, but `extensions` does not —
  so `findFiles` never discovers a `.less` file. The branch is only reachable by calling
  `scanFile()` directly.
- **`scanTextFile` has no char-before guard.** `scanCssFile` skips a match whose preceding
  character is `[-a-zA-Z0-9_$]` (so `$primary-blue` is not flagged as `blue`). `scanTextFile`
  does not, so the same token inside an identifier in a `.ts`/`.js` file *is* flagged.
- **`findFiles` / `getChangedFiles` are dual implementations** of the same three rules
  (extensions, excluded folders, source-of-truth). `findFiles` uses fast-glob `ignore` patterns;
  `getChangedFiles` uses manual path-segment checks. They can silently diverge when `SCAN_CONFIG`
  changes — the parity suite in `tests/file-finder.test.ts` exists to catch that.
- **`--changed` does not cover a PR's changes.** `GIT_CHANGED_FILES_COMMANDS` only inspects
  **working-tree** state (unstaged / staged / untracked). On a cleanly checked-out PR branch all
  three return nothing, so `--changed` scans zero files. Diffing against a base ref
  (`git diff --name-only --diff-filter=d <base>...HEAD`) is separate, unimplemented work.

## 7. Testing conventions

- Vitest. Suites in `tests/*.test.ts`; fixtures in `tests/fixtures/`.
- Fixtures carry **inline "answer key" comments** naming what each line is expected to do
  (flagged / ignored, and why). Keep them in sync when editing a fixture — the comments are
  read as the spec.
- `tests/file-finder.test.ts` builds a real temp git repo per test (`mkdtemp` + `git init`),
  never mutates this repo.
- `vitest.config.mts` → `coverage.include` is an **explicit allowlist**, not a glob. A new
  `src/` file only enters the coverage gate when it is added there. Adding it is mandatory
  when the file gains a test suite (see `.claude/skills/execute-prd`).

## 8. Agentic workflows (the harness)

Two invokable skills encode how work is meant to flow through this repo:

- `.claude/skills/refine-prd/` — turn a rough feature ask into a lightweight PRD at
  `docs/prds/<slug>.md`, with acceptance criteria written as testable behaviors.
- `.claude/skills/execute-prd/` — execute a PRD test-first, one failing test per criterion,
  with a mandatory housekeeping gate (coverage config + README) before the full check.

Prefer routing a new feature through `refine-prd` → `execute-prd` over coding it ad hoc.
See `docs/harness-walkthrough.md` for the what/why.
