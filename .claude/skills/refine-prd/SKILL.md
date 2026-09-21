---
name: refine-prd
description: Turn a rough feature ask into a lightweight PRD saved at docs/prds/<slug>.md, with acceptance criteria written as independently testable behaviors. Use when the user has a feature idea for color-lint-tool that is not yet specified, says "refine this", "write a PRD", "spec this out", or before starting any non-trivial feature. Also use when an existing PRD needs amending — new requirements, or changes discovered while testing an implemented feature. Pairs with execute-prd, which implements the PRD test-first.
---

# Refine a feature ask into a PRD

You are refining a **raw feature ask** into a lightweight PRD for `color-lint-tool`.
Read `AGENTS.md` first if it is not already in context — the PRD must name real files.

The output is a PRD whose acceptance criteria map **1:1 to future tests**. That mapping is
the whole point: `execute-prd` writes exactly one failing test per criterion, so a criterion
that cannot be observed is a criterion that cannot be executed.

## First: amendment or new PRD?

**Default to amending. Rewriting is opt-in and requires an explicit instruction.**

Before anything else, work out whether a PRD already covers this ask:

- Did the user name a PRD file or slug — `docs/prds/suggest-css-variable.md`, or "the
  suggest-css-variable PRD"? → **that PRD is the target. Amend it.**
- Otherwise list `docs/prds/` and check whether an existing PRD covers this feature area. If
  one plausibly does, name it and confirm with the user before proceeding.

Then route:

- **A covering PRD exists → amend it in place.** This is the default. It does **not** require
  the user to have said "amend", "update", "edit" or anything similar — naming a PRD, or asking
  for a change to a feature that already has one, is sufficient on its own. Read that PRD in
  full before asking the user anything: its Goals, Non-goals and existing acceptance criteria
  are your starting context, not something to re-derive. Run steps 1-5 scoped to *the delta*,
  with step 1's cold question becoming: "What should change or be added here, in your own
  words?" Save per the amendment branch in step 5.

- **No PRD covers this** → fresh refinement. Run steps 1-5 as written.

- **The user explicitly asked to rewrite, replace or start the document over** — words to that
  effect about *the document itself*, not merely describing new behavior → regenerate from the
  template. Confirm before doing so: state what will be lost (existing criterion numbering, the
  Problem statement, anything not re-derived in this pass) and get a yes. Never infer a rewrite
  from an ask that only describes a change in functionality.

Never create a second PRD for a feature that already has one. Two files describing the same
feature drift, and `execute-prd` reads only one of them.

Follow the steps **in order**. The ordering is load-bearing.

## 1. Capture the user's own acceptance criteria — first, cold

Before proposing any framing, before any structured question, ask the user in **free text**:

> "Before I propose anything: what does *done* look like for this, in your own words?
> Rough bullets are fine — and 'you propose some' is a fine answer too."

Rules for this step:
- Ask it **cold**. Do not precede it with your own summary, restatement, options or
  architecture sketch. Whatever framing you offer first becomes the frame the user answers
  inside, and the criteria stop being theirs.
- Do **not** use `AskUserQuestion` here. Multiple-choice options are a framing. Plain text.
- Do not push the drafting burden back: if the user says "you propose some", propose a
  draft set immediately and continue to step 2 with it, explicitly marked as *your* draft
  for them to correct.

*Why first:* the user's original definition of done is the anchor for everything after. Asking
scope questions first makes the resulting criteria partly your invention rather than the user's
intent, and the rest of the loop becomes "guess what the user meant" instead of "sharpen what
the user said".

## 2. Restate and challenge each criterion

For every criterion the user gave:
- Restate it back in one line.
- Judge it against one bar: **could an automated test observe this, without asking a human?**
- Flag the ones that fail the bar — vague ("works well", "is fast"), subjective ("feels
  right"), or unobservable from outside the code — and **propose sharper wording** for each.
  Do not just report the problem; offer the fix.
- Name any criterion that is really two criteria and split it.

Example of the transformation this step exists to make:
- *"Suggestions should be accurate"* → *"Given a token file defining `$primary-blue: #0052cc`,
  a violation with value `#0052CC` is reported with suggestion `$primary-blue`."*

Get the user's agreement on the sharpened set before moving on.

## 3. Structured clarifying questions

**Now** use `AskUserQuestion` — and only for what the user's own criteria left genuinely open:
- **Scope boundaries** — what is explicitly *not* in this change.
- **Affected files** — confirm which `src/` files this touches (propose from `AGENTS.md`'s
  architecture map; do not make the user recall paths).
- **Edge cases** the criteria did not cover — empty input, missing file, malformed input,
  conflicting matches, backwards compatibility of existing CLI behavior.

Ask only questions whose different answers lead to **materially different implementations**.
If a question has an obvious default, state the default and move on rather than asking.

## 4. Write the PRD — lightweight

**If this is an amendment, do not regenerate this template.** It is the reference for what
sections exist, not a document to reproduce. Edit only the sections your delta actually
touches and leave every other line of the existing PRD byte-for-byte alone.

Exactly these sections, nothing more. This is a solo internal tool: no stakeholders, no
rollout plan, no success metrics.

```markdown
# <Feature name>

**Status:** Draft | Agreed
**Slug:** <feature-slug>

## Problem
2-4 sentences. What is broken or missing today, grounded in the current code.

## Goals
What this change delivers. Bullets.

## Non-goals
What it explicitly does not do, and where that work lives instead. Bullets.
This section is what stops scope creep during execution — be specific.

## Acceptance criteria
Numbered. One observable behavior each, in Given/When/Then or equivalent.
Each one must be directly translatable into a single failing test.

1. ...
2. ...

## Edge cases
Numbered, in the same testable style. These become tests too.

## Affected files
| File | Change |
|---|---|
| `src/...` | new / modified — what |
| `tests/...` | new suite |
| `vitest.config.mts` | add new src file to `coverage.include` (if a new src file gains tests) |
| `README.md` | update (if user-facing behavior changed) |

## Open questions
Anything unresolved, or "None — all resolved during refinement."
```

## 5. Save

Write to `docs/prds/<feature-slug>.md` (kebab-case slug, create the directory if needed).
Report the path back to the user, and note that `execute-prd` is what implements it.


### If this is an amendment

Edit the existing `docs/prds/<slug>.md` in place. Do not rewrite it wholesale:

- **Append** new acceptance criteria and edge cases, continuing the existing numbering. Do not
  renumber existing items — `execute-prd`'s checklist and any test named for "criterion 3" stay
  valid only while 3 is still 3.
- **Move** anything graduating from Non-goals to Goals rather than deleting it; that it was once
  out of scope is useful history.
- **Update** Affected files for anything newly touched.
- **Set** `**Status:** Draft` while the amendment is open; back to `Agreed` once the user confirms
  the sharpened wording.
- **Add** a line under a `## Revisions` section at the bottom (create it if absent):
  `- YYYY-MM-DD — <what changed, one line>`. A PRD that silently mutates is no longer a record of
  what was agreed.

An existing PRD may instead carry a `## Amendment (<date>)` heading with criteria appended under
it. That is the same thing under a different name — follow it rather than converting the file to
the `## Revisions` style, and keep appending under that heading.

Report the path and what changed. Note that `execute-prd` picks the new criteria up as fresh
items in its step-1 working set; already-implemented criteria stay green and untouched.

Changing or dropping an item that already exists:

- **Revised** — the criterion keeps its number and gets a marker: `3. (revised 2026-09-17)
  <new wording>`. Never reword an existing criterion silently. Its old test still exists and
  still passes; the marker is the only thing that tells `execute-prd` that a green test is
  now evidence for wording nobody agreed to.
- **Retired** — keep the number, replace the body with `~~<old wording>~~ (retired
  YYYY-MM-DD — <why>)`. Do not delete the line and close the gap; that renumbers everything
  after it. Name the test that should now be deleted.
- Both cases get a `## Revisions` entry naming the item number.

## Done when

- Every acceptance criterion is independently observable by a test.
- Non-goals are explicit.
- Affected files name real paths that exist (or are clearly marked new).
- The file exists at `docs/prds/<slug>.md`.
- If an amendment — existing criteria numbering preserved, no untouched section reworded, and a
  `## Revisions` entry (or an entry under the existing `## Amendment` heading) added.
- Any criterion whose meaning changed carries a `(revised <date>)` marker, any dropped one a
  `(retired <date>)` marker — neither was silently edited away.
