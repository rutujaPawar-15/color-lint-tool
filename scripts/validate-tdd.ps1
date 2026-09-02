<#
.SYNOPSIS
    TDD Validation Gate for color-lint-tool.
    Runs type checks, tests, and verifies test count against baseline.

.DESCRIPTION
    This script enforces test-driven development discipline by:
    1. Running tsc --noEmit (type check)
    2. Running vitest run --reporter=json (tests)
    3. Comparing the test count against a stored baseline
    4. Outputting a structured JSON report
    5. Failing if any gate is not met

.EXAMPLE
    pwsh -File scripts/validate-tdd.ps1
    npm run validate
#>

param(
    [switch]$UpdateBaseline,
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BaselineFile = Join-Path $PSScriptRoot ".tdd-baseline.json"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Step {
    param([string]$Icon, [string]$Message)
    Write-Host "`n$Icon  $Message" -ForegroundColor Cyan
}

function Write-Pass {
    param([string]$Message)
    Write-Host "   ✅ $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "   ❌ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "   ℹ️  $Message" -ForegroundColor Yellow
}

# ── Load or initialize baseline ──────────────────────────────────────────────

function Get-Baseline {
    if (Test-Path $BaselineFile) {
        $content = Get-Content $BaselineFile -Raw | ConvertFrom-Json
        return $content
    }
    return @{
        testCount = 0
        lastValidated = $null
    }
}

function Save-Baseline {
    param([int]$TestCount)
    $baseline = @{
        testCount     = $TestCount
        lastValidated = (Get-Date -Format "o")
    }
    $baseline | ConvertTo-Json | Set-Content $BaselineFile -Encoding UTF8
}

# ── Gate 1: Type Check ───────────────────────────────────────────────────────

Write-Step "🔍" "Gate 1: TypeScript type check (tsc --noEmit)"

$typecheckResult = "pass"
$typecheckOutput = ""

try {
    $typecheckOutput = & npx tsc --noEmit 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        $typecheckResult = "fail"
        Write-Fail "Type check failed with exit code $LASTEXITCODE"
        if ($Verbose) {
            Write-Host $typecheckOutput -ForegroundColor Gray
        }
    } else {
        Write-Pass "Type check passed"
    }
} catch {
    $typecheckResult = "fail"
    Write-Fail "Type check threw an exception: $_"
}

# ── Gate 2: Run Tests ────────────────────────────────────────────────────────

Write-Step "🧪" "Gate 2: Vitest test suite"

$testResult = "pass"
$testCount = 0
$testPassed = 0
$testFailed = 0
$testOutput = ""

try {
    # Run vitest with JSON reporter to parse results, but also capture console output
    $jsonOutput = & npx vitest run --reporter=json 2>&1 | Out-String
    $testOutput = $jsonOutput

    # Extract the JSON portion from the output (vitest may print non-JSON before it)
    # Look for the JSON object that starts with {"numTotalTestSuites"
    if ($jsonOutput -match '(\{[\s\S]*"numTotalTestSuites"[\s\S]*\})') {
        $jsonData = $Matches[1] | ConvertFrom-Json

        $testCount = $jsonData.numTotalTests
        $testPassed = $jsonData.numPassedTests
        $testFailed = $jsonData.numFailedTests

        if ($jsonData.numFailedTests -gt 0 -or $jsonData.numFailedTestSuites -gt 0) {
            $testResult = "fail"
            Write-Fail "Tests failed: $testPassed passed, $testFailed failed out of $testCount total"
        } else {
            Write-Pass "All tests passed: $testCount tests in $($jsonData.numTotalTestSuites) suites"
        }
    } else {
        # Fallback: try running with verbose reporter and count from output
        $verboseOutput = & npx vitest run --reporter=verbose 2>&1 | Out-String

        # Parse the summary line: "Tests  N passed (N)"
        if ($verboseOutput -match 'Tests\s+(\d+)\s+passed\s+\((\d+)\)') {
            $testPassed = [int]$Matches[1]
            $testCount = [int]$Matches[2]

            if ($testPassed -eq $testCount) {
                $testResult = "pass"
                Write-Pass "All tests passed: $testCount tests"
            } else {
                $testResult = "fail"
                Write-Fail "Some tests failed: $testPassed/$testCount passed"
            }
        } elseif ($verboseOutput -match '(\d+)\s+failed.*?(\d+)\s+passed') {
            $testFailed = [int]$Matches[1]
            $testPassed = [int]$Matches[2]
            $testCount = $testFailed + $testPassed
            $testResult = "fail"
            Write-Fail "Tests failed: $testPassed passed, $testFailed failed out of $testCount total"
        } else {
            $testResult = "fail"
            Write-Fail "Could not parse test results"
            if ($Verbose) {
                Write-Host $verboseOutput -ForegroundColor Gray
            }
        }
    }
} catch {
    $testResult = "fail"
    Write-Fail "Test runner threw an exception: $_"
}

# ── Gate 3: Test Count Baseline ──────────────────────────────────────────────

Write-Step "📊" "Gate 3: Test count baseline check"

$baseline = Get-Baseline
$baselineCount = $baseline.testCount
$testDelta = $testCount - $baselineCount
$baselineResult = "pass"

if ($testCount -lt $baselineCount) {
    $baselineResult = "fail"
    Write-Fail "Test count DECREASED: $testCount (current) < $baselineCount (baseline) — delta: $testDelta"
    Write-Info "Tests must never be removed without replacement. Restore deleted tests or add new ones."
} elseif ($testCount -eq $baselineCount) {
    Write-Pass "Test count unchanged: $testCount (matches baseline)"
} else {
    Write-Pass "Test count INCREASED: $baselineCount → $testCount (delta: +$testDelta)"
}

# ── Update baseline if all gates passed ──────────────────────────────────────

$allPassed = ($typecheckResult -eq "pass") -and ($testResult -eq "pass") -and ($baselineResult -eq "pass")

if ($allPassed -and ($testCount -gt $baselineCount -or $UpdateBaseline)) {
    Save-Baseline -TestCount $testCount
    Write-Info "Baseline updated: $testCount tests (saved to $BaselineFile)"
}

# ── Final Report ─────────────────────────────────────────────────────────────

Write-Step "📋" "Validation Report"

$report = @{
    timestamp       = (Get-Date -Format "o")
    typecheck       = $typecheckResult
    tests           = $testResult
    baseline        = $baselineResult
    testCount       = $testCount
    testPassed      = $testPassed
    testFailed      = $testFailed
    testDelta       = $testDelta
    baselineCount   = $baselineCount
    allPassed       = $allPassed
}

$reportJson = $report | ConvertTo-Json
Write-Host $reportJson

if ($allPassed) {
    Write-Host "`n🎉 ALL GATES PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n💥 VALIDATION FAILED" -ForegroundColor Red

    if ($typecheckResult -eq "fail") { Write-Host "   • Type check failed" -ForegroundColor Red }
    if ($testResult -eq "fail")      { Write-Host "   • Tests failed" -ForegroundColor Red }
    if ($baselineResult -eq "fail")  { Write-Host "   • Test count decreased" -ForegroundColor Red }

    exit 1
}
