import { describe, it, expect } from 'vitest';
import { buildColorMap } from '../../src/core/setup/generator';
import type { VariableDefinition } from '../../src/core/setup/extractor';

function def(name: string, normalizedColor: string): VariableDefinition {
  return { name, rawColor: normalizedColor, normalizedColor };
}

describe('buildColorMap', () => {
  it('reverses name->color definitions into a color->variable map', () => {
    const defs = [def('$color-red', '#ff0000'), def('$color-blue', '#0000ff')];
    const map = buildColorMap(defs, {});

    expect(map).toEqual({
      '#ff0000': '$color-red',
      '#0000ff': '$color-blue',
    });
  });

  it('collapses duplicate (name, color) pairs into a single entry', () => {
    const defs = [def('$color-red', '#ff0000'), def('$color-red', '#ff0000')];
    expect(buildColorMap(defs, {})).toEqual({ '#ff0000': '$color-red' });
  });

  it('uses the resolution to pick the winner for a conflicting color', () => {
    const defs = [def('$color-red', '#ff0000'), def('$color-danger', '#ff0000')];
    const map = buildColorMap(defs, { '#ff0000': '$color-danger' });

    expect(map).toEqual({ '#ff0000': '$color-danger' });
  });

  it('omits a conflicting color that has no resolution (developer chose to skip)', () => {
    const defs = [
      def('$color-red', '#ff0000'),
      def('$color-danger', '#ff0000'),
      def('$color-blue', '#0000ff'),
    ];
    const map = buildColorMap(defs, {}); // no resolution for the #ff0000 conflict

    // The unambiguous color is kept; the conflicting one is dropped.
    expect(map).toEqual({ '#0000ff': '$color-blue' });
  });

  it('returns an empty map for no definitions', () => {
    expect(buildColorMap([], {})).toEqual({});
  });
});
