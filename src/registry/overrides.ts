import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { countryFromDomain } from "./country.js";

export interface Overrides {
  /** Domain -> ISO 3166 alpha-2, for outlets whose suffix says nothing (`.com`, `.net`). */
  country: Map<string, string>;
  /** Extra aggregators, on top of the built-in list. */
  aggregators: Set<string>;
  /** Domains the built-in list gets wrong. */
  notAggregators: Set<string>;
  /** Domains that are crawled even though the region rule would leave them out. */
  include: Set<string>;
  /** Domains that are never promoted or crawled; wins over `include`. */
  blocked: Set<string>;
}

// Sites that republish or link other outlets' stories rather than report their own. Not exhaustive; the owner
// extends it in registry-overrides.yaml.
const BUILT_IN_AGGREGATORS = [
  "news.google.com", "news.yahoo.com", "msn.com", "flipboard.com", "smartnews.com", "newsbreak.com",
  "dailyhunt.in", "ground.news", "feedly.com", "newsnow.co.uk", "zazoom.it", "drimble.nl", "naslovi.net",
  "haberler.com", "baomoi.com", "akhbarak.net",
];

const bare = (d: string) => d.trim().toLowerCase().replace(/^www\./, "");

export function parseOverrides(text: string): Overrides {
  const doc = (parse(text) ?? {}) as { country?: Record<string, unknown>; aggregators?: string[]; notAggregators?: string[]; include?: string[]; blocked?: string[] };
  const country = new Map<string, string>();
  for (const [domain, code] of Object.entries(doc.country ?? {})) {
    if (typeof code !== "string" || !/^[A-Za-z]{2}$/.test(code)) {
      throw new Error(`Country override for ${domain} must be a two-letter code, got ${JSON.stringify(code)}`);
    }
    country.set(bare(domain), code.toUpperCase());
  }
  return {
    country,
    aggregators: new Set((doc.aggregators ?? []).map(bare)),
    notAggregators: new Set((doc.notAggregators ?? []).map(bare)),
    include: new Set((doc.include ?? []).map(bare)),
    blocked: new Set((doc.blocked ?? []).map(bare)),
  };
}

/** Reads registry-overrides.yaml; a missing file means no overrides. */
export function loadOverrides(path = process.env.REGISTRY_OVERRIDES_FILE ?? "registry-overrides.yaml"): Overrides {
  return existsSync(path) ? parseOverrides(readFileSync(path, "utf8")) : parseOverrides("");
}

/**
 * Where an outlet is based: the owner's override, else what a directory recorded (`known`, e.g. from
 * Wikidata), else what the domain suffix says, else unknown.
 */
export function countryOf(domain: string, overrides: Overrides, known?: string): string | undefined {
  return overrides.country.get(bare(domain)) ?? known ?? countryFromDomain(bare(domain));
}

/** Every domain currently treated as an aggregator, for filtering a list by exact match. */
export function aggregatorDomains(overrides: Overrides): string[] {
  return [...new Set([...BUILT_IN_AGGREGATORS, ...overrides.aggregators])].filter((d) => !overrides.notAggregators.has(d));
}

/** Is this domain (or its parent) a known aggregator? */
export function isAggregator(domain: string, overrides: Overrides): boolean {
  const labels = bare(domain).split(".");
  const suffixes = labels.map((_, i) => labels.slice(i).join("."));
  if (suffixes.some((s) => overrides.notAggregators.has(s))) return false;
  return suffixes.some((s) => overrides.aggregators.has(s) || BUILT_IN_AGGREGATORS.includes(s));
}
