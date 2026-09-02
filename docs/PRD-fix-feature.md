# Product Requirements Document: `--fix` Feature for color-lint

## 1. Feature Overview

The `--fix` feature automatically scans files for hard-coded colors, suggests semantically appropriate CSS variables from your project's design token library, and optionally replaces hard-coded colors in-place with those variables. This enables teams to standardize color usage across their codebase and enforce design consistency.

---

## 2. User Stories

### User Story 1: Suggest Variables Without Modifying Files
**As a** developer on a team still building out color standards,
**I want to** see what CSS variables the tool recommends for each hard-coded color without actually changing my code,
**So that** I can review suggestions, decide which to adopt, and make manual fixes strategically.

**Acceptance Criteria:**
- `color-lint --fix --suggestions-only` scans the codebase and prints each violation with a recommended variable name
- Output format: `File: src/button.scss:15 | #ff0000 → suggest $color-red (affects 3 other locations)`
- The command exits with code 0 (success) and does not modify any files
- Recommendations appear even when the suggested variable is not yet defined in `_variables.scss`
- Violations are grouped by unique color value to show cross-file impact

### User Story 2: Auto-Replace Hard-Coded Colors
**As a** developer on a mature project with established color variables,
**I want to** automatically replace all detected hard-coded colors with their corresponding CSS variables,
**So that** I can quickly clean up legacy code and enforce design token usage without manual work.

**Acceptance Criteria:**
- `color-lint --fix` scans and automatically replaces hard-coded colors in all matching files
- Replacements use the tool's recommended variable mapping (see Section 3 for mapping logic)
- Only files that are modified are written to disk (read → check for changes → write only if different)
- A summary is printed showing: total violations found, total replaced, total skipped (see Section 5)
- Exit code is 1 if violations were found (whether replaced or skipped), 0 if none found
- The user can undo changes via Git: `git checkout` reverts all replacements

### User Story 3: Dry-Run Mode Before Applying Changes
**As a** developer who wants to preview changes before committing them,
**I want to** use a `--dry-run` flag that shows me exactly which lines would be modified and how,
**So that** I can verify the changes are correct before they're written to disk.

**Acceptance Criteria:**
- `color-lint --fix --dry-run` outputs a unified diff-like preview for each file with changes
- Preview format shows before/after for each replacement, with line numbers
- No files are modified when `--dry-run` is active
- Exit code and summary match what would happen without `--dry-run`
- Dry-run output is suitable for piping to a pager or saving to a file for review

### User Story 4: Fix Only Changed Files in a PR
**As a** developer working on a feature branch,
**I want to** fix only the hard-coded colors in files I've modified,
**So that** I don't accidentally change unrelated code and create merge conflicts.

**Acceptance Criteria:**
- `color-lint --fix --changed` applies fixes only to files that are staged, unstaged, or untracked (as detected by Git)
- Respects the same Git detection logic as the existing `--changed` flag (uses `git diff` commands)
- Summary shows which files were processed and how many violations were fixed per file
- Works seamlessly with `--suggestions-only` and `--dry-run` flags

---

## 3. Design Questions to Resolve

### 3.1 Variable Recommendation Strategy

The tool must determine which CSS variable to suggest for each hard-coded color. Three strategies are supported:

#### Strategy A: Configuration File Mapping (Recommended for v1)
A `.color-lint-config.json` file in the project root defines an explicit mapping from colors to variables:

```json
{
  "colorMap": {
    "#ff0000": "$color-red",
    "#00ff00": "$color-green",
    "#0000ff": "$color-blue",
    "red": "$color-red",
    "blue": "$color-blue"
  },
  "defaultBehavior": "strict"
}
```

- **Advantages**: Predictable, no ambiguity, team can control naming conventions, fast lookup
- **Disadvantages**: Requires upfront configuration, doesn't scale well as color palette grows
- **When to use**: Projects with small, stable color palettes; teams that want explicit control

#### Strategy B: Smart Heuristic Matching (Future; not v1)
The tool examines variable definitions in `_variables.scss` (or configured `sourceOfTruth` files) and suggests the closest semantic match:
- For `#ff0000`, search for variables matching patterns like `$color-red`, `$primary-red`, `$danger` (semantic analysis)
- For `rgb(255, 0, 0)`, convert to hex first, then match
- For named colors like `red`, match to variables containing "red" in their name

- **Advantages**: Scales with growing palettes, no config file needed, heuristic can improve over time
- **Disadvantages**: May suggest incorrect variables for ambiguous cases (e.g., is `#ff0000` danger or brand-red?), requires SCSS parsing
- **When to use**: Future versions; requires additional design work on matching algorithm

#### Strategy C: "Ask the User" / Per-Color Prompt (Not v1)
For colors without a mapping, the tool stops and prompts the user to specify the variable.

- **Advantages**: No mistakes, users define mappings interactively
- **Disadvantage**: Breaks automation, not suitable for CI/CD
- **When to use**: Interactive usage only; not v1

### **Decision for v1**: Use Strategy A (Configuration File Mapping)
- Require a `.color-lint-config.json` file to enable the `--fix` feature
- Fail gracefully if the config is missing (print a helpful message)
- Support both exact matches (#ff0000) and case-insensitive named matches (red, RED, Red → $color-red)

---

### 3.2 Handling Undefined / Missing Variables

**Scenario**: The config maps `#ff0000` to `$color-danger`, but `$color-danger` is not defined in `_variables.scss`.

**v1 Behavior**:
1. **Warnings during scan**: Print a warning: `WARNING: $color-danger is suggested for #ff0000, but not found in _variables.scss`
2. **Suggestions-only mode**: Still suggest the variable; user must add it before auto-replace can work
3. **Auto-replace mode**: Replace the color with the variable name anyway (e.g., `color: #ff0000` → `color: $color-danger`)
   - The build will fail with "undefined variable" if the variable is not exported
   - User must then add the variable definition to `_variables.scss`
   - This is intentional: the tool flags the problem, but doesn't enforce fixes

**Rationale**: Separating the linting (suggesting variables) from the build system (ensuring exports) keeps the tool focused and allows teams to control the workflow.

---

### 3.3 Cross-File Consistency

**Scenario**: The same hard-coded color appears in 5 different files.

**Behavior**:
- The tool suggests the **same variable** for all instances of the same color
- Example output: `#ff0000 appears in button.scss, card.scss, badge.ts (3 files total) → suggest $color-red for all`
- When auto-replacing, all instances are replaced with the same variable
- This ensures consistency: if developers accidentally use different variables for the same color, suggestions bring them back in sync

---

### 3.4 How Users Specify Available Variables

Two mechanisms work together:

#### Mechanism 1: Configuration File (`.color-lint-config.json`)
Defines the mapping from colors to variable names. File location: project root.

```json
{
  "sourceOfTruth": ["src/styles/_variables.scss", "src/styles/_variables-new.scss"],
  "colorMap": {
    "#ff0000": "$color-red",
    "#00ff00": "$color-green",
    "red": "$color-red",
    "blue": "$color-blue"
  },
  "defaultBehavior": "strict"
}
```

- **sourceOfTruth**: Paths to files where variables are defined; used for validation and warnings
  - Paths are relative to the project root
  - If a variable is suggested but not found in these files, a warning is printed
  - Multiple files are supported (e.g., separate files for brand and component colors)

- **colorMap**: Explicit mapping from hard-coded colors to CSS variable names
  - Keys can be hex (#ff0000), named (red, blue), rgb/hsl (converted to hex internally)
  - Values must be valid CSS variable names (start with $ for SCSS or -- for CSS custom properties)
  - Case-insensitive for named colors

- **defaultBehavior**: Controls how the tool handles unmapped colors
  - `"strict"`: Only suggest/replace colors in the colorMap; unmapped colors are flagged as violations (current scanner behavior continues)
  - `"lenient"` (future): Attempt heuristic matching for colors without explicit mappings

#### Mechanism 2: Source of Truth Files (Read-Only)
The scanner reads `_variables.scss` (or other configured `sourceOfTruth` files) to:
- Verify that suggested variables are actually defined (print warnings if not)
- Extract variable names for heuristic matching (future feature)
- Avoid flagging variables as violations (colors in the `sourceOfTruth` files are never reported as violations)

The scanner already has this logic in `SCAN_CONFIG.sourceOfTruth`.

---

## 4. CLI Interface

### 4.1 Command Syntax

```bash
# Suggest variables for all hard-coded colors (no changes)
color-lint --fix --suggestions-only

# Auto-replace all hard-coded colors
color-lint --fix

# Preview changes without writing to disk
color-lint --fix --dry-run

# Auto-replace changes only to modified/staged files
color-lint --fix --changed

# Combine flags
color-lint --fix --dry-run --changed              # Preview changes to PR files
color-lint --fix --suggestions-only --changed    # Suggest for PR files only
```

### 4.2 Flag Definitions

| Flag | Short | Default | Behavior |
|------|-------|---------|----------|
| `--fix` | (none) | Not set | Enable fix/suggestion mode; requires `.color-lint-config.json` |
| `--suggestions-only` | (none) | false | Print recommendations without modifying files |
| `--dry-run` | (none) | false | Show changes that would be made, but don't write files |
| `--changed` | `-c` | false | Process only modified/staged/untracked files (existing behavior) |

### 4.3 Implementation Notes

- **Mutually exclusive behaviors**:
  - `--fix` without `--suggestions-only` and without `--dry-run` = auto-replace (default)
  - `--fix --suggestions-only` = suggestions only
  - `--fix --dry-run` = preview without writing
  - Cannot combine `--suggestions-only` and `--dry-run` (they serve different purposes; prefer `--dry-run` for combined output)

- **Config file requirement**:
  - If `--fix` is specified and `.color-lint-config.json` is missing, print a helpful error and exit(1):
    ```
    ERROR: --fix requires a .color-lint-config.json file in the project root.
    Please create one with color→variable mappings. See docs/FIX_FEATURE.md for examples.
    ```

- **Backward compatibility**:
  - Without `--fix`, the tool behaves exactly as today: scan and report violations, exit(1) if violations found
  - Existing `--changed` flag continues to work as-is; `--fix` and `--changed` are orthogonal

---

## 5. Output Format

### 5.1 Suggestions-Only Mode (`--fix --suggestions-only`)

```
🔍 Starting ColorLint Tool...
Scanning [project-root] with suggestions enabled.

SUGGESTIONS (3 violations, 2 unique colors):

  src/components/button.scss:12
    Line: color: #ff0000;
    → Suggest: $color-red
    Impact: Also appears in 2 other file(s)

  src/components/card.scss:8
    Line: background: #ff0000;
    → Suggest: $color-red
    Impact: Also appears in 2 other file(s)

  src/styles/badge.ts:15
    Line: color: "red",
    → Suggest: $color-red
    Impact: Also appears in 2 other file(s)

  src/components/banner.scss:20
    Line: border-color: #00ff00;
    → Suggest: $color-green
    Impact: First occurrence

✅ Suggestions complete! Review above and consider adopting these variables.
```

**Format details**:
- Each suggestion shows file, line number, original line of code, and recommended variable
- Group multiple occurrences of the same color and show the count
- If a variable is not found in `sourceOfTruth` files, append a warning:
  ```
  → Suggest: $color-red (⚠️  not found in _variables.scss)
  ```
- Exit code: 0 (success); violations are not treated as errors in suggestions-only mode

---

### 5.2 Dry-Run Mode (`--fix --dry-run`)

```
🔍 Starting ColorLint Tool...
Scanning [project-root] with --dry-run (no changes will be written).

CHANGES PREVIEW (3 violations, would replace 3):

  src/components/button.scss
    Line 12: color: #ff0000;
    ✏️  → color: $color-red;

  src/components/card.scss
    Line 8: background: #ff0000;
    ✏️  → background: $color-red;

  src/styles/badge.ts
    Line 15: color: "red",
    ✏️  → color: $color-red,

  src/components/banner.scss
    Line 20: border-color: #00ff00;
    ✏️  → border-color: $color-green;

SUMMARY:
  Files affected: 4
  Violations found: 4
  Would be replaced: 4
  Skipped (unmapped): 0
  
Run without --dry-run to apply changes. Exit code: 1

❌ Would replace 4 violation(s) across 4 file(s).
```

**Format details**:
- Show before/after for each replacement
- Group by file
- Summary at the end with counts
- Exit code: 1 (same as if violations were found and replaced)
- Add a note at the top saying "no changes will be written"

---

### 5.3 Auto-Replace Mode (`--fix`)

```
🔍 Starting ColorLint Tool...
Scanning [project-root] with --fix (auto-replace enabled).

FIXING (3 violations to replace):

  ✅ src/components/button.scss:12
    color: #ff0000; → color: $color-red;

  ✅ src/components/card.scss:8
    background: #ff0000; → background: $color-red;

  ✅ src/styles/badge.ts:15
    color: "red", → color: $color-red,

  ✅ src/components/banner.scss:20
    border-color: #00ff00; → border-color: $color-green;

SUMMARY:
  Files modified: 4
  Violations found: 4
  Replaced: 4
  Skipped (unmapped): 0
  
Use git diff to review changes. Exit code: 1

❌ Fixed 4 violation(s) across 4 file(s). Review with git diff.
```

**Format details**:
- Show each replacement with a ✅ checkmark
- Summary with counts
- Remind users to review with `git diff`
- Exit code: 1 if violations were found/replaced; 0 if none found
- If violations exist but cannot be fixed (no mapping), show them under "Skipped"

---

### 5.4 Error Cases

**Missing config file**:
```
ERROR: --fix requires a .color-lint-config.json file in the project root.
Please create one with color→variable mappings.
See docs/FIX_FEATURE.md for examples.

Exit code: 1
```

**Invalid config**:
```
ERROR: .color-lint-config.json is invalid JSON.
Details: Unexpected token at line 5, column 10

Exit code: 1
```

**Unmapped color in strict mode**:
```
WARNING: #ff0000 found but not in colorMap. Set defaultBehavior to "lenient" to attempt heuristic matching.
Location: src/button.scss:12
```

---

## 6. Error Handling & Safety

### 6.1 Dry-Run Mode (Recommended Workflow)

`--dry-run` is the safest way to preview changes:

```bash
color-lint --fix --dry-run        # See what would change
git diff color-lint-output.txt    # Review the preview
color-lint --fix                  # Apply changes if happy
git diff                          # Verify actual changes
git add -A && git commit          # Commit the fixes
```

### 6.2 File Write Safety

When auto-replacing:
1. Read the file into memory
2. Apply all replacements (in-memory only)
3. Compare with original; only write if different
4. Write only modified files to disk
5. If a write fails (permissions, disk full), continue with next file and report errors at end

```typescript
// Pseudocode
for (const file of filesToFix) {
  const original = fs.readFile(file);
  const modified = applyReplacements(original);
  if (modified !== original) {
    try {
      fs.writeFile(file, modified);
      successCount++;
    } catch (err) {
      console.error(`Failed to write ${file}: ${err.message}`);
      errorFiles.push(file);
    }
  }
}
```

### 6.3 Undo Strategy

Since the tool writes source files directly, the standard Git workflow is the undo mechanism:

```bash
# If you don't like the changes, undo with Git
git checkout -- .                    # Discard all changes
git checkout -- src/button.scss      # Discard specific file
```

This is **simpler and more familiar** than a custom backup/undo mechanism. It leverages the standard VCS workflow.

**No custom backup/undo feature in v1.** Users rely on Git.

### 6.4 Permission Handling

- Check file read/write permissions before processing
- Skip files that cannot be read (report warning)
- If a file cannot be written, report error and continue with next file
- At end, if any writes failed, exit(1) with summary of failures

### 6.5 Edge Cases & Validation

| Scenario | Behavior |
|----------|----------|
| Color value has leading/trailing whitespace (e.g., ` #ff0000 `) | Preserve whitespace; replace only the color value |
| Color inside a comment (e.g., `// Use #ff0000 for errors`) | Skip (comments are already masked by scanner) |
| Color inside a string literal (e.g., `"color: #ff0000"` inside a JavaScript string) | The scanner detects this; in fix mode, replace the string content |
| Variable name conflicts (e.g., `$color-red` defined in two files) | Assume they're the same; suggest the variable name as-is |
| Same color mapped to different variables in config | Use the first mapping; log a warning |
| Very large files (> 10 MB) | Process normally; no special handling needed (regex is fast) |
| Binary files | Skip (use file type detection; only process text files) |

---

## 7. Scope Boundaries

### IN (Included in v1)

- **Detection**: Scan CSS/SCSS/Less/HTML/TS/JS for hard-coded colors (existing scanner logic)
- **Suggestion**: Recommend CSS variable names based on `.color-lint-config.json` mapping
- **Auto-replace**: Replace hard-coded colors with variable names in source files
- **Dry-run**: Preview changes without writing to disk (`--fix --dry-run`)
- **Suggestions-only**: Print recommendations without modifying files (`--fix --suggestions-only`)
- **Cross-file consistency**: Suggest the same variable for the same color across all files
- **PR-scoped fixes**: Apply fixes only to changed/staged files (`--fix --changed`)
- **Config file**: `.color-lint-config.json` for explicit color→variable mappings
- **Warnings**: Alert when suggested variables are not found in `sourceOfTruth` files
- **Exit codes**: Proper exit codes for scripting (0 = no violations, 1 = violations found/fixed)

### OUT (Not v1; Future Enhancements)

- **Heuristic matching**: Smart suggestions based on variable naming patterns (e.g., `#ff0000` → `$color-red` from `_variables.scss`)
- **Interactive prompts**: "What variable should we use for #ff0000?" → user types answer
- **Auto-export**: Automatically add `@export` or module exports for suggested variables
- **Variable renaming**: Update variable definitions if a variable is found but misnamed
- **Custom transformers**: Allow plugins to define custom color-to-variable logic
- **Learning from feedback**: Remember user's choices and apply them to future scans
- **Merge conflict detection**: Special handling when fixes conflict with concurrent changes
- **Analytics**: Track which colors are most commonly hard-coded (for future design decisions)
- **CSS custom properties (`--color-red`)**: Support CSS variables in addition to SCSS variables (future version with detection)

---

## 8. Configuration File Specification

### 8.1 `.color-lint-config.json` Structure

```json
{
  "sourceOfTruth": [
    "src/styles/_variables.scss",
    "src/styles/_variables-new.scss"
  ],
  "colorMap": {
    "#ff0000": "$color-red",
    "#00ff00": "$color-green",
    "#0000ff": "$color-blue",
    "#ffffff": "$color-white",
    "#000000": "$color-black",
    "red": "$color-red",
    "blue": "$color-blue",
    "white": "$color-white",
    "black": "$color-black",
    "rgb(255, 0, 0)": "$color-red",
    "hsl(0, 100%, 50%)": "$color-red"
  },
  "defaultBehavior": "strict"
}
```

### 8.2 Schema Notes

- **sourceOfTruth** (optional): Array of file paths (relative to project root) where variables are defined
  - Used for validation warnings, not required for basic --fix to work
  - Defaults to: `["src/styles/_variables.scss", "_variables.scss"]`

- **colorMap** (required): Object mapping color strings to variable names
  - Keys can be: hex (#fff, #ffffff, #ffffffff), named (red, blue, transparent), or rgb/hsl formats
  - Values must be valid CSS variable names (e.g., `$color-red`, `--color-red`)
  - Case-insensitive for named colors
  - RGB/HSL keys are normalized to hex internally for matching

- **defaultBehavior** (optional): `"strict"` or `"lenient"`
  - `"strict"` (default): Only suggest mapped colors; unmapped colors remain as violations
  - `"lenient"` (future): Attempt heuristic matching for unmapped colors

### 8.3 Example: Bootstrap Color Palette

```json
{
  "sourceOfTruth": ["src/scss/_variables.scss"],
  "colorMap": {
    "#007bff": "$blue",
    "#6c757d": "$gray",
    "#28a745": "$green",
    "#dc3545": "$red",
    "#ffc107": "$warning",
    "#17a2b8": "$info",
    "#ffffff": "$white",
    "#000000": "$black"
  },
  "defaultBehavior": "strict"
}
```

---

## 9. Implementation Roadmap

### Phase 1 (v1.1): MVP
- [ ] Parse `.color-lint-config.json`
- [ ] Add `--fix`, `--suggestions-only`, `--dry-run` flags to CLI
- [ ] Implement variable suggestion logic (exact color matching)
- [ ] Implement auto-replace logic (in-memory replacement → file write)
- [ ] Print suggestions and dry-run output
- [ ] Print summary and exit codes
- [ ] Add unit tests for suggestion and replacement logic
- [ ] Add integration tests for CLI commands
- [ ] Documentation: README section on `--fix` feature, config file examples

### Phase 2 (v1.2+): Enhancements
- [ ] Heuristic matching from `_variables.scss` parsing
- [ ] Interactive prompt mode for unmapped colors
- [ ] Lenient mode in defaultBehavior
- [ ] Analytics on color usage patterns
- [ ] CI/CD integration examples

---

## 10. Testing Strategy

### Unit Tests
- Color matching logic (exact hex, named, rgb/hsl formats)
- Variable suggestion (config lookup)
- String replacement (preserving whitespace, handling edge cases)
- Config parsing and validation

### Integration Tests
- End-to-end `--fix --suggestions-only`
- End-to-end `--fix --dry-run`
- End-to-end `--fix` (auto-replace)
- End-to-end `--fix --changed`
- Verify correct exit codes
- Verify file write safety (only modified files written)
- Error cases: missing config, invalid config, permission errors

### Manual Testing (Pre-Release)
- Test on real codebase with mixed CSS/SCSS/HTML/TS
- Test with large files (1000+ lines)
- Test with various newline formats (LF, CRLF)
- Test with non-ASCII characters in comments
- Verify `git diff` shows expected changes

---

## 11. Success Metrics

A successful v1 release will:
1. Allow users to scan and get suggestions without modifying files (`--suggestions-only`)
2. Allow users to preview changes safely (`--dry-run`)
3. Allow users to auto-replace hard-coded colors efficiently (`--fix`)
4. Ensure 100% of replaced colors are mapped in `.color-lint-config.json`
5. Provide clear, actionable error messages if config is missing or invalid
6. Maintain backward compatibility (existing scans work without `--fix`)
7. Support all existing file types (CSS/SCSS/Less/HTML/TS/JS)
8. Have >95% test coverage on fix logic
