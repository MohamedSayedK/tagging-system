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

async function fetchOnce(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5" },
    signal: AbortSignal.timeout(TIMEOUT),
    redirect: "follow",
  });
  if (!res.ok) throw new HttpStatusError(res.status, url);
  return res.text();
}

export function fetchText(url: string): Promise<string> {
  return limiter.run(new URL(url).hostname, async () => {
    // The retry stays inside the site's slot, so politeness is kept.
    try {
      return await fetchOnce(url);
    } catch (first) {
      const worthRetrying = first instanceof HttpStatusError ? RETRYABLE_STATUS.has(first.status) : true;
      if (!worthRetrying) throw first;
      if (RETRY_DELAY_MS > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      try {
        return await fetchOnce(url);
      } catch (second) {
        throw explain(second);
      }
    }
  });
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

export interface Extracted { title?: string; body: string; author?: string; lang?: string }

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

export function extractArticle(html: string, url: string): Extracted | null {
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  const doc = dom.window.document;
  const description = metaDescription(doc);
  const parsed = new Readability(doc.cloneNode(true) as Document).parse();

  // Readability's textContent glues neighbouring elements together; spacing every tag keeps words apart.
  const contentDoc = parsed?.content ? new JSDOM(parsed.content.replace(/</g, " <")).window.document : null;
  const text = contentDoc
    ? contentDoc.body.textContent!.replace(/\s+/g, " ").trim()
    : "";

  const linkText = contentDoc ? [...contentDoc.querySelectorAll("a")].reduce((n, a) => n + (a.textContent ?? "").trim().length, 0) : 0;
  const usable = text.length > 0 && looksLikeProse(text) && linkText / text.length <= MAX_LINK_SHARE;
  const body = usable ? text : description;
  if (!body) return null;
  return {
    title: parsed?.title?.trim() || undefined,
    body,
    author: parsed?.byline?.trim() || undefined,
    lang: parsed?.lang || doc.documentElement.lang || undefined,
  };
}