import { createRequire } from "node:module";

const robotsParser = createRequire(import.meta.url)("robots-parser") as (
  url: string,
  txt: string,
) => { isAllowed(url: string, ua?: string): boolean | undefined };

/** A feed or sitemap that might be readable by the crawler. */
export interface FeedCandidate {
  url: string;
  kind: "rss" | "sitemap";
}

export interface FeedDiscovery {
  candidates: FeedCandidate[];
  /** False when neither the page nor robots.txt could be read on any host. */
  reachable: boolean;
  /** True when robots.txt forbids crawlers the homepage; nothing else was fetched. */
  blocked: boolean;
}

const COMMON_PATHS = ["/feed", "/rss", "/rss.xml", "/feed/", "/atom.xml", "/sitemap-news.xml", "/news-sitemap.xml"];
const MAX_CANDIDATES = 8;

const TAG = /<link\b([^>]*)>/gi;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function attributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR)) out[m[1]!.toLowerCase()] = (m[2] ?? m[3] ?? m[4] ?? "").trim();
  return out;
}

/** RSS and Atom feeds a page advertises with `<link rel="alternate">`, as absolute URLs. */
export function extractFeedLinks(html: string, pageUrl: string): FeedCandidate[] {
  const found = new Map<string, FeedCandidate>();
  for (const tag of html.matchAll(TAG)) {
    const a = attributes(tag[1]!);
    if (!/\balternate\b/i.test(a.rel ?? "")) continue;
    if (!/^application\/(rss|atom)\+xml/i.test(a.type ?? "")) continue;
    if (!a.href) continue;
    if (/comment/i.test(a.title ?? "") || /comment/i.test(a.href)) continue;
    let url: string;
    try {
      url = new URL(a.href, pageUrl).toString();
    } catch {
      continue;
    }
    if (!found.has(url)) found.set(url, { url, kind: "rss" });
  }
  return [...found.values()];
}

const ANCHOR = /<a\b([^>]*)>/gi;
const LOOKS_LIKE_FEED = /^\s*<\?xml|<(rss|feed|urlset|sitemapindex|rdf:RDF)\b/i;
const FEED_FILE = /\.(xml|rss|atom)(\?|$)/i;
const FEED_PAGE = /\/(rss|feeds?|atom)(\/|\.html?|\.php|\.aspx)?$/i;

/** Absolute same-site links on a page that look like a feed file (`.xml`, `.rss`) or like an RSS directory page. */
function feedAnchors(html: string, pageUrl: string, site: string): { files: string[]; pages: string[] } {
  const files: string[] = [];
  const pages: string[] = [];
  for (const tag of html.matchAll(ANCHOR)) {
    const href = attributes(tag[1]!).href;
    if (!href || href.startsWith("#") || /^(mailto|javascript):/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== site && !host.endsWith(`.${site}`)) continue;
    const s = url.toString();
    if (FEED_FILE.test(url.pathname + url.search)) files.push(s);
    else if (FEED_PAGE.test(url.pathname)) pages.push(s);
  }
  return { files: [...new Set(files)], pages: [...new Set(pages)] };
}

/**
 * Looks for feeds and sitemaps a news domain offers: what the homepage advertises, then the sitemaps in its
 * robots.txt, then RSS directory pages the homepage links to, and only if all of those yield nothing a few
 * conventional paths. Best effort: nothing is validated here.
 */
export async function discoverFeeds(
  domain: string,
  fetchText: (url: string) => Promise<string>,
  options: { userAgent?: string } = {},
): Promise<FeedDiscovery> {
  const userAgent = options.userAgent ?? "TaggingBot";
  const hosts = domain.startsWith("www.") ? [domain] : [domain, `www.${domain}`];
  const attempt = async (url: string) => fetchText(url).catch(() => null);

  for (const host of hosts) {
    const origin = `https://${host}`;
    const robotsTxt = await attempt(`${origin}/robots.txt`);
    if (robotsTxt !== null && robotsParser(`${origin}/robots.txt`, robotsTxt).isAllowed(`${origin}/`, userAgent) === false) {
      return { candidates: [], reachable: true, blocked: true };
    }
    const home = await attempt(`${origin}/`);
    if (robotsTxt === null && home === null) continue; // try the next host

    const found = new Map<string, FeedCandidate>();
    const add = (c: FeedCandidate) => found.size < MAX_CANDIDATES && !found.has(c.url) && found.set(c.url, c);
    if (home !== null) extractFeedLinks(home, `${origin}/`).forEach(add);
    if (robotsTxt !== null) sitemapsFromRobots(robotsTxt).forEach((url) => add({ url, kind: "sitemap" }));
    const site = host.replace(/^www\./, "");
    if (found.size === 0 && home !== null) {
      // Many outlets list their feeds on an RSS page rather than advertising them in the page head.
      const { files, pages } = feedAnchors(home, `${origin}/`, site);
      files.forEach((url) => add({ url, kind: "rss" }));
      for (const page of pages.slice(0, 3)) {
        if (found.size > 0) break;
        const body = await attempt(page);
        if (body === null) continue;
        if (LOOKS_LIKE_FEED.test(body)) {
          add({ url: page, kind: /<urlset|<sitemapindex/i.test(body) ? "sitemap" : "rss" });
          continue;
        }
        extractFeedLinks(body, page).forEach(add);
        feedAnchors(body, page, site).files.forEach((url) => add({ url, kind: "rss" }));
      }
    }
    if (found.size === 0) {
      for (const path of COMMON_PATHS) {
        const body = await attempt(origin + path);
        // An ordinary page answering 200 for any path is not a feed.
        if (body !== null && LOOKS_LIKE_FEED.test(body)) add({ url: origin + path, kind: /sitemap/.test(path) ? "sitemap" : "rss" });
      }
    }
    return { candidates: [...found.values()], reachable: true, blocked: false };
  }
  return { candidates: [], reachable: false, blocked: false };
}

/** The `Sitemap:` URLs of a robots.txt, news sitemaps first. Commented lines are ignored. */
export function sitemapsFromRobots(robots: string): string[] {
  const urls = robots
    .split(/\r?\n/)
    .map((l) => /^\s*sitemap:\s*(\S+)/i.exec(l)?.[1])
    .filter((u): u is string => Boolean(u) && /^https?:\/\//i.test(u!));
  const unique = [...new Set(urls)];
  return [...unique.filter((u) => /news/i.test(u)), ...unique.filter((u) => !/news/i.test(u))];
}
