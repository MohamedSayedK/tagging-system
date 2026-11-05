import type { FeedItem } from "./feeds.js";

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return NAMED[e.toLowerCase()] ?? m;
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });

const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
// Pages that organise or run the site rather than report on it.
const NOT_ARTICLE =
  /^\/(?:(?:category|categories|tag|tags|topic|topics|author|authors|page|search|about|contact|privacy|terms|login|signin|sign-in|register|subscribe|subscription|advertis\w*|cookie\w*|newsletter\w*|rss|feed|sitemap|careers|jobs|events|video|videos|gallery|photos|section|sections|archive|account|profile|help|faq|support)(?:[/.\-?]|$)|$)/i;
const MIN_WORDS = 5;
// Scripts written without spaces between words: a headline there is one run of characters.
const UNSPACED_SCRIPT = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0e00-\u0e7f]/;
const MIN_UNSPACED = 8;

const siteOf = (host: string) => host.toLowerCase().replace(/^www\./, "");
const sameSite = (host: string, site: string) => siteOf(host) === site || siteOf(host).endsWith(`.${site}`);

/**
 * The article links of a front page: same-site links to a page below the root whose text reads as a headline.
 * A heuristic for sites that publish no feed. It keeps the longest text any of an article's links carries.
 */
export function parseHeadlines(html: string, pageUrl: string): FeedItem[] {
  const page = new URL(pageUrl);
  const site = siteOf(page.hostname);
  const found = new Map<string, FeedItem>();
  for (const m of html.matchAll(ANCHOR)) {
    const attr = HREF.exec(m[1]!);
    const href = attr?.[1] ?? attr?.[2] ?? attr?.[3];
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;
    let url: URL;
    try {
      url = new URL(decodeEntities(href), page);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || !sameSite(url.hostname, site)) continue;
    if (NOT_ARTICLE.test(url.pathname) || url.pathname.length < 8) continue;
    url.hash = "";
    const title = decodeEntities(m[2]!.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    const spaced = title.split(" ").length >= MIN_WORDS;
    if (!spaced && !(UNSPACED_SCRIPT.test(title) && title.length >= MIN_UNSPACED)) continue;
    const key = url.toString();
    const known = found.get(key);
    if (!known || title.length > (known.title ?? "").length) found.set(key, { url: key, title });
  }
  return [...found.values()];
}
