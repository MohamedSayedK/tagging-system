import { Facets } from "./api";
import { activePreset, Preset, presetRange } from "./dateRange";

// Named filter sets, kept in this browser. A date range that is one of the presets is stored as the
// preset, so "7D" saved today means the last seven days whenever it is applied.
export interface SavedFilter {
  id: string;
  name: string;
  facets: Facets;
  dedupe: boolean;
  range: { preset: Preset } | { from: string; to: string };
}

const KEY = "tagging.savedFilters";

export function loadSaved(): SavedFilter[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((s) => s && typeof s.id === "string" && typeof s.name === "string") : [];
  } catch {
    return [];
  }
}

export function storeSaved(list: SavedFilter[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage unavailable (private window, quota): the sets simply last until the page is closed
  }
}

export function makeSaved(name: string, facets: Facets, dedupe: boolean, from: string, to: string, now: Date): SavedFilter {
  const preset = activePreset(from, to, now);
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    facets,
    dedupe,
    range: preset ? { preset } : { from, to },
  };
}

export function rangeOf(s: SavedFilter, now: Date): { from: string; to: string } {
  return "preset" in s.range ? presetRange(s.range.preset, now) : s.range;
}