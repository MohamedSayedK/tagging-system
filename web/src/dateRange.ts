// Presets are UTC days counted back from `now`, end day inclusive.
export const PRESETS = ["1D", "7D", "30D", "3M", "6M", "1Y"] as const;
export type Preset = (typeof PRESETS)[number];

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function presetRange(preset: Preset, now: Date): { from: string; to: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const n = Number.parseInt(preset, 10);
  if (preset.endsWith("D")) start.setUTCDate(start.getUTCDate() - n);
  else if (preset.endsWith("M")) start.setUTCMonth(start.getUTCMonth() - n);
  else start.setUTCFullYear(start.getUTCFullYear() - n);
  return { from: ymd(start), to: ymd(now) };
}

export function activePreset(from: string, to: string, now: Date): Preset | null {
  if (!from && !to) return null;
  return PRESETS.find((p) => {
    const r = presetRange(p, now);
    return r.from === from && r.to === to;
  }) ?? null;
}
