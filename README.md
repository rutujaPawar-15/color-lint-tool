# Universal Color Lint Tool (POC)

A project-agnostic Command Line Interface (CLI) tool designed to scan a codebase, identify hard-coded CSS color values (Hex, RGB, RGBA), and report them as design system violations.

---

## 🎯 Purpose

In software development—especially within large enterprise systems like construction domain applications—maintaining a strict design system is vital.

When developers hard-code values like `#FFFFFF` or `rgb(0,0,0)` directly into `.scss`, `.html`, or `.ts` files, it creates **technical debt**. If the brand colors change, finding and replacing these values across thousands of files is prone to errors.

This tool automates the detection of those violations, acting as a quality gate to keep code clean and maintainable.

---

## 🚀 Usage

You can run this tool globally from any directory on your machine to scan the local files:

```bash
color-lint-check [options]
```
