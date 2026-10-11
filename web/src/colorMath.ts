export interface Hsv { h: number; s: number; v: number } // h 0-360, s and v 0-1

/** "#9980FA", "9980fa" or "#abc" -> "#9980fa" / "#aabbcc"; null when it is not a hex colour. */
export function normalizeHex(input: string): string | null {
  const t = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(t)) return "#" + [...t].map((c) => c + c).join("");
  if (/^[0-9a-f]{6}$/.test(t)) return "#" + t;
  return null;
}

export function hexToHsv(hex: string): Hsv {
  const n = normalizeHex(hex) ?? "#000000";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] = ([[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector] ?? [0, 0, 0]) as [number, number, number];
  return "#" + [r, g, b].map((k) => Math.round((k + m) * 255).toString(16).padStart(2, "0")).join("");
}