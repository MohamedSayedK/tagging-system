import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";
import { createRequire } from "node:module";

const robotsParser = createRequire(import.meta.url)("robots-parser") as (url: string, txt: string) => { isAllowed(url: string, ua?: string): boolean | undefined };

export const USER_AGENT = process.env.USER_AGENT ?? "TaggingBot/0.1 (+set-USER_AGENT-with-contact-url)";
const TIMEOUT = 15_000;

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5" },
    signal: AbortSignal.timeout(TIMEOUT),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
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