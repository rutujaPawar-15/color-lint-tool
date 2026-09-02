import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportViolations, reportViolationsWithSuggestions } from '../../src/utils/reporter';
import type { ColorViolation, ScanSuggestion } from '../../src/core/types';

describe('Reporter', () => {
  let logSpy: any;
  let loggedOutput: string[] = [];

  beforeEach(() => {
    loggedOutput = [];
    logSpy = vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      loggedOutput.push(args.join(' '));
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  describe('reportViolations', () => {
    it('prints nothing when violations list is empty', () => {
      reportViolations([], '/root');
      expect(loggedOutput.length).toBe(0);
    });

    it('prints grouped violations by file with line and column', () => {
      const violations: ColorViolation[] = [
        { file: '/root/src/button.scss', line: 12, column: 9, property: 'color', value: '#ff0000' }
      ];
      reportViolations(violations, '/root');
      const allText = loggedOutput.join('\n');
      expect(allText).toContain('button.scss');
      expect(allText).toContain('Line 12, Col 9');
      expect(allText).toContain('color');
      expect(allText).toContain('#ff0000');
    });
  });

  describe('reportViolationsWithSuggestions', () => {
    it('prints suggested variable next to violation when suggestion exists', () => {
      const suggestions: ScanSuggestion[] = [
        {
          file: '/root/src/button.scss',
          line: 12,
          column: 9,
          property: 'color',
          value: '#ff0000',
          suggestedVariable: '$color-red',
          variableMissing: false
        }
      ];

      reportViolationsWithSuggestions(suggestions, '/root');
      const allText = loggedOutput.join('\n');
      expect(allText).toContain('button.scss');
      expect(allText).toContain('Line 12, Col 9');
      expect(allText).toContain('color: #ff0000');
      expect(allText).toContain('Suggest: $color-red');
    });

    it('prints "No mapping found" when suggestedVariable is null', () => {
      const suggestions: ScanSuggestion[] = [
        {
          file: '/root/src/button.scss',
          line: 18,
          column: 5,
          property: 'background',
          value: '#abcdef',
          suggestedVariable: null,
          variableMissing: false
        }
      ];

      reportViolationsWithSuggestions(suggestions, '/root');
      const allText = loggedOutput.join('\n');
      expect(allText).toContain('No mapping found in colorMap');
    });

    it('prints warning when suggested variable is not found in sourceOfTruth', () => {
      const suggestions: ScanSuggestion[] = [
        {
          file: '/root/src/button.scss',
          line: 12,
          column: 9,
          property: 'color',
          value: '#ff0000',
          suggestedVariable: '$color-danger',
          variableMissing: true
        }
      ];

      reportViolationsWithSuggestions(suggestions, '/root');
      const allText = loggedOutput.join('\n');
      expect(allText).toContain('Suggest: $color-danger');
      expect(allText).toContain('not found in sourceOfTruth files');
    });

    it('groups multiple violations under their respective file headers', () => {
      const suggestions: ScanSuggestion[] = [
        {
          file: '/root/src/button.scss',
          line: 12,
          column: 9,
          property: 'color',
          value: '#ff0000',
          suggestedVariable: '$color-red',
          variableMissing: false
        },
        {
          file: '/root/src/card.scss',
          line: 5,
          column: 3,
          property: 'border-color',
          value: '#00ff00',
          suggestedVariable: '$color-green',
          variableMissing: false
        }
      ];

      reportViolationsWithSuggestions(suggestions, '/root');
      const allText = loggedOutput.join('\n');
      expect(allText).toContain('button.scss');
      expect(allText).toContain('card.scss');
      expect(allText).toContain('Suggest: $color-red');
      expect(allText).toContain('Suggest: $color-green');
    });

    it('does nothing when suggestions list is empty', () => {
      reportViolationsWithSuggestions([], '/root');
      expect(loggedOutput.length).toBe(0);
    });
  });
});
