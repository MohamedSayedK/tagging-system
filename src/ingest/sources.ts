import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { parseDuration } from "./scheduler.js";

export interface FeedRef { url: string; kind: "rss" | "sitemap" }
export interface Source {
  name: string;
  domain: string;
  sourcetype: string; // e.g. ONLINENEWS_NEWSPAPER, ONLINENEWS_MAGAZINE, BLOG
  country?: string;
  lang?: string;
  feeds: FeedRef[];
  /** How often the worker re-reads this source, ms (yaml: `interval: 15m`, default 15m). */
  interval: number;
  /** Newest items of a feed read per run (sitemaps can list thousands). Default 100. */
  maxItems: number;
  /** Items published longer ago than this are skipped: the stream is about now, not evergreen feed entries. Default 90. */
  maxAgeDays: number;
}

export const DEFAULT_INTERVAL = "15m";
export const DEFAULT_MAX_ITEMS = 100;
export const DEFAULT_MAX_AGE_DAYS = 90;

export function loadSources(path = process.env.SOURCES_FILE ?? "sources.yaml"): Source[] {
  const doc = parse(readFileSync(path, "utf8")) as { sources?: (Omit<Source, "interval" | "maxItems" | "maxAgeDays"> & { interval?: string; maxItems?: number; maxAgeDays?: number })[] };
  if (!doc?.sources?.length) throw new Error(`No sources in ${path}`);
  const seen = new Set<string>();
  return doc.sources.map((s) => {
    if (!s.name || !s.domain || !s.sourcetype || !s.feeds?.length) {
      throw new Error(`Source needs name, domain, sourcetype, feeds: ${JSON.stringify(s)}`);
    }
    if (seen.has(s.name)) throw new Error(`Duplicate source name "${s.name}"`);
    seen.add(s.name);
    const maxItems = s.maxItems ?? DEFAULT_MAX_ITEMS;
    if (!Number.isInteger(maxItems) || maxItems < 1) throw new Error(`Source "${s.name}": maxItems must be a positive whole number`);
    try {
      const maxAgeDays = s.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
      if (!(maxAgeDays > 0)) throw new Error(`Source "${s.name}": maxAgeDays must be a positive number`);
      return { ...s, maxItems, maxAgeDays, interval: parseDuration(String(s.interval ?? DEFAULT_INTERVAL)) };
    } catch (e) {
      throw new Error(`Source "${s.name}": interval: ${(e as Error).message}`);
    }
  });
}

