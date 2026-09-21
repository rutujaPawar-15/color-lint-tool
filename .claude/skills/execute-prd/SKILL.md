---
name: execute-prd
description: Implement a PRD from docs/prds/ test-first — one failing test per acceptance criterion, red for the right reason, minimal green, refactor — then a mandatory repo housekeeping gate (vitest coverage.include + README) and a full npm run lint && npm run build && npm test check. Use when the user says "execute the PRD", "implement docs/prds/<slug>.md", or asks to build a feature that already has a PRD.
---

# Execute a PRD, test-first

You are implementing an agreed PRD for `color-lint-tool`. Read `AGENTS.md` first if it is not
already in context. If no PRD exists yet, stop and use `refine-prd` instead — do not write one
inline and implement it in the same breath, that defeats the criteria-first anchor.

## 1. Read the acceptance criteria

Open `docs/prds/<slug>.md`. List the acceptance criteria **and** the edge cases as
one working set, **keeping each item's own PRD identity**: `AC-<n>` for acceptance criteria,
`EC-<n>` for edge cases. Use those IDs in test names and in step 8's table. Never assign the
set its own sequence — the IDs must survive an amendment that appends to either list.

Pick up criteria appended under a `## Amendment (<date>)` heading too, not just those in the
main `## Acceptance criteria` list. An item the classification never sees is an item that
never gets a test.

Every item in that set gets a test. Keep the list visible — step 8 checks against it.

If a criterion is not independently observable, stop and refine it with the user. Do not
silently reinterpret it into something testable; that is the user's call.


### Then: classify each item — what is already implemented?

A PRD is often re-executed after being amended, so assume **some of this may already be
done** until you have checked. Before writing any test, mark every item in the working set
`done` / `partial` / `not started`.

Gather evidence in this order:

0. **Markers first — they override everything below.** An item marked `(revised <date>)` is
   **`not started`, even though a passing test for its number exists** — that test asserts the
   *old* wording. Open it, rewrite it against the new wording, and confirm red for the right
   reason (step 3) before touching the implementation. An item marked `(retired <date>)` is
   not work: delete its test, note the deletion in step 9, and drop it from the working set.
1. **`## Revisions` in the PRD** — if present, the newest entry names what was just added.
   That is a hint about where the delta is, not proof; still verify each item below.
2. **Run the existing suite:** `npm test`. A criterion is `done` only if a test **exists and
   passes** that observably asserts that criterion. Search `tests/` by behavior, not by
   filename.
3. **Read the relevant `src/` code** for items with no matching test. Implementation with no
   test is **`partial`, never `done`** — the behavior is unpinned, and this harness treats an
   untested behavior as unfinished. It needs a test written against the existing code (which
   will go green immediately; say so explicitly rather than pretending it was a red-green
   cycle).

Then:

- **`done`** → skip it. Do not rewrite the test, do not touch the implementation. Carry it
  into step 8's table with its existing test cited and verdict `met (pre-existing)`.
- **`partial`** → treat as work, and say which half is missing (test / implementation).
- **`not started`** → the normal 2-5 loop.

State the classification before proceeding — a one-line-per-item list. If **everything** is
`done`, stop and report that; do not manufacture work to look busy.

*Why this is not optional:* the failure mode is silent. Writing a fresh test for
already-working behavior produces a test that passes on first run, and step 3 (confirm red)
gets skipped with no error and no signal. You end up with duplicate coverage and one less
piece of evidence than you think you have.

## 2. Per criterion: write the failing test first

One criterion → one test. Do not batch-write the implementation first "and then add tests".

Repo conventions (see `AGENTS.md` §7):
- Vitest, suite at `tests/<unit>.test.ts`, fixtures at `tests/fixtures/`.
- Fixtures carry inline "answer key" comments saying what each line should do and why.
- Tests that need a repo or filesystem state build a temp dir (`mkdtemp`), never mutate this repo.
- Name the test after the behavior, not the function.

## 3. Confirm red — for the *right reason*

Run the single test file (`npx vitest run tests/<unit>.test.ts`), and **read the failure text**.

It must fail because the behavior is missing — a wrong value, a missing property, an
unimplemented branch. If it fails with a `ReferenceError`, a module-not-found, a typo, or a
TypeScript error, that is a broken test, not a red test. Fix it and re-run until the failure
is a genuine behavior gap.

*Why this matters:* a test that fails for a mechanical reason will go green the moment the
mechanical problem is fixed, whether or not the behavior was ever implemented. The red phase
is only evidence if you have read why it is red.

## 4. Minimal green

Write the smallest implementation that makes that test pass. No speculative options, no
"while I'm here" extras, nothing from the PRD's **Non-goals**. Re-run the single file.

## 5. Refactor once green

Clean up naming, duplication and placement now that the behavior is pinned. Put shared config
in `SCAN_CONFIG` (`src/core/constants.ts`), not at call sites. Re-run the test file after.

Loop 2-5 until every item in the step-1 working set has a passing test.

## 6. Housekeeping gate — mandatory, before the full check

Both items. Do not skip either; skipping is silent, and that is exactly why it is encoded here.

- **Coverage config.** If a **new** `src/` file gained a test suite, add it to
  `coverage.include` in `vitest.config.mts`. That list is an explicit allowlist, not a glob —
  the file's own comment states the convention. A new file left out of it is outside the
  coverage gate and nothing will ever tell you. This must happen **before** step 7, since
  `npm test` reads that config.
- **README.** If **user-facing** behavior changed — a new command, a new flag, new output, a
  changed default — update `README.md`. This keeps "a teammate can set up and verify from the
  documentation alone" continuously true instead of a quarter-end scramble. It cannot be
  delegated to `AGENTS.md`, which is deliberately AI-agent-first and not a human setup guide.

## 7. Full gate

```
npm run lint && npm run build && npm test
```

All three must pass. Note: `lint` is `tsc --noEmit` and `build` is `tsc` — the **same type
check** twice, with and without emit. Both are run for parity with CI. Never report this as
"linting passed" in any sense implying style or rule checking; there is no ESLint in this repo.

## 8. Checklist re-check against the diff

Green tests prove the criteria you *wrote tests for* are met. They prove nothing about the
criteria you forgot. So walk the step-1 working set explicitly, one line each:

| ID | Criterion | Test | Verdict |
|---|---|---|---|
| AC-1 | ... | `tests/x.test.ts:` "..." | met |
| EC-2 | ... | `tests/x.test.ts:` "..." | met (pre-existing) |

Any row without a test is unfinished work — go back to step 2. Also re-read the PRD's
**Non-goals** against `git diff` and remove anything that crept in.

## 9. Report

State what was built, the criteria table, and the gate output. Note anything deferred and why.
Creating a PR is **optional** — do not push or open one unless the user asks.

## 10. Handling feedback found after execution

Manual testing after step 9 sometimes surfaces something wrong. Route it by one question:
**does the PRD's existing text, read literally, already describe the behavior you wanted?**

- **Yes — it's a bug.** The criterion was right, the implementation missed it. Stay here:
  write a new failing test reproducing exactly what went wrong, confirm it's red for the
  right reason (step 3), fix minimally (step 4), rerun the full gate (step 7), redo the
  checklist (step 8). The PRD does not change.
- **No — it's a spec gap.** What you actually want differs from what's written. Do not patch
  code first. Go back to `refine-prd` to amend the specific criterion or add the missed edge
  case, get agreement on the sharpened wording, then return here — the updated PRD gives you
  a new item for the step-1 working set, same as any other criterion.

Silently absorbing a "the code should do X instead" finding into a code fix defeats the
point of the PRD as the record of what was agreed — that's why the second case routes back
through `refine-prd` rather than being handled inline.
