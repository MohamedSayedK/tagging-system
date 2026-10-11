import { toIso3 } from "./language.js";
import type { SourceRecord } from "./registry.js";

/** The Arab League states and the neighbours the monitoring covers (Turkey, Iran, Israel, Cyprus). */
export const MENA_COUNTRIES = [
  "DZ", "BH", "KM", "DJ", "EG", "IQ", "JO", "KW", "LB", "LY", "MR", "MA", "OM", "PS", "QA", "SA", "SO", "SD",
  "SY", "TN", "AE", "YE", "TR", "IR", "IL", "CY",
];

/**
 * SPARQL for newspapers, online newspapers and news agencies that have an official website and a country in the
 * region, with the language they publish in when Wikidata knows it.
 */
export function outletQuery(): string {
  const countries = MENA_COUNTRIES.map((c) => `"${c}"`).join(" ");
  return `SELECT DISTINCT ?site ?country ?lang WHERE {
  VALUES ?type { wd:Q11032 wd:Q1153191 wd:Q192283 }
  ?item wdt:P31/wdt:P279* ?type .
  ?item wdt:P856 ?site .
  ?item wdt:P17 ?c .
  ?c wdt:P297 ?country .
  VALUES ?country { ${countries} }
  OPTIONAL { ?item wdt:P407 ?l . ?l wdt:P218 ?lang . }
}`;
}

export interface Outlet {
  domain: string;
  country: string;
  /** Two-letter language codes, in the order Wikidata gave them. */
  languages: string[];
}

// Official "websites" that are really social pages or reference sites; they are not outlets' own domains.
const NOT_OUTLET_SITES = ["facebook.com", "twitter.com", "x.com", "instagram.com", "youtube.com", "t.me", "linkedin.com", "tiktok.com", "wikipedia.org"];

interface SparqlAnswer {
  results?: { bindings?: Record<string, { value?: string } | undefined>[] };
}

/** Outlets from a Wikidata SPARQL JSON answer, one per domain, languages merged. */
export function parseOutlets(answer: SparqlAnswer): Outlet[] {
  const byDomain = new Map<string, Outlet>();
  for (const row of answer.results?.bindings ?? []) {
    const site = row.site?.value;
    const country = row.country?.value?.toUpperCase();
    if (!site || !country) continue;
    let domain: string;
    try {
      domain = new URL(site).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      continue;
    }
    if (!domain.includes(".") || NOT_OUTLET_SITES.some((s) => domain === s || domain.endsWith(`.${s}`))) continue;
    const outlet = byDomain.get(domain) ?? { domain, country, languages: [] };
    const lang = row.lang?.value?.toLowerCase();
    if (lang && !outlet.languages.includes(lang)) outlet.languages.push(lang);
    byDomain.set(domain, outlet);
  }
  return [...byDomain.values()];
}

export interface SeedResult {
  outlets: number;
  added: number;
  updated: number;
}

/**
 * Fills the registry with outlets from Wikidata: new domains are added with no articles counted, domains
 * already known gain the missing languages and country. Counts and dates are never touched.
 */
export async function seedFromWikidata(o: {
  store: {
    getMany(domains: string[]): Promise<SourceRecord[]>;
    putMany(records: SourceRecord[]): Promise<void>;
  };
  query: () => Promise<SparqlAnswer>;
  now: Date;
}): Promise<SeedResult> {
  const outlets = parseOutlets(await o.query());
  const existing = new Map((await o.store.getMany(outlets.map((x) => x.domain))).map((r) => [r.domain, r]));
  const stamp = o.now.toISOString();
  const result: SeedResult = { outlets: outlets.length, added: 0, updated: 0 };
  const out: SourceRecord[] = [];

  for (const outlet of outlets) {
    const langs = outlet.languages.map(toIso3);
    const have = existing.get(outlet.domain);
    if (!have) {
      out.push({ domain: outlet.domain, firstSeen: stamp, lastSeen: stamp, articleCount: 0, languages: langs, country: outlet.country });
      result.added++;
      continue;
    }
    const languages = [...new Set([...have.languages, ...langs])].sort();
    const country = have.country ?? outlet.country;
    if (languages.length === have.languages.length && country === have.country) continue;
    out.push({ ...have, languages, country });
    result.updated++;
  }
  await o.store.putMany(out);
  return result;
}

/** Runs the outlet query against the public Wikidata endpoint. The caller supplies a User-Agent with contact details. */
export async function queryWikidata(userAgent: string, fetchImpl: typeof fetch = fetch): Promise<SparqlAnswer> {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(outletQuery())}`;
  const res = await fetchImpl(url, { headers: { "user-agent": userAgent, accept: "application/sparql-results+json" } });
  if (!res.ok) throw new Error(`Wikidata answered HTTP ${res.status}`);
  return (await res.json()) as SparqlAnswer;
}
