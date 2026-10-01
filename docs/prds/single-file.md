# Run color-lint and color-lint-fix on a single file

**Status:** Agreed
**Slug:** single-file

## Problem
Both binaries pick their files in one of only two ways: a full scan of the cwd (`findFiles()`) or
the working-tree changes (`getChangedFiles()`, via `-c/--changed`). Both choices are made in
`src/cli.ts` and `src/fix-cli.ts`. There is no way to point `color-lint` or `color-lint-fix` at one
specific file. To check or fix a single stylesheet today, a developer has to scan the whole
project, or edit the file and depend on `--changed`.

## Goals
- A new `-f, --file <path>` option on **both** `color-lint` and `color-lint-fix` that limits the run to
  exactly that one file.
- The path resolves against `process.cwd()`, the same way `-t/--tokens` does today. Relative and
  absolute paths are both accepted.
- A named file is subject to the **same rules as discovery** (extensions, excluded folders,
  source-of-truth; for the fixer, also the fixable extensions and the `--tokens` file). A file that
  fails one of them is refused with a message saying why. It is never scanned.
- The `--file` path must resolve to a file **inside the cwd** (or a subfolder of it). A path outside
  it is a fatal error, whether given as relative or absolute (EC-13 to EC-16, EC-18).
- `-t/--tokens` and token auto-discovery work unchanged alongside `--file`.
- Without `--file`, both commands behave exactly as they do today.

## Non-goals
- **Several files, globs, or a directory** given to `--file`. It takes exactly one file. Multi-file
  and glob support is separate, later work.
- **A positional path argument** (`color-lint src/a.scss`). The option is `-f/--file` only.
- **Combining `--file` with `--changed`.** That is a fatal error (EC-3, EC-4), not an intersection.
- **Bypassing the discovery filters** by naming a file explicitly. A `_variables.scss`, a file under
  `node_modules/`, or an unsupported extension is refused, never scanned.
- **Changing the `Scanning <dir>` header** or the report layout. Single-file output uses the same
  grouped report as a full scan.
- **Narrowing token lookup to the file.** Without `-t`, tokens are still auto-discovered across the
  whole cwd.
- **Applying the cwd boundary to `-t/--tokens`.** A token file may sit outside the cwd (EC-17).
  The rule that a token file must be inside the repo applies to every `-t` run, not only with
  `--file`, so it lives in the `suggest-css-variable` PRD (the PRD that owns `--tokens`).
- **Unifying `findFiles` / `getChangedFiles`** (AGENTS.md §6). The single-file check must reuse the
  existing rules rather than add a third copy (see Affected files), but merging the two existing
  implementations is out of scope.

## Acceptance criteria
Both binaries are run as child processes with the cwd set to a temp target dir, as
`tests/cli.test.ts` and `tests/fix-cli.test.ts` already do.

1. Given a target dir containing `a.scss` and `b.scss`, both with hard-coded colors, when
   `color-lint -f a.scss` runs, every reported violation is in `a.scss` and none is in `b.scss`.
   The summary reads `across 1 file(s)` and the exit code is `1`.
2. Given a target dir containing `a.scss` and `b.scss`, both with hard-coded colors that each match
   exactly one token, when `color-lint-fix -f a.scss` runs, `a.scss` is rewritten with the tokens
   and `b.scss` is byte-for-byte unchanged. The summary reads `Replaced N color(s) in 1 file(s)`
   and the exit code is `0`.
3. Given the target dir contains `src/a.scss`, when `color-lint -f src/a.scss` and
   `color-lint -f <absolute path to src/a.scss>` run, both report the same violations under the same
   file header `src/a.scss`.
4. Given the target dir contains `src/a.scss` with a single-match color, when
   `color-lint-fix -f src/a.scss` and `color-lint-fix -f <absolute path to src/a.scss>` run (each
   on a fresh copy), both produce the same rewritten `src/a.scss`.
5. Given the target dir contains `clean.scss` with no hard-coded colors, when
   `color-lint -f clean.scss` runs, it prints `No violations found across 1 file(s)` and exits `0`.
6. Given the target dir contains `clean.scss` with no hard-coded colors, when
   `color-lint-fix -f clean.scss` runs, `clean.scss` is unchanged, the summary reads
   `Replaced 0 color(s) in 0 file(s)`, and the exit code is `0`.
7. Given `a.scss` contains `color: #0052cc;` and `tokens.scss` defines `$primary-blue: #0052cc`,
   when `color-lint -f a.scss -t tokens.scss` runs, the violation's suggestion is `$primary-blue`.
8. Given the same files as criterion 7, when `color-lint-fix -f a.scss -t tokens.scss` runs,
   `a.scss` contains `color: $primary-blue;`.
9. Given `a.scss` contains `color: #0052cc;` and `styles/_variables.scss` (elsewhere in the cwd)
   defines `$primary-blue: #0052cc`, when `color-lint -f a.scss` runs **without** `-t`, the
   violation's suggestion is `$primary-blue`. Token auto-discovery is not narrowed by `--file`.
10. Given a target dir containing `a.scss` and `b.scss`, both with hard-coded colors, when
    `color-lint` runs without `--file`, violations from both files are reported, the summary reads
    `across 2 file(s)`, and the exit code is `1`, as today. If an existing `tests/cli.test.ts`
    test already asserts this, it is the test for this criterion and no new one is added.
11. Given a target dir containing `a.scss` and `b.scss`, both with single-match colors, when
    `color-lint-fix` runs without `--file`, both files are rewritten, as today. If an existing
    `tests/fix-cli.test.ts` test already asserts this, it is the test for this criterion.

## Edge cases
1. Given `missing.scss` does not exist, when `color-lint -f missing.scss` runs, stderr contains
   `Fatal Error: File not found: missing.scss` and the exit code is `1`.
2. Given `missing.scss` does not exist, when `color-lint-fix -f missing.scss` runs, stderr contains
   `Fatal Error: File not found: missing.scss`, the exit code is `1`, and no file in the target dir
   is modified.
3. When `color-lint -f a.scss -c` runs, stderr contains
   `Fatal Error: Use either --file or --changed, not both.` and the exit code is `1`. No git
   command needs to succeed for this (the check runs before any file lookup).
4. When `color-lint-fix -f a.scss -c` runs, stderr contains the same message as EC-3, the exit
   code is `1`, and `a.scss` is unchanged.
5. Given `notes.md` contains `#ff0000`, when `color-lint -f notes.md` runs, stdout contains
   `Skipped notes.md: not a scannable file type.`, no violation is reported, and the exit code is `0`.
6. Given `node_modules/lib/x.scss` contains a hard-coded color, when
   `color-lint -f node_modules/lib/x.scss` runs, stdout contains
   `Skipped node_modules/lib/x.scss: inside an excluded folder.`, no violation is reported, and the
   exit code is `0`.
7. Given `_variables.scss` defines `$primary-blue: #0052cc`, when `color-lint -f _variables.scss`
   runs, stdout contains `Skipped _variables.scss: source-of-truth token file.`, no violation is
   reported, and the exit code is `0`.
8. Given `app.ts` contains `'#ff0000'`, when `color-lint -f app.ts` runs, the violation in `app.ts`
   is reported and the exit code is `1`. `.ts` is scannable by `color-lint`.
9. Given `app.ts` contains `'#ff0000'`, when `color-lint-fix -f app.ts` runs, stdout contains
   `Skipped app.ts: color-lint-fix only fixes .scss / .css files.`, `app.ts` is unchanged, and the
   exit code is `0`.
10. Given `tokens.scss` defines `$primary-blue: #0052cc` and also contains `color: #0052cc;`, when
    `color-lint-fix -f tokens.scss -t tokens.scss` runs, stdout contains
    `Skipped tokens.scss: it is the --tokens file.`, `tokens.scss` is unchanged, and the exit code
    is `0`.
11. Given `_variables.scss` exists, when `color-lint-fix -f _variables.scss` runs, stdout contains
    `Skipped _variables.scss: source-of-truth token file.`, the file is unchanged, and the exit
    code is `0`.
12. Given `src/` is a directory, when `color-lint -f src` runs, stderr contains
    `Fatal Error: Not a file: src` and the exit code is `1`.
13. (revised 2026-10-01) Given `../outside/x.scss` exists outside the cwd and contains a hard-coded
    color, when `color-lint -f ../outside/x.scss` runs, stderr contains
    `Fatal Error: File is outside the current directory: ../outside/x.scss` (the path as typed),
    no violation is reported, and the exit code is `1`.
14. Given `../outside/x.scss` exists outside the cwd and contains a single-match hard-coded color,
    when `color-lint-fix -f ../outside/x.scss` runs, stderr contains
    `Fatal Error: File is outside the current directory: ../outside/x.scss`, the exit code is `1`,
    and `x.scss` is byte-for-byte unchanged. No `Pick a token` prompt is shown.
15. Given `x.scss` exists in a temp directory that is not inside the cwd, when
    `color-lint -f <absolute path to that x.scss>` runs, stderr contains
    `Fatal Error: File is outside the current directory: <that absolute path>` and the exit code
    is `1`. The check uses the resolved location, not a leading `..`.
16. Given the cwd is a directory named `proj` containing `a.scss` with a hard-coded color, when
    `color-lint -f ../proj/a.scss` runs, the violation is reported under the header `a.scss` and
    the exit code is `1`. A path that resolves back inside the cwd is allowed.
17. Given a git repo `repo/` with the cwd at `repo/app/`, where `repo/shared/tokens.scss` defines
    `$primary-blue: #0052cc` and `repo/app/a.scss` contains `color: #0052cc;`, when
    `color-lint -f a.scss -t ../shared/tokens.scss` runs from `repo/app/`, the violation's
    suggestion is `$primary-blue`, the exit code is `1`, and no "outside" error appears. The cwd
    boundary applies to `--file` only.
18. Given `../missing.scss` does not exist, when `color-lint -f ../missing.scss` runs, stderr
    contains `Fatal Error: File is outside the current directory: ../missing.scss`, does not
    contain `File not found`, and the exit code is `1`. The outside check runs before the
    existence check.

## Affected files
| File | Change |
|---|---|
| `src/utils/file-finder.ts` | modified: extract the per-path rule check from `getChangedFiles` (extension / excluded segment / source-of-truth) into one helper that returns a skip reason or `null`. `getChangedFiles` and a new `resolveSingleFile(targetDir, file)` both use it. `resolveSingleFile` resolves the path, throws `File is outside the current directory` (checked first) / `File not found` / `Not a file`, and returns the absolute path or the skip reason. |
| `src/cli.ts` | modified: new `-f, --file <path>` option; `--file` + `--changed` is a fatal error; with `--file`, the file list is `resolveSingleFile()`'s single path, or the `Skipped …` message and exit `0`. |
| `src/fix-cli.ts` | modified: same option and conflict check. Adds the `isFixable` and `--tokens`-file refusals as `Skipped …` messages (EC-9, EC-10) instead of the silent filter it uses for discovered files. |
| `tests/file-finder.test.ts` | modified: unit tests for `resolveSingleFile` (EC-1, EC-5–7, EC-12, EC-13, EC-15, EC-16, EC-18 at the function level), and the existing `getChangedFiles` parity suite stays green after the refactor. |
| `tests/cli.test.ts` | modified: AC-1, 3, 5, 7, 9, 10; EC-1, 3, 5–8, 12, 13, 15–18. |
| `tests/fix-cli.test.ts` | modified: AC-2, 4, 6, 8, 11; EC-2, 4, 9–11, 14. |
| `vitest.config.mts` | unchanged: `src/utils/file-finder.ts` is already in `coverage.include`; `cli.ts` / `fix-cli.ts` stay out (child-process tested). |
| `README.md` | update: document `-f/--file` for both commands, the refusal rules, and that it cannot be combined with `--changed`. |
| `AGENTS.md` | update: architecture map (`resolveSingleFile`) and the §2 flag list for both binaries. |

## Open questions
None. All resolved during refinement. The `Skipped …` / `Fatal Error: …` message strings in
Edge cases were confirmed as written on 2026-10-01.

## Revisions
- 2026-10-01 — `--file` must resolve inside the cwd: EC-13 revised from "outside the cwd is allowed" to a fatal error (rewrite tests `EC-13: a file outside the cwd is scanned…` in `tests/cli.test.ts` and `EC-13: a file outside the cwd is allowed…` in `tests/file-finder.test.ts`); EC-14 to EC-18 added; Goals and Non-goals updated (the token-file repo boundary is deferred to `suggest-css-variable`); Affected files updated.
- 2026-10-01 — All Edge-case message strings confirmed unchanged; Open questions closed; Status → Agreed.
