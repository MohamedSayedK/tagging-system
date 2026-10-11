import type { Promotion, PromotedSource, PromotionStatus } from "../registry/promote.js";
import { client, CRAWL_SOURCES_INDEX } from "./index-def.js";

export interface Attempt {
  status: PromotionStatus;
  checkedAt: string;
}

/** What the registry has tried to turn into crawl sources. One document per domain (id = domain). */
export function openSearchPromotions() {
  return {
    async save(p: Promotion): Promise<void> {
      await client.index({ index: CRAWL_SOURCES_INDEX, id: p.domain, body: p, refresh: true });
    },

    /** Every domain whose last attempt produced a crawlable source. */
    async activeSources(): Promise<PromotedSource[]> {
      const res = await client.search({
        index: CRAWL_SOURCES_INDEX,
        body: { size: 10_000, query: { term: { status: "active" } } },
      });
      return ((res.body as any).hits.hits as any[]).map((h) => (h._source as Promotion).source!).filter(Boolean);
    },

    /** Status and time of the last attempt per domain; domains never tried are absent. */
    async attempts(domains: string[]): Promise<Map<string, Attempt>> {
      const out = new Map<string, Attempt>();
      if (domains.length === 0) return out;
      const res = await client.mget({ index: CRAWL_SOURCES_INDEX, body: { ids: domains }, _source: ["status", "checkedAt"] });
      for (const d of (res.body as any).docs as any[]) {
        if (d.found) out.set(d._id, { status: d._source.status, checkedAt: d._source.checkedAt });
      }
      return out;
    },
  };
}
