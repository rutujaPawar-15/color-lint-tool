# Replace hard-coded colors with design tokens

**Status:** Draft
**Slug:** fix-colors

## Problem
`color-lint` reports each hard-coded color and, since `suggest-css-variable`, prints the matching
design token on a `Suggestion:` line (`suggestVariable()` in `src/core/variables.ts`). The developer
still has to open every file and make each replacement by hand. `suggest-css-variable` lists
auto-replacing as a Non-goal and defers it to a separate PRD. This is that PRD.

## Goals
- A second binary, `color-lint-fix`, run by the user after `color-lint`, that rewrites hard-coded
  colors in the target dir's files into their matching design token.
- `color-lint-fix` scans the files again itself. It does not read `color-lint`'s output.
- Tokens and files are chosen exactly as `color-lint` chooses them: `-t/--tokens <path>`, otherwise
  auto-discovered `SCAN_CONFIG.sourceOfTruth` files; `-c/--changed` for git-changed files only.
- One matching token → replaced without asking. Several matching tokens → the user picks one at an
  interactive prompt, **for every occurrence** separately.
- Edits only the color text. Every other byte of the file is preserved.
- Only emits syntax valid for the file type. `.scss` accepts `$x` and `var(--x)`. `.css` accepts
  only `var(--x)`. `.ts`, `.js` and `.html` are never edited.
- Prints a summary line and exits `0` once the run completes, even if some violations remain.
- (2026-09-30) Terminal output uses `color-lint`'s color scheme and layout: a `📄` header per file,
  and violation lines styled as in `src/utils/reporter.ts`.
- (2026-09-30) At the prompt, `s` skips and an invalid answer says it was skipped. `q`, or Ctrl+C at
  a prompt, stops the run early and saves every replacement decided so far.

## Non-goals
- **A `--fix` flag or a `fix` subcommand on `color-lint`.** `color-lint` is unchanged and never
  writes files. The fixer is a separate binary.
- **Editing `.ts` / `.js` / `.html` files.** Their violations are still reported by `color-lint`.
- **Adding `@use` / `@import`** so that an inserted `$token` resolves. Making the token file
  available in the edited `.scss` file is the user's job.
- **Remembering a pick** across occurrences of the same color. Each occurrence prompts separately.
- **Re-asking on invalid input.** An invalid answer skips that violation.
- **Dry-run / `--check` / diff preview, backups or undo.** The user reviews and reverts with git.
- **Reading `color-lint`'s printed report** as input.
- Everything `suggest-css-variable` excludes from matching still applies: no nearest-color match,
  no token alias resolution, no suggestion for `transparent` / `currentColor`, and one `--tokens`
  path only.
- **`.less`** (dead path, `AGENTS.md` §6) and **`--changed` against a PR base ref** (`AGENTS.md` §6).
- (2026-09-30) **Continuing after a stop.** After `q` / Ctrl+C nothing more is processed, not even
  single-match replacements. The user runs `color-lint-fix` again to pick up the rest.
- (2026-09-30) **Ctrl+C outside a prompt** (while scanning or parsing). It keeps Node's default
  behavior. Nothing has been written at that point, because writes happen only at the end.
- (2026-09-30) **A confirmation line after a successful pick.** Only skip / invalid answers print
  an outcome message.

## Acceptance criteria

*Replacement — `src/core/fixer.ts`, `src/fix-cli.ts`*

1. Given `_variables.scss` with `$primary-blue: #0052cc;` and `src/app.scss` with
   `color: #0052cc;`, when `color-lint-fix` runs, that line of `src/app.scss` becomes
   `color: $primary-blue;`.
2. Given the same token and `src/app.scss` containing `border: 1px solid #0052cc;` plus other
   lines, comments and whitespace, after `color-lint-fix` the file content equals the original
   with only `#0052cc` replaced by `$primary-blue`. Every other byte is identical.
3. (revised 2026-09-30) Given tokens `$white: #fff;` then `$surface-white: #fff;` and
   `src/app.scss` with `color: #fff;` on line 4, when `color-lint-fix` runs with stdin `2\n`,
   stdout shows the violation in the criterion-17 layout, then the numbered candidates
   `1) $white` and `2) $surface-white` in suggestion order, then a
   `Pick a token [1-2, s=skip, q=quit]:` prompt. The line becomes `color: $surface-white;`.
4. Given no token defining `#123456` and `src/app.scss` with `color: #123456;`, after
   `color-lint-fix` that line is unchanged.
5. Given a target dir where `color-lint` reports `V` violations, when `color-lint-fix` runs and
   reports `R` replacements, a following `color-lint` run reports exactly `V − R` violations.
6. Given a target dir on which `color-lint-fix` has just run, a second `color-lint-fix` run with
   empty stdin leaves every file byte-identical.
7. When `color-lint-fix` finishes, the last summary line is
   `Replaced <N> color(s) in <M> file(s); <K> without a matching token, <S> skipped.`.
   `<K>` counts violations with no usable token for their file type. `<S>` counts violations that
   had candidates but were not replaced (invalid answer or end of stdin).
8. `color-lint-fix -t <path>` / `--tokens <path>` and `-c` / `--changed` select tokens and files
   the same way `color-lint` does. Given `tokens/colors.scss` defining `$primary-blue: #0052cc;`,
   `color-lint-fix -t tokens/colors.scss` replaces `#0052cc` with `$primary-blue`. Given a git
   repo where only `src/a.scss` is modified, `color-lint-fix -c` leaves an unmodified
   `src/b.scss` containing `#0052cc` unchanged.

*Interactive pick — `src/fix-cli.ts`*

9. Given tokens `$white: #fff;` then `$surface-white: #fff;` and `src/app.scss` with two
   `color: #fff;` declarations, when `color-lint-fix` runs with stdin `1\n2\n`, two prompts are
   printed. The first declaration becomes `$white` and the second `$surface-white`.
10. Given a violation with exactly one usable token, `color-lint-fix` replaces it and prints no
    `Pick a token` prompt for it.

*File-type safety — `src/core/fixer.ts`*

11. Given only `$primary-blue: #0052cc;` as a token and `src/app.css` with `color: #0052cc;`,
    after `color-lint-fix` `src/app.css` is unchanged, and the violation is counted in `<K>`.
12. Given tokens `$white: #fff;` and `--white: #fff;` and `src/app.css` with `color: #fff;`,
    `color-lint-fix` replaces it with `var(--white)` without prompting, because only one candidate
    is valid in `.css`.
13. Given a matching token and `src/app.ts`, `src/app.js` and `src/index.html` each containing
    `#0052cc`, after `color-lint-fix` all three files are byte-identical to before.

*CLI contract — `src/fix-cli.ts`, `src/cli.ts`*

14. Given a run that completes with some violations left (no match or skipped), `color-lint-fix`
    exits `0`.
15. Given a target dir with a matching token and `src/app.scss` containing `#0052cc`, running
    `color-lint` (not `-fix`) leaves every file byte-identical.

*Output styling — `src/fix-cli.ts`, `src/utils/reporter.ts` (amendment 2026-09-30)*

16. Given a multi-match violation and `FORCE_COLOR=1`, the `color-lint-fix` output uses the same
    styling as `reportViolations()`. The file header is `chalk.underline.blueBright('📄 <relative path>')`.
    The violation line is byte-identical to the line `reportViolations()` prints for that violation
    (yellow `⚠`, white `Line x, Col y`, gray separators, magenta property, bold red value). Each
    candidate token name is `chalk.green`, and the `Pick a token …:` prompt is `chalk.cyan`.
17. Given `FORCE_COLOR=0`, `src/app.scss` with multi-match violations on lines 4 and 9, and stdin
    `1\n1\n`, stdout contains exactly one `📄 src/app.scss` line for that file. Each violation is
    printed as `  ⚠  Line <n>, Col <n>  |  <property>: <value>`, followed by one
    `     <i>) <token>` line per candidate and then `     Pick a token [1-N, s=skip, q=quit]:`.
    A blank line separates the two violation blocks.
18. Given a multi-match violation answered with a valid number, no outcome message is printed for
    it. The output contains no `Replaced with` / `Skipped` / `Invalid choice` text for that
    violation.
19. Given `FORCE_COLOR=1` and a run with `N` replaced, `K` without a match and `S` skipped, the
    summary line reads as in criterion 7, with `N` in `chalk.green`, `K` in `chalk.red` and `S` in
    `chalk.yellow`. With `FORCE_COLOR=0` it is byte-identical to criterion 7's text.

*Skip and invalid answers — `src/fix-cli.ts` (amendment 2026-09-30)*

20. Given a multi-match violation and stdin `s\n`, the violation is unchanged, the line
    `     Skipped.` (yellow) is printed after the prompt, and it is counted in `<S>`.
21. Given a multi-match violation and stdin `abc\n`, the violation is unchanged, the line
    `     Invalid choice, hence skipped.` (yellow) is printed after the prompt, it is counted in
    `<S>`, and no second prompt is shown for that violation.

*Stopping early — `src/fix-cli.ts`, `src/core/fixer.ts` (amendment 2026-09-30)*

22. Given three multi-match violations in `src/app.scss` and stdin `1\nq\n`, after
    `color-lint-fix` the first violation is replaced on disk and the second and third are
    unchanged. The process exits `0`.
23. Given stdin `q\n` at the first prompt, which comes after a single-match violation earlier in
    `src/a.scss` and before another single-match violation in `src/b.scss` (file order), `src/a.scss`
    is written with its replacement and `src/b.scss` is byte-identical. Nothing after the quit point
    is processed.
24. Given a run stopped with `q` where `P` violations were not processed (the one at the quit
    prompt plus every later one), the line `Stopped early: <P> violation(s) not processed.` (yellow)
    is printed directly before the summary line. The summary's `N` / `K` / `S` count only
    processed violations.
25. Given `color-lint-fix` waiting at a prompt after one earlier pick, when the process receives
    `SIGINT` (Ctrl+C), the earlier pick is written to disk, the criterion-24 line and the summary
    are printed, and the process exits `130`.

## Edge cases

1. (revised 2026-09-30) Given tokens `$white: #fff;` and `$surface-white: #fff;` and a
   `color: #fff;` violation, stdin answers `0`, `3`, `abc` and an empty line each leave the
   violation unchanged, with no re-ask, and each prints `     Invalid choice, hence skipped.`.
   The violation is counted in `<S>`, and the next violation's prompt still appears.
2. Given a multi-match violation and stdin that ends before an answer (empty stdin, as in CI),
   `color-lint-fix` does not hang. It leaves that violation unchanged (counted in `<S>`) and still
   replaces single-match violations in the same run.
3. Given `box-shadow: 0 0 0 #0052cc, 0 0 0 #fff;` with both colors matching a single token each,
   both are replaced within the one declaration.
4. Given two declarations on one line (`a { color: #0052cc; background: #fff; }`), both are
   replaced.
5. Given `color: white;` and the token `$surface-white: #ffffff;`, the line becomes
   `color: $surface-white;`. Given `color: $primary-blue;` (already a token), nothing is changed.
   Detection matches `color-lint`'s, including the char-before guard.
6. Given a `.scss` comment `/* old: #0052cc */`, the comment is unchanged.
7. Given `color-lint-fix -t tokens/colors.scss`, where `tokens/colors.scss` sits inside the
   scanned tree, `tokens/colors.scss` is never modified, and auto-discovered `_variables*.scss`
   files are never modified either.
8. Given `color-lint-fix --tokens does-not-exist.scss`, it prints an error naming
   `does-not-exist.scss` to stderr, modifies no file, and exits `1`.
9. Given no token file and no `--tokens`, `color-lint-fix` modifies no file, prints
   `Replaced 0 color(s) in 0 file(s); <K> without a matching token, 0 skipped.`, and exits `0`.
10. Given a `.scss` file with CRLF line endings, the endings are preserved after replacement.
11. Given a scanned `.scss` file that PostCSS cannot parse, `color-lint-fix` prints an error
    naming that file to stderr, modifies **no** file (all files are parsed and all picks made
    before anything is written), and exits `1`.
12. Given stdin `S\n` or `  s  \n`, the answer is treated as `s` (skip). Given `Q\n` or `  q  \n`,
    it is treated as `q` (quit). Both are trimmed and case-insensitive.
13. Given `box-shadow: 0 0 0 #fff, 0 0 0 #fff;` with two candidates each and stdin `2\nq\n`, the
    first `#fff` is replaced, the second is unchanged, and the rest of the declaration is
    byte-identical.
14. Given a run whose stdin ends (EOF) at a prompt, behavior is unchanged from edge case 2. It is
    a skip, not a quit, and no `Stopped early` line is printed.
15. Given `q` at the very first prompt with no earlier single-match violations, no file is
    modified, and `Stopped early: <P> …` counts every violation from that prompt on.

## Affected files
| File | Change |
|---|---|
| `src/fix-cli.ts` | **new** — commander entry for `color-lint-fix`: `-t/--tokens`, `-c/--changed`, line-by-line stdin prompt (invalid answer or end of stdin → skip), summary line, exit codes |
| `src/core/fixer.ts` | **new** — plan and apply replacements for one file: PostCSS walk (postcss-scss), per-match offset within `decl.value`, file-type token filter (`.css` → `var(--x)` only), injected `choose(violation, candidates)` callback so prompting stays out of the core; returns new content + counts |
| `src/core/scanner.ts` | modified, **no behavior change** — extract the per-declaration match loop (patterns + char-before guard) into an exported helper returning match text and offset, so `fixer.ts` detects exactly what `scanCssFile` flags (criterion 5). Needed because `ColorViolation.column` is the declaration's start, not the color's |
| `src/cli.ts` | modified, **no behavior change** — optionally extract token-file / file-list resolution into a helper shared with `fix-cli.ts` |
| `bin/color-lint-fix.js` | **new** — `require('../dist/src/fix-cli.js')` |
| `package.json` | modified — add `"color-lint-fix": "./bin/color-lint-fix.js"` to `bin` |
| `tests/fixer.test.ts` | **new suite** — criteria 1-2, 4, 11-13; edge cases 3-7, 10 |
| `tests/fix-cli.test.ts` | **new suite** — criteria 3, 5-10, 14-15; edge cases 1-2, 8-9, 11 (temp target dir, child process, answers via `spawnSync` `input`) |
| `tests/scanner.test.ts` | stays green — guards the no-behavior-change refactor |
| `vitest.config.mts` | add `src/core/fixer.ts` to `coverage.include` (`fix-cli.ts` stays out, like `cli.ts`: child process) |
| `README.md` | update — `color-lint-fix` usage, flags, prompt, summary, file-type rules, "tokens must be in scope" caveat |
| `AGENTS.md` | update — architecture map gains `fix-cli.ts` and `core/fixer.ts`; exit-code note for `color-lint-fix` |
| `src/fix-cli.ts` (2026-09-30) | modified — chalk styling (16, 19), per-file `📄` grouping + indented prompt layout (17), `s` / invalid messages (20-21), `q` + `SIGINT` handler that stops planning and writes the picks made so far (22-25, exit `130` on SIGINT) |
| `src/utils/reporter.ts` (2026-09-30) | modified, **no behavior change** — export the file-header and violation-line formatters so `fix-cli.ts` prints byte-identical lines (16) |
| `src/core/fixer.ts` (2026-09-30) | modified — `ChooseToken` can signal "stop"; `fixFile` returns content with only the replacements decided before the stop, plus a not-processed count (22-24, EC-13) |
| `tests/fix-cli.test.ts` (2026-09-30) | modified — update the prompt-text assertions for revised 3 and EC-1; add 16-25, EC-12, EC-14, EC-15 (`FORCE_COLOR=1` for the styling tests; `child.kill('SIGINT')` for 25) |
| `tests/fixer.test.ts` (2026-09-30) | modified — add EC-13 (stop partway through one declaration) |
| `tests/reporter.test.ts` (2026-09-30) | stays green — guards the formatter extraction |
| `README.md` (2026-09-30) | update — `s` / `q` / Ctrl+C at the prompt, sample colored output, `Stopped early` line, exit `130` |
| `AGENTS.md` (2026-09-30) | update — `color-lint-fix` exit codes gain `130` on SIGINT |

## Open questions
- In criterion 7, violations in `.ts` / `.js` / `.html` files are assumed **not counted** at all
  (the fixer never processes those files). Alternative: count them in `<K>`. Confirm.
- The exact prompt layout in criterion 3 (how the violation line and candidates look) was
  defaulted. Only the numbered order and the `Pick a token [1-N]:` text are asserted.
- Criterion 12 and edge cases 3-11 were defaulted during refinement, not asked. Confirm.
- (2026-09-30) Defaulted, not asked: `q` exits `0` but Ctrl+C exits `130` (the shell convention for
  an interrupt, criterion 25); `s` / `q` are trimmed and case-insensitive (EC-12); the
  `Stopped early: <P> violation(s) not processed.` wording and its placement (24). Confirm.

## Revisions
- 2026-09-30 — Output styling, skip/invalid messages and stop-early: AC-3 and EC-1 revised (prompt
  text `[1-N, s=skip, q=quit]`, invalid message); AC-16 to AC-25 and EC-12 to EC-15 added; Goals and
  Non-goals extended; `reporter.ts` and `fixer.ts` added to Affected files.
