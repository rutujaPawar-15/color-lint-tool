# Product Requirements Document: `--suggest` Flag — Inline Scan Suggestions

## 1. Feature Overview

The `--suggest` flag enriches the default scan output with **inline variable suggestions** for each hard-coded color violation. Instead of just telling the developer *what's wrong*, it tells them *what to use instead* — directly in the scan output, without modifying any files.

This bridges the gap between the existing scan mode (detection only) and the `--fix` workflow (full replacement pipeline). Developers get actionable guidance in a single command:

```bash
color-lint --suggest
```

Output:
```
📄 src/button.scss (2 violations)
  ⚠  Line 12, Col 9  |  color: #ff0000
     💡 Suggest: $color-red
  ⚠  Line 18, Col 5  |  background: #abcdef
     ⚠️  No mapping found in colorMap
```

---

## 2. User Stories

### User Story 1: See Suggestions Alongside Violations

**As a** developer running the linter for the first time,  
**I want to** see which CSS variable I should use for each hard-coded color,  
**So that** I can fix violations manually with confidence, without needing to look up the variable mapping myself.

**Acceptance Criteria:**
- AC1: `color-lint --suggest` prints a suggested variable next to each violation when a mapping exists in `.color-lint-config.json`
- AC2: Unmapped colors show "No mapping found" instead of a suggestion
- AC3: Output is grouped by file, identical layout to the existing scan output, with suggestion lines added below each violation
- AC4: Each violation line shows: file path, line, column, property, value, and suggestion
- AC5: Exit code is `1` if violations are found, `0` if none — same as regular scan

### User Story 2: Graceful Degradation Without Config

**As a** developer who hasn't set up `.color-lint-config.json` yet,  
**I want to** run `color-lint --suggest` without it crashing,  
**So that** I still see my violations and get a helpful hint about creating the config file.

**Acceptance Criteria:**
- AC6: When `.color-lint-config.json` is missing, `--suggest` shows violations without suggestions (same as regular scan output)
- AC7: A tip is printed at the end: "💡 Tip: Create .color-lint-config.json to get variable suggestions. See docs/PRD-fix-feature.md for examples."
- AC8: Exit code is `1` if violations are found — config absence is not an error

### User Story 3: Warn About Undefined Variables

**As a** developer reviewing suggestions,  
**I want to** know if a suggested variable doesn't actually exist in my codebase,  
**So that** I don't blindly use a variable that will cause a build error.

**Acceptance Criteria:**
- AC9: When a suggested variable is NOT defined in any `sourceOfTruth` file, print a warning: "(⚠️ not found in sourceOfTruth files)"
- AC10: When a suggested variable IS defined, no warning is printed
- AC11: `sourceOfTruth` files are read from `.color-lint-config.json` (or defaults to `["src/styles/_variables.scss", "_variables.scss"]`)

### User Story 4: Suggest for Changed Files Only

**As a** developer working on a feature branch,  
**I want to** get suggestions only for files I've changed,  
**So that** I can focus on cleaning up my own changes without noise from the rest of the codebase.

**Acceptance Criteria:**
- AC12: `color-lint --suggest --changed` scans only git-changed files and shows suggestions
- AC13: Combines naturally with the existing `--changed` / `-c` flag behavior

---

## 3. Design Questions to Resolve

### 3.1 Relationship to `--fix --suggestions-only`

**Question:** How does `--suggest` differ from `--fix --suggestions-only`?

| Aspect | `--suggest` (this feature) | `--fix --suggestions-only` (existing) |
|--------|--------------------------|--------------------------------------|
| Requires `--fix`? | No | Yes |
| Requires config? | No (degrades gracefully) | Yes (errors if missing) |
| Modifies files? | Never | Never |
| Shows cross-file impact? | No (simple inline suggestion) | Yes ("Also appears in N other files") |
| Exit code on violations | `1` | `0` |
| Primary use case | Quick scan with guidance | Detailed suggestion report before fixing |

**Decision for v1:** `--suggest` is a lightweight, scan-mode enhancement. It does NOT replace `--fix --suggestions-only`; they serve different purposes at different stages of the workflow.

### 3.2 Config File Handling

**Question:** Should `--suggest` require `.color-lint-config.json`?

**Decision for v1:** No. `--suggest` degrades gracefully:
- **Config present:** Show violations + suggestions + sourceOfTruth warnings
- **Config absent:** Show violations only (same as plain scan) + print a helpful tip

This makes `--suggest` safe to adopt incrementally — teams can start using it before setting up the config file.

### 3.3 Mutual Exclusivity with `--fix`

**Question:** What happens if both `--suggest` and `--fix` are passed?

**Decision for v1:** `--fix` takes precedence. If `--fix` is set, `--suggest` is ignored (the fix workflow has its own suggestion output). Print a note: "Note: --suggest is ignored when --fix is active."

---

## 4. CLI Interface

### 4.1 Command Syntax

```bash
# Scan with inline suggestions
color-lint --suggest

# Scan changed files with suggestions
color-lint --suggest --changed
color-lint --suggest -c

# Plain scan (existing behavior, unchanged)
color-lint

# --fix takes precedence over --suggest
color-lint --fix --suggest    # behaves as --fix (--suggest ignored)
```

### 4.2 Flag Definitions

| Flag | Short | Default | Behavior |
|------|-------|---------|----------|
| `--suggest` | (none) | false | Enrich scan output with variable suggestions from `.color-lint-config.json` |

### 4.3 Implementation Notes

- `--suggest` is a scan-mode enhancement — it does NOT enter fix mode
- `--suggest` is orthogonal to `--changed` (they combine naturally)
- If both `--suggest` and `--fix` are passed, `--fix` wins
- No new required dependencies

---

## 5. Output Format

### 5.1 With Config File Present

```
🔍 Starting ColorLint Tool...

Scanning D:\project with suggestions enabled.

📄 src/components/button.scss (2 violations)
  ⚠  Line 12, Col 9  |  color: #ff0000
     💡 Suggest: $color-red
  ⚠  Line 18, Col 5  |  background: #abcdef
     ⚠️  No mapping found in colorMap

📄 src/styles/badge.ts (1 violation)
  ⚠  Line 15, Col 3  |  color: red
     💡 Suggest: $color-red

❌ Found 3 violation(s) across 2 file(s). 2 with suggestions, 1 unmapped.
```

### 5.2 With Missing Variable Warning

```
  ⚠  Line 12, Col 9  |  color: #ff0000
     💡 Suggest: $color-danger  (⚠️  not found in sourceOfTruth files)
```

### 5.3 Without Config File (Graceful Degradation)

```
🔍 Starting ColorLint Tool...

Scanning D:\project

📄 src/components/button.scss (2 violations)
  ⚠  Line 12, Col 9  |  color: #ff0000
  ⚠  Line 18, Col 5  |  background: #abcdef

❌ Found 2 violation(s) across 1 file(s).

💡 Tip: Create .color-lint-config.json to get variable suggestions. See docs/PRD-fix-feature.md for examples.
```

### 5.4 No Violations

```
🔍 Starting ColorLint Tool...

Scanning D:\project with suggestions enabled.

✅ Scan complete! No violations found across 15 file(s).
```

---

## 6. Error Handling & Safety

### 6.1 This Feature Never Modifies Files

`--suggest` is strictly read-only. It:
- Reads source files (to scan for violations)
- Reads `.color-lint-config.json` (for color→variable mapping)
- Reads `sourceOfTruth` files (to check if variables exist)
- Writes nothing to disk

### 6.2 Edge Cases

| Scenario | Behavior |
|----------|----------|
| Config file missing | Degrade gracefully — show violations without suggestions + tip |
| Config file has invalid JSON | Print error and exit(1), same as `--fix` |
| Config file missing `colorMap` | Print error and exit(1), same as `--fix` |
| Color not in colorMap | Show "No mapping found" on that violation |
| Variable suggested but not in sourceOfTruth | Append "(⚠️ not found in sourceOfTruth files)" |
| `--suggest` + `--fix` both passed | `--fix` takes precedence, print note |
| `--suggest` + `--changed` | Scan only changed files, show suggestions |
| No files found | Print "No matching files found" (existing behavior) |
| Zero violations | Print "No violations found" (existing behavior) |

---

## 7. Scope Boundaries

### IN (Included in v1)
- `--suggest` flag on the CLI
- Inline suggestions in scan output from `.color-lint-config.json` colorMap
- Graceful degradation when config is missing
- Missing-variable warnings from sourceOfTruth
- Combination with `--changed` flag
- Summary line showing "N with suggestions, M unmapped"

### OUT (Not v1; Future Enhancements)
- Cross-file impact counts ("Also appears in N other files") — use `--fix --suggestions-only` for that
- Interactive mode ("Press Y to apply this suggestion")
- JSON/SARIF output format for `--suggest`
- Auto-generation of `.color-lint-config.json` from scan results

---

## 8. Configuration

No new configuration. Reuses the existing `.color-lint-config.json`:

```json
{
  "sourceOfTruth": ["src/styles/_variables.scss"],
  "colorMap": {
    "#ff0000": "$color-red",
    "#00ff00": "$color-green",
    "red": "$color-red"
  },
  "defaultBehavior": "strict"
}
```

When config is absent, `--suggest` falls back to plain scan + tip.

---

## 9. Implementation Roadmap

### Phase 1: Reporter Enhancement
- [ ] Add `ScanSuggestion` interface to `src/core/types.ts`
- [ ] Add `reportViolationsWithSuggestions()` to `src/utils/reporter.ts`
- [ ] Unit tests for the new reporter function

### Phase 2: CLI Wiring
- [ ] Add `--suggest` flag to Commander.js in `src/cli.ts`
- [ ] Load config (with graceful fallback) when `--suggest` is active
- [ ] Build color lookup and enrich violations with suggestions
- [ ] Call `reportViolationsWithSuggestions()` instead of `reportViolations()`
- [ ] Handle `--suggest` + `--fix` precedence

### Phase 3: Verification
- [ ] Integration tests for CLI flag combinations
- [ ] Update README.md with `--suggest` documentation
- [ ] Update ANALYSIS-suggest-feature.md with implementation details

---

## 10. Testing Strategy

### Unit Tests
- `reportViolationsWithSuggestions()`: suggestion display, missing-variable warning, no-config fallback, grouping
- `ScanSuggestion` type construction: enrichment from `ColorViolation`

### Integration Tests
- CLI `--suggest` with config present → suggestions shown
- CLI `--suggest` without config → graceful degradation + tip
- CLI `--suggest --changed` → only changed files scanned
- CLI `--suggest --fix` → `--fix` takes precedence
- Exit codes: `1` with violations, `0` without

### Manual Testing
- Run on the color-lint-tool project itself
- Verify output formatting with Chalk colors in terminal

---

## 11. Success Metrics

1. `color-lint --suggest` shows a variable suggestion for every violation that has a colorMap entry
2. Unmapped violations show a clear "No mapping found" message
3. Missing config degrades gracefully — never crashes
4. Missing variables in sourceOfTruth produce a visible warning
5. `--suggest --changed` works for PR-scoped suggestions
6. Exit code `1` on violations, `0` on clean — consistent with scan mode
7. All existing 100 tests continue to pass (no regressions)
8. ≥15 new tests covering the feature
