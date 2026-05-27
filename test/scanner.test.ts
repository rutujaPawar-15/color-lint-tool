// color-lint-disable
import { strict as assert } from 'assert';
import { describe, it } from 'node:test';
import { scanFile } from '../src/scanner';
import path from 'path';

describe('Scanner', () => {
  describe('scanFile', () => {
    it('should scan a file and return issues', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'sample.scss');
      const issues = await scanFile(testFile);
      
      assert.ok(issues.length > 0, 'Should find color issues in sample.scss');
      assert.ok(issues[0].file, 'Should include file path');
      assert.ok(issues[0].line > 0, 'Should include line number');
    });

    it('should return empty array for non-existent file', async () => {
      const issues = await scanFile('non-existent-file.css');
      assert.equal(issues.length, 0);
    });

    it('should include all ColorIssue properties', async () => {
      const testFile = path.join(__dirname, 'fixtures', 'sample.scss');
      const issues = await scanFile(testFile);
      
      if (issues.length > 0) {
        const issue = issues[0];
        assert.ok(issue.file, 'Should have file property');
        assert.ok(issue.type, 'Should have type property');
        assert.ok(issue.color, 'Should have color property');
        assert.ok(typeof issue.line === 'number', 'Should have line number');
        assert.ok(typeof issue.column === 'number', 'Should have column number');
        assert.ok(issue.lineContent, 'Should have line content');
      }
    });
  });
});
