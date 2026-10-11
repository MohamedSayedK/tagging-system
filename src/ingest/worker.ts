// Long-running crawler: `npm run worker`. Each source is re-read on its own `interval` (sources.yaml),
// failing sources back off, and every run's outcome is stored (see GET /sources).
import { statSync } from "node:fs";
import { ensureIndices } from "../search/index-def.js";
import { ingestSource } from "./ingestSource.js";
import { openSearchStore } from "./runStore.js";
import { createScheduler } from "./scheduler.js";
import { loadSources, Source } from "./sources.js";

const TICK_MS = Number(process.env.WORKER_TICK_SECONDS ?? 30) * 1000;
const sourcesPath = process.env.SOURCES_FILE ?? "sources.yaml";
const store = openSearchStore();

let sources: Source[] = [];
let loadedAt = 0;
let scheduler: ReturnType<typeof createScheduler> | null = null;

/** Picks up edits to sources.yaml without a restart; a broken edit keeps the previous sources running. */
function refreshSources() {
  const mtime = statSync(sourcesPath).mtimeMs;
  if (scheduler && mtime === loadedAt) return;
  try {
    sources = loadSources(sourcesPath);
    loadedAt = mtime;
    scheduler = createScheduler({
      sources,
      store,
      concurrency: Number(process.env.INGEST_CONCURRENCY ?? 4),
      run: async (name) => ingestSource(sources.find((s) => s.name === name)!),
    });
    console.log(`[worker] ${sources.length} sources loaded from ${sourcesPath}`);
  } catch (e) {
    loadedAt = mtime; // don't re-log every tick until the file changes again
    console.error(`[worker] ${sourcesPath} not loaded: ${(e as Error).message}`);
    if (!scheduler) throw e;
  }
}

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));

await ensureIndices();
while (!stopping) {
  refreshSources();
  try {
    const ran = await scheduler!.tick();
    if (ran.length) console.log(`[worker] ran ${ran.length} sources`);
  } catch (e) {
    console.error("[worker] tick failed:", (e as Error).message);
  }
  await new Promise((r) => setTimeout(r, TICK_MS));
}
console.log("[worker] stopped");
