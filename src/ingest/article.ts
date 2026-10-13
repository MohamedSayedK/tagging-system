import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import { createRequire } from "node:module";
import { createDomainLimiter } from "./domainLimiter.js";

const robotsParser = createRequire(import.meta.url)("robots-parser") as (url: string, txt: string) => { isAllowed(url: string, ua?: string): boolean | undefined };

export const USER_AGENT = process.env.USER_AGENT ?? "TaggingBot/0.1 (+set-USER_AGENT-with-contact-url)";
const TIMEOUT = 15_000;

// One request per second per site by default: many sources can run at once, but no outlet is hammered.
const limiter = createDomainLimiter({ minIntervalMs: Number(process.env.DOMAIN_MIN_INTERVAL_MS ?? 1000) });

// A slow or briefly overloaded site, or a hiccup on our own network, should cost a second try, not a failed run.
const RETRY_DELAY_MS = Number(process.env.FETCH_RETRY_DELAY_MS ?? 1500);
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

class HttpStatusError extends Error {
  constructor(readonly status: number, url: string) {
    super(`HTTP ${status} ${url}`);
  }
}

/** Node's fetch reports every network failure as "fetch failed"; the useful part is on `cause`. */
function explain(e: unknown): Error {
  if (e instanceof HttpStatusError || !(e instanceof Error)) return e as Error;
  const cause = (e as { cause?: { code?: string; message?: string } }).cause;
  const detail = cause?.code ?? cause?.message;
  return detail && !e.message.includes(detail) ? new Error(`${e.message} (${detail})`) : e;
}

interface Fetched {
  text: string;
  notModified: boolean;
  etag?: string;
  lastModified?: string;
}

async function fetchOnce(url: string, conditional: Record<string, string> = {}): Promise<Fetched> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5", ...conditional },
    signal: AbortSignal.timeout(TIMEOUT),
    redirect: "follow",
  });
  if (res.status === 304) return { text: "", notModified: true };
  if (!res.ok) throw new HttpStatusError(res.status, url);
  return {
    text: await res.text(),
    notModified: false,
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
  };
}

function fetchWithRetry(url: string, conditional: Record<string, string> = {}): Promise<Fetched> {
  return limiter.run(new URL(url).hostname, async () => {
    // The retry stays inside the site's slot, so politeness is kept.
    try {
      return await fetchOnce(url, conditional);
    } catch (first) {
      const worthRetrying = first instanceof HttpStatusError ? RETRYABLE_STATUS.has(first.status) : true;
      if (!worthRetrying) throw first;
      if (RETRY_DELAY_MS > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      try {
        return await fetchOnce(url, conditional);
      } catch (second) {
        throw explain(second);
      }
    }
  });
}

export async function fetchText(url: string): Promise<string> {
  return (await fetchWithRetry(url)).text;
}

// What each feed said last time (ETag / Last-Modified, and the text), kept for this process's lifetime. A
// feed that has not changed answers 304 with no body, which saves the site the transfer.
const feedMemory = new Map<string, { etag?: string; lastModified?: string; text: string }>();

/** Like `fetchText`, but asks the site whether the feed changed since the last read and reuses the text if not. */
export async function fetchFeedText(url: string): Promise<string> {
  const seen = feedMemory.get(url);
  const conditional: Record<string, string> = {};
  if (seen?.etag) conditional["if-none-match"] = seen.etag;
  if (seen?.lastModified) conditional["if-modified-since"] = seen.lastModified;
  const got = await fetchWithRetry(url, conditional);
  if (got.notModified && seen) return seen.text;
  if (got.etag || got.lastModified) feedMemory.set(url, { etag: got.etag, lastModified: got.lastModified, text: got.text });
  return got.text;
}

const robotsCache = new Map<string, Promise<ReturnType<typeof robotsParser> | null>>();

export async function allowedByRobots(url: string): Promise<boolean> {
  const origin = new URL(url).origin;
  let entry = robotsCache.get(origin);
  if (!entry) {
    entry = fetchText(`${origin}/robots.txt`)
      .then((txt) => robotsParser(`${origin}/robots.txt`, txt))
      .catch(() => null); // no robots.txt reachable => allowed
    robotsCache.set(origin, entry);
  }
  const robots = await entry;
  return robots ? robots.isAllowed(url, USER_AGENT) !== false : true;
}

export interface Extracted {
  title?: string;
  body: string;
  author?: string;
  lang?: string;
  /** Where the text came from: the page's article, the page's structured data (JSON-LD, microdata), or only its description. */
  via: "page" | "structured" | "description";
  /** The page's own publication date, as an ISO string, when it states a usable one. */
  published?: string;
}
const WORD = /\s+/;
const MIN_JUDGED_WORDS = 12;
const GLUED_TOKEN = 28; // real words, even in Arabic, are well under this
const MAX_SENTENCE_WORDS = 90;
const CLEARLY_GLUED = 40; // one "word" this long is several words run together
const MAX_LINK_SHARE = 0.33; // article text is mostly not links; menus and footers are

/**
 * Is this running text, or site chrome (menus, footers, tag clouds) that extraction picked up?
 * Chrome shows as words glued together (links with no whitespace) or as one endless unpunctuated run.
 */
export function looksLikeProse(text: string): boolean {
  const words = text.trim().split(WORD).filter(Boolean);
  if (words.some((w) => w.length > CLEARLY_GLUED)) return false;
  if (words.length < MIN_JUDGED_WORDS) return true; // too short to judge
  const glued = words.filter((w) => w.length > GLUED_TOKEN).length;
  if (glued / words.length > 0.03) return false;
  const longestSentence = Math.max(...text.split(/[.!?؟…。]+(?:\s+|$)|\n+/).map((s) => s.trim().split(WORD).filter(Boolean).length));
  return longestSentence <= MAX_SENTENCE_WORDS;
}

function metaDescription(doc: Document): string | undefined {
  for (const sel of ['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]']) {
    const v = doc.querySelector(sel)?.getAttribute("content")?.replace(/\s+/g, " ").trim();
    if (v && v.length >= 30) return v;
  }
  return undefined;
}

/** Values of `key` anywhere in a parsed JSON-LD document (it nests under @graph, mainEntity, arrays). */
function jsonLdValues(node: unknown, key: string, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => jsonLdValues(n, key, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === key && typeof v === "string") out.push(v);
      else jsonLdValues(v, key, out);
    }
  }
  return out;
}

function jsonLd(doc: Document): unknown[] {
  const out: unknown[] = [];
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      out.push(JSON.parse(s.textContent ?? ""));
    } catch {
      // sites ship invalid JSON-LD now and then; that block is just skipped
    }
  }
  return out;
}

/** Text a page publishes about itself: JSON-LD `articleBody` and `itemprop="articleBody"` elements. */
function structuredBodies(doc: Document, blocks: unknown[]): string[] {
  const raw = [...blocks.flatMap((b) => jsonLdValues(b, "articleBody")), ...[...doc.querySelectorAll('[itemprop="articleBody"]')].map((e) => e.textContent ?? "")];
  return raw
    .map((t) => (t.includes("<") ? new JSDOM(t.replace(/</g, " <")).window.document.body.textContent ?? "" : t))
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function publishedOf(doc: Document, blocks: unknown[]): string | undefined {
  const candidates = [
    doc.querySelector('meta[property="article:published_time"]')?.getAttribute("content"),
    doc.querySelector('meta[property="og:article:published_time"]')?.getAttribute("content"),
    doc.querySelector('meta[itemprop="datePublished"]')?.getAttribute("content"),
    ...blocks.flatMap((b) => jsonLdValues(b, "datePublished")),
    doc.querySelector('article time[datetime], time[itemprop="datePublished"][datetime]')?.getAttribute("datetime"),
  ];
  const latest = Date.now() + 86_400_000; // a date days in the future is a page's mistake, not news
  for (const c of candidates) {
    const t = c ? Date.parse(c.trim()) : NaN;
    if (!Number.isNaN(t) && t <= latest) return new Date(t).toISOString();
  }
  return undefined;
}

// Structured text replaces the page's own extraction when that is unusable or clearly thinner.
const STRUCTURED_FULLER_BY = 1.3;

export function extractArticle(html: string, url: string): Extracted | null {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  const doc = dom.window.document;
  const description = metaDescription(doc);
  const blocks = jsonLd(doc);
  const published = publishedOf(doc, blocks);
  const parsed = new Readability(doc.cloneNode(true) as Document).parse();

  // Readability's textContent glues neighbouring elements together; spacing every tag keeps words apart.
  const contentDoc = parsed?.content ? new JSDOM(parsed.content.replace(/</g, " <")).window.document : null;
  const text = contentDoc
    ? contentDoc.body.textContent!.replace(/\s+/g, " ").trim()
    : "";

  const linkText = contentDoc ? [...contentDoc.querySelectorAll("a")].reduce((n, a) => n + (a.textContent ?? "").trim().length, 0) : 0;
  const usable = text.length > 0 && looksLikeProse(text) && linkText / text.length <= MAX_LINK_SHARE;
  const structured = structuredBodies(doc, blocks)
    .filter(looksLikeProse)
    .sort((a, b) => b.length - a.length)[0];

  let body: string | undefined;
  let via: Extracted["via"] = "page";
  if (structured && (!usable || structured.length > text.length * STRUCTURED_FULLER_BY)) {
    body = structured;
    via = "structured";
  } else if (usable) {
    body = text;
  } else if (description) {
    body = description;
    via = "description";
  }
  if (!body) return null;
  return {
    title: parsed?.title?.trim() || undefined,
    body,
    via,
    ...(published && { published }),
    author: parsed?.byline?.trim() || undefined,
    lang: parsed?.lang || doc.documentElement.lang || undefined,
  };
}