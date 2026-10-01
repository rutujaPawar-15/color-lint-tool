#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { findFiles, getChangedFiles, findTokenFiles, resolveSingleFile, resolveTokenFile } from './utils/file-finder';
import { loadVariables } from './core/variables';
import { isFixable, parseForFix, fixFile, ChooseToken, STOP } from './core/fixer';
import { formatFileHeader, formatViolationLine, warnTokenFile } from './utils/reporter';

// Indent of everything printed under a violation line, matching the reporter's Suggestion line.
const INDENT = '     ';

// Reads stdin one line at a time on demand; resolves null once stdin has ended, so a
// non-interactive run (e.g. CI with empty stdin) never hangs. Created lazily, only when a
// prompt is actually needed.
function createLineReader() {
  const rl = readline.createInterface({ input: process.stdin });
  const queued: string[] = [];
  const waiting: ((line: string | null) => void)[] = [];
  let closed = false;
  let interrupted = false;

  const flush = () => waiting.splice(0).forEach((resolve) => resolve(null));
  rl.on('line', (line) => {
    const resolve = waiting.shift();
    if (resolve) resolve(line); else queued.push(line);
  });
  rl.on('close', () => { closed = true; flush(); });

  // Ctrl+C at a prompt ends the wait, so the picks made so far can still be written.
  const onSigint = () => { interrupted = true; flush(); };

  const next = (): Promise<string | null> =>
    interrupted ? Promise.resolve(null)
      : queued.length ? Promise.resolve(queued.shift()!)
      : closed ? Promise.resolve(null)
      : new Promise((resolve) => waiting.push(resolve));

  return {
    // Prints the prompt and resolves the answer line, or null on end of stdin or Ctrl+C.
    // The SIGINT handler is installed only while waiting: elsewhere Node's default applies.
    ask: async (prompt: string): Promise<string | null> => {
      process.on('SIGINT', onSigint);
      try {
        process.stdout.write(prompt);
        const answer = await next();
        // A terminal echoes the user's Enter; piped stdin does not, so end the line ourselves.
        if (!process.stdin.isTTY || interrupted) process.stdout.write('\n');
        return answer;
      } finally {
        process.off('SIGINT', onSigint);
      }
    },
    get interrupted() { return interrupted; },
    close: () => rl.close(),
  };
}

const program = new Command();

program
  .name('color-lint-fix')
  .description('Replace hard-coded colors in .scss / .css files with their matching design token.')
  .option('-c, --changed', 'Fix only changed files in the current directory and working tree (staged, unstaged, and untracked). Requires git.', false)
  .option('-f, --file <path>', 'Fix only this one .scss / .css file (relative to the current directory, or absolute). Cannot be combined with --changed.')
  .option('-t, --tokens <path>', 'Design token file to replace colors with. Defaults to every _variables.scss / _variables-new.scss found in the current directory.')
  .action(async (options) => {
    const targetDir = process.cwd();
    let reader: ReturnType<typeof createLineReader> | undefined;

    try {
      if (options.file && options.changed) throw new Error('Use either --file or --changed, not both.');

      // 1. Tokens and files — chosen exactly as color-lint chooses them
      //    A broken --tokens file is fatal; a broken discovered one is only a warning.
      const tokenFiles = options.tokens
        ? [resolveTokenFile(targetDir, options.tokens)]
        : await findTokenFiles(targetDir);
      const tokens = loadVariables(tokenFiles, options.tokens ? undefined : warnTokenFile);

      // A --tokens file inside the scanned tree is where colors are defined: never edit it.
      const tokenPaths = new Set(tokenFiles.map((f) => path.resolve(f)));
      let files: string[];
      if (options.file) {
        // A named file is refused with its reason, rather than silently filtered like discovered ones.
        const { file, skipReason } = resolveSingleFile(targetDir, options.file);
        const reason = skipReason
          ?? (!isFixable(file) ? 'color-lint-fix only fixes .scss / .css files'
            : tokenPaths.has(file) ? 'it is the --tokens file'
            : null);
        if (reason) {
          console.log(chalk.yellow(`Skipped ${options.file}: ${reason}.`));
          return;
        }
        files = [file];
      } else {
        files = (options.changed ? await getChangedFiles(targetDir) : await findFiles(targetDir))
          .filter((f) => isFixable(f) && !tokenPaths.has(path.resolve(f)));
      }

      // 2. Parse every file before prompting or writing, so a parse error modifies nothing
      const parsed = files.map((f) => parseForFix(f, fs.readFileSync(f, 'utf8')));

      // 3. Plan replacements, prompting whenever several tokens match. Output is laid out like
      //    color-lint's report: one header per file, then a block per prompted violation.
      let headerFor: string | undefined;
      const choose: ChooseToken = async (v, candidates) => {
        if (v.file !== headerFor) {
          headerFor = v.file;
          console.log('\n' + formatFileHeader(path.relative(targetDir, v.file)));
        } else {
          console.log(''); // blank line between blocks of the same file
        }
        console.log(formatViolationLine(v));
        candidates.forEach((c, i) => console.log(`${INDENT}${i + 1}) ${chalk.green(c)}`));

        reader ??= createLineReader();
        const line = await reader.ask(`${INDENT}${chalk.cyan(`Pick a token [1-${candidates.length}, s=skip, q=quit]:`)} `);
        if (reader.interrupted) return STOP;
        if (line === null) return null; // end of stdin: a skip, not a quit

        const answer = line.trim().toLowerCase();
        if (answer === 'q') return STOP;
        if (answer === 's') {
          console.log(INDENT + chalk.yellow('Skipped.'));
          return null;
        }
        const pick = /^\d+$/.test(answer) ? candidates[Number(answer) - 1] : undefined;
        if (!pick) console.log(INDENT + chalk.yellow('Invalid choice, hence skipped.'));
        return pick ?? null;
      };

      let replaced = 0, noMatch = 0, skipped = 0, notProcessed = 0;
      const writes: { file: string; content: string }[] = [];
      for (const p of parsed) {
        // Once stopped, nothing more is processed — later files only add to the not-processed count.
        if (notProcessed > 0) { notProcessed += p.occurrences.length; continue; }
        const result = await fixFile(p, tokens, choose);
        replaced += result.replaced;
        noMatch += result.noMatch;
        skipped += result.skipped;
        notProcessed += result.notProcessed;
        if (result.replaced > 0) writes.push({ file: p.file, content: result.content });
      }
      reader?.close();

      // 4. Write, then summarise
      for (const w of writes) fs.writeFileSync(w.file, w.content);

      console.log('');
      if (notProcessed > 0) console.log(chalk.yellow(`Stopped early: ${notProcessed} violation(s) not processed.`));
      console.log(`Replaced ${chalk.green(replaced)} color(s) in ${writes.length} file(s); ${chalk.red(noMatch)} without a matching token, ${chalk.yellow(skipped)} skipped.`);

      // 130 is the shell convention for a run ended by Ctrl+C.
      if (reader?.interrupted) process.exitCode = 130;
    } catch (error: any) {
      reader?.close();
      console.error(chalk.red('\nFatal Error:'), error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
