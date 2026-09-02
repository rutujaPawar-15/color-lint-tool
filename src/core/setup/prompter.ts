import * as readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import { SetupCancelledError, type Prompter } from './setup';

// The real Prompter: drives an interactive terminal session.
//
// It buffers input lines via readline's 'line' event into a queue, rather than
// using readline/promises' question(), because that eagerly consumes and closes
// piped stdin before the first prompt is even reached. The queue model works
// identically for an interactive TTY, piped input (automation/CI), and EOF.
//
// This is the thin, untestable I/O boundary — all decision logic lives in
// runSetup, which is exercised against a fake Prompter in the unit tests.
export class ReadlinePrompter implements Prompter {
  private rl = readline.createInterface({ input: stdin });
  private queue: string[] = [];
  private waiting: ((line: string | null) => void) | null = null;
  private closed = false;

  constructor() {
    this.rl.on('line', line => {
      if (this.waiting) {
        const resolve = this.waiting;
        this.waiting = null;
        resolve(line);
      } else {
        this.queue.push(line);
      }
    });
    this.rl.on('close', () => {
      this.closed = true;
      if (this.waiting) {
        const resolve = this.waiting;
        this.waiting = null;
        resolve(null); // signal EOF to any pending read
      }
    });
  }

  // Resolves with the next input line, or null if input has ended (EOF).
  private nextLine(): Promise<string | null> {
    if (this.queue.length > 0) return Promise.resolve(this.queue.shift()!);
    if (this.closed) return Promise.resolve(null);
    return new Promise(resolve => {
      this.waiting = resolve;
    });
  }

  async select(question: string, choices: string[]): Promise<string> {
    console.log(chalk.cyan(question));
    choices.forEach((choice, i) => console.log(chalk.white(`  ${i + 1}) ${choice}`)));

    // Loop until a valid choice number is entered; EOF cancels setup.
    for (;;) {
      stdout.write(chalk.gray('Enter a number: '));
      const raw = await this.nextLine();
      if (raw === null) throw new SetupCancelledError();
      const idx = Number.parseInt(raw.trim(), 10) - 1;
      if (Number.isInteger(idx) && idx >= 0 && idx < choices.length) {
        return choices[idx];
      }
      console.log(chalk.yellow(`Please enter a number between 1 and ${choices.length}.`));
    }
  }

  async confirm(question: string, defaultYes: boolean): Promise<boolean> {
    const hint = defaultYes ? '(Y/n)' : '(y/N)';
    stdout.write(chalk.cyan(`${question} ${hint} `));
    const raw = await this.nextLine();
    if (raw === null) throw new SetupCancelledError(); // EOF cancels
    const answer = raw.trim().toLowerCase();
    if (answer === '') return defaultYes;
    return answer === 'y' || answer === 'yes';
  }

  async close(): Promise<void> {
    this.rl.close();
  }
}
