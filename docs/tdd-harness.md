# TDD Harness: Rules & Conventions

**Project:** color-lint-tool  
**Test Framework:** Vitest  
**Baseline:** 100 tests, 8 test files (as of 2026-08-03)

---

## 1. The TDD Contract

Every code change in this project — whether made by a human developer or an AI agent — must follow the **RED → GREEN → REFACTOR** cycle:

### 🔴 RED: Write a Failing Test First

- Write one or more test cases that describe the **expected behavior** of the new code
- Run the test suite: the new test(s) **MUST fail**
- All existing tests **MUST still pass** (no regressions introduced by test setup)
- If a new test passes immediately, it is testing existing behavior — either remove it or make it test something genuinely new

### 🟢 GREEN: Write the Minimal Implementation

- Write the **simplest code** that makes the failing test(s) pass
- Do not add functionality beyond what the test requires
- Run the test suite: **ALL tests MUST pass** (old + new)
- Run `tsc --noEmit`: **zero type errors**

### 🔵 REFACTOR: Clean Up

- Improve code quality without changing behavior:
  - Extract helper functions
  - Remove data clumps and duplication
  - Improve type safety
  - Add/improve JSDoc comments
- Run the test suite again: **ALL tests MUST still pass**
- Run the validation gate: `npm run validate`

---

## 2. Test File Conventions

### File Naming

```
tests/unit/<module>.<unit>.test.ts
```

| Source File                     | Test File                            |
|---------------------------------|--------------------------------------|
| `src/core/scanner.ts`          | `tests/unit/scanner.test.ts`         |
| `src/core/fixer/replacer.ts`  | `tests/unit/fixer.replacer.test.ts`  |
| `src/core/fixer/config.ts`    | `tests/unit/fixer.config.test.ts`    |
| `src/utils/file-finder.ts`    | `tests/unit/file-finder.test.ts`     |

For spec-draft tests created during PRD refinement:
```
tests/unit/<feature>.spec-draft.ts
```
These are renamed to `*.test.ts` during PRD execution once they contain real assertions.

### Test Structure

Use nested `describe` blocks organized by: **Module → Behavior → Scenario**

```typescript
describe('ModuleName: functionName', () => {
  describe('behavior category', () => {
    it('specific scenario description', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

**Example** (from `fixer.replacer.test.ts`):
```typescript
describe('ColorReplacer: replaceColorInText', () => {
  describe('hex replacements', () => {
    it('replaces a 6-digit hex color with the suggested variable', () => { ... });
    it('replaces a 3-digit shorthand hex', () => { ... });
  });
  describe('hex boundary safety', () => {
    it('does not replace a 6-digit hex when it is the prefix of an 8-digit hex', () => { ... });
  });
});
```

### Assertion Style

- Use Vitest's `expect()` with specific matchers
- Prefer `toBe()` for primitives, `toEqual()` for objects/arrays
- Use `toContain()` for substring checks
- Use `toThrow()` or `rejects.toThrow()` for error cases

---

## 3. Test Fixtures

Test fixtures live in `tests/fixtures/` and are shared across test files.

- **Static fixtures** (`.html`, `.scss`, `.ts`): Real-world file samples for scanner tests
- **Dynamic fixtures**: Created in `beforeEach` / `afterEach` using `fs.mkdtemp` for isolation

When a test needs a temporary file system:
```typescript
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'color-lint-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});
```

---

## 4. Coverage Gates

### Minimum Requirements

| Metric            | Requirement                                    |
|-------------------|------------------------------------------------|
| Test count        | Must **never decrease** from the baseline      |
| All tests pass    | 100% pass rate required                        |
| Type check        | `tsc --noEmit` must produce zero errors        |
| New feature       | Must add ≥1 new test per acceptance criterion  |
| Bug fix           | Must add ≥1 regression test proving the fix    |

### Tracking

The baseline test count is tracked by the `validate-tdd.ps1` script. After each successful validation, the script records the new test count in `scripts/.tdd-baseline.json`:

```json
{
  "testCount": 100,
  "lastValidated": "2026-08-03T18:00:00Z"
}
```

---

## 5. Validation Gate

The validation gate is the automated checkpoint that enforces TDD discipline. Run it with:

```bash
npm run validate
```

This executes `scripts/validate-tdd.ps1`, which:

1. **Type-checks** the project (`tsc --noEmit`)
2. **Runs the full test suite** (`vitest run --reporter=json`)
3. **Compares test count** against the stored baseline
4. **Reports results** as structured JSON
5. **Fails** if type check fails, any test fails, or test count decreased

### When to Run

| Event                                  | Run validate? |
|----------------------------------------|---------------|
| After writing a failing test (RED)     | ✅ Yes — verify only new tests fail |
| After making tests pass (GREEN)        | ✅ Yes — verify all pass            |
| After refactoring (REFACTOR)           | ✅ Yes — verify nothing broke       |
| Before committing                      | ✅ Yes — final gate                 |
| After merging/pulling                  | ✅ Yes — catch integration issues   |

---

## 6. Pre-Commit Checklist

Before any commit to the repository:

- [ ] `npm run lint` passes (zero type errors)
- [ ] `npm test` passes (all tests green)
- [ ] `npm run validate` passes (TDD gate)
- [ ] New code has corresponding new tests
- [ ] Test count has not decreased
- [ ] No `console.log` debugging statements left in source code
- [ ] No `.only` or `.skip` left on test cases

---

## 7. Adding a New Module

When adding a new module (e.g., `src/core/formatter/json-formatter.ts`):

1. Create the test file first: `tests/unit/formatter.json-formatter.test.ts`
2. Write the describe/it structure with failing tests
3. Create the source file with minimal exports
4. Implement until tests pass
5. Wire into the existing architecture (usually `cli.ts` or an orchestrator)
6. Run `npm run validate`

---

## 8. Debugging Test Failures

### Quick commands

```bash
# Run a single test file
npx vitest run tests/unit/fixer.replacer.test.ts

# Run tests matching a pattern
npx vitest run -t "hex boundary"

# Run in watch mode for rapid iteration
npm run test:watch

# Run with verbose output
npm run test:verbose
```

### Common failure patterns

| Symptom                            | Likely Cause                                    |
|------------------------------------|-------------------------------------------------|
| Import error on new module         | Module not yet created (expected in RED phase)   |
| Test passes when it should fail    | Test is not actually testing new behavior        |
| Type error in test file            | Source interface changed, update test imports     |
| Timeout in async test              | Missing `await`, or test hitting real filesystem  |
| `ENOENT` in test                   | Temp directory not created in `beforeEach`        |
