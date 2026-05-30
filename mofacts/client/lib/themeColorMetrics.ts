export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export type ParsedThemeColor = {
  input: string;
  hex: string;
  rgb: RgbColor;
};

type LabColor = {
  l: number;
  a: number;
  b: number;
};

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHexChannel(value: number): string {
  return clampChannel(value).toString(16).padStart(2, '0').toUpperCase();
}

export function rgbToHex(color: RgbColor): string {
  return `#${toHexChannel(color.r)}${toHexChannel(color.g)}${toHexChannel(color.b)}`;
}

export function parseThemeColor(value: unknown): ParsedThemeColor {
  if (typeof value !== 'string') {
    throw new Error('Color value must be text.');
  }

  const trimmed = value.trim();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (shortHex?.[1]) {
    const [r, g, b] = shortHex[1].split('');
    if (!r || !g || !b) {
      throw new Error(`Unsupported color value: ${trimmed}`);
    }
    const hex = `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    return parseThemeColor(hex);
  }

  const hex = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (hex?.[1]) {
    const normalized = `#${hex[1].toUpperCase()}`;
    return {
      input: trimmed,
      hex: normalized,
      rgb: {
        r: parseInt(hex[1].slice(0, 2), 16),
        g: parseInt(hex[1].slice(2, 4), 16),
        b: parseInt(hex[1].slice(4, 6), 16),
      },
    };
  }

  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(trimmed);
  if (rgb?.[1] && rgb[2] && rgb[3]) {
    const channels = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    if (channels.some((channel) => channel < 0 || channel > 255)) {
      throw new Error(`RGB channels must be between 0 and 255: ${trimmed}`);
    }
    const parsed = { r: channels[0] as number, g: channels[1] as number, b: channels[2] as number };
    return { input: trimmed, hex: rgbToHex(parsed), rgb: parsed };
  }

  throw new Error(`Unsupported color value: ${trimmed}`);
}

export function parseThemeColorList(value: string): { colors: ParsedThemeColor[]; skipped: string[] } {
  const tokens = value
    .split(/[\n;]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const colors: ParsedThemeColor[] = [];
  const skipped: string[] = [];

  tokens.forEach((token) => {
    try {
      colors.push(parseThemeColor(token));
    } catch (_error) {
      skipped.push(token);
    }
  });

  return { colors, skipped };
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: RgbColor): number {
  return (
    0.2126 * srgbChannelToLinear(color.r) +
    0.7152 * srgbChannelToLinear(color.g) +
    0.0722 * srgbChannelToLinear(color.b)
  );
}

export function contrastRatio(foreground: RgbColor, background: RgbColor): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

export function mixRgb(first: RgbColor, second: RgbColor, weight: number): RgbColor {
  const bounded = Math.max(0, Math.min(1, weight));
  return {
    r: clampChannel(first.r * (1 - bounded) + second.r * bounded),
    g: clampChannel(first.g * (1 - bounded) + second.g * bounded),
    b: clampChannel(first.b * (1 - bounded) + second.b * bounded),
  };
}

export function getReadableTextColor(background: RgbColor, minimum = 4.5): RgbColor {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  const blackContrast = contrastRatio(black, background);
  const whiteContrast = contrastRatio(white, background);
  const best = blackContrast >= whiteContrast ? black : white;
  if (Math.max(blackContrast, whiteContrast) < minimum) {
    throw new Error(`Unable to find readable black or white text with contrast ${minimum}:1.`);
  }
  return best;
}

export function rgbToHsl(color: RgbColor): { h: number; s: number; l: number } {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) {
    h = (g - b) / d + (g < b ? 6 : 0);
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  return { h: h / 6, s, l };
}

function pivotRgb(value: number): number {
  return value > 0.04045 ? Math.pow((value + 0.055) / 1.055, 2.4) : value / 12.92;
}

function pivotXyz(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : (7.787 * value) + 16 / 116;
}

function rgbToLab(color: RgbColor): LabColor {
  const r = pivotRgb(color.r / 255);
  const g = pivotRgb(color.g / 255);
  const b = pivotRgb(color.b / 255);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const fx = pivotXyz(x);
  const fy = pivotXyz(y);
  const fz = pivotXyz(z);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function deltaE2000(first: RgbColor, second: RgbColor): number {
  const lab1 = rgbToLab(first);
  const lab2 = rgbToLab(second);
  const avgLp = (lab1.l + lab2.l) / 2;
  const c1 = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b);
  const c2 = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b);
  const avgC = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = (1 + g) * lab1.a;
  const a2p = (1 + g) * lab2.a;
  const c1p = Math.sqrt(a1p * a1p + lab1.b * lab1.b);
  const c2p = Math.sqrt(a2p * a2p + lab2.b * lab2.b);
  const avgCp = (c1p + c2p) / 2;
  const h1p = Math.atan2(lab1.b, a1p) >= 0 ? Math.atan2(lab1.b, a1p) : Math.atan2(lab1.b, a1p) + 2 * Math.PI;
  const h2p = Math.atan2(lab2.b, a2p) >= 0 ? Math.atan2(lab2.b, a2p) : Math.atan2(lab2.b, a2p) + 2 * Math.PI;
  const dhp = Math.abs(h1p - h2p) <= Math.PI ? h2p - h1p : h2p <= h1p ? h2p - h1p + 2 * Math.PI : h2p - h1p - 2 * Math.PI;
  const dLp = lab2.l - lab1.l;
  const dCp = c2p - c1p;
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(dhp / 2);
  const avgHp = Math.abs(h1p - h2p) > Math.PI ? (h1p + h2p + 2 * Math.PI) / 2 : (h1p + h2p) / 2;
  const t = 1 - 0.17 * Math.cos(avgHp - Math.PI / 6) + 0.24 * Math.cos(2 * avgHp) + 0.32 * Math.cos(3 * avgHp + Math.PI / 30) - 0.20 * Math.cos(4 * avgHp - 63 * Math.PI / 180);
  const deltaTheta = 30 * Math.PI / 180 * Math.exp(-Math.pow((avgHp * 180 / Math.PI - 275) / 25, 2));
  const rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const sl = 1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const sc = 1 + 0.045 * avgCp;
  const sh = 1 + 0.015 * avgCp * t;
  const rt = -Math.sin(2 * deltaTheta) * rc;
  return Math.sqrt(
    Math.pow(dLp / sl, 2) +
    Math.pow(dCp / sc, 2) +
    Math.pow(dHp / sh, 2) +
    rt * (dCp / sc) * (dHp / sh),
  );
}
