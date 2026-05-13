const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');
const detector = require('./detector');
const gitUtils = require('./utils/gitUtils');

/**
 * Get list of files to scan based on arguments
 */
async function getFiles(args) {
  let filesToScan = [];
  
  if (args['git-diff']) {
    // Get files changed in current branch
    filesToScan = await gitUtils.getChangedFiles();
  } else {
    // Get all files matching extensions
    const extensions = args.ext.split(',').map(e => e.trim());
    const patterns = extensions.map(ext => 
      `${args.path}/**/*${ext}`
    );
    
    for (const pattern of patterns) {
      const files = await glob(pattern, { 
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
        absolute: true
      });
      filesToScan.push(...files);
    }
  }
  
  return [...new Set(filesToScan)]; // Remove duplicates
}

/**
 * Scan a single file for hard-coded colors
 */
async function scanFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const issues = [];
    
    lines.forEach((line, index) => {
      const findings = detector.detectColors(line, index + 1);
      findings.forEach(finding => {
        issues.push({
          file: filePath,
          ...finding
        });
      });
    });
    
    return issues;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return [];
  }
}

/**
 * Scan multiple files
 */
async function scanFiles(files) {
  const allIssues = [];
  
  for (const file of files) {
    const issues = await scanFile(file);
    allIssues.push(...issues);
  }
  
  return {
    totalIssues: allIssues.length,
    totalFiles: files.length,
    filesWithIssues: new Set(allIssues.map(i => i.file)).size,
    issues: allIssues
  };
}

module.exports = {
  getFiles,
  scanFile,
  scanFiles
};