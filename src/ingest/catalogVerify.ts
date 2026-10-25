// Usage: npm run catalog:verify -- [--limit 100] [--concurrency 6] [--retry-days 7]
// Checks the next crawlable records of the business source catalog (ADR 0001), P1 first: robots.txt, homepage,
// feeds, and the name the homepage gives itself. A working feed becomes a crawl source the worker picks up.
// Fetches real sites, so USER_AGENT must carry a contact URL.
import { verifyCatalog } from "../registry/catalogVerify.js";
import { openSearchCatalog } from "../search/catalogStore.js";
import { ensureIndices } from "../search/index-def.js";
import { openSearchPromotions } from "../search/promotionStore.js";
import { fetchText } from "./article.js";
import { hasContactUrl } from "./registryJobs.js";
import { loadSources } from "./sources.js";

if (!hasContactUrl()) {
  console.error("Set USER_AGENT to a string with a contact URL before crawling real sites.");
  process.exit(2);
}

function flag(name: string, fallback: number | undefined): number | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  if (v !== undefined && (!Number.isFinite(v) || v < 0)) throw new Error(`--${name} must be a number`);
  return v;
}

await ensureIndices();
const catalog = openSearchCatalog();
const promotions = openSearchPromotions();
const result = await verifyCatalog({
  entries: await catalog.all(),
  curatedDomains: new Set(loadSources().map((s) => s.domain.toLowerCase().replace(/^www\./, ""))),
  fetchText,
  now: new Date(),
  limit: flag("limit", 100)!,
  concurrency: flag("concurrency", 6)!,
  retryAfterDays: flag("retry-days", undefined),
  saveVerification: (id, v) => catalog.saveVerification(id, v),
  savePromotion: (p) => promotions.save(p),
  onResult: (domain, v) => console.log(`${v.status.padEnd(11)} ${domain} ${v.identity ?? ""} ${v.siteName ?? ""} ${v.reason ?? ""}`),
});
console.log(JSON.stringify(result));
