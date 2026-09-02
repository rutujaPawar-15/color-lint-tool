import { describe, it, expect } from 'vitest';
import { normalizeColor } from '../../src/core/fixer/normalizer';

describe('ColorNormalizer: normalizeColor', () => {
  describe('hex colors', () => {
    it('normalizes 6-digit hex to lowercase', () => {
      expect(normalizeColor('#FF0000')).toBe('#ff0000');
      expect(normalizeColor('#ffffff')).toBe('#ffffff');
    });

    it('normalizes 3-digit hex to 6-digit lowercase', () => {
      expect(normalizeColor('#fff')).toBe('#ffffff');
      expect(normalizeColor('#f00')).toBe('#ff0000');
    });

    it('normalizes 8-digit hex (with alpha) to 8-digit lowercase', () => {
      expect(normalizeColor('#FF0000FF')).toBe('#ff0000ff');
      expect(normalizeColor('#fff0')).toBe('#ffffff00');
    });
  });

  describe('named colors', () => {
    it('normalizes named colors to lowercase', () => {
      expect(normalizeColor('red')).toBe('red');
      expect(normalizeColor('RED')).toBe('red');
      expect(normalizeColor('Blue')).toBe('blue');
      expect(normalizeColor('white')).toBe('white');
      expect(normalizeColor('transparent')).toBe('transparent');
    });

    it('returns the named color as-is if valid (case-normalized)', () => {
      expect(normalizeColor('currentColor')).toBe('currentcolor');
      expect(normalizeColor('gray')).toBe('gray');
      expect(normalizeColor('grey')).toBe('grey');
    });
  });

  describe('rgb/rgba colors', () => {
    it('normalizes rgb(r, g, b) to hex', () => {
      expect(normalizeColor('rgb(255, 0, 0)')).toBe('#ff0000');
      expect(normalizeColor('rgb(255, 255, 255)')).toBe('#ffffff');
      expect(normalizeColor('rgb(0, 128, 255)')).toBe('#0080ff');
    });

    it('normalizes rgba(r, g, b, a) to hex with alpha', () => {
      expect(normalizeColor('rgba(255, 0, 0, 1)')).toBe('#ff0000ff');
      expect(normalizeColor('rgba(255, 0, 0, 0.5)')).toBe('#ff000080');
      expect(normalizeColor('rgba(255, 0, 0, 0)')).toBe('#ff000000');
    });

    it('handles rgb/rgba with spaces and modern syntax', () => {
      expect(normalizeColor('rgb(255 0 0)')).toBe('#ff0000');
      expect(normalizeColor('rgba(255 0 0 / 1)')).toBe('#ff0000ff');
    });

    it('clamps out-of-range channels to a valid 2-digit hex', () => {
      // 300 is out of range; must clamp to ff rather than produce an invalid "12c"
      expect(normalizeColor('rgb(300, 0, 0)')).toBe('#ff0000');
    });
  });

  describe('hsl/hsla colors', () => {
    it('normalizes hsl(h, s%, l%) to hex', () => {
      expect(normalizeColor('hsl(0, 100%, 50%)')).toBe('#ff0000');
      expect(normalizeColor('hsl(120, 100%, 50%)')).toBe('#00ff00');
      expect(normalizeColor('hsl(240, 100%, 50%)')).toBe('#0000ff');
    });

    it('normalizes hsla(h, s%, l%, a) to hex with alpha', () => {
      expect(normalizeColor('hsla(0, 100%, 50%, 1)')).toBe('#ff0000ff');
      expect(normalizeColor('hsla(0, 100%, 50%, 0.5)')).toBe('#ff000080');
    });
  });

  describe('whitespace handling', () => {
    it('trims whitespace from input', () => {
      expect(normalizeColor('  #ff0000  ')).toBe('#ff0000');
      expect(normalizeColor('\nred\t')).toBe('red');
    });
  });
});
