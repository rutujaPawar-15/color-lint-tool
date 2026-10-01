import fs from 'node:fs';
import postcssScss from 'postcss-scss';
import { SCAN_CONFIG } from './constants';

// Normalized color (#rrggbbaa) → token references that define it, in file order then declaration order.
export type TokenMap = Map<string, string[]>;

// Reads design-token files and indexes every `$name: <color>` / `--name: <color>` declaration
// by its normalized color. A token declared more than once keeps its last value (SCSS semantics).
// A file that cannot be read or parsed throws, unless onError is given: then it is passed the error
// and the file is skipped.
export function loadVariables(paths: string[], onError?: (err: Error) => void): TokenMap {
  const colorByRef = new Map<string, string>();

  for (const file of paths) {
    let root;
    try {
      root = postcssScss.parse(fs.readFileSync(file, 'utf8'), { from: file });
    } catch (err: any) {
      const reason = err.code === 'ENOENT' ? 'file not found' : err.reason || err.message;
      const error = new Error(`Could not load design token file ${file}: ${reason}`);
      if (!onError) throw error;
      onError(error);
      continue;
    }

    root.walkDecls((decl) => {
      const ref = decl.prop.startsWith('$') ? decl.prop
        : decl.prop.startsWith('--') ? `var(${decl.prop})`
        : null;
      if (!ref) return;

      colorByRef.delete(ref);
      const color = normalizeColor(decl.value.replace(/(\s*!\w+)+\s*$/, '').trim());
      if (color) colorByRef.set(ref, color);
    });
  }

  const tokens: TokenMap = new Map();
  for (const [ref, color] of colorByRef) {
    if (!tokens.has(color)) tokens.set(color, []);
    tokens.get(color)!.push(ref);
  }
  return tokens;
}

// Returns every token reference whose color equals `value` ([] when none does), in TokenMap
// order; the first one is the primary suggestion.
export function suggestVariable(value: string, tokens: TokenMap): string[] {
  const color = normalizeColor(value);
  return color ? [...(tokens.get(color) ?? [])] : [];
}

// Converts a color string to lowercase #rrggbbaa, or null if it is not a recognised color.
function normalizeColor(value: string): string | null {
  const { valuePatterns, namedColorHex } = SCAN_CONFIG;

  const named = namedColorHex[value.toLowerCase()];
  if (named) return normalizeColor(named);

  if (valuePatterns.hex.test(value)) {
    let hex = value.slice(1).toLowerCase();
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
    return `#${hex.length === 6 ? hex + 'ff' : hex}`;
  }

  if (valuePatterns.rgb.test(value)) {
    const [r, g, b, a] = functionArgs(value);
    return toHex(channel(r), channel(g), channel(b), alpha(a));
  }

  if (valuePatterns.hsl.test(value)) {
    const [h, s, l, a] = functionArgs(value);
    const [r, g, b] = hslToRgb(hue(h), parseFloat(s) / 100, parseFloat(l) / 100);
    return toHex(r, g, b, alpha(a));
  }

  return null;
}

// "rgba(0, 82, 204 / 0.5)" → ['0', '82', '204', '0.5']
function functionArgs(value: string): string[] {
  const inner = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'));
  return inner.split(/[\s,/]+/).filter(Boolean);
}

// rgb channel: "82" → 82, "100%" → 255
function channel(arg: string): number {
  const n = parseFloat(arg);
  return Math.round(arg.endsWith('%') ? (n / 100) * 255 : n);
}

// alpha: absent → 255, "0.5" / "50%" → 128
function alpha(arg: string | undefined): number {
  if (arg === undefined) return 255;
  const n = parseFloat(arg);
  return Math.round((arg.endsWith('%') ? n / 100 : n) * 255);
}

// hsl hue in degrees: "216", "216deg", "0.6turn", "3.77rad", "240grad"
function hue(arg: string): number {
  const n = parseFloat(arg);
  if (arg.endsWith('grad')) return n * 0.9;
  if (arg.endsWith('rad')) return (n * 180) / Math.PI;
  if (arg.endsWith('turn')) return n * 360;
  return n;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}

function toHex(...bytes: number[]): string {
  return '#' + bytes.map((b) => Math.min(255, Math.max(0, b)).toString(16).padStart(2, '0')).join('');
}
