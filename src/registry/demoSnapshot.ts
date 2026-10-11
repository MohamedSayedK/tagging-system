import type { RunRecord } from "../ingest/scheduler.js";
import { countryOf, isAggregator, type Overrides } from "./overrides.js";
import type { PromotedSource, PromotionStatus } from "./promote.js";
import type { SourceRecord } from "./registry.js";

const MINUTE = 60_000;
const PROMOTED_INTERVAL_MS = 30 * MINUTE; // as the worker crawls promoted sources

// These mirror `DemoRegistryRecord` and `DemoSource` in web/src/demo/api.ts, which reads this file's output.
// They are repeated here so the server build does not depend on the web sources.
export interface DemoRegistryRecord {
  domain: string;
  articleCount: number;
  languages: string[];
  country?: string;
  aggregator?: boolean;
  crawl?: PromotionStatus;
  lastSeenAgoMs: number;
}

export interface DemoSource {
  name: string;
  origin: "registry";
  domain: string;
  sourcetype: string;
  country?: string;
  lang?: string;
  feedCount: number;
  intervalMs: number;
  status: "ok" | "failing" | "pending";
  found?: number;
  indexed?: number;
  consecutiveFailures?: number;
  error?: string;
  lastRunAgoMs?: number;
  nextInMs?: number;
  durationMs?: number;
}

export interface RegistrySnapshot {
  generatedAt: string;
  registry: DemoRegistryRecord[];
  sources: DemoSource[];
}

/**
 * The static demo's view of the registry: every known domain with the facts the Registry tab shows, and the
 * promoted sources with how their latest crawl went. Times are relative to `now` so the demo can re-anchor them.
 */
export function buildRegistrySnapshot(input: {
  records: SourceRecord[];
  attempts: Map<string, { status: PromotionStatus; checkedAt: string }>;
  overrides: Overrides;
  promoted: PromotedSource[];
  runs: Map<string, RunRecord>;
  now: Date;
}): RegistrySnapshot {
  const at = input.now.getTime();

  const registry = input.records.map((r): DemoRegistryRecord => {
    const country = countryOf(r.domain, input.overrides, r.country);
    const crawl = input.attempts.get(r.domain)?.status;
    return {
      domain: r.domain,
      articleCount: r.articleCount,
      languages: r.languages,
      ...(country && { country }),
      aggregator: isAggregator(r.domain, input.overrides),
      ...(crawl && { crawl }),
      lastSeenAgoMs: Math.max(MINUTE, at - Date.parse(r.lastSeen)),
    };
  });

  const sources = input.promoted.map((p): DemoSource => {
    const base = {
      name: p.name,
      origin: "registry" as const,
      domain: p.domain,
      sourcetype: p.sourcetype,
      country: p.country,
      lang: p.lang,
      feedCount: p.feeds.length,
      intervalMs: PROMOTED_INTERVAL_MS,
    };
    const run = input.runs.get(p.name);
    if (!run) return { ...base, status: "pending" };
    return {
      ...base,
      status: run.consecutiveFailures > 0 ? "failing" : "ok",
      found: run.found,
      indexed: run.indexed,
      consecutiveFailures: run.consecutiveFailures,
      error: run.error,
      durationMs: run.durationMs,
      lastRunAgoMs: Math.max(MINUTE, at - Date.parse(run.lastRun)),
      nextInMs: Math.max(MINUTE, Date.parse(run.nextRun) - at),
    };
  });

  return { generatedAt: input.now.toISOString(), registry, sources };
}
