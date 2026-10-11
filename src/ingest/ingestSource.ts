import { createHash } from "node:crypto";
import { client, INDEX } from "../search/index-def.js";
import { allowedByRobots, extractArticle, fetchText } from "./article.js";
import { FeedItem, parseFeed } from "./feeds.js";
import { RunOutcome } from "./scheduler.js";
import { DEFAULT_MAX_AGE_DAYS, DEFAULT_MAX_ITEMS, Source } from "./sources.js";

const CONCURRENCY = Number(process.env.INGEST_CONCURRENCY ?? 4);
const idOf = (url: string) => createHash("sha1").update(url).digest("hex");

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]!);
    }),
  );
}

async function newItems(items: FeedItem[]): Promise<FeedItem[]> {
  const byId = new Map(items.map((it) => [idOf(it.url), it]));
  if (!byId.size) return [];
  const res = await client.mget({ index: INDEX, body: { ids: [...byId.keys()] }, _source: false });
  for (const d of (res.body as any).docs) if (d.found) byId.delete(d._id);
  return [...byId.values()];
}

/** Reads a source's feeds, stores articles not seen before, and reports what happened. */
export async function ingestSource(src: Omit<Source, "interval" | "maxItems" | "maxAgeDays"> & { maxItems?: number; maxAgeDays?: number }): Promise<RunOutcome> {
  const items: FeedItem[] = [];
  const feedErrors: string[] = [];
  for (const feed of src.feeds) {
    try {
      items.push(...parseFeed(await fetchText(feed.url), feed.kind));
    } catch (e) {
      feedErrors.push((e as Error).message);
      console.warn(`[${src.name}] feed failed ${feed.url}: ${(e as Error).message}`);
    }
  }
  if (feedErrors.length === src.feeds.length) {
    return { ok: false, found: 0, indexed: 0, error: feedErrors.slice(0, 3).join("; ") };
  }
  const partial = feedErrors.length
    ? `${feedErrors.length} of ${src.feeds.length} feeds failed: ${feedErrors.slice(0, 3).join("; ")}`
    : undefined;

  const unique = [...new Map(items.map((i) => [i.url, i])).values()];
  // Only the newest items are worth reading each run; undated items count as new.
  const cutoff = Date.now() - (src.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 86_400_000;
  const current = unique.filter((i) => !i.published || Date.parse(i.published) >= cutoff);
  const newest = [...current].sort((a, b) => (b.published ?? "9").localeCompare(a.published ?? "9")).slice(0, src.maxItems ?? DEFAULT_MAX_ITEMS);
  const fresh = await newItems(newest);

  const docs: { id: string; doc: Record<string, unknown> }[] = [];
  await pool(fresh, CONCURRENCY, async (it) => {
    let title = it.title;
    let body = it.summary ?? "";
    let author = it.author;
    let lang = src.lang;
    try {
      if (await allowedByRobots(it.url)) {
        const ex = extractArticle(await fetchText(it.url), it.url);
        if (ex) {
          title ||= ex.title;
          body = ex.body;
          author ||= ex.author;
          lang ||= ex.lang;
        }
      }
    } catch (e) {
      console.warn(`[${src.name}] article failed ${it.url}: ${(e as Error).message}`);
    }
    if (!title && !body) return;
    const now = new Date().toISOString();
    docs.push({
      id: idOf(it.url),
      doc: {
        url: it.url,
        title,
        body,
        author,
        authorshort: author?.toLowerCase(),
        source: src.name,
        domain: src.domain,
        sourcetype: src.sourcetype,
        sourcecountry: src.country,
        lang,
        published: it.published ?? now,
        fetched: now,
      },
    });
  });

  let indexed = 0;
  if (docs.length) {
    const res = await client.bulk({
      refresh: false,
      body: docs.flatMap((d) => [{ create: { _index: INDEX, _id: d.id } }, d.doc]),
    });
    const results = (res.body as any).items as any[];
    const failed = results.filter((i) => i.create.error && i.create.status !== 409);
    indexed = results.length - failed.length;
    for (const f of failed.slice(0, 3)) console.warn(`[${src.name}] index error`, JSON.stringify(f.create.error));
  }
  console.log(`[${src.name}] ${unique.length} feed items, ${fresh.length} new, ${indexed} indexed`);
  return { ok: true, found: unique.length, indexed, ...(partial && { error: partial }) };
}


