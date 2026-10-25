import type { CatalogEntry, CatalogVerification } from "../registry/catalog.js";
import { CATALOG_INDEX, client } from "./index-def.js";

/** The business source catalog on OpenSearch (ADR 0001). One document per business record (id = its ID). */
export function openSearchCatalog() {
  return {
    /**
     * Writes the records as given. A record already stored gets its business fields replaced and keeps our
     * verification; records missing from this import stay as they were.
     */
    async importEntries(entries: CatalogEntry[]): Promise<void> {
      for (let i = 0; i < entries.length; i += 500) {
        const res = await client.bulk({
          refresh: true,
          body: entries.slice(i, i + 500).flatMap((e) => {
            const doc = { id: e.id, domain: e.domain, record: e.record };
            return [
              { update: { _index: CATALOG_INDEX, _id: e.id } },
              {
                script: { source: "ctx._source.domain = params.domain; ctx._source.record = params.record", params: doc },
                upsert: doc,
              },
            ];
          }),
        });
        if ((res.body as any).errors) throw new Error("catalog bulk write failed");
      }
    },

    async all(): Promise<CatalogEntry[]> {
      // No catalog index yet (never imported) means no catalog.
      const res = await client.search({ index: CATALOG_INDEX, body: { size: 10_000, query: { match_all: {} } } }, { ignore: [404] });
      return (((res.body as any).hits?.hits ?? []) as any[]).map((h) => h._source as CatalogEntry);
    },

    async saveVerification(id: string, verification: CatalogVerification): Promise<void> {
      // Replaced whole, so a field from an older check (a past `reason`) does not linger.
      await client.update({
        index: CATALOG_INDEX,
        id,
        body: { script: { source: "ctx._source.verification = params.v", params: { v: verification } } },
        refresh: true,
      });
    },
  };
}
