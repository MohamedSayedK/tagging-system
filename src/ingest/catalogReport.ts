// Usage: npm run catalog:report -- [out.csv]   (default business-input/catalog-report.csv, gitignored)
// One row per business catalog record: their fields, then whether we crawl it and why not. Read-only.
import { writeFileSync } from "node:fs";
import { catalogReport, toCsv } from "../registry/catalog.js";
import { openSearchCatalog } from "../search/catalogStore.js";
import { openSearchPromotions } from "../search/promotionStore.js";
import { promotedScope } from "../search/promotedScope.js";
import { loadSources } from "./sources.js";

const out = process.argv[2] ?? "business-input/catalog-report.csv";
const promoted = await openSearchPromotions().activeSources();
const inScope = await promotedScope(promoted);
const rows = catalogReport(await openSearchCatalog().all(), {
  curatedDomains: new Set(loadSources().map((s) => s.domain.toLowerCase().replace(/^www\./, ""))),
  crawledDomains: new Set(promoted.filter(inScope).map((p) => p.domain)),
});
rows.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(out, toCsv(rows.map((r) => ({ ...r }))), "utf8");

const byState: Record<string, number> = {};
for (const r of rows) byState[r.state] = (byState[r.state] ?? 0) + 1;
console.log(`${rows.length} records -> ${out}`);
for (const [k, n] of Object.entries(byState).sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(5)}  ${k}`);
