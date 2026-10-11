// Writes web/public/demo-registry.json: the source registry and the sources promoted from it, as a static
// snapshot for the serverless public demo. `npm run demo:registry`
// The article snapshot (demo-data.json) is separate and is not touched.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadOverrides } from "../registry/overrides.js";
import { buildRegistrySnapshot } from "../registry/demoSnapshot.js";
import type { SourceRecord } from "../registry/registry.js";
import { client, REGISTRY_INDEX } from "../search/index-def.js";
import { openSearchPromotions } from "../search/promotionStore.js";
import { openSearchStore } from "./runStore.js";

const OUT = "web/public/demo-registry.json";
const PAGE = 5000;

/** Every registry record, paged by domain so the 10,000-hit window is not a limit. */
async function allRecords(): Promise<SourceRecord[]> {
  const out: SourceRecord[] = [];
  let after: string | undefined;
  for (;;) {
    const res = await client.search({
      index: REGISTRY_INDEX,
      body: <any>{ size: PAGE, sort: [{ domain: "asc" }], query: { match_all: {} }, ...(after && { search_after: [after] }) },
    });
    const hits = (res.body as any).hits.hits as any[];
    out.push(...hits.map((h) => h._source as SourceRecord));
    if (hits.length < PAGE) return out;
    after = hits.at(-1)!.sort[0] as string;
  }
}

const records = await allRecords();
const promotions = openSearchPromotions();
const attempts = new Map<string, { status: never; checkedAt: string }>();
for (let i = 0; i < records.length; i += 1000) {
  const chunk = records.slice(i, i + 1000).map((r) => r.domain);
  for (const [domain, attempt] of await promotions.attempts(chunk)) attempts.set(domain, attempt as never);
}
const promoted = await promotions.activeSources();
const runs = new Map((await openSearchStore().load()).map((r) => [r.name, r]));

const snapshot = buildRegistrySnapshot({ records, attempts, overrides: loadOverrides(), promoted, runs, now: new Date() });

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot));
const crawled = snapshot.registry.filter((r) => r.crawl === "active").length;
console.log(`${snapshot.registry.length} domains (${crawled} crawled), ${snapshot.sources.length} promoted sources -> ${OUT}`);
