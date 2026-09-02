# Analysis: `--suggest` Feature — Inline Suggestions in Default Scan Mode

**Status:** PRD Refinement Phase 1 Complete  
**Date:** 2026-08-04  

---

## Problem Statement

Currently, the CLI has two distinct modes:

1. **Scan mode** (`color-lint`) — detects violations and lists them, but provides **no actionable guidance** on what to replace them with
2. **Fix mode** (`color-lint --fix --suggestions-only`) — shows suggestions, but requires the `--fix` flag and a `.color-lint-config.json` file

There is no middle ground: a user who just wants to see "violation + what to do about it" must opt into the full fix workflow. The `--suggest` feature fills this gap by enriching the default scan output with inline variable suggestions.

---

## Current Architecture (What Exists)

### Scan Mode Flow (lines 161–195 of `cli.ts`)

```
cli.ts → findFiles() / getChangedFiles()
       → scanFile() per file (concurrent)
       → reportViolations() — prints to terminal
       → exit(1) if violations found
```

`reportViolations()` in `reporter.ts` outputs:
```
📄 src/button.scss (2 violations)
  ⚠  Line 12, Col 9  |  color: #ff0000
  ⚠  Line 18, Col 5  |  background: #00ff00
```

No suggestion. No config file loaded. No variable lookup.

### Suggestion Infrastructure (Already Built)

| Module | What it Does | Reusable? |
|--------|-------------|-----------|
| `config.ts` → `loadConfig()` | Loads `.color-lint-config.json` | ✅ Yes |
| `normalizer.ts` → `normalizeColor()` | Normalizes hex/rgb/hsl/named to canonical form | ✅ Yes |
| `suggester.ts` → `buildColorLookup()`, `lookupVariable()` | O(1) color→variable lookup | ✅ Yes |
| `variables.ts` → `loadDefinedVariables()` | Checks if variable is defined in sourceOfTruth | ✅ Yes |

**Key insight:** All the suggestion logic already exists in `src/core/fixer/`. This feature only needs to **wire it into the scan mode output** — no new algorithms needed.

---

## Affected Modules

| File | Change Type | Why |
|------|-------------|-----|
| `src/utils/reporter.ts` | **MODIFY** | Add new `reportViolationsWithSuggestions()` function that shows suggestion per violation |
| `src/cli.ts` | **MODIFY** | Add `--suggest` flag; when set, load config and pass suggestions to reporter |
| `src/core/types.ts` | **MODIFY** | Add `ScanSuggestion` interface (violation + suggested variable + missing flag) |

### Modules NOT Changed

| Module | Why Unchanged |
|--------|---------------|
| `scanner.ts` | Scan logic is identical — we still detect the same violations |
| `config.ts` | Config loading is reused as-is |
| `suggester.ts` | Lookup logic is reused as-is |
| `normalizer.ts` | Normalization is reused as-is |
| `variables.ts` | Variable extraction is reused as-is |
| `fixer.ts` | Fix orchestrator is not involved — this is scan mode only |
| `replacer.ts` | No text replacement happens — suggestions are display-only |
| `file-finder.ts` | File discovery is unchanged |

---

## Dependency Graph

```
                       cli.ts (--suggest flag)
                      /       \
                     /         \
            loadConfig()    scanFile() per file
                |               |
         buildColorLookup()  → violations[]
                |               |
                └───────┬───────┘
                        ▼
              reportViolationsWithSuggestions()
              (new function in reporter.ts)
                        │
                For each violation:
                ├─ lookupVariable(v.value, lookup)
                └─ Print: violation + "→ Suggest: $variable"
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Config file missing when `--suggest` is used | High (new users) | Low | Graceful error message, same pattern as `--fix` |
| Performance impact of loading config + building lookup | Very Low | Low | One-time O(n) build, already proven fast in fix mode |
| Breaking existing scan output | Low | High | Existing `reportViolations()` stays unchanged; new function added alongside |
| Confusion between `--suggest` and `--fix --suggestions-only` | Medium | Medium | Clear docs: `--suggest` is read-only scan enrichment; `--fix` modifies files |

---

## Open Questions

1. **Should `--suggest` work without a config file?** If no `.color-lint-config.json` exists, should it: (a) error out like `--fix`, or (b) show violations without suggestions and print a hint about creating the config?
   - **Recommendation:** Option (b) — degrade gracefully. Show violations normally and print a note: "Tip: Create .color-lint-config.json to get variable suggestions."

2. **Should `--suggest` combine with `--changed`?** The user might want to see suggestions only for files they've modified.
   - **Recommendation:** Yes — `--suggest --changed` should work naturally (same as scan + changed).

3. **Exit code behavior?** Should `--suggest` exit(1) when violations are found (same as scan), or exit(0) since it's informational?
   - **Recommendation:** Exit(1) if violations found — consistent with scan mode behavior.
