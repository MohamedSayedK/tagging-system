// Long-running crawler: `npm run worker`. Each source is re-read on its own `interval` (sources.yaml),
// failing sources back off, and every run's outcome is stored (see GET /sources). Domains promoted from the
// registry (`npm run promote`) are crawled too; the list is re-read every few minutes.
import { statSync } from "node:fs";
import { ensureIndices } from "../search/index-def.js";
import { purgeOlderThan } from "../search/retention.js";
import { openSearchPromotions } from "../search/promotionStore.js";
import { ingestSource } from "./ingestSource.js";
import { mergeSources } from "./mergeSources.js";
import { openSearchStore } from "./runStore.js";
import { createScheduler } from "./scheduler.js";
import { createJob } from "./job.js";
import { parseDuration } from "./scheduler.js";
import { discoverFromGdelt, hasContactUrl, promoteFromRegistry, seedRegistryFromWikidata } from "./registryJobs.js";
import { loadSources, Source } from "./sources.js";

// Background jobs that grow the source list by themselves. Both can be turned off with "off".
//   DISCOVER_EVERY (default 1h)  read new GDELT files into the registry
//   PROMOTE_EVERY  (default 1h)  try PROMOTE_BATCH (default 25) registry domains; needs a USER_AGENT contact URL
const jobs = [];
// Background jobs wait a few minutes after start so they do not compete with the first crawl burst.
const STARTUP_GRACE_MS = 3 * 60_000;
const every = (name: string, fallback: string) => {
  const v = (process.env[name] ?? fallback).trim().toLowerCase();
  return v === "off" ? null : parseDuration(v);
};
const discoverEvery = every("DISCOVER_EVERY", "1h");
if (discoverEvery) {
  jobs.push(
    createJob({
      name: "discover-gdelt",
      everyMs: discoverEvery,
      startAfterMs: STARTUP_GRACE_MS,
      run: () => discoverFromGdelt({ hours: Number(process.env.DISCOVER_HOURS ?? 24), maxStamps: 96 }),
    }),
  );
}
const promoteEvery = every("PROMOTE_EVERY", "1h");
if (promoteEvery && hasContactUrl()) {
  jobs.push(
    createJob({
      name: "promote-registry",
      everyMs: promoteEvery,
      startAfterMs: STARTUP_GRACE_MS,
      run: () => promoteFromRegistry({ limit: Number(process.env.PROMOTE_BATCH ?? 25), concurrency: 4 }),
    }),
  );
} else if (promoteEvery) {
  console.warn("[worker] registry promotion is off: set USER_AGENT with a contact URL to enable it");
}
// Deleting data is opt-in: set RETENTION_DAYS (at least 7) to drop articles published longer ago, checked daily.
if (process.env.RETENTION_DAYS) {
  const days = Number(process.env.RETENTION_DAYS);
  jobs.push(createJob({ name: "retention", everyMs: 24 * 3_600_000, run: async () => ({ removed: await purgeOlderThan({ days }) }) }));
}
// Outlet directories change slowly; once a week is plenty. Off with SEED_WIKIDATA_EVERY=off.
const seedEvery = every("SEED_WIKIDATA_EVERY", "7d");
if (seedEvery && hasContactUrl()) {
  jobs.push(createJob({ name: "seed-wikidata", everyMs: seedEvery, startAfterMs: STARTUP_GRACE_MS, run: () => seedRegistryFromWikidata() }));
}

const TICK_MS = Number(process.env.WORKER_TICK_SECONDS ?? 30) * 1000;
const PROMOTED_REFRESH_MS = 5 * 60_000;
const sourcesPath = process.env.SOURCES_FILE ?? "sources.yaml";
const store = openSearchStore();
const promotions = openSearchPromotions();

let curated: Source[] = [];
let sources: Source[] = [];
let loadedAt = 0;
let promotedAt = 0;
let scheduler: ReturnType<typeof createScheduler> | null = null;

function rebuild(promoted: Awaited<ReturnType<typeof promotions.activeSources>>) {
  sources = mergeSources(curated, promoted);
  scheduler = createScheduler({
    sources,
    store,
    concurrency: Number(process.env.INGEST_CONCURRENCY ?? 4),
    run: async (name) => ingestSource(sources.find((s) => s.name === name)!),
  });
  console.log(`[worker] ${sources.length} sources (${curated.length} curated, ${sources.length - curated.length} from the registry)`);
}

/**
 * Picks up edits to sources.yaml and newly promoted domains without a restart; a broken edit keeps the
 * previous sources running.
 */
async function refreshSources() {
  const mtime = statSync(sourcesPath).mtimeMs;
  const yamlChanged = !scheduler || mtime !== loadedAt;
  const promotedDue = Date.now() - promotedAt >= PROMOTED_REFRESH_MS;
  if (!yamlChanged && !promotedDue) return;
  try {
    if (yamlChanged) curated = loadSources(sourcesPath);
    loadedAt = mtime;
  } catch (e) {
    loadedAt = mtime; // don't re-log every tick until the file changes again
    console.error(`[worker] ${sourcesPath} not loaded: ${(e as Error).message}`);
    if (!scheduler) throw e;
    return;
  }
  let promoted: Awaited<ReturnType<typeof promotions.activeSources>> = [];
  try {
    promoted = await promotions.activeSources();
    promotedAt = Date.now();
  } catch (e) {
    console.error(`[worker] promoted sources not loaded: ${(e as Error).message}`);
    if (!yamlChanged) return;
  }
  const same = scheduler && !yamlChanged && mergeSources(curated, promoted).length === sources.length;
  if (!same) rebuild(promoted);
}

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));

await ensureIndices();
while (!stopping) {
  await refreshSources();
  // Jobs run in the background so a long discovery never delays the crawl.
  for (const job of jobs) {
    const before = job.status().runs;
    void job.tick().then(() => {
      const s = job.status();
      if (s.runs === before) return; // nothing was due on this tick
      if (s.lastError) console.error(`[worker] job ${s.name} failed: ${s.lastError}`);
      else console.log(`[worker] job ${s.name} done: ${JSON.stringify(s.lastResult)}`);
    });
  }
  try {
    const ran = await scheduler!.tick();
    if (ran.length) console.log(`[worker] ran ${ran.length} sources`);
  } catch (e) {
    console.error("[worker] tick failed:", (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, TICK_MS));
}
console.log("[worker] stopped");
