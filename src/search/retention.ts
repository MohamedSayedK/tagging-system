import { client, INDEX } from "./index-def.js";

/** Deletes articles published more than `days` ago; returns how many were removed. */
export async function purgeOlderThan({ days, now = new Date() }: { days: number; now?: Date }): Promise<number> {
  // A typo (0, or a value in the wrong unit) must not be able to empty the index.
  if (!Number.isFinite(days) || days < 7) throw new Error(`Retention must be at least 7 days, got ${days}`);
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  const res = await client.deleteByQuery({
    index: INDEX,
    refresh: true,
    conflicts: "proceed",
    body: { query: { range: { published: { lt: cutoff } } } },
  });
  return (res.body as any).deleted as number;
}
