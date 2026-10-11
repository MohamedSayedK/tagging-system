// Usage: npm run promote -- [--limit 100] [--lang ar] [--concurrency 6] [--retry-days 7]
// Tries to turn the busiest registry domains (regional ones first) into crawl sources by finding and
// validating their feeds. Fetches each domain's robots.txt, homepage and a few feed URLs, so USER_AGENT must
// carry a contact URL.
import { ensureIndices } from "../search/index-def.js";
import { hasContactUrl, promoteFromRegistry } from "./registryJobs.js";

if (!hasContactUrl()) {
  console.error(
    "Set USER_AGENT to a string with a contact URL before crawling real sites, e.g.\n" +
      '  $env:USER_AGENT = "TaggingBot/0.1 (+https://example.org/contact)"',
  );
  process.exit(2);
}

function flag(name: string, fallback: number | undefined): number | undefined {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  if (v !== undefined && (!Number.isFinite(v) || v < 0)) throw new Error(`--${name} must be a number`);
  return v;
}
const langIndex = process.argv.indexOf("--lang");

await ensureIndices();
const result = await promoteFromRegistry({
  limit: flag("limit", 100)!,
  concurrency: flag("concurrency", 6)!,
  retryAfterDays: flag("retry-days", undefined),
  lang: langIndex >= 0 ? process.argv[langIndex + 1] : undefined,
  onResult: (p) => {
    const detail = p.source ? `${p.source.feeds.length} feeds, lang ${p.source.lang ?? "?"}` : (p.rejected[0]?.reason ?? "");
    console.log(`${p.status.padEnd(11)} ${p.domain} ${detail}`);
  },
});
console.log(JSON.stringify(result));
