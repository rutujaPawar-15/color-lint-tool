# Domain glossary

The shared vocabulary for the color-lint tool. Terms only — no implementation details.

## Hardcoded color
A literal color value written directly in source (e.g. `#fff`, `rgb(0,0,0)`, `white`)
instead of referencing a design token. The thing the tool exists to discourage.

## Violation
A single occurrence of a hardcoded color that the tool flags, located by file, line, and
column, with the offending value and the property it appears on.

## Design token (token)
A named variable whose value is a color, declared as either an SCSS variable (`$name`) or a
CSS custom property (`--name`). The approved way to reference a color.

## Source of truth
The file(s) where design tokens are defined. Chosen via `--tokens`, or, when unspecified, the
conventional variable files discovered in the project (`_variables.scss`, `_variables-new.scss`).
These files define colors, so their own declarations are never treated as violations.

## Suggestion
The token(s) a developer should use in place of a hardcoded color, shown in the form the token
was declared: `$name` for an SCSS variable, `var(--name)` for a CSS custom property.

## Normalization
Reducing the many ways one color can be written (hex, rgb/rgba, hsl/hsla, named colors) to a
single canonical form, so equivalent spellings — `#fff`, `#ffffff`, `white`,
`rgb(255,255,255)` — are recognized as the same color when matching.

## Collision
When more than one token resolves to the same color. All colliding tokens are offered as
suggestions; the developer chooses the semantically correct one.

## Fix (auto-fix)
Replacing a hardcoded color in place with its token. Applies only to `.css`/`.scss` files.

## Rewrite
Writing a fixed file back to disk, preserving the original formatting and replacing only the
exact color value.

## Ambiguous match
A color with more than one valid token candidate for its file. Resolved interactively (the
developer is prompted per occurrence); skipped if unresolved.

## Unfixable violation
A flagged color that cannot be auto-fixed: it has no valid token for its file type, lives in a
file type fix does not rewrite, or is in a token-definition file. Reported, never changed.

## Dry run
A preview pass of fix that reports intended changes without writing files or prompting.

## Base branch
The branch a PR targets — the comparison point for `--base`.

## PR change set
The files changed on the current branch relative to its base (`<base>...HEAD`, committed changes
since the branch diverged). Distinct from the working-tree **changed files** set used by `--changed`.
