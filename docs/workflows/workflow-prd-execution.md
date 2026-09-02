# Workflow: PRD Execution

**Purpose:** Take an approved PRD and implement it fully using strict TDD discipline (RED → GREEN → REFACTOR), producing production-ready code with comprehensive tests.

**Input:**
1. Approved PRD: `docs/PRD-<feature>.md`
2. Codebase analysis: `docs/ANALYSIS-<feature>.md`
3. Skeleton tests (optional): `tests/unit/<feature>.spec-draft.ts`

**Output:**
1. Fully implemented feature in `src/`
2. Complete test suite in `tests/unit/`
3. Updated analysis: `docs/ANALYSIS-<feature>.md`
4. Updated `README.md` (if user-facing changes)

---

## Prerequisites

Before starting this workflow, verify:
- [ ] The PRD has been **explicitly approved** by the human
- [ ] `npm run validate` passes
- [ ] You have read `AGENTS.md` for project conventions
- [ ] You have read `docs/tdd-harness.md` for TDD rules

---

## Phase 1: Planning

**Goal:** Break the PRD into ordered implementation chunks, each scoped to one module or seam.

### Steps

1. **Parse the PRD**
   - Read `docs/PRD-<feature>.md` sections 7 (Scope) and 9 (Roadmap)
   - List every concrete deliverable mentioned

2. **Break into implementation chunks**
   Each chunk is a single module or function with a clear boundary:
   ```
   Chunk 1: src/core/<feature>/types.ts        (interfaces and types)
   Chunk 2: src/core/<feature>/parser.ts        (parsing logic)
   Chunk 3: src/core/<feature>/transformer.ts   (transformation logic)
   Chunk 4: src/cli.ts                          (CLI integration)
   ```

3. **Order by dependencies**
   - Types and interfaces first (no dependencies)
   - Pure functions next (depend only on types)
   - Orchestrators last (depend on pure functions)
   - CLI integration last (depends on everything)

4. **Create the task checklist**
   Create a `task.md` artifact tracking progress:
   ```markdown
   - [ ] Chunk 1: Types and interfaces
   - [ ] Chunk 2: Parser logic
   - [ ] Chunk 3: Transformer logic
   - [ ] Chunk 4: CLI integration
   - [ ] Chunk 5: Documentation update
   ```

5. **Rename spec-draft if present**
   If `tests/unit/<feature>.spec-draft.ts` exists from the refinement workflow:
   - Rename to `tests/unit/<feature>.test.ts` (or split into per-module test files)
   - Update imports to match the planned module structure

### Validation Gate
```bash
npm run validate   # Baseline still passes
```

---

## Phase 2: TDD Loop (Repeat Per Chunk)

**Goal:** Implement each chunk using the strict RED → GREEN → REFACTOR cycle.

### 🔴 Step 2a: RED — Write Failing Tests

1. **Write test cases** for this chunk in the appropriate test file
   - Convert skeleton tests into real assertions
   - Add edge case tests from PRD section 6 (Error Handling)
   - Add boundary tests for each data type and format

2. **Run the tests**
   ```bash
   npx vitest run tests/unit/<module>.<unit>.test.ts
   ```

3. **Verify the expected state**
   - ✅ **New tests MUST FAIL** (import errors, assertion failures, or `undefined` returns)
   - ✅ **Existing tests MUST PASS** (run `npm test` to confirm no regressions)
   - ❌ If a new test passes → it's not testing new behavior; revise or remove it

4. **Record the failure count**
   Note how many tests fail — this is your target for the GREEN step.

### 🟢 Step 2b: GREEN — Minimal Implementation

1. **Write the simplest code** that makes the failing tests pass
   - Do not add extra features, optimizations, or error handling beyond what tests require
   - Use simple data structures and straightforward logic
   - It's OK for the code to be "ugly" at this stage — that's what REFACTOR is for

2. **Run all tests**
   ```bash
   npm test
   ```

3. **Verify the expected state**
   - ✅ **ALL tests pass** (new + existing)
   - ✅ **Type check passes** (`npm run lint`)
   - ❌ If any existing test breaks → fix the implementation, not the test

### 🔵 Step 2c: REFACTOR — Clean Up

1. **Improve code quality** without changing behavior:
   - Extract helper functions for complex logic
   - Remove code duplication (DRY)
   - Improve variable names and add JSDoc comments
   - Resolve data clumps (merge repeated parameter lists into interfaces)
   - Move shared types to `types.ts`

2. **Run the full validation gate**
   ```bash
   npm run validate
   ```

3. **Verify the expected state**
   - ✅ All tests still pass
   - ✅ Type check still passes
   - ✅ Test count ≥ baseline

4. **Update task checklist**
   Mark the current chunk as complete:
   ```markdown
   - [x] Chunk 1: Types and interfaces
   - [/] Chunk 2: Parser logic     ← in progress
   - [ ] Chunk 3: Transformer logic
   ```

### Repeat

Move to the next chunk and repeat Step 2a → 2b → 2c until all chunks are complete.

---

## Phase 3: Integration

**Goal:** Wire the new feature into the existing CLI and verify end-to-end behavior.

### Steps

1. **CLI integration**
   - Add new flags/commands to `src/cli.ts` using Commander.js
   - Follow the flag patterns established in the existing code
   - Wire the new orchestrator into the CLI's control flow

2. **Integration tests**
   - Write tests that exercise the full pipeline (CLI flags → scan → process → output)
   - Test flag combinations and mutual exclusions
   - Test error cases (missing config, invalid input)

3. **End-to-end verification**
   - Build the project: `npm run build`
   - Run the compiled CLI against test fixtures:
     ```bash
     node dist/src/cli.js --new-flag tests/fixtures/
     ```
   - Verify the output matches PRD section 5 (Output Format) exactly

4. **Run full validation**
   ```bash
   npm run validate
   ```

---

## Phase 4: Documentation & Analysis

**Goal:** Update project documentation and produce a final analysis document.

### Steps

1. **Update README.md**
   - Add the new feature to the usage section
   - Add new CLI flags to the flags table
   - Add examples showing the new feature in action

2. **Update the Analysis document**
   Revise `docs/ANALYSIS-<feature>.md` to include:
   - **What was built**: Final module list with line counts
   - **Architecture decisions**: Why you made specific design choices
   - **Bugs found & fixed**: Any issues discovered during implementation
   - **Test coverage analysis**: Tests by module, by type (unit/integration/regression)
   - **Spec alignment checklist**: Every PRD acceptance criterion → status + test reference
   - **Known limitations**: Anything deferred or not fully addressed

3. **Final acceptance criterion cross-check**
   For every acceptance criterion in the PRD:
   ```
   AC: "outputs valid JSON containing violations array"
   → Test: fixer.json-formatter.test.ts:L15 "outputs valid JSON containing violations array and summary"
   → Status: ✅ PASS
   ```

4. **Final validation**
   ```bash
   npm run validate
   ```
   Record the final test count and delta in the Analysis document.

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   PRD EXECUTION WORKFLOW                         │
│                                                                  │
│  INPUT: Approved PRD + Analysis + Skeleton tests                 │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ PHASE 1: PLANNING                                         │   │
│  │  • Parse PRD scope & roadmap                              │   │
│  │  • Break into ordered chunks (dependency-first)           │   │
│  │  • Create task.md checklist                               │   │
│  │  • Rename spec-draft → test files                         │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             ▼                                    │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ PHASE 2: TDD LOOP (repeat per chunk)                      │   │
│  │                                                            │   │
│  │  ┌─────────────────────────────────────────────────────┐  │   │
│  │  │ 🔴 RED: Write failing tests                         │  │   │
│  │  │  • New tests MUST FAIL                              │  │   │
│  │  │  • Existing tests MUST PASS                         │  │   │
│  │  ├─────────────────────────────────────────────────────┤  │   │
│  │  │ 🟢 GREEN: Write minimal implementation              │  │   │
│  │  │  • ALL tests MUST PASS                              │  │   │
│  │  │  • tsc --noEmit MUST PASS                           │  │   │
│  │  ├─────────────────────────────────────────────────────┤  │   │
│  │  │ 🔵 REFACTOR: Clean up                               │  │   │
│  │  │  • npm run validate MUST PASS                       │  │   │
│  │  │  • Update task.md progress                          │  │   │
│  │  └─────────────────────────────────────────────────────┘  │   │
│  │                                                            │   │
│  │  ↻ Repeat for each chunk until all complete               │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             ▼                                    │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ PHASE 3: INTEGRATION                                      │   │
│  │  • Wire into CLI (src/cli.ts)                             │   │
│  │  • Integration & E2E tests                                │   │
│  │  • Build & run compiled CLI                               │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             ▼                                    │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ PHASE 4: DOCUMENTATION & ANALYSIS                         │   │
│  │  • Update README.md                                       │   │
│  │  • Update ANALYSIS-<feature>.md                           │   │
│  │  • Cross-check every AC against passing tests             │   │
│  │  • Final: npm run validate                                │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  OUTPUT: Fully implemented & tested feature                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Rules & Guardrails

### Hard Rules (Never Break)

1. **Never write implementation before a failing test** — RED always comes first
2. **Never skip the validation gate** — run `npm run validate` after every GREEN and REFACTOR
3. **Never decrease the test count** — tests can be rewritten but never deleted without replacement
4. **Never modify an existing test to make new code pass** — fix the implementation instead
5. **Never commit with failing tests** — all tests must be green

### Soft Guidelines (Follow When Practical)

1. Keep each chunk small (≤100 lines of new implementation code)
2. Prefer pure functions over stateful classes
3. One `describe` block per public function/method
4. Write at least 3 tests per public function (happy path, edge case, error case)
5. Run the full test suite (not just the current file) at least once per chunk

### When Things Go Wrong

| Problem | Action |
|---------|--------|
| New test passes immediately | The behavior already exists — revise the test to test something new |
| Can't make a test pass without breaking another | You've found a design conflict — revisit the PRD or add a failing test for the conflict |
| Implementation is much more complex than expected | Stop, update the Analysis doc, and consider splitting the chunk |
| A PRD requirement is ambiguous | Stop, add the question to the Analysis doc, and ask the human |
| Test count decreased after refactor | You removed a test — restore it or add an equivalent replacement |

---

## Checklist: Is the Feature Complete?

Before declaring the feature done, verify:

- [ ] Every PRD acceptance criterion has at least one passing test
- [ ] `npm run validate` passes with increased test count
- [ ] `npm run build` produces clean output
- [ ] `docs/ANALYSIS-<feature>.md` is updated with final implementation details
- [ ] `README.md` is updated with new user-facing documentation
- [ ] No `console.log` debugging statements in source code
- [ ] No `.only` or `.skip` on test cases
- [ ] Spec alignment checklist in Analysis shows all items ✅
