# Workflow: PRD Refinement

**Purpose:** Transform a raw feature idea into a polished, test-informed Product Requirements Document (PRD) ready for human review and approval.

**Input:** A raw feature idea (text description from the user)  
**Output:** Three deliverables in the repository:
1. `docs/ANALYSIS-<feature>.md` — Codebase analysis and architecture impact
2. `docs/PRD-<feature>.md` — Polished product requirements document
3. `tests/unit/<feature>.spec-draft.ts` — Skeleton test file with named test cases

---

## Prerequisites

Before starting this workflow, verify:
- [ ] The project builds cleanly (`npm run lint`)
- [ ] All existing tests pass (`npm test`)
- [ ] You have read `AGENTS.md` for project conventions

---

## Phase 1: Codebase Analysis

**Goal:** Understand the current architecture deeply enough to propose changes that fit naturally into the existing design.

### Steps

1. **Read the project structure**
   - Review `AGENTS.md` for project conventions and module layout
   - List `src/` directory to understand module boundaries
   - List `tests/unit/` to understand test coverage map

2. **Read existing related code**
   - Identify which existing modules are **affected** by the new feature
   - Read those modules and their corresponding test files
   - Identify the **seams** (public interfaces) where new code will connect

3. **Read existing PRDs and analyses**
   - Read all `docs/PRD-*.md` files to understand the established requirements template
   - Read all `docs/ANALYSIS-*.md` files to understand the analysis template
   - Note any deferred items or future enhancements that relate to the new feature

4. **Produce the Analysis document**
   - Create `docs/ANALYSIS-<feature>.md` with:
     - **Affected modules**: Which source files will change and why
     - **New modules needed**: What new files/directories to create
     - **Dependency graph**: How the new feature connects to existing architecture
     - **Risk assessment**: What could break, what edge cases exist
     - **Open questions**: Architecture decisions that need resolution

### Validation Gate
```bash
npm run lint   # Type check still passes (no source changes yet)
npm test       # All tests still pass (no test changes yet)
```

---

## Phase 2: Test Exploration (TDD-Informed)

**Goal:** Write skeleton test cases that express the expected behaviors of the new feature. These tests define what "done" looks like and directly inform the PRD's acceptance criteria.

### Steps

1. **Create the spec-draft test file**
   - File: `tests/unit/<feature>.spec-draft.ts`
   - Import from the modules that **will exist** (they don't exist yet — that's intentional)
   - Write `describe` and `it` blocks with descriptive names but minimal assertions

2. **Cover the key behaviors**
   For each distinct behavior the feature should have, write a test:
   ```typescript
   describe('FeatureName', () => {
     describe('happy path', () => {
       it('does X when given Y', () => {
         // TODO: implement in PRD Execution workflow
         expect(true).toBe(false); // Force fail
       });
     });

     describe('edge cases', () => {
       it('handles empty input gracefully', () => {
         expect(true).toBe(false);
       });
     });

     describe('error handling', () => {
       it('throws a descriptive error when config is missing', () => {
         expect(true).toBe(false);
       });
     });
   });
   ```

3. **Map tests to acceptance criteria**
   Each test name should read as an acceptance criterion:
   - ❌ `it('works')` — too vague
   - ✅ `it('outputs valid JSON containing violations array and summary object')` — testable

4. **Run the tests to confirm they fail**
   ```bash
   npx vitest run tests/unit/<feature>.spec-draft.ts
   ```
   - **Expected:** ALL new tests fail (import errors or forced failures)
   - **Required:** No existing tests in other files are affected

### Validation Gate
```bash
npm test   # Existing tests pass; spec-draft tests fail (expected)
```
> Note: The spec-draft file uses `.spec-draft.ts` extension, which is NOT matched by the vitest include pattern (`tests/**/*.test.ts`), so it won't interfere with `npm test`. Run it explicitly with `npx vitest run tests/unit/<feature>.spec-draft.ts` to verify the skeleton.

---

## Phase 3: PRD Drafting

**Goal:** Write a comprehensive PRD that follows the established template and is grounded in the concrete test cases from Phase 2.

### PRD Template

Follow this section structure (matching `PRD-fix-feature.md`):

```markdown
# Product Requirements Document: <Feature Name>

## 1. Feature Overview
Brief description of what the feature does and why.

## 2. User Stories
### User Story N: <Title>
**As a** <role>,
**I want to** <action>,
**So that** <benefit>.

**Acceptance Criteria:**
- AC1: <maps to test: "it('...')" in spec-draft>
- AC2: ...

## 3. Design Questions to Resolve
### 3.N <Question Title>
Options, trade-offs, and recommended decision for v1.

## 4. CLI Interface (if applicable)
### 4.1 Command Syntax
### 4.2 Flag Definitions
### 4.3 Implementation Notes

## 5. Output Format
Exact terminal output for each mode/scenario.

## 6. Error Handling & Safety
Edge cases table, validation rules, undo strategy.

## 7. Scope Boundaries
### IN (Included in v1)
### OUT (Not v1; Future Enhancements)

## 8. Configuration (if applicable)
Schema, examples, defaults.

## 9. Implementation Roadmap
Ordered phases with checkboxes.

## 10. Testing Strategy
### Unit Tests
### Integration Tests
### Manual Testing

## 11. Success Metrics
Numbered list of measurable outcomes.
```

### Key Rules for PRD Writing

1. **Every acceptance criterion must trace to a test** in the spec-draft file
2. **Be specific about data shapes** — show exact JSON schemas, exact CLI output
3. **Document decisions, not just options** — each design question must end with a `Decision for v1:` statement
4. **Define IN/OUT scope clearly** — prevents scope creep during execution
5. **Include error messages verbatim** — the implementation should match the PRD word-for-word

---

## Phase 4: Validation & Human Review

**Goal:** Cross-check the PRD against the skeleton tests and present everything for human approval.

### Steps

1. **Cross-reference checklist**
   For every acceptance criterion in the PRD:
   - [ ] There is a corresponding test case in `tests/unit/<feature>.spec-draft.ts`
   - [ ] The test name clearly expresses the criterion
   - [ ] The criterion is specific enough to write a passing/failing assertion

2. **Verify no regressions**
   ```bash
   npm run validate
   ```
   All existing tests must still pass.

3. **Present deliverables for review**
   - `docs/ANALYSIS-<feature>.md` — architecture impact
   - `docs/PRD-<feature>.md` — requirements
   - `tests/unit/<feature>.spec-draft.ts` — skeleton tests

4. **Wait for human approval**
   - The human reviews the PRD and may request changes
   - Iterate on the PRD until approved
   - **DO NOT proceed to implementation until the PRD is approved**

---

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                   PRD REFINEMENT WORKFLOW                        │
│                                                                  │
│  INPUT: Raw feature idea                                         │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ PHASE 1: CODEBASE ANALYSIS                                │   │
│  │  • Read src/, tests/, docs/                               │   │
│  │  • Identify affected modules & seams                      │   │
│  │  • Produce: docs/ANALYSIS-<feature>.md                    │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             ▼                                    │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ PHASE 2: TEST EXPLORATION                                 │   │
│  │  • Write skeleton tests with descriptive names            │   │
│  │  • Confirm new tests FAIL (import errors / forced)        │   │
│  │  • Produce: tests/unit/<feature>.spec-draft.ts            │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             ▼                                    │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ PHASE 3: PRD DRAFTING                                     │   │
│  │  • Follow established 11-section template                 │   │
│  │  • Map every AC to a test case                            │   │
│  │  • Produce: docs/PRD-<feature>.md                         │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             ▼                                    │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ PHASE 4: VALIDATION & HUMAN REVIEW                        │   │
│  │  • Cross-check: every AC ↔ test case                      │   │
│  │  • npm run validate (no regressions)                      │   │
│  │  • Present PRD for approval                               │   │
│  │  • STOP until human approves                              │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  OUTPUT: Approved PRD + Analysis + Skeleton tests                │
│          → Feed into PRD Execution Workflow                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Checklist: Is the PRD Ready?

Before presenting for human review, verify:

- [ ] `docs/ANALYSIS-<feature>.md` exists with architecture impact analysis
- [ ] `docs/PRD-<feature>.md` follows the 11-section template
- [ ] `tests/unit/<feature>.spec-draft.ts` exists with skeleton test cases
- [ ] Every PRD acceptance criterion maps to at least one test case
- [ ] All test names are descriptive and read as acceptance criteria
- [ ] Design questions have explicit v1 decisions (not just options)
- [ ] Scope boundaries (IN/OUT) are clearly defined
- [ ] Error messages are specified verbatim in the PRD
- [ ] `npm run validate` passes (no regressions to existing code)
