import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runSetup, SKIP_CONFLICT, type Prompter } from '../../src/core/setup/setup';

const tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

function readConfig(dir: string): any {
  return JSON.parse(fs.readFileSync(path.join(dir, '.color-lint-config.json'), 'utf-8'));
}

// A scripted prompter: select answers and confirm answers are consumed in order.
// Records the questions/choices it was asked so tests can assert on the flow.
class FakePrompter implements Prompter {
  selectCalls: { question: string; choices: string[] }[] = [];
  confirmCalls: string[] = [];
  constructor(
    private selectAnswers: string[] = [],
    private confirmAnswers: boolean[] = []
  ) {}
  async select(question: string, choices: string[]): Promise<string> {
    this.selectCalls.push({ question, choices });
    if (this.selectAnswers.length === 0) throw new Error(`Unexpected select: ${question}`);
    const answer = this.selectAnswers.shift()!;
    // A real prompter always returns one of the offered choices. Allow tests to
    // script an exact choice OR a recognizable fragment (e.g. a file's basename),
    // resolving it to the actual choice so paths needn't be spelled out verbatim.
    if (choices.includes(answer)) return answer;
    const match = choices.find(c => c.endsWith(answer) || c.includes(answer));
    if (!match) throw new Error(`Scripted answer "${answer}" not among choices: ${choices}`);
    return match;
  }
  async confirm(question: string): Promise<boolean> {
    this.confirmCalls.push(question);
    if (this.confirmAnswers.length === 0) throw new Error(`Unexpected confirm: ${question}`);
    return this.confirmAnswers.shift()!;
  }
  async close(): Promise<void> {}
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('runSetup', () => {
  it('generates a config by reversing a single variable file (no prompts needed)', async () => {
    const dir = makeTmpDir('setup-single-');
    writeFile(dir, 'src/_variables.scss', '$color-red: #ff0000;\n$color-blue: #0000ff;');

    const prompter = new FakePrompter();
    const result = await runSetup(dir, prompter);

    expect(result.status).toBe('created');
    expect(readConfig(dir).colorMap).toEqual({
      '#ff0000': '$color-red',
      '#0000ff': '$color-blue',
    });
    // Only one variable file and no conflicts -> no questions asked.
    expect(prompter.selectCalls).toHaveLength(0);
  });

  it('records the chosen file as sourceOfTruth (relative, forward slashes)', async () => {
    const dir = makeTmpDir('setup-sot-');
    writeFile(dir, 'src/styles/_variables.scss', '$color-red: #ff0000;');

    await runSetup(dir, new FakePrompter());

    expect(readConfig(dir).sourceOfTruth).toEqual(['src/styles/_variables.scss']);
  });

  it('prompts the developer to choose when multiple variable files exist', async () => {
    const dir = makeTmpDir('setup-multi-');
    writeFile(dir, 'a.scss', '$color-red: #ff0000;');
    writeFile(dir, 'b.scss', '$color-blue: #0000ff;\n$color-green: #00ff00;');

    // b.scss ranks first (2 vars); we deliberately pick a.scss to prove the choice is honored.
    const prompter = new FakePrompter(['a.scss']);
    const result = await runSetup(dir, prompter);

    expect(result.status).toBe('created');
    expect(prompter.selectCalls).toHaveLength(1);
    expect(readConfig(dir).colorMap).toEqual({ '#ff0000': '$color-red' });
  });

  it('asks the developer to resolve a conflicting color and uses the winner', async () => {
    const dir = makeTmpDir('setup-conflict-');
    writeFile(dir, 'vars.scss', '$color-red: #ff0000;\n$color-danger: #ff0000;');

    const prompter = new FakePrompter(['$color-danger']); // resolve the #ff0000 conflict
    const result = await runSetup(dir, prompter);

    expect(result.status).toBe('created');
    expect(readConfig(dir).colorMap).toEqual({ '#ff0000': '$color-danger' });
    expect(prompter.selectCalls[0].choices).toContain('$color-red');
    expect(prompter.selectCalls[0].choices).toContain('$color-danger');
    expect(prompter.selectCalls[0].choices).toContain(SKIP_CONFLICT);
  });

  it('omits a conflicting color when the developer chooses to skip it', async () => {
    const dir = makeTmpDir('setup-skip-');
    writeFile(dir, 'vars.scss', '$color-red: #ff0000;\n$color-danger: #ff0000;\n$color-blue: #0000ff;');

    const prompter = new FakePrompter([SKIP_CONFLICT]);
    const result = await runSetup(dir, prompter);

    expect(result.status).toBe('created');
    // Conflicting #ff0000 dropped; unambiguous #0000ff kept.
    expect(readConfig(dir).colorMap).toEqual({ '#0000ff': '$color-blue' });
    expect(result.skippedConflicts).toBe(1);
  });

  it('reports no-variables-found and writes nothing when no color variables exist', async () => {
    const dir = makeTmpDir('setup-none-');
    writeFile(dir, 'app.scss', '.box { color: #ff0000; }'); // usage only, no definitions

    const result = await runSetup(dir, new FakePrompter());

    expect(result.status).toBe('no-variables-found');
    expect(fs.existsSync(path.join(dir, '.color-lint-config.json'))).toBe(false);
  });

  it('aborts without overwriting when a config exists and the developer declines', async () => {
    const dir = makeTmpDir('setup-abort-');
    writeFile(dir, 'vars.scss', '$color-red: #ff0000;');
    writeFile(dir, '.color-lint-config.json', '{"colorMap":{"#existing":"$keep"}}');

    const prompter = new FakePrompter([], [false]); // decline overwrite
    const result = await runSetup(dir, prompter);

    expect(result.status).toBe('aborted');
    expect(prompter.confirmCalls).toHaveLength(1);
    // Original config untouched.
    expect(readConfig(dir).colorMap).toEqual({ '#existing': '$keep' });
  });

  it('overwrites an existing config when the developer confirms', async () => {
    const dir = makeTmpDir('setup-overwrite-');
    writeFile(dir, 'vars.scss', '$color-red: #ff0000;');
    writeFile(dir, '.color-lint-config.json', '{"colorMap":{"#existing":"$keep"}}');

    const prompter = new FakePrompter([], [true]); // confirm overwrite
    const result = await runSetup(dir, prompter);

    expect(result.status).toBe('created');
    expect(readConfig(dir).colorMap).toEqual({ '#ff0000': '$color-red' });
  });
});
