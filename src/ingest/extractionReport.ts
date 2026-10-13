// How article text was obtained, per source: `npm run report:extraction`. Read-only.
import { client, INDEX } from "../search/index-def.js";

const res = await client.search({
  index: INDEX,
  body: <any>{
    size: 0,
    track_total_hits: true,
    aggs: {
      by_source: {
        terms: { field: "source", size: 500 },
        aggs: { how: { terms: { field: "extraction", size: 10, missing: "unknown" } } },
      },
      overall: { terms: { field: "extraction", size: 10, missing: "unknown" } },
    },
  },
});
const aggs = (res.body as any).aggregations;
const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;
const total = (res.body as any).hits.total.value as number;

console.log(`Articles: ${total}`);
for (const b of aggs.overall.buckets) console.log(`  ${String(b.key).padEnd(12)} ${String(b.doc_count).padStart(7)}  ${pct(b.doc_count, total)}`);

// Sources whose articles are mostly not full page text, busiest first.
const rows = (aggs.by_source.buckets as any[])
  .map((s) => {
    const how = Object.fromEntries((s.how.buckets as any[]).map((h) => [h.key, h.doc_count as number]));
    const full = (how.page ?? 0) + (how.structured ?? 0);
    const known = s.doc_count - (how.unknown ?? 0);
    return { name: s.key as string, n: s.doc_count as number, known, full, how };
  })
  .filter((r) => r.known >= 10 && r.full / r.known < 0.6)
  .sort((a, b) => b.n - a.n);

console.log(`\nSources where under 60% of the measured articles have full page text (${rows.length}):`);
for (const r of rows.slice(0, 40)) {
  const parts = Object.entries(r.how).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`  ${r.name.padEnd(28)} ${String(r.n).padStart(5)}  full ${pct(r.full, r.known).padStart(4)}  (${parts})`);
}
if (aggs.overall.buckets.every((b: any) => b.key === "unknown")) {
  console.log("\nNo article carries an extraction mark yet: it is written as articles are crawled from now on.");
}