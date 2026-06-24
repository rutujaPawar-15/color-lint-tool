# Universal Color Lint Tool (POC)

A project-agnostic Command Line Interface (CLI) tool designed to scan a codebase, identify hard-coded CSS color values (Hex, RGB, RGBA), and report them as design system violations.

---

## 🎯 Purpose

In software development—especially within large enterprise systems like construction domain applications—maintaining a strict design system is vital.

When developers hard-code values like `#FFFFFF` or `rgb(0,0,0)` directly into `.scss`, `.html`, or `.ts` files, it creates **technical debt**. If the brand colors change, finding and replacing these values across thousands of files is prone to errors.

This tool automates the detection of those violations, acting as a quality gate to keep code clean and maintainable.

---

## 🛠️ Installation

### Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js** | v16 or higher |
| **npm** | v7 or higher |
| **Git** | Required for the `--changed` flag |

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/rutujaPawar-15/color-lint-tool.git
cd color-lint-tool
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Type-check the source (optional but recommended)

```bash
npm run lint
```

> Runs `tsc --noEmit` — confirms there are no TypeScript errors before building.

### Step 4 — Build the project

```bash
npm run build
```

> Compiles the TypeScript source from `src/` into `dist/`. This must be done before the tool can be used globally.

### Step 5 — Install globally on your machine

```bash
npm install -g .
```

> This registers the `color-lint-check` command so you can run it from **any project directory**.

---

## 🚀 Usage

Once installed, navigate to the project you want to audit and run:

### Scan the entire project

```bash
color-lint-check
```

Scans all `.css`, `.scss`, `.html`, `.ts`, and `.js` files in the current directory for hard-coded color violations.

### Scan only changed / modified files

```bash
color-lint-check --changed
```

or the shorthand:

```bash
color-lint-check -c
```

Only scans files that are **staged, unstaged, or untracked** in your git working tree — ideal for catching violations in just the files you are actively working on.

### View all available options

```bash
color-lint-check --help
```

---

## 📋 All Commands at a Glance

| Command | Description |
|---|---|
| `npm install` | Install all dependencies |
| `npm run lint` | Type-check source with TypeScript (no output files) |
| `npm run build` | Compile TypeScript source into `dist/` |
| `npm install -g .` | Register `color-lint-check` globally |
| `color-lint-check` | Scan the entire project for color violations |
| `color-lint-check --changed` | Scan only your changed / modified files |
| `color-lint-check -c` | Shorthand for `--changed` |
| `color-lint-check --help` | Show help and all available options |
