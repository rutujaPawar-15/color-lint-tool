import { describe, it, expect } from 'vitest';
import { TokenMap } from '../../src/core/token-map';

// Helper: build a map from inline content (no file IO).
function mapFrom(content: string): TokenMap {
  const map = new TokenMap();
  map.ingest(content);
  return map;
}

describe('TokenMap', () => {
  it('suggests an SCSS variable in $name form', () => {
    const map = mapFrom('$color-white: #ffffff;');
    expect(map.getSuggestions('#fff')).toEqual(['$color-white']);
  });

  it('suggests a CSS custom property in var(--name) form', () => {
    const map = mapFrom(':root { --color-white: #fff; }');
    expect(map.getSuggestions('#ffffff')).toEqual(['var(--color-white)']);
  });

  it('matches across equivalent color spellings', () => {
    const map = mapFrom('$brand: #ff0000;');
    expect(map.getSuggestions('red')).toEqual(['$brand']);
    expect(map.getSuggestions('rgb(255, 0, 0)')).toEqual(['$brand']);
  });

  it('lists all tokens for a color collision in definition order', () => {
    const map = mapFrom(`
      $color-white: #fff;
      :root { --bg-surface: #ffffff; }
    `);
    expect(map.getSuggestions('white')).toEqual(['$color-white', 'var(--bg-surface)']);
  });

  it('dedupes identical suggestions', () => {
    const map = mapFrom(`
      $color-white: #fff;
      $color-white: #ffffff;
    `);
    expect(map.getSuggestions('#fff')).toEqual(['$color-white']);
  });

  it('handles SCSS !default and !important flags on token values', () => {
    const map = mapFrom(`
      $color-white: #fff !default;
      $brand: #ff0000 !important;
    `);
    expect(map.getSuggestions('white')).toEqual(['$color-white']);
    expect(map.getSuggestions('#ff0000')).toEqual(['$brand']);
  });

  it('returns empty array when no token matches', () => {
    const map = mapFrom('$brand: #ff0000;');
    expect(map.getSuggestions('#00ff00')).toEqual([]);
  });

  it('ignores declarations whose value is not a color', () => {
    const map = mapFrom(`
      $spacing: 8px;
      $font: sans-serif;
      $ref: $brand;
      --alias: var(--other);
    `);
    expect(map.getSuggestions('8px')).toEqual([]);
    expect(map.size).toBe(0);
  });

  it('ignores non-variable declarations (regular properties)', () => {
    const map = mapFrom('.button { color: #ff0000; }');
    expect(map.getSuggestions('#ff0000')).toEqual([]);
  });

  it('ingests multiple sources cumulatively', () => {
    const map = new TokenMap();
    map.ingest('$a: #fff;');
    map.ingest(':root { --b: #fff; }');
    expect(map.getSuggestions('#fff')).toEqual(['$a', 'var(--b)']);
  });
});
