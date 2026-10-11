// The two registry jobs wired to real services. Used by the CLI commands and by the worker's schedule.
import { discover } from "../registry/discover.js";
import { countryOf, isAggregator, loadOverrides } from "../registry/overrides.js";
import { promoteBatch } from "../registry/promoteBatch.js";
import { queryWikidata, seedFromWikidata } from "../registry/wikidata.js";
import { openSearchPromotions } from "../search/promotionStore.js";
import { openSearchRegistry } from "../search/registryStore.js";
import { searchRegistry } from "../search/registrySearch.js";
import { fetchText } from "./article.js";
import { loadSources } from "./sources.js";

/** Crawling real sites needs a way for their owners to reach us. */
export const hasContactUrl = () => /https?:\/\/\S+/.test(process.env.USER_AGENT ?? "");

/** Read GDELT's newest files (and backfill to `hours` ago) into the registry. */
export async function discoverFromGdelt({ hours, maxStamps }: { hours: number; maxStamps: number }) {
  const userAgent = process.env.USER_AGENT ?? "tagging-system (set USER_AGENT with a contact URL)";
  const http = async (url: string) => {
    const res = await fetch(url, { headers: { "user-agent": userAgent } });
    if (res.status === 404) return null; // not published (yet)
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  // The registry should cover `hours` back, on GDELT's 15-minute grid.
  const start = new Date(Math.floor((Date.now() - hours * 3_600_000) / 900_000) * 900_000);
  const startAfter = start.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return discover({ store: openSearchRegistry(), http, startAfter, maxStamps });
}

/** Add MENA newspapers and agencies from Wikidata to the registry (needs a contact URL in USER_AGENT). */
export async function seedRegistryFromWikidata() {
  return seedFromWikidata({
    store: openSearchRegistry(),
    query: () => queryWikidata(process.env.USER_AGENT!),
    now: new Date(),
  });
}

/** Try the next registry domains (MENA first) and store whether each can be crawled. */
export async function promoteFromRegistry({
  limit,
  concurrency,
  lang,
  retryAfterDays,
  onResult,
}: {
  limit: number;
  concurrency: number;
  lang?: string;
  retryAfterDays?: number;
  onResult?: Parameters<typeof promoteBatch>[0]["onResult"];
}) {
  const promotions = openSearchPromotions();
  const overrides = loadOverrides();
  return promoteBatch({
    isAggregator: (d) => isAggregator(d, overrides),
    countryOf: (d) => countryOf(d, overrides),
    // A pool larger than `limit`, since many candidates are filtered out as tried or configured. Arabic
    // publishers are always pooled so the busiest global domains cannot crowd them out.
    pool: async () => {
      const byDomain = new Map<string, { domain: string; articleCount: number; languages: string[] }>();
      for (const poolLang of lang ? [lang] : ["ar", undefined]) {
        for (let from = 0, got = 0; got < limit * 5 && from < 5000; from += 500) {
          const page = await searchRegistry({ lang: poolLang, from, size: 500 });
          for (const r of page.items) byDomain.set(r.domain, r);
          got += page.items.length;
          if (page.items.length < 500) break;
        }
      }
      return [...byDomain.values()];
    },
    attempts: (domains) => promotions.attempts(domains),
    save: (p) => promotions.save(p),
    curatedDomains: new Set(loadSources().map((s) => s.domain)),
    fetchText,
    now: new Date(),
    limit,
    concurrency,
    retryAfterDays,
    onResult,
  });
}
