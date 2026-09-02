// Normalize a color string to a canonical form (hex or named color, lowercase).
// Supports: hex (#fff, #ffffff, #ffffffff), named (red, blue, etc.),
// rgb/rgba, and hsl/hsla formats.

export function normalizeColor(color: string): string {
  const trimmed = color.trim();

  // Hex colors: #fff, #ffffff, #ffffffff
  if (trimmed.startsWith('#')) {
    return normalizeHex(trimmed);
  }

  // RGB/RGBA: rgb(255, 0, 0) or rgb(255 0 0) or rgba(255, 0, 0, 1)
  if (trimmed.toLowerCase().startsWith('rgb')) {
    return normalizeRgb(trimmed);
  }

  // HSL/HSLA: hsl(0, 100%, 50%) or hsla(0, 100%, 50%, 1)
  if (trimmed.toLowerCase().startsWith('hsl')) {
    return normalizeHsl(trimmed);
  }

  // Named color: just lowercase it
  return trimmed.toLowerCase();
}

function normalizeHex(hex: string): string {
  let clean = hex.toLowerCase();

  if (clean.length === 4) {
    // #fff → #ffffff
    clean = '#' + clean[1] + clean[1] + clean[2] + clean[2] + clean[3] + clean[3];
  } else if (clean.length === 5) {
    // #fff0 → #ffffff00
    clean =
      '#' +
      clean[1] +
      clean[1] +
      clean[2] +
      clean[2] +
      clean[3] +
      clean[3] +
      clean[4] +
      clean[4];
  }

  return clean;
}

function normalizeRgb(rgb: string): string {
  const match = rgb.match(
    /rgba?\s*\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,\s/]\s*([\d.]+))?\s*\)/i
  );
  if (!match) return rgb; // fallback if parsing fails

  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  const hasAlpha = match[4] !== undefined;
  const alpha = hasAlpha ? parseAlpha(parseFloat(match[4])) : '';

  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}${alpha}`;
  return hex.toLowerCase();
}

function normalizeHsl(hsl: string): string {
  const match = hsl.match(
    /hsla?\s*\(\s*(\d+)\s*[,\s]\s*(\d+)%?\s*[,\s]\s*(\d+)%?\s*(?:[,\s/]\s*([\d.]+))?\s*\)/i
  );
  if (!match) return hsl; // fallback if parsing fails

  const h = parseInt(match[1], 10);
  const s = parseInt(match[2], 10);
  const l = parseInt(match[3], 10);
  const hasAlpha = match[4] !== undefined;
  const alpha = hasAlpha ? parseAlpha(parseFloat(match[4])) : '';

  const [r, g, b] = hslToRgb(h, s, l);
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}${alpha}`;
  return hex.toLowerCase();
}

function toHex(n: number): string {
  // Clamp to a valid 0–255 channel so out-of-range input (e.g. rgb(300,0,0))
  // never produces an invalid 3-char hex like "12c".
  const clamped = Math.max(0, Math.min(255, Math.round(n)));
  const hex = clamped.toString(16);
  return hex.length === 1 ? '0' + hex : hex;
}

function parseAlpha(a: number): string {
  // a is 0-1; convert to 00-ff
  const alpha = Math.round(a * 255);
  return toHex(alpha);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  // Normalize h to 0-360, s and l to 0-1
  h = h % 360;
  const s_ = s / 100;
  const l_ = l / 100;

  const c = (1 - Math.abs(2 * l_ - 1)) * s_;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l_ - c / 2;

  let r_, g_, b_;
  if (h < 60) {
    [r_, g_, b_] = [c, x, 0];
  } else if (h < 120) {
    [r_, g_, b_] = [x, c, 0];
  } else if (h < 180) {
    [r_, g_, b_] = [0, c, x];
  } else if (h < 240) {
    [r_, g_, b_] = [0, x, c];
  } else if (h < 300) {
    [r_, g_, b_] = [x, 0, c];
  } else {
    [r_, g_, b_] = [c, 0, x];
  }

  const r = Math.round((r_ + m) * 255);
  const g = Math.round((g_ + m) * 255);
  const b = Math.round((b_ + m) * 255);

  return [r, g, b];
}
