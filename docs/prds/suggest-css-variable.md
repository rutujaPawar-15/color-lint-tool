# Suggest a design token for each violation

**Status:** Draft
**Slug:** suggest-css-variable

## Problem
`color-lint` reports every hard-coded color (`reportViolations()` in `src/utils/reporter.ts`
prints file, line, column, property, value) but gives the developer no hint what to replace it
with. The target project's design tokens already live in `_variables.scss` /
`_variables-new.scss` (`SCAN_CONFIG.sourceOfTruth`), yet nothing reads them — `file-finder.ts`
only uses that list to *exclude* those files. `AGENTS.md` describes `core/variables.ts`,
`loadVariables()`, `suggestVariable()`, a `--variables` flag and `SCAN_CONFIG.valuePatterns`;
none of these exist in `src/` today.

## Goals
- Load color tokens from the target project's token file(s) and, for every violation, print the
  token(s) whose value is the same color.
- Token source is configurable with `--tokens <path>` (short: `-t`); without it, auto-discover the
  `SCAN_CONFIG.sourceOfTruth` files in the target dir.
- (2026-10-01) A `--tokens` file must be inside the git repository that contains the cwd
  (`git rev-parse --show-toplevel`). It may sit outside the cwd. When the cwd is not in a git repo,
  it must be inside the cwd. This applies to every `-t` run of both `color-lint` and `color-lint-fix`.
- (2026-10-01, AC-46) Without `--tokens`, auto-discovery searches the **whole git repository** that
  contains the cwd (from `git rev-parse --show-toplevel`), not only the cwd. When the cwd is not in
  a git repo, it searches the cwd as before. Every `sourceOfTruth` file found (minus
  `SCAN_CONFIG.exclude` folders) is merged, in sorted path order. Applies to both binaries. Only
  token discovery widens: the files that get scanned are still the ones under the cwd.
- Match by *color*, not by string: hex (any case, 3/4/6/8 digits), `rgb()/rgba()`,
  `hsl()/hsla()` and the named colors in `SCAN_CONFIG.patterns.named` all normalize to one form
  before comparing. Alpha must match exactly.
- Read both SCSS variables (`$name: <color>` → suggest `$name`) and CSS custom properties
  (`--name: <color>` → suggest `var(--name)`).
- Each suggestion is printed on its own indented line, labelled `Suggestion:`, directly under the
  violation it belongs to.
- When several tokens match, only the **primary** one is printed, followed by `(+N more)`. The
  primary is simply the **first** match: token files in the order they are loaded
  (auto-discovered files in sorted path order), then declaration order within a file.
- Existing violation detection, count, summary and exit code are unchanged.

## Non-goals
- **Auto-replacing** the hard-coded value in source files (a `--fix` mode). Separate, later PRD.
- **Suggesting a "closest" token** for a color with no exact match (delta-E / nearest-color).
  No exact match → no suggestion.
- **Suggestions for `transparent` and `currentColor`.** They are reported as today, never with a
  suggestion.
- **Resolving token aliases** (`$brand: $primary-blue;`). A token whose value is not itself a
  literal color is skipped.
- **Changing what gets flagged.** No change to `scanner.ts` detection, the `scanTextFile`
  char-before gap, or the `.less` dead path (see `AGENTS.md` §6).
- **`--changed` against a PR base ref** — unrelated, still tracked in `AGENTS.md` §6.
- **Multiple `--tokens` paths.** The flag takes one path.
- **The cwd boundary for `--tokens` when inside a repo** (2026-10-01). Inside a repo, the token file
  is bounded by the repo root, not the cwd. The stricter cwd boundary belongs to `-f/--file`
  (`single-file` PRD, EC-13 to EC-18). ~~Auto-discovered token files are always under the cwd, so the
  new check never applies to them.~~ (Revised 2026-10-01, AC-46: auto-discovered files can now sit
  outside the cwd, but they are always found inside the repo, so the `-t` check still never applies
  to them.)
- **Nearest-first or walk-up-only discovery** (2026-10-01). Repo-wide discovery merges every token
  file in the repo, sibling packages of a monorepo included. Files under the cwd get no priority
  (EC-25), and discovery is not limited to the cwd's ancestor directories. Use `-t` to narrow it.
- **Honoring `.gitignore` in token discovery** (2026-10-01). Only `SCAN_CONFIG.exclude` filters
  discovered token files, as before.
- **A `--variables` alias.** The flag was renamed to `--tokens` before ever being committed or
  released; `--variables` is simply an unknown option.
- **Renaming internal identifiers** (`core/variables.ts`, `loadVariables()`, `suggestVariable()`).
  Only the user-facing flag changes.
- **Machine-readable output** (JSON etc.). Terminal output only.
- **Naming the alternative tokens** anywhere in the output (no end-of-report legend, no
  `--all-suggestions` flag). Only the primary token and the count are printed.
- **Explaining the pick** (e.g. `matched "button"`). Ranking is invisible in the output.
- **Ranking suggestions by context** (moved from Goals, 2026-09-30). Picking the primary token
  by words shared with the violation's selector / file name / property, the `SCAN_CONFIG`
  abbreviation table, the `_variables-new.scss` tie-break preference, and recording `selector` on
  violations were all agreed and implemented, then dropped as too complex for the benefit
  (AC-29 to AC-39, EC-14 to EC-20 retired). The primary is the first match.

## Acceptance criteria

*Token loading & matching — `src/core/variables.ts` (`loadVariables()`, `suggestVariable()`)*

1. Given a token file containing `$primary-blue: #0052cc;`, when it is loaded and
   `suggestVariable('#0052cc', tokens)` is called, the result is `['$primary-blue']`.
2. Given the same tokens, `suggestVariable('#0052CC', tokens)` returns `['$primary-blue']`
   (hex comparison ignores case).
3. Given a token `$surface-white: #ffffff;`, `suggestVariable('#fff', tokens)` returns
   `['$surface-white']` (shorthand hex expands before comparing).
4. Given a token `$surface-white: #fff;`, `suggestVariable('#ffffff', tokens)` returns
   `['$surface-white']` (expansion applies to token values too).
5. Given the `$primary-blue: #0052cc;` token, `suggestVariable('rgb(0, 82, 204)', tokens)`
   returns `['$primary-blue']`.
6. Given the same token, `suggestVariable('rgba(0, 82, 204, 1)', tokens)` returns
   `['$primary-blue']` (alpha 1 equals opaque hex).
7. Given the same token, `suggestVariable('rgba(0, 82, 204, 0.5)', tokens)` returns `[]`
   (alpha must match exactly).
8. Given a token `$primary-blue-50: #0052cc80;`, `suggestVariable('rgba(0, 82, 204, 0.5)', tokens)`
   returns `['$primary-blue-50']` (alpha 0.5 → `0x80`, rounded).
9. Given the `$primary-blue: #0052cc;` token, `suggestVariable('hsl(216, 100%, 40%)', tokens)`
   returns `['$primary-blue']`.
10. Given a token `$brand: rgb(0, 82, 204);`, `suggestVariable('#0052cc', tokens)` returns
    `['$brand']` (token values are normalized with the same rules as violations).
11. Given a token `$surface-white: #ffffff;`, `suggestVariable('white', tokens)` returns
    `['$surface-white']` (named colors map to their CSS hex value).
12. Given tokens `$clear: transparent;` and `$ink: currentColor;`, `suggestVariable('transparent', tokens)`
    and `suggestVariable('currentColor', tokens)` both return `[]`.
13. Given a token file containing `--primary-blue: #0052cc;`, `suggestVariable('#0052cc', tokens)`
    returns `['var(--primary-blue)']`.
14. Given tokens `$white: #fff;` then `$surface-white: #ffffff;` in that order,
    `suggestVariable('#ffffff', tokens)` returns `['$white', '$surface-white']` (all matches, in
    declaration order).
15. Given tokens that do not include `#123456`, `suggestVariable('#123456', tokens)` returns `[]`.

*Reporting — `src/utils/reporter.ts`*

16. (revised 2026-09-30) Given a violation `{ line: 4, column: 10, value: '#0052cc', property: 'color', suggestions: ['$primary-blue'] }`,
    `reportViolations()` prints the violation line in today's format
    (`  ⚠  Line 4, Col 10  |  color: #0052cc`, no `→`), and the very next line printed is
    `     Suggestion: $primary-blue`.
17. (revised 2026-09-30) Given a violation with `suggestions: ['$white', '$surface-white', '$bg-default']`,
    the line printed directly after it is `     Suggestion: $white (+2 more)` — only the first
    (primary) suggestion is named, followed by the count of the others.
18. (revised 2026-09-30) Given a violation with no suggestions (`suggestions` absent or `[]`), its line has
    today's format (`Line <n>, Col <n>  |  <property>: <value>`) and no `Suggestion:` line is
    printed for it.

*Token source & CLI — `src/cli.ts`, `src/utils/file-finder.ts`*

19. (revised 2026-09-30) Given a target dir with `styles/_variables.scss` defining `$primary-blue: #0052cc;` and
    `src/app.scss` containing `color: #0052cc;`, when `color-lint` runs with no flags, the output
    for `src/app.scss` contains the line `Suggestion: $primary-blue`.
20. Given a target dir with both `_variables.scss` (`$primary-blue: #0052cc;`) and
    `_variables-new.scss` (`$accent: #ff0000;`), when `color-lint` runs, violations `#0052cc` and
    `#ff0000` get `$primary-blue` and `$accent` respectively (all discovered token files are
    merged).
21. Given a target dir whose only `_variables.scss` is under `node_modules/`, when `color-lint`
    runs, no suggestions are printed (auto-discovery honors `SCAN_CONFIG.exclude`).
22. (revised 2026-09-30) Given `tokens/colors.scss` defining `$primary-blue: #0052cc;`, when
    `color-lint --tokens tokens/colors.scss` runs, `#0052cc` violations are followed by
    `Suggestion: $primary-blue`.
23. (revised 2026-09-30) Given a target dir with `_variables.scss` defining `$old: #0052cc;` and `tokens/colors.scss`
    defining `$primary-blue: #0052cc;`, when `color-lint --tokens tokens/colors.scss` runs, the
    suggestion is `$primary-blue` only — auto-discovery is skipped when the flag is given.
24. (revised 2026-09-30) When `color-lint --tokens does-not-exist.scss` runs, it prints an error naming
    `does-not-exist.scss` to stderr, scans nothing, and exits `1`.
25. (revised 2026-09-30) Given a target dir with no token file and no `--tokens`, `color-lint` output contains no
    `Suggestion:` line, prints no error, and the violation count and exit code are what they are today.
26. Given a target dir where violations do get suggestions, the violation count in the summary
    line and the exit code (`1`) are identical to a run where the token file is absent.
27. Given `tokens/colors.scss` defining `$primary-blue: #0052cc;`, when
    `color-lint -t tokens/colors.scss` runs, `#0052cc` violations are followed by
    `Suggestion: $primary-blue` (`-t` is the short form of `--tokens`).
28. When `color-lint --variables tokens/colors.scss` runs, it exits `1` with commander's
    unknown-option error for `--variables` on stderr, and scans nothing.

*Primary-token ranking — retired 2026-09-30 (see Non-goals). Tests to delete: the
`suggestVariable — primary-token ranking by context` describe block in `tests/variables.test.ts`
and the `selector capture` describe block in `tests/scanner.test.ts`.*

29. ~~Given context `{ selector: '.button', … }`, `suggestVariable('#fff', tokens, context)` returns
    `['$button-bg', '$text-white']` (selector word shared).~~ (retired 2026-09-30 — context ranking dropped; primary is the first match)
30. ~~A token sharing a file-name word ranks first.~~ (retired 2026-09-30 — context ranking dropped)
31. ~~A token sharing a property word ranks first.~~ (retired 2026-09-30 — context ranking dropped)
32. ~~Two shared words beat one.~~ (retired 2026-09-30 — context ranking dropped)
33. ~~`btn` in the context matches `button` in the token (abbreviation table).~~ (retired 2026-09-30 — abbreviation table removed)
34. ~~`bg` in the token matches `background` in the property (abbreviation table).~~ (retired 2026-09-30 — abbreviation table removed)
35. ~~With no shared word, declaration order is kept.~~ (retired 2026-09-30 — declaration order is now the only order; covered by AC-14)
36. ~~On a tie, `_variables-new.scss` tokens rank first regardless of path order.~~ (retired 2026-09-30 — no file preference; files keep load order)
37. ~~A context match beats the `_variables-new.scss` preference.~~ (retired 2026-09-30 — context ranking dropped)

*Selector capture — `src/core/scanner.ts`*

38. ~~Given `.button { &:hover { color: #fff; } }`, `scanFile()` reports `selector: '.button &:hover'`.~~ (retired 2026-09-30 — `selector` existed only to feed ranking; scanner output returns to its pre-feature shape)
39. ~~Root-level SCSS declarations and `.ts` / `.html` violations have no `selector` property.~~ (retired 2026-09-30 — no `selector` property at all)

*End to end — `src/cli.ts`, `src/utils/reporter.ts`*

40. (revised 2026-09-30) Given a target dir with `_variables.scss` defining `$text-white: #fff;` then
    `$button-bg: #fff;`, and `src/app.scss` containing `.button { background: #fff; }`, when
    `color-lint` runs, the violation is followed by `Suggestion: $text-white (+1 more)` — the
    first-declared match, regardless of the selector, file name or property.

*Token file boundary (2026-10-01) — `src/utils/file-finder.ts`, `src/cli.ts`, `src/fix-cli.ts`*

41. Given a git repo `repo/` with the cwd at `repo/app/`, where `repo/shared/colors.scss` defines
    `$primary-blue: #0052cc;` and `repo/app/a.scss` contains `color: #0052cc;`, when
    `color-lint -t ../shared/colors.scss` runs from `repo/app/`, the violation is followed by
    `Suggestion: $primary-blue` and no "outside" error appears.
42. Given a git repo `repo/` (the cwd) containing `a.scss` with `color: #0052cc;`, and a sibling
    directory `other/` that is not part of `repo/`, with `other/colors.scss` defining
    `$primary-blue: #0052cc;`, when `color-lint -t ../other/colors.scss` runs from `repo/`, stderr
    contains `Fatal Error: Token file is outside the repository: ../other/colors.scss` (the path as
    typed), no violation lines are printed, and the exit code is `1`.
43. Given the same layout as AC-42, where `repo/a.scss` has a single-match color, when
    `color-lint-fix -t ../other/colors.scss` runs from `repo/`, stderr contains
    `Fatal Error: Token file is outside the repository: ../other/colors.scss`, the exit code is
    `1`, and `repo/a.scss` is byte-for-byte unchanged.
44. Given a git repo `repo/` (the cwd) and a token file `colors.scss` in a temp directory not inside
    `repo/`, when `color-lint -t <absolute path to that colors.scss>` runs from `repo/`, stderr
    contains `Fatal Error: Token file is outside the repository: <that absolute path>` and the
    exit code is `1`. The check uses the resolved location, not a leading `..`.
45. Given the cwd `proj/` is not inside any git repository and `../shared/colors.scss` exists next
    to it, when `color-lint -t ../shared/colors.scss` runs from `proj/`, stderr contains
    `Fatal Error: Token file is outside the current directory: ../shared/colors.scss` and the exit
    code is `1`. (The accepted side of this fallback, a token file inside a non-repo cwd, is
    already AC-22, whose test runs in a plain temp dir.)

*Repo-wide token discovery (2026-10-01) — `src/utils/file-finder.ts` (`findTokenFiles()`)*

46. Given a git repo `repo/` with the cwd at `repo/app/`, where `repo/styles/_variables.scss`
    defines `$primary-blue: #0052cc;` and `repo/app/a.scss` contains `color: #0052cc;`, when
    `color-lint` runs from `repo/app/` with no flags, the violation is followed by
    `Suggestion: $primary-blue`.
47. Given the same layout as AC-46, when `color-lint-fix` runs from `repo/app/` with no flags,
    `repo/app/a.scss` is rewritten to `color: $primary-blue;` and the exit code is `0` (a single
    match is applied with no prompt).
48. Given the cwd `proj/` is not inside any git repository, `../styles/_variables.scss` next to it
    defines `$primary-blue: #0052cc;`, and `proj/a.scss` contains `color: #0052cc;`, when
    `color-lint` runs from `proj/`, no `Suggestion:` line is printed and stderr contains no error
    or warning.
49. Given a git repo `repo/` with the cwd at `repo/app/`, where the only token file is
    `repo/node_modules/pkg/_variables.scss` (defining `$primary-blue: #0052cc;`) and
    `repo/app/a.scss` contains `color: #0052cc;`, when `color-lint` runs from `repo/app/`, no
    `Suggestion:` line is printed.
50. Given the same layout as AC-46, plus `repo/other/b.scss` containing `color: #ff0000;`, when
    `color-lint` runs from `repo/app/`, the output has a file header for `a.scss`, none for `b.scss`
    or any path containing `other`, and the summary counts 1 violation (the scan scope is still the
    cwd).

## Edge cases

1. Given `$primary-blue: #0052cc !default;` (or `!important`), the token loads as
   `$primary-blue` → `#0052cc`.
2. Given non-color tokens (`$spacing: 8px;`, `$brand: $primary-blue;`), they are skipped with no
   error, and color tokens in the same file still load.
3. Given `:root { --primary-blue: #0052cc; }` (custom property nested in a rule), the token loads
   as `var(--primary-blue)`.
4. Given a token file whose comments contain `$ghost: #0052cc;`, no `$ghost` suggestion appears.
5. Given `$full: #0052ccff;`, `suggestVariable('#0052cc', tokens)` returns `['$full']`
   (8-digit hex with `ff` alpha equals opaque 6-digit).
6. Given the `$primary-blue: #0052cc;` token, `suggestVariable('rgb(0 82 204 / 1)', tokens)`
   (space/slash syntax) returns `['$primary-blue']`.
7. Given a token `$green: #00ff00;`, `suggestVariable('rgb(0%, 100%, 0%)', tokens)` returns
   `['$green']` (percent channels scale to 0-255).
8. Given the `$primary-blue: #0052cc;` token, `suggestVariable('hsl(216deg, 100%, 40%)', tokens)`
   and `suggestVariable('hsla(216, 100%, 40%, 1)', tokens)` both return `['$primary-blue']`.
9. Given a token file that defines the same name twice (`$a: #fff;` … `$a: #000;`), the last
   declaration wins (SCSS semantics): `#000` suggests `$a`, `#fff` does not.
10. (revised 2026-10-01) Given a git repo `repo/` with the cwd at `repo/app/` and
    `repo/shared/colors.scss` defining `$primary-blue: #0052cc;`, when
    `color-lint --tokens ../shared/colors.scss` runs from `repo/app/`, the path is resolved against
    `process.cwd()` and `#0052cc` violations get `Suggestion: $primary-blue`.
11. Given a `.ts` or `.html` file violation `#0052cc`, it gets the same suggestion as a `.scss`
    violation (suggestions are not limited to CSS-like files).
12. (revised 2026-10-01) Given `tokens/broken.scss` that PostCSS cannot parse (e.g. an unclosed
    block `a { color: #fff;`), when `color-lint --tokens tokens/broken.scss` runs, stderr contains
    `broken.scss`, nothing is scanned, and the exit code is `1`. (`--tokens` only; the
    auto-discovered case is EC-23.)
13. Given a token defined in both SCSS and custom-property form in one file
    (`$primary-blue: #0052cc;` and `--primary-blue: #0052cc;`), the suggestion is
    `['$primary-blue', 'var(--primary-blue)']` in declaration order.
14. ~~Context words split on camelCase and compare case-insensitively.~~ (retired 2026-09-30 — context ranking dropped)
15. ~~Every abbreviation-table pair matches in both directions.~~ (retired 2026-09-30 — abbreviation table removed)
16. ~~Distinct shared words are counted once.~~ (retired 2026-09-30 — context ranking dropped)
17. ~~Token syntax (`$`, `--`, `var(…)`) is not a word.~~ (retired 2026-09-30 — context ranking dropped)
18. ~~With no selector (`.ts`/`.html`), the file name still ranks.~~ (retired 2026-09-30 — context ranking dropped)
19. ~~The file extension is not a word.~~ (retired 2026-09-30 — context ranking dropped)
20. ~~With no context, results are in tie-break order (`_variables-new.scss` first).~~ (retired 2026-09-30 — `suggestVariable` takes no context; order is load order, covered by AC-14)
21. Given `loadVariables([<_variables.scss defining $old-white: #fff>, <_variables-new.scss defining $white: #fff>])`,
    `suggestVariable('#fff', tokens)` returns `['$old-white', '$white']` — tokens keep the order
    their files were passed in; `_variables-new.scss` gets no preference.
22. Given a git repo `repo/` (the cwd) and `../missing.scss` does not exist, when
    `color-lint -t ../missing.scss` runs from `repo/`, stderr contains
    `Fatal Error: Token file is outside the repository: ../missing.scss`, does not contain AC-24's
    not-found error, and the exit code is `1`. The boundary check runs before the existence check
    (the same order as `-f/--file`, `single-file` EC-18).
23. Given `styles/_variables.scss` that PostCSS cannot parse, `styles/_variables-new.scss` defining
    `$primary-blue: #0052cc;`, and `src/app.scss` containing `color: #0052cc;`, when `color-lint`
    runs with no `-t`, stderr contains `Warning: Could not load design token file` followed by a
    path ending in `_variables.scss` and then `. Its tokens are ignored.`. The `#0052cc` violation
    is still reported with `Suggestion: $primary-blue`, and the exit code is `1` (from the
    violation; with no violations it would be `0`).
24. Given the same files as EC-23, when `color-lint-fix` runs with no `-t`, stderr contains the
    same `Warning: Could not load design token file … Its tokens are ignored.` line,
    `src/app.scss` is rewritten to `color: $primary-blue;`, and the exit code is `0`.
25. Given a git repo `repo/` with the cwd at `repo/app/`, where `repo/app/_variables.scss` defines
    `$app-white: #fff;`, `repo/styles/_variables.scss` defines `$base-white: #fff;`, and
    `repo/app/a.scss` contains `color: #fff;`, when `color-lint` runs from `repo/app/`, the violation
    is followed by `Suggestion: $app-white (+1 more)`. Files load in sorted path order
    (`app/…` before `styles/…`); the file nearer the cwd gets no priority.
26. Given a git repo `repo/` with the cwd at `repo/app/`, where `repo/legacy/_variables.scss` cannot
    be parsed by PostCSS, `repo/styles/_variables-new.scss` defines `$primary-blue: #0052cc;`, and
    `repo/app/a.scss` contains `color: #0052cc;`, when `color-lint` runs from `repo/app/`, stderr
    contains `Warning: Could not load design token file` followed by a path ending in
    `legacy/_variables.scss` and then `. Its tokens are ignored.`, the violation is still followed by
    `Suggestion: $primary-blue`, and the exit code is `1`.
27. Given a git repo `repo/` that is also the cwd, with `repo/styles/_variables.scss` defining
    `$primary-blue: #0052cc;` and `repo/src/app.scss` containing `color: #0052cc;`, when
    `color-lint` runs from `repo/`, the output contains `Suggestion: $primary-blue` (unchanged
    behavior when the repo root is the cwd).

## Affected files
| File | Change |
|---|---|
| `src/core/variables.ts` | **new** — `loadVariables(paths): TokenMap` (PostCSS + `postcss-scss`, reads `$x` and `--x` decls), `suggestVariable(value, tokens): string[]`, private color normalizer (hex/rgb/hsl/named → `#rrggbbaa`) |
| `src/core/constants.ts` | modified — add anchored `SCAN_CONFIG.valuePatterns` (hex, rgb, hsl, named) and a named-color → hex map for the colors in `patterns.named` |
| `src/core/types.ts` | modified — `ColorViolation` gains optional `suggestions?: string[]`. **Amendment:** also optional `selector?: string` |
| `src/utils/file-finder.ts` | modified — new `findTokenFiles(targetDir)`: finds `sourceOfTruth` basenames, honoring `exclude` |
| `src/utils/reporter.ts` | modified — append `→ a \| b` when `suggestions` is non-empty. **Amendment:** print `     Suggestion: a \| b` on its own line instead |
| `src/cli.ts` | modified — `--variables <path>` option (**amendment:** renamed `--tokens <path>` / `-t <path>`); load tokens once, attach suggestions to each violation; fatal on missing/unparseable token file |
| `src/core/scanner.ts` | **unchanged** — the `selector` capture added by the ranking amendment is reverted (2026-09-30) |
| `src/core/constants.ts` (2026-09-30) | remove `abbreviations` and `preferredTokenFile` from `SCAN_CONFIG` |
| `src/core/types.ts` (2026-09-30) | remove `selector?` from `ColorViolation` |
| `src/core/variables.ts` (2026-09-30) | remove `SuggestionContext`, ranking, `words()`/`tokenName()` and the preferred-file ordering; `suggestVariable(value, tokens)` returns matches in load order |
| `src/cli.ts` (2026-09-30) | call `suggestVariable(v.value, tokens)` without context |
| `src/utils/file-finder.ts` (2026-10-01) | new `resolveTokenFile(targetDir, tokensPath)`: resolves the path; finds the repo root with `git rev-parse --show-toplevel` (falls back to `targetDir` when not a repo); throws `Token file is outside the repository` / `… the current directory` before any existence check; returns the absolute path |
| `src/cli.ts`, `src/fix-cli.ts` (2026-10-01) | resolve `-t` through `resolveTokenFile()` instead of `path.resolve(targetDir, options.tokens)` |
| `src/core/variables.ts` (2026-10-01) | `loadVariables()` gains an optional per-file error callback: when given, an unparseable file is reported to it and skipped instead of throwing. Without it, behavior is unchanged (throws) |
| `src/cli.ts`, `src/fix-cli.ts` (2026-10-01, EC-23/24) | pass a callback that prints `Warning: <loadVariables error>. Its tokens are ignored.` to stderr, for auto-discovered files only; the `--tokens` path keeps throwing |
| `tests/scanner.test.ts` | revert to its pre-feature expectations — delete the `selector capture` block (AC-38, AC-39) and `tests/fixtures/selectors.scss` |
| `tests/variables.test.ts` | new suite — criteria 1-15, edge cases 1-9, 13. **2026-09-30:** delete the ranking block (AC-29 to AC-37, EC-14 to EC-20); add EC-21 |
| `tests/reporter.test.ts` | new suite — criteria 16-18 (**amendment:** rewrite for revised 16-18) |
| `tests/cli.test.ts` | new suite — criteria 19-26, edge cases 10-12 (temp target dir per test). **Amendment:** add 27-28; update every `→`/`--variables` assertion (19-26, EC-10-12); add 40. **2026-09-30:** rewrite 40 for first-match |
| `tests/file-finder.test.ts` | modified — `findTokenFiles` discovery + exclude. **2026-10-01:** unit tests for `resolveTokenFile` (inside repo, outside repo, absolute path, no-repo fallback, boundary-before-existence) |
| `tests/cli.test.ts` (2026-10-01) | add AC-41, 42, 44, 45 and EC-22; revise the EC-10 test to `git init` the temp dir |
| `tests/fix-cli.test.ts` (2026-10-01) | add AC-43, EC-24 |
| `tests/cli.test.ts` (2026-10-01, EC-12/23) | split the `EC-12: an unparseable token file is a fatal error…` test: keep its `--tokens` half as EC-12, rewrite its `discovered` half as EC-23 (warning + scan continues) |
| `tests/variables.test.ts` (2026-10-01) | unit test for the `loadVariables()` error callback (skips the file, keeps other files' tokens) |
| `src/utils/file-finder.ts` (2026-10-01, AC-46) | `findTokenFiles(targetDir)` globs from `repoRoot(targetDir) ?? targetDir` instead of `targetDir`; still `absolute: true`, `EXCLUDE_GLOBS`, sorted. `cli.ts` / `fix-cli.ts` call sites unchanged |
| `tests/cli.test.ts` (2026-10-01, AC-46) | add AC-46, 48, 49, 50 and EC-25, 26, 27 (temp dir + `git init`) |
| `tests/fix-cli.test.ts` (2026-10-01, AC-46) | add AC-47 |
| `tests/file-finder.test.ts` (2026-10-01, AC-46) | unit tests: `findTokenFiles` from a repo subdirectory finds a token file elsewhere in the repo; from a non-repo dir it does not look above it |
| `tests/fixtures/` | new token fixtures as needed |
| `vitest.config.mts` | add `src/core/variables.ts`, `src/utils/reporter.ts` (and `src/cli.ts` if its suite exercises it in-process) to `coverage.include` |
| `README.md` | update — `--variables` flag, auto-discovery, suggestion output example. **Amendment:** `--tokens`/`-t`, new output example; `(+N more)` and how the primary token is picked. **2026-09-30:** primary = first match; drop the ranking / abbreviation / tie-break text |
| `README.md`, `AGENTS.md` (2026-10-01, AC-46) | auto-discovery searches the whole repo (cwd when not a repo); AGENTS.md architecture map entry for `findTokenFiles()` |
| `AGENTS.md` | update — `valuePatterns` now covers rgb/hsl/named, not only hex; architecture map already names `variables.ts`. **Amendment:** document `--tokens` where the flag is mentioned. **2026-09-30:** remove the `selector`, context-ranking and abbreviation-table notes |

## Open questions
- ~~Edge case 12 (unparseable **auto-discovered** token file → fatal exit 1) was defaulted, not
  asked. Alternative: warn and continue without that file's tokens. Confirm.~~ Resolved
  2026-10-01: warn and continue (EC-23, EC-24); a `--tokens` file stays fatal (EC-12 revised).
- Criteria 1-18 were sharpened from your single criterion; confirm the wording before this
  moves to `Agreed`.

## Revisions
- 2026-09-30 — Suggestion moves to its own `Suggestion:` line: AC-16, AC-17, AC-18, AC-19, AC-22, AC-25 revised. AC-20, AC-23, AC-26, EC-10 and EC-11 keep their wording, but their tests assert `→` and must be updated.
- 2026-09-30 — Flag renamed `--variables` → `--tokens`, short form `-t`, no alias: AC-22, AC-23, AC-24, AC-25, EC-10, EC-12 revised; AC-27, AC-28 added; Goals and Non-goals updated.
- 2026-09-30 — Multiple matches print only a primary token plus `(+N more)`, ranked by shared words with the violation's selector / file name / property (with an abbreviation table), tie-break `_variables-new.scss` then declaration order: AC-17 revised again; AC-29 to AC-40 and EC-14 to EC-20 added; Goals and Non-goals updated; `scanner.ts` moves from unchanged to modified (records `selector`).
- 2026-09-30 — Context ranking dropped as too complex: primary suggestion is the first match (load order, then declaration order; no `_variables-new.scss` preference). AC-29 to AC-39 and EC-14 to EC-20 retired; AC-40 revised; EC-21 added; ranking moved from Goals to Non-goals; `scanner.ts` back to unchanged.
- 2026-10-01 — `--tokens` file must be inside the cwd's git repo (cwd boundary when not a repo), for both binaries: AC-41 to AC-45 and EC-22 added; EC-10 revised (fixture is now a git repo, so its `../shared` path stays in bounds; meaning unchanged); Goals, Non-goals and Affected files updated. README / AGENTS.md need the new rule (rows above already cover updating `--tokens` docs).
- 2026-10-01 — Open question on EC-12 resolved: an unparseable auto-discovered token file warns and is skipped instead of being fatal. EC-12 revised to the `--tokens` case only (still fatal); EC-23 (`color-lint`) and EC-24 (`color-lint-fix`) added; Affected files updated (`variables.ts` error callback).
- 2026-10-01 — Without `-t`, token auto-discovery searches the whole git repo containing the cwd (cwd when not a repo), merging all found files in sorted path order: AC-46 to AC-50 and EC-25 to EC-27 added; Goals bullet added; the Non-goals sentence "auto-discovered token files are always under the cwd" struck and revised; Non-goals added for nearest-first / walk-up discovery and `.gitignore`; Affected files updated. No existing criterion changes meaning. AC-19 to AC-21 and AC-25 run in non-repo temp dirs, where discovery is unchanged.
