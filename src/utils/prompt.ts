// src/utils/prompt.ts
//
// Interactive chooser used by `color-lint fix` when a hardcoded color maps to more than one
// valid token. Presents the candidates for a single occurrence and returns the chosen token,
// or null to skip. When stdin is not a TTY (e.g. CI, piped input) it cannot prompt, so it
// skips ambiguous colors rather than hanging.

import chalk from 'chalk';
import path from 'node:path';
import * as readline from 'node:readline/promises';
import { AmbiguityResolver, FixContext } from '../core/fixer';

// Builds a resolver backed by terminal prompts. `targetDir` is used to show relative paths.
export function createPromptResolver(targetDir: string): AmbiguityResolver {
  return async (ctx: FixContext): Promise<string | null> => {
    if (!process.stdin.isTTY) return null;

    const where = `${path.relative(targetDir, ctx.file)}:${ctx.line}:${ctx.column}`;
    console.log(
      chalk.yellow('\n  Ambiguous: ') +
      chalk.red.bold(ctx.value) +
      chalk.gray(`  (${ctx.property} at ${where})`),
    );
    if (ctx.lineText.trim()) {
      console.log(chalk.gray('    ' + ctx.lineText.trim()));
    }
    ctx.candidates.forEach((c, i) => {
      console.log(chalk.gray(`    ${i + 1}) `) + chalk.green(c));
    });
    console.log(chalk.gray('    s) skip'));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // In terminal mode readline captures Ctrl+C and emits 'SIGINT' here instead of killing
    // the process. Abort the whole run cleanly (exit code 130 = terminated by Ctrl+C).
    // Files already written stay written — git is the undo net.
    rl.on('SIGINT', () => {
      rl.close();
      console.log(chalk.yellow('\n\nAborted by user. No further files were changed.\n'));
      process.exit(130);
    });
    try {
      const answer = (await rl.question(chalk.cyan(`  Choose [1-${ctx.candidates.length}/s]: `))).trim().toLowerCase();
      if (answer === 's' || answer === '') return null;
      const idx = Number.parseInt(answer, 10);
      if (Number.isInteger(idx) && idx >= 1 && idx <= ctx.candidates.length) {
        return ctx.candidates[idx - 1];
      }
      console.log(chalk.gray('  Not a valid choice — skipping.'));
      return null;
    } finally {
      rl.close();
    }
  };
}
