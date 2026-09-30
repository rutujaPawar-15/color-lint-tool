// src/core/token-map.ts
//
// Builds a lookup from a canonical color key (see color-normalize) to the design
// tokens that resolve to that color. A hardcoded color can then be answered with
// the variable(s) a developer should use instead. Suggestions are kept in the form
// they were declared: SCSS variables as `$name`, CSS custom properties as
// `var(--name)`.

import postcss from 'postcss';
import scssPostcss from 'postcss-scss';
import * as fs from 'node:fs/promises';
import { normalizeColor } from './color-normalize';

export class TokenMap {
  // canonical color key -> suggestion strings, in declaration order, deduped.
  private readonly byColor = new Map<string, string[]>();

  /** Number of distinct colors that have at least one token. */
  get size(): number {
    return this.byColor.size;
  }

  /**
   * Parses CSS/SCSS content and records every variable declaration whose value is
   * a color. Safe to call repeatedly to accumulate tokens from multiple sources.
   */
  ingest(content: string): void {
    let root;
    try {
      root = postcss().process(content, { syntax: scssPostcss }).root;
    } catch {
      // A source file that fails to parse contributes no tokens rather than
      // aborting the whole run.
      return;
    }

    root.walkDecls((decl) => {
      const suggestion = suggestionFor(decl.prop);
      if (!suggestion) return; // not a variable declaration

      // Drop trailing SCSS/CSS flags (e.g. "#fff !default", "#000 !important") so the
      // bare color value can be normalized.
      const rawValue = decl.value.replace(/\s*!(default|global|important)\s*$/i, '').trim();

      const canonical = normalizeColor(rawValue);
      if (!canonical) return; // value is not a resolvable color literal

      this.add(canonical, suggestion);
    });
  }

  /** Reads and ingests each source file. Missing/unreadable files are skipped. */
  static async build(files: string[]): Promise<TokenMap> {
    const map = new TokenMap();
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        map.ingest(content);
      } catch {
        // Skip files that cannot be read.
      }
    }
    return map;
  }

  /** Returns every token matching `color`, in declaration order, or []. */
  getSuggestions(color: string): string[] {
    const canonical = normalizeColor(color);
    if (!canonical) return [];
    return this.byColor.get(canonical) ?? [];
  }

  private add(canonical: string, suggestion: string): void {
    const existing = this.byColor.get(canonical);
    if (!existing) {
      this.byColor.set(canonical, [suggestion]);
    } else if (!existing.includes(suggestion)) {
      existing.push(suggestion);
    }
  }
}

// Maps a declaration property to its "as-defined" suggestion form, or null if the
// property is not a design-token variable.
function suggestionFor(prop: string): string | null {
  if (prop.startsWith('--')) return `var(${prop})`;
  if (prop.startsWith('$')) return prop;
  return null;
}
