import { describe, it, expect } from 'vitest';
import { applyFixes, FixContext } from '../../src/core/fixer';
import { TokenMap } from '../../src/core/token-map';

function mapFrom(content: string): TokenMap {
  const map = new TokenMap();
  map.ingest(content);
  return map;
}

// A resolver that always skips ambiguous colors.
const skipAll = () => null;

describe('applyFixes', () => {
  it('auto-applies a single SCSS token match', async () => {
    const map = mapFrom('$brand: #ff0000;');
    const out = await applyFixes('.a { color: #ff0000; }', '.scss', map, skipAll);
    expect(out.text).toContain('color: $brand;');
    expect(out.applied).toHaveLength(1);
    expect(out.applied[0]).toMatchObject({ from: '#ff0000', to: '$brand' });
  });

  it('applies a var(--x) token in a .css file', async () => {
    const map = mapFrom(':root { --brand: #ff0000; }');
    const out = await applyFixes('.a { color: #ff0000; }', '.css', map, skipAll);
    expect(out.text).toContain('color: var(--brand);');
    expect(out.applied).toHaveLength(1);
  });

  it('filters out $scss candidates in a .css file (invalid form)', async () => {
    const map = mapFrom('$brand: #ff0000;');
    const out = await applyFixes('.a { color: #ff0000; }', '.css', map, skipAll);
    expect(out.text).toContain('color: #ff0000;'); // unchanged
    expect(out.applied).toHaveLength(0);
    expect(out.unresolved).toEqual([
      expect.objectContaining({ value: '#ff0000', reason: 'no-valid-form' }),
    ]);
  });

  it('allows both $ and var() forms in a .scss file', async () => {
    const map = mapFrom('$brand: #ff0000;\n:root { --brand: #ff0000; }');
    const captured: FixContext[] = [];
    const chooseVar = (ctx: FixContext) => {
      captured.push(ctx);
      return ctx.candidates.find((c) => c.startsWith('var(')) ?? null;
    };
    const out = await applyFixes('.a { color: #ff0000; }', '.scss', map, chooseVar);
    expect(captured[0].candidates).toEqual(['$brand', 'var(--brand)']);
    expect(out.text).toContain('color: var(--brand);');
  });

  it('routes ambiguous colors through the resolver and honors its choice', async () => {
    const map = mapFrom('$a: #fff;\n$b: #ffffff;');
    const out = await applyFixes('.a { color: #fff; }', '.scss', map, () => '$b');
    expect(out.text).toContain('color: $b;');
    expect(out.applied[0]).toMatchObject({ from: '#fff', to: '$b' });
  });

  it('leaves ambiguous colors unchanged when the resolver skips', async () => {
    const map = mapFrom('$a: #fff;\n$b: #ffffff;');
    const out = await applyFixes('.a { color: #fff; }', '.scss', map, skipAll);
    expect(out.text).toContain('color: #fff;');
    expect(out.applied).toHaveLength(0);
    expect(out.unresolved).toEqual([
      expect.objectContaining({ value: '#fff', reason: 'ambiguous' }),
    ]);
  });

  it('replaces only the color span within a larger value', async () => {
    const map = mapFrom('$brand: #ff0000;');
    const out = await applyFixes('.a { border: 1px solid #ff0000; }', '.scss', map, skipAll);
    expect(out.text).toContain('border: 1px solid $brand;');
  });

  it('replaces every color in a multi-color value', async () => {
    const map = mapFrom('$white: #fff;\n$black: #000;');
    const out = await applyFixes(
      '.a { background: linear-gradient(#fff, #000); }',
      '.scss',
      map,
      skipAll,
    );
    expect(out.text).toContain('linear-gradient($white, $black)');
    expect(out.applied).toHaveLength(2);
  });

  it('does not touch a named color that is part of an identifier', async () => {
    const map = mapFrom('$blue: #0000ff;');
    const out = await applyFixes('.a { color: $primary-blue; }', '.scss', map, skipAll);
    expect(out.text).toContain('color: $primary-blue;');
    expect(out.applied).toHaveLength(0);
  });

  it('ignores colors that have no matching token', async () => {
    const map = mapFrom('$brand: #ff0000;');
    const out = await applyFixes('.a { color: #123456; }', '.scss', map, skipAll);
    expect(out.text).toContain('color: #123456;');
    expect(out.applied).toHaveLength(0);
    expect(out.unresolved).toHaveLength(0);
  });

  it('reports a distinct column for each color in a multi-color value', async () => {
    const map = mapFrom('$white: #fff;\n$black: #000;');
    const out = await applyFixes(
      '.a { background: linear-gradient(#fff, #000); }',
      '.scss',
      map,
      skipAll,
    );
    expect(out.applied).toHaveLength(2);
    const [first, second] = out.applied;
    expect(second.column).toBeGreaterThan(first.column);
  });

  it('passes the source line and per-occurrence context to the resolver', async () => {
    const map = mapFrom('$a: #fff;\n$b: #ffffff;');
    const seen: FixContext[] = [];
    await applyFixes('.a { color: #fff; }', '.scss', map, (ctx) => {
      seen.push(ctx);
      return null;
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].lineText).toContain('color: #fff;');
    expect(seen[0].column).toBeGreaterThan(0);
  });

  it('leaves the file untouched (no throw) when the source cannot be parsed', async () => {
    const map = mapFrom('$brand: #ff0000;');
    const broken = '.a { color: #ff0000; ' + '}'.repeat(0) + '@@@ !! {{{';
    await expect(applyFixes(broken, '.scss', map, skipAll)).resolves.toBeDefined();
  });

  it('is idempotent — a second pass changes nothing', async () => {
    const map = mapFrom('$brand: #ff0000;');
    const first = await applyFixes('.a { color: #ff0000; }', '.scss', map, skipAll);
    const second = await applyFixes(first.text, '.scss', map, skipAll);
    expect(second.text).toBe(first.text);
    expect(second.applied).toHaveLength(0);
  });
});
