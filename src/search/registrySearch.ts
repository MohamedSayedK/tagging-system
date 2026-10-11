import { toIso3 } from "../registry/language.js";
import type { SourceRecord } from "../registry/registry.js";
import { client, REGISTRY_INDEX } from "./index-def.js";

export interface RegistryQuery {
  /** A two-letter (`ar`) or three-letter (`ara`) language code. */
  lang?: string;
  /** Domains containing this text, case-insensitive; wildcard characters match literally. */
  q?: string;
  /** Domains to leave out, exact match (the aggregators). */
  excludeDomains?: string[];
  from?: number;
  size?: number;
}

export async function searchRegistry({ lang, q, excludeDomains, from = 0, size = 50 }: RegistryQuery = {}): Promise<{ total: number; items: SourceRecord[] }> {
  const filter: object[] = [];
  const must_not: object[] = excludeDomains?.length ? [{ terms: { domain: excludeDomains } }] : [];
  if (lang) filter.push({ term: { languages: toIso3(lang) } });
  if (q) filter.push({ wildcard: { domain: { value: `*${q.replace(/[\\*?]/g, "\\$&")}*`, case_insensitive: true } } });
  const res = await client.search({
    index: REGISTRY_INDEX,
    body: {
      from,
      size: Math.min(size, 500),
      track_total_hits: true,
      query: { bool: { filter, must_not } },
      sort: [{ articleCount: "desc" }, { domain: "asc" }],
    },
  });
  const hits = (res.body as any).hits;
  return { total: hits.total.value, items: hits.hits.map((h: any) => h._source as SourceRecord) };
}
