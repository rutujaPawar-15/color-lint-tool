// color-lint-disable
import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { detectColors } from '../src/detector';

describe('Color Detector', () => {
  describe('Hex Colors', () => {
    it('should detect 3-digit hex colors', () => {
      const findings = detectColors('color: #fff;', 1);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].type, 'hex3');
      assert.equal(findings[0].color, '#fff');
    });

    it('should detect 6-digit hex colors', () => {
      const findings = detectColors('background: #ff0000;', 1);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].type, 'hex6');
      assert.equal(findings[0].color, '#ff0000');
    });

    it('should detect 8-digit hex colors with alpha', () => {
      const findings = detectColors('color: #ff0000ff;', 1);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].type, 'hex8');
      assert.equal(findings[0].color, '#ff0000ff');
    });
  });

  describe('RGB Colors', () => {
    it('should detect rgb() colors', () => {
      const findings = detectColors('color: rgb(255, 0, 0);', 1);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].type, 'rgb');
      assert.equal(findings[0].color, 'rgb(255, 0, 0)');
    });

    it('should detect rgba() colors', () => {
      const findings = detectColors('color: rgba(255, 0, 0, 0.5);', 1);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].type, 'rgb');
    });
  });

  describe('HSL Colors', () => {
    it('should detect hsl() colors', () => {
      const findings = detectColors('color: hsl(120, 100%, 50%);', 1);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].type, 'hsl');
    });

    it('should detect hsla() colors', () => {
      const findings = detectColors('color: hsla(120, 100%, 50%, 0.8);', 1);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].type, 'hsl');
    });
  });

  describe('Named Colors', () => {
    it('should detect named colors in CSS properties', () => {
      const findings = detectColors('color: red;', 1);
      assert.equal(findings.length, 1);
      assert.equal(findings[0].type, 'named');
      assert.equal(findings[0].color, 'red');
    });

    it('should detect multiple named colors', () => {
      const findings = detectColors('border: 1px solid blue; background: white;', 1);
      assert.equal(findings.length, 2);
    });
  });

  describe('Ignore Patterns', () => {
    it('should ignore CSS variables', () => {
      const findings = detectColors('color: var(--primary-color);', 1);
      assert.equal(findings.length, 0);
    });

    it('should ignore CSS custom properties', () => {
      const findings = detectColors('--primary-color: #ff0000;', 1);
      assert.equal(findings.length, 0);
    });

    it('should ignore SCSS variables', () => {
      const findings = detectColors('$primary: #ff0000;', 1);
      assert.equal(findings.length, 0);
    });

    it('should ignore LESS variables', () => {
      const findings = detectColors('@primary: #ff0000;', 1);
      assert.equal(findings.length, 0);
    });

    it('should ignore transparent keyword', () => {
      const findings = detectColors('background: transparent;', 1);
      assert.equal(findings.length, 0);
    });

    it('should ignore currentColor keyword', () => {
      const findings = detectColors('color: currentColor;', 1);
      assert.equal(findings.length, 0);
    });

    it('should ignore inherit keyword', () => {
      const findings = detectColors('color: inherit;', 1);
      assert.equal(findings.length, 0);
    });

    it('should ignore comments', () => {
      const findings = detectColors('// color: #ff0000;', 1);
      assert.equal(findings.length, 0);
    });

    it('should ignore lines with color-lint-disable', () => {
      const findings = detectColors('color: #ff0000; // color-lint-disable', 1);
      assert.equal(findings.length, 0);
    });
  });

  describe('Position Tracking', () => {
    it('should track correct line number', () => {
      const findings = detectColors('color: #fff;', 42);
      assert.equal(findings[0].line, 42);
    });

    it('should track correct column position', () => {
      const findings = detectColors('  background: #ff0000;', 1);
      assert.ok(findings[0].column > 0);
    });

    it('should include line content', () => {
      const line = 'color: #fff;';
      const findings = detectColors(line, 1);
      assert.equal(findings[0].lineContent, line.trim());
    });
  });
});
