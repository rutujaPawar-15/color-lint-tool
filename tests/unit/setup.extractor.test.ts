import { describe, it, expect } from 'vitest';
import { extractVariableDefinitions } from '../../src/core/setup/extractor';

describe('extractVariableDefinitions', () => {
  it('extracts SCSS color variables with their raw and normalized color', () => {
    const content = '$color-red: #ff0000;\n$color-white: #FFFFFF;';
    const defs = extractVariableDefinitions(content);

    expect(defs).toContainEqual({
      name: '$color-red',
      rawColor: '#ff0000',
      normalizedColor: '#ff0000',
    });
    expect(defs).toContainEqual({
      name: '$color-white',
      rawColor: '#FFFFFF',
      normalizedColor: '#ffffff',
    });
  });

  it('extracts CSS custom property color variables', () => {
    const content = ':root {\n  --brand: #0000ff;\n}';
    const defs = extractVariableDefinitions(content);

    expect(defs).toContainEqual({
      name: '--brand',
      rawColor: '#0000ff',
      normalizedColor: '#0000ff',
    });
  });

  it('normalizes rgb and named colors to hex/canonical form', () => {
    const content = '$c1: rgb(255, 0, 0);\n$c2: red;';
    const defs = extractVariableDefinitions(content);

    const c1 = defs.find(d => d.name === '$c1');
    const c2 = defs.find(d => d.name === '$c2');
    expect(c1!.normalizedColor).toBe('#ff0000');
    expect(c2!.normalizedColor).toBe('red');
  });

  it('skips variables whose value is not a color', () => {
    const content = '$spacing: 8px;\n$font: "Arial";\n$z-index: 100;';
    const defs = extractVariableDefinitions(content);
    expect(defs).toEqual([]);
  });

  it('skips variables that reference another variable rather than a literal color', () => {
    const content = '$color-red: #ff0000;\n$brand: $color-red;';
    const defs = extractVariableDefinitions(content);

    expect(defs.map(d => d.name)).toEqual(['$color-red']);
  });

  it('does not treat a variable USAGE as a definition', () => {
    const content = '.box { color: $color-red; }';
    const defs = extractVariableDefinitions(content);
    expect(defs).toEqual([]);
  });

  it('returns an empty array when there are no variables', () => {
    expect(extractVariableDefinitions('.box { color: #ff0000; }')).toEqual([]);
  });
});
