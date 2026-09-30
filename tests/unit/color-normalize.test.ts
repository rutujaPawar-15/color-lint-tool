import { describe, it, expect } from 'vitest';
import { normalizeColor } from '../../src/core/color-normalize';

describe('normalizeColor', () => {
  it('treats equivalent spellings of white as the same key', () => {
    const white = normalizeColor('#ffffff');
    expect(white).not.toBeNull();
    expect(normalizeColor('#fff')).toBe(white);
    expect(normalizeColor('#FFFFFF')).toBe(white);
    expect(normalizeColor('white')).toBe(white);
    expect(normalizeColor('rgb(255,255,255)')).toBe(white);
    expect(normalizeColor('rgb(255, 255, 255)')).toBe(white);
    expect(normalizeColor('hsl(0, 0%, 100%)')).toBe(white);
  });

  it('treats equivalent spellings of black as the same key', () => {
    const black = normalizeColor('#000000');
    expect(normalizeColor('#000')).toBe(black);
    expect(normalizeColor('black')).toBe(black);
    expect(normalizeColor('rgb(0,0,0)')).toBe(black);
    expect(normalizeColor('hsl(0,0%,0%)')).toBe(black);
  });

  it('distinguishes different colors', () => {
    expect(normalizeColor('#fff')).not.toBe(normalizeColor('#000'));
    expect(normalizeColor('red')).not.toBe(normalizeColor('blue'));
  });

  it('handles alpha: 8-digit hex, 4-digit hex, and rgba', () => {
    const halfBlack = normalizeColor('rgba(0, 0, 0, 0.5)');
    expect(halfBlack).not.toBeNull();
    expect(normalizeColor('#00000080')).toBe(halfBlack); // 0x80/255 ≈ 0.502
    // opaque forms differ from semi-transparent
    expect(normalizeColor('#000000')).not.toBe(halfBlack);
  });

  it('treats missing alpha as fully opaque', () => {
    expect(normalizeColor('#ff0000')).toBe(normalizeColor('rgba(255,0,0,1)'));
    expect(normalizeColor('rgb(255,0,0)')).toBe(normalizeColor('#ff0000ff'));
  });

  it('maps named color "transparent" to fully transparent black', () => {
    expect(normalizeColor('transparent')).toBe(normalizeColor('rgba(0,0,0,0)'));
  });

  it('is case-insensitive for named colors', () => {
    expect(normalizeColor('RED')).toBe(normalizeColor('red'));
    expect(normalizeColor('Red')).toBe(normalizeColor('red'));
  });

  it('returns null for non-literal / unresolvable values', () => {
    expect(normalizeColor('currentColor')).toBeNull();
    expect(normalizeColor('var(--color-primary)')).toBeNull();
    expect(normalizeColor('$primary')).toBeNull();
    expect(normalizeColor('inherit')).toBeNull();
    expect(normalizeColor('')).toBeNull();
    expect(normalizeColor('not-a-color')).toBeNull();
  });

  it('handles rgb percentages', () => {
    expect(normalizeColor('rgb(100%, 0%, 0%)')).toBe(normalizeColor('#ff0000'));
  });
});
