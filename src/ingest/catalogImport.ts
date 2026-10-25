// Usage: npm run catalog:import -- <business data file.json>
// Loads the business source list into the source catalog (ADR 0001) and checks that every record is stored.
// Safe to repeat: business fields are replaced, our verification results are kept, nothing is dropped.
import { readFileSync } from "node:fs";
import { importCheck, parseCatalog } from "../registry/catalog.js";
import { openSearchCatalog } from "../search/catalogStore.js";
import { ensureIndices } from "../search/index-def.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run catalog:import -- <file.json>");
  process.exit(2);
}

await ensureIndices();
const parsed = parseCatalog(readFileSync(path, "utf8"));
const store = openSearchCatalog();
await store.importEntries(parsed.entries);
const check = importCheck(parsed, new Set((await store.all()).map((e) => e.id)));

console.log(`declared ${check.declared}, parsed ${check.parsed}, stored ${check.stored}`);
console.log("identity_verification:", JSON.stringify(check.byIdentity));
for (const r of check.rejected) console.log(`rejected #${r.index} ${r.id ?? ""}: ${r.reason}`);
for (const id of check.missing) console.log(`missing after import: ${id}`);
console.log(check.ok ? "OK: every record is in the catalog" : "NOT OK: see above");
process.exit(check.ok ? 0 : 1);
