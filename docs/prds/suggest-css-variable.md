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
10. (revised 2026-09-30) Given `--tokens` with a relative path, it is resolved against `process.cwd()`.
11. Given a `.ts` or `.html` file violation `#0052cc`, it gets the same suggestion as a `.scss`
    violation (suggestions are not limited to CSS-like files).
12. (revised 2026-09-30) Given a token file that PostCSS cannot parse, `color-lint` prints an error naming that file to
    stderr and exits `1` — for both `--tokens` and auto-discovered files.
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
| `tests/scanner.test.ts` | revert to its pre-feature expectations — delete the `selector capture` block (AC-38, AC-39) and `tests/fixtures/selectors.scss` |
| `tests/variables.test.ts` | new suite — criteria 1-15, edge cases 1-9, 13. **2026-09-30:** delete the ranking block (AC-29 to AC-37, EC-14 to EC-20); add EC-21 |
| `tests/reporter.test.ts` | new suite — criteria 16-18 (**amendment:** rewrite for revised 16-18) |
| `tests/cli.test.ts` | new suite — criteria 19-26, edge cases 10-12 (temp target dir per test). **Amendment:** add 27-28; update every `→`/`--variables` assertion (19-26, EC-10-12); add 40. **2026-09-30:** rewrite 40 for first-match |
| `tests/file-finder.test.ts` | modified — `findTokenFiles` discovery + exclude |
| `tests/fixtures/` | new token fixtures as needed |
| `vitest.config.mts` | add `src/core/variables.ts`, `src/utils/reporter.ts` (and `src/cli.ts` if its suite exercises it in-process) to `coverage.include` |
| `README.md` | update — `--variables` flag, auto-discovery, suggestion output example. **Amendment:** `--tokens`/`-t`, new output example; `(+N more)` and how the primary token is picked. **2026-09-30:** primary = first match; drop the ranking / abbreviation / tie-break text |
| `AGENTS.md` | update — `valuePatterns` now covers rgb/hsl/named, not only hex; architecture map already names `variables.ts`. **Amendment:** document `--tokens` where the flag is mentioned. **2026-09-30:** remove the `selector`, context-ranking and abbreviation-table notes |

## Open questions
- Edge case 12 (unparseable **auto-discovered** token file → fatal exit 1) was defaulted, not
  asked. Alternative: warn and continue without that file's tokens. Confirm.
- Criteria 1-18 were sharpened from your single criterion; confirm the wording before this
  moves to `Agreed`.

## Revisions
- 2026-09-30 — Suggestion moves to its own `Suggestion:` line: AC-16, AC-17, AC-18, AC-19, AC-22, AC-25 revised. AC-20, AC-23, AC-26, EC-10 and EC-11 keep their wording, but their tests assert `→` and must be updated.
- 2026-09-30 — Flag renamed `--variables` → `--tokens`, short form `-t`, no alias: AC-22, AC-23, AC-24, AC-25, EC-10, EC-12 revised; AC-27, AC-28 added; Goals and Non-goals updated.
- 2026-09-30 — Multiple matches print only a primary token plus `(+N more)`, ranked by shared words with the violation's selector / file name / property (with an abbreviation table), tie-break `_variables-new.scss` then declaration order: AC-17 revised again; AC-29 to AC-40 and EC-14 to EC-20 added; Goals and Non-goals updated; `scanner.ts` moves from unchanged to modified (records `selector`).
- 2026-09-30 — Context ranking dropped as too complex: primary suggestion is the first match (load order, then declaration order; no `_variables-new.scss` preference). AC-29 to AC-39 and EC-14 to EC-20 retired; AC-40 revised; EC-21 added; ranking moved from Goals to Non-goals; `scanner.ts` back to unchanged.
