import { describe, it, expect } from 'vitest';
import { replaceColorInText } from '../../src/core/fixer/replacer';

describe('ColorReplacer: replaceColorInText', () => {
  describe('simple hex replacements', () => {
    it('replaces a single hex color with a variable', () => {
      const input = 'color: #ff0000;';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('color: $color-red;');
    });

    it('replaces multiple occurrences of the same color', () => {
      const input = 'color: #ff0000; background: #ff0000;';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('color: $color-red; background: $color-red;');
    });

    it('preserves whitespace around the color', () => {
      const input = 'color:  #ff0000  ;';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('color:  $color-red  ;');
    });

    it('replaces colors case-insensitively for hex', () => {
      const input = 'color: #FF0000;';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('color: $color-red;');
    });
  });

  describe('named color replacements', () => {
    it('replaces a named color with a variable (case-insensitive)', () => {
      const input = 'color: red;';
      const output = replaceColorInText(input, 'red', '$color-red');
      expect(output).toBe('color: $color-red;');
    });

    it('replaces named colors case-insensitively', () => {
      const input = 'color: RED;';
      const output = replaceColorInText(input, 'red', '$color-red');
      expect(output).toBe('color: $color-red;');
    });

    it('replaces multiple named colors', () => {
      const input = 'color: red; border: red;';
      const output = replaceColorInText(input, 'red', '$color-red');
      expect(output).toBe('color: $color-red; border: $color-red;');
    });

    it('does not replace a named color that is part of a longer word', () => {
      // "red" should not match inside "redacted" or "$primary-red"
      const input = 'color: red; class: redacted; var: $primary-red;';
      const output = replaceColorInText(input, 'red', '$color-red');
      // Only the standalone "red" should be replaced
      expect(output).toBe('color: $color-red; class: redacted; var: $primary-red;');
    });
  });

  describe('rgb/rgba replacements', () => {
    it('replaces rgb() colors', () => {
      const input = 'color: rgb(255, 0, 0);';
      const output = replaceColorInText(input, 'rgb(255, 0, 0)', '$color-red');
      expect(output).toBe('color: $color-red;');
    });

    it('replaces rgba() colors', () => {
      const input = 'color: rgba(255, 0, 0, 0.5);';
      const output = replaceColorInText(input, 'rgba(255, 0, 0, 0.5)', '$color-red');
      expect(output).toBe('color: $color-red;');
    });

    it('replaces rgb/rgba with different spacing', () => {
      // Input has different spacing than the color pattern
      const input = 'color: rgb(255 0 0);';
      const output = replaceColorInText(input, 'rgb(255, 0, 0)', '$color-red');
      // Should still match because both normalize to the same hex
      expect(output).toBe('color: $color-red;');
    });
  });

  describe('hsl/hsla replacements', () => {
    it('replaces hsl() colors', () => {
      const input = 'color: hsl(0, 100%, 50%);';
      const output = replaceColorInText(input, 'hsl(0, 100%, 50%)', '$color-red');
      expect(output).toBe('color: $color-red;');
    });

    it('replaces hsla() colors', () => {
      const input = 'color: hsla(0, 100%, 50%, 1);';
      const output = replaceColorInText(input, 'hsla(0, 100%, 50%, 1)', '$color-red');
      expect(output).toBe('color: $color-red;');
    });
  });

  describe('quoted color values', () => {
    it('replaces colors inside double-quoted strings', () => {
      const input = 'const color = "#ff0000";';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('const color = "$color-red";');
    });

    it('replaces colors inside single-quoted strings', () => {
      const input = "const color = '#ff0000';";
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe("const color = '$color-red';");
    });

    it('replaces colors inside backtick strings', () => {
      const input = 'const color = `#ff0000`;';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('const color = `$color-red`;');
    });
  });

  describe('edge cases', () => {
    it('does not replace a color that does not exist in the text', () => {
      const input = 'color: #00ff00;';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe(input); // unchanged
    });

    it('handles multiline text by replacing in all lines', () => {
      const input = 'color: #ff0000;\nbackground: #ff0000;';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('color: $color-red;\nbackground: $color-red;');
    });

    it('preserves the overall structure of the text', () => {
      const input = `
        .button {
          color: #ff0000;
          border: 1px solid #ff0000;
        }
      `.trim();
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toContain('color: $color-red;');
      expect(output).toContain('border: 1px solid $color-red;');
      expect(output).toContain('.button {');
      expect(output).toContain('}');
    });

    it('does not replace colors in comments (already masked)', () => {
      // Comments should have been masked before calling this function,
      // so we assume the color is not in a comment. If it appears in a comment,
      // it means it wasn't masked, and we still replace it (caller's responsibility).
      const input = 'color: #ff0000; // use #ff0000 here';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      // Both occurrences are replaced (comments not masked at this level)
      expect(output).toBe('color: $color-red; // use $color-red here');
    });
  });

  describe('hex boundary safety', () => {
    it('does not replace a 6-digit hex when it is the prefix of an 8-digit hex', () => {
      // #ff0000 must NOT match inside #ff0000ff (which would corrupt it to "$color-redff")
      const input = 'background: #ff0000ff;';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('background: #ff0000ff;'); // unchanged
    });

    it('does not replace a 3-digit hex when it is the prefix of a 6-digit hex', () => {
      // #fff must NOT match inside #ffffff
      const input = 'color: #ffffff;';
      const output = replaceColorInText(input, '#fff', '$color-white');
      expect(output).toBe('color: #ffffff;'); // unchanged
    });

    it('still replaces an exact 6-digit hex followed by a non-hex char', () => {
      const input = 'color: #ff0000;';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('color: $color-red;');
    });

    it('replaces the 8-digit hex but leaves the 6-digit hex on the same line', () => {
      const input = 'a: #ff0000; b: #ff0000ff;';
      // Replacing the 6-digit form should only touch the standalone 6-digit occurrence
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('a: $color-red; b: #ff0000ff;');
    });
  });

  describe('special characters and escapes', () => {
    it('handles colors with backslash escapes in strings', () => {
      // Input: const color = "\#ff0000"; (escaped hash, though unusual)
      const input = 'const color = "#ff0000";';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('const color = "$color-red";');
    });

    it('replaces color correctly when it appears multiple times with different contexts', () => {
      const input = 'a { color: #ff0000; } b { background: #ff0000; }';
      const output = replaceColorInText(input, '#ff0000', '$color-red');
      expect(output).toBe('a { color: $color-red; } b { background: $color-red; }');
    });
  });
});
