import { parseFeed, parseSitemapIndex, type FeedItem } from "../ingest/feeds.js";
import type { FeedCandidate } from "./feedDiscovery.js";
import { detectLanguage } from "./language.js";

export interface FeedValidation {
  ok: boolean;
  /** The URL actually read: a sitemap index resolves to one of its children. */
  url: string;
  kind: "rss" | "sitemap";
  items: number;
  /** Items that carry a publication date. */
  dated: number;
  newest?: string;
  lang?: "ar" | "en";
  /** Why the feed was refused; only set when `ok` is false. */
  reason?: string;
}

const MIN_ITEMS = 3;
const MIN_SAME_SITE_SHARE = 0.5;
const MAX_NEWEST_AGE_MS = 14 * 86_400_000;

const sameSite = (url: string, domain: string) => {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
};

/** Pick the news sitemap from an index, else the last child (indexes list oldest first). */
const pickChild = (children: string[]) => children.find((u) => /news/i.test(u)) ?? children.at(-1)!;

/**
 * Decides whether a discovered feed or sitemap is worth crawling: it parses, has enough items, mostly
 * points at the same site, and is not long dead. Never throws; failures come back as `ok: false` with a reason.
 */
export async function validateFeed(
  candidate: FeedCandidate,
  domain: string,
  fetchText: (url: string) => Promise<string>,
  options: { now?: Date } = {},
): Promise<FeedValidation> {
  const now = (options.now ?? new Date()).getTime();
  let url = candidate.url;
  let kind = candidate.kind;
  const refuse = (reason: string): FeedValidation => ({ ok: false, url, kind, items: 0, dated: 0, reason });

  let body: string;
  try {
    body = await fetchText(url);
    if (kind === "sitemap") {
      const children = parseSitemapIndex(body);
      if (children.length > 0) {
        url = pickChild(children);
        body = await fetchText(url);
      }
    }
  } catch (e) {
    return refuse((e as Error).message);
  }

  if (/<urlset\b/i.test(body)) kind = "sitemap";
  else if (/<(rss|feed|rdf:RDF)\b/i.test(body)) kind = "rss";
  else return refuse("not a feed");

  let items: FeedItem[];
  try {
    items = parseFeed(body, kind);
  } catch (e) {
    return refuse(`not a feed (${(e as Error).message})`);
  }
  if (items.length < MIN_ITEMS) return refuse(`too few items (${items.length})`);

  const same = items.filter((i) => sameSite(i.url, domain)).length;
  if (same / items.length < MIN_SAME_SITE_SHARE) return refuse("items link to other sites");

  const times = items.map((i) => (i.published ? Date.parse(i.published) : NaN)).filter((t) => !Number.isNaN(t));
  const newestMs = times.length ? Math.max(...times) : undefined;
  if (newestMs !== undefined && now - newestMs > MAX_NEWEST_AGE_MS) {
    const days = Math.floor((now - newestMs) / 86_400_000);
    return refuse(`stale: newest item is ${days} days old`);
  }

  const lang = detectLanguage(items.map((i) => i.title ?? "").filter(Boolean));
  return {
    ok: true,
    url,
    kind,
    items: items.length,
    dated: times.length,
    ...(newestMs !== undefined && { newest: new Date(newestMs).toISOString() }),
    ...(lang && { lang }),
  };
}
