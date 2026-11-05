import { countryFromDomain } from "./country.js";
import { discoverFeeds, type FeedCandidate } from "./feedDiscovery.js";
import { validateFeed } from "./feedValidation.js";
import { parseHeadlines } from "../ingest/headlines.js";
import { detectLanguage } from "./language.js";

/** A registry domain turned into something the worker can crawl. Same shape as a `sources.yaml` entry. */
export interface PromotedSource {
  name: string;
  domain: string;
  sourcetype: string;
  country?: string;
  lang?: string;
  feeds: { url: string; kind: FeedCandidate["kind"] | "html" }[];
}

export type PromotionStatus = "active" | "no_feed" | "unreachable" | "blocked";

export interface Promotion {
  domain: string;
  status: PromotionStatus;
  checkedAt: string;
  source?: PromotedSource;
  /** Candidate feeds that did not validate, with the reason. */
  rejected: { url: string; reason: string }[];
}

const MAX_FEEDS = 3;
/** Fewer article links than this on a front page is a menu, not a stream of news. */
const MIN_HEADLINES = 5;

/** A front page whose article links can stand in for a feed, as a source feed; undefined when it has too few. */
async function headlinesFeed(domain: string, fetchText: (url: string) => Promise<string>) {
  for (const host of domain.startsWith("www.") ? [domain] : [domain, `www.${domain}`]) {
    const url = `https://${host}/`;
    const html = await fetchText(url).catch(() => null);
    if (html === null) continue;
    const found = parseHeadlines(html, url);
    if (found.length < MIN_HEADLINES) return undefined;
    return { feed: { url, kind: "html" as const }, lang: detectLanguage(found.map((h) => h.title ?? "").filter(Boolean)) };
  }
}

/**
 * Tries to make one registry domain crawlable: finds its feeds, keeps those that validate, and describes the
 * result. Never throws; an unusable domain comes back with a status explaining why.
 */
export async function promoteDomain(
  domain: string,
  fetchText: (url: string) => Promise<string>,
  options: {
    now?: Date;
    userAgent?: string;
    countryOf?: (domain: string) => string | undefined;
    /** Thresholds `validateFeed` applies; the defaults suit registry domains nobody chose. */
    validation?: { minItems?: number; maxAgeDays?: number };
    /** With no feed, fall back to the headlines on the front page. Off for registry domains nobody chose. */
    headlines?: boolean;
  } = {},
): Promise<Promotion> {
  const now = options.now ?? new Date();
  const base = { domain, checkedAt: now.toISOString(), rejected: [] as Promotion["rejected"] };

  const found = await discoverFeeds(domain, fetchText, { userAgent: options.userAgent });
  if (found.blocked) return { ...base, status: "blocked" };
  if (!found.reachable) return { ...base, status: "unreachable" };

  const feeds: PromotedSource["feeds"] = [];
  let lang: string | undefined;
  for (const candidate of found.candidates) {
    if (feeds.length >= MAX_FEEDS) break;
    const v = await validateFeed(candidate, domain, fetchText, { now, ...options.validation });
    if (!v.ok) {
      base.rejected.push({ url: candidate.url, reason: v.reason ?? "rejected" });
      continue;
    }
    if (!feeds.some((f) => f.url === v.url)) feeds.push({ url: v.url, kind: v.kind });
    lang ??= v.lang;
  }
  if (feeds.length === 0 && options.headlines) {
    const page = await headlinesFeed(domain, fetchText);
    if (page) {
      feeds.push(page.feed);
      lang ??= page.lang;
    }
  }
  if (feeds.length === 0) return { ...base, status: "no_feed" };

  const country = (options.countryOf ?? countryFromDomain)(domain);
  return {
    ...base,
    status: "active",
    source: {
      name: domain,
      domain,
      sourcetype: "ONLINENEWS_OTHER",
      ...(country && { country }),
      ...(lang && { lang }),
      feeds,
    },
  };
}
