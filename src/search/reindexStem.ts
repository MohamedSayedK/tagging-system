// Re-analyzes every stored article so the stemmed fields (`stem:`) cover articles stored before they existed.
// `npm run reindex:stem`. Safe to repeat: it rewrites each document with its own content.
import { client, INDEX } from "./index-def.js";

/** Rewrites every article in place; returns how many were processed. */
export async function reindexStem(): Promise<number> {
  const res = await client.updateByQuery({
    index: INDEX,
    conflicts: "proceed",
    wait_for_completion: true,
    refresh: true,
    body: { query: { match_all: {} } } as never,
  });
  return (res.body as any).updated as number;
}

if (process.argv[1] && /reindexStem\.[tj]s$/.test(process.argv[1])) {
  console.log(`reindexing ${INDEX}…`);
  console.log(`done: ${await reindexStem()} articles`);
}