// One pass over every source in sources.yaml: `npm run ingest`. For continuous, scheduled crawling use `npm run worker`.
import { ensureIndices } from "../search/index-def.js";
import { ingestSource } from "./ingestSource.js";
import { loadSources } from "./sources.js";

await ensureIndices();
for (const src of loadSources()) {
  const outcome = await ingestSource(src);
  if (!outcome.ok) console.warn(`[${src.name}] FAILED: ${outcome.error}`);
}
