// src/core/color-normalize.ts
//
// Reduces the many ways a single color can be written (hex, rgb/rgba, hsl/hsla,
// CSS named colors) to one canonical key, so that #fff, #ffffff, white and
// rgb(255,255,255) all compare equal. The key is `r,g,b,a` with every channel an
// integer 0-255 (alpha included), which lets hex alpha (0x80) and rgba alpha (0.5)
// line up on the same scale.

// The full set of CSS named colors, mapped to [r, g, b]. `transparent` is special
// (fully transparent black) and handled below.
const NAMED_COLORS: Record<string, [number, number, number]> = {
  aliceblue: [240, 248, 255], antiquewhite: [250, 235, 215], aqua: [0, 255, 255],
  aquamarine: [127, 255, 212], azure: [240, 255, 255], beige: [245, 245, 220],
  bisque: [255, 228, 196], black: [0, 0, 0], blanchedalmond: [255, 235, 205],
  blue: [0, 0, 255], blueviolet: [138, 43, 226], brown: [165, 42, 42],
  burlywood: [222, 184, 135], cadetblue: [95, 158, 160], chartreuse: [127, 255, 0],
  chocolate: [210, 105, 30], coral: [255, 127, 80], cornflowerblue: [100, 149, 237],
  cornsilk: [255, 248, 220], crimson: [220, 20, 60], cyan: [0, 255, 255],
  darkblue: [0, 0, 139], darkcyan: [0, 139, 139], darkgoldenrod: [184, 134, 11],
  darkgray: [169, 169, 169], darkgreen: [0, 100, 0], darkgrey: [169, 169, 169],
  darkkhaki: [189, 183, 107], darkmagenta: [139, 0, 139], darkolivegreen: [85, 107, 47],
  darkorange: [255, 140, 0], darkorchid: [153, 50, 204], darkred: [139, 0, 0],
  darksalmon: [233, 150, 122], darkseagreen: [143, 188, 143], darkslateblue: [72, 61, 139],
  darkslategray: [47, 79, 79], darkslategrey: [47, 79, 79], darkturquoise: [0, 206, 209],
  darkviolet: [148, 0, 211], deeppink: [255, 20, 147], deepskyblue: [0, 191, 255],
  dimgray: [105, 105, 105], dimgrey: [105, 105, 105], dodgerblue: [30, 144, 255],
  firebrick: [178, 34, 34], floralwhite: [255, 250, 240], forestgreen: [34, 139, 34],
  fuchsia: [255, 0, 255], gainsboro: [220, 220, 220], ghostwhite: [248, 248, 255],
  gold: [255, 215, 0], goldenrod: [218, 165, 32], gray: [128, 128, 128],
  green: [0, 128, 0], greenyellow: [173, 255, 47], grey: [128, 128, 128],
  honeydew: [240, 255, 240], hotpink: [255, 105, 180], indianred: [205, 92, 92],
  indigo: [75, 0, 130], ivory: [255, 255, 240], khaki: [240, 230, 140],
  lavender: [230, 230, 250], lavenderblush: [255, 240, 245], lawngreen: [124, 252, 0],
  lemonchiffon: [255, 250, 205], lightblue: [173, 216, 230], lightcoral: [240, 128, 128],
  lightcyan: [224, 255, 255], lightgoldenrodyellow: [250, 250, 210], lightgray: [211, 211, 211],
  lightgreen: [144, 238, 144], lightgrey: [211, 211, 211], lightpink: [255, 182, 193],
  lightsalmon: [255, 160, 122], lightseagreen: [32, 178, 170], lightskyblue: [135, 206, 250],
  lightslategray: [119, 136, 153], lightslategrey: [119, 136, 153], lightsteelblue: [176, 196, 222],
  lightyellow: [255, 255, 224], lime: [0, 255, 0], limegreen: [50, 205, 50],
  linen: [250, 240, 230], magenta: [255, 0, 255], maroon: [128, 0, 0],
  mediumaquamarine: [102, 205, 170], mediumblue: [0, 0, 205], mediumorchid: [186, 85, 211],
  mediumpurple: [147, 112, 219], mediumseagreen: [60, 179, 113], mediumslateblue: [123, 104, 238],
  mediumspringgreen: [0, 250, 154], mediumturquoise: [72, 209, 204], mediumvioletred: [199, 21, 133],
  midnightblue: [25, 25, 112], mintcream: [245, 255, 250], mistyrose: [255, 228, 225],
  moccasin: [255, 228, 181], navajowhite: [255, 222, 173], navy: [0, 0, 128],
  oldlace: [253, 245, 230], olive: [128, 128, 0], olivedrab: [107, 142, 35],
  orange: [255, 165, 0], orangered: [255, 69, 0], orchid: [218, 112, 214],
  palegoldenrod: [238, 232, 170], palegreen: [152, 251, 152], paleturquoise: [175, 238, 238],
  palevioletred: [219, 112, 147], papayawhip: [255, 239, 213], peachpuff: [255, 218, 185],
  peru: [205, 133, 63], pink: [255, 192, 203], plum: [221, 160, 221],
  powderblue: [176, 224, 230], purple: [128, 0, 128], rebeccapurple: [102, 51, 153],
  red: [255, 0, 0], rosybrown: [188, 143, 143], royalblue: [65, 105, 225],
  saddlebrown: [139, 69, 19], salmon: [250, 128, 114], sandybrown: [244, 164, 96],
  seagreen: [46, 139, 87], seashell: [255, 245, 238], sienna: [160, 82, 45],
  silver: [192, 192, 192], skyblue: [135, 206, 235], slateblue: [106, 90, 205],
  slategray: [112, 128, 144], slategrey: [112, 128, 144], snow: [255, 250, 250],
  springgreen: [0, 255, 127], steelblue: [70, 130, 180], tan: [210, 180, 140],
  teal: [0, 128, 128], thistle: [216, 191, 216], tomato: [255, 99, 71],
  turquoise: [64, 224, 208], violet: [238, 130, 238], wheat: [245, 222, 179],
  white: [255, 255, 255], whitesmoke: [245, 245, 245], yellow: [255, 255, 0],
  yellowgreen: [154, 205, 50],
};

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

// Builds the canonical key from red/green/blue (0-255) and alpha (0-1).
function key(r: number, g: number, b: number, a: number): string {
  return `${clamp255(r)},${clamp255(g)},${clamp255(b)},${clamp255(a * 255)}`;
}

// Parses a channel token that may be a plain number (0-255) or a percentage.
function channel(token: string): number {
  const t = token.trim();
  if (t.endsWith('%')) return (parseFloat(t) / 100) * 255;
  return parseFloat(t);
}

// Parses an alpha token that may be a fraction (0-1) or a percentage.
function alpha(token: string | undefined): number {
  if (token === undefined) return 1;
  const t = token.trim();
  if (t.endsWith('%')) return parseFloat(t) / 100;
  return parseFloat(t);
}

// Pulls the numeric arguments out of a functional color like rgb(...)/hsl(...),
// splitting on commas, slashes, and whitespace while keeping % and unit suffixes.
function args(inner: string): string[] {
  return inner
    .split(/[\s,/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function hexToKey(hex: string): string | null {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) {
    h = h.split('').map((c) => c + c).join('');
  }
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return key(r, g, b, a);
}

// Converts an HSL triple (h in degrees, s/l as 0-1) to [r, g, b] 0-255.
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

// Parses an angle token (default deg) to degrees, honoring rad/grad/turn units.
function angle(token: string): number {
  const t = token.trim().toLowerCase();
  const value = parseFloat(t);
  if (t.endsWith('turn')) return value * 360;
  if (t.endsWith('grad')) return value * 0.9;
  if (t.endsWith('rad')) return (value * 180) / Math.PI;
  return value; // deg or unitless
}

/**
 * Normalizes any single color literal to a canonical `r,g,b,a` key (all channels
 * 0-255). Returns null for values that are not resolvable color literals
 * (currentColor, var(...), $vars, keywords like inherit, empty strings).
 */
export function normalizeColor(input: string): string | null {
  if (!input) return null;
  const value = input.trim();
  if (!value) return null;
  const lower = value.toLowerCase();

  // Named colors
  if (lower === 'transparent') return key(0, 0, 0, 0);
  if (NAMED_COLORS[lower]) {
    const [r, g, b] = NAMED_COLORS[lower];
    return key(r, g, b, 1);
  }

  // Hex
  if (value.startsWith('#')) return hexToKey(value);

  // rgb() / rgba()
  const rgbMatch = lower.match(/^rgba?\(([^)]*)\)$/);
  if (rgbMatch) {
    const parts = args(rgbMatch[1]);
    if (parts.length < 3) return null;
    const r = channel(parts[0]);
    const g = channel(parts[1]);
    const b = channel(parts[2]);
    const a = alpha(parts[3]);
    if ([r, g, b, a].some((n) => Number.isNaN(n))) return null;
    return key(r, g, b, a);
  }

  // hsl() / hsla()
  const hslMatch = lower.match(/^hsla?\(([^)]*)\)$/);
  if (hslMatch) {
    const parts = args(hslMatch[1]);
    if (parts.length < 3) return null;
    const h = angle(parts[0]);
    const s = parseFloat(parts[1]) / 100;
    const l = parseFloat(parts[2]) / 100;
    const a = alpha(parts[3]);
    if ([h, s, l, a].some((n) => Number.isNaN(n))) return null;
    const [r, g, b] = hslToRgb(h, s, l);
    return key(r, g, b, a);
  }

  return null;
}
