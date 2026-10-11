import { countryFromDomain } from "./country.js";
import { discoverFeeds, type FeedCandidate } from "./feedDiscovery.js";
import { validateFeed } from "./feedValidation.js";

/** A registry domain turned into something the worker can crawl. Same shape as a `sources.yaml` entry. */
export interface PromotedSource {
  name: string;
  domain: string;
  sourcetype: string;
  country?: string;
  lang?: string;
  feeds: FeedCandidate[];
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

/**
 * Tries to make one registry domain crawlable: finds its feeds, keeps those that validate, and describes the
 * result. Never throws; an unusable domain comes back with a status explaining why.
 */
export async function promoteDomain(
  domain: string,
  fetchText: (url: string) => Promise<string>,
  options: { now?: Date; userAgent?: string; countryOf?: (domain: string) => string | undefined } = {},
): Promise<Promotion> {
  const now = options.now ?? new Date();
  const base = { domain, checkedAt: now.toISOString(), rejected: [] as Promotion["rejected"] };

  const found = await discoverFeeds(domain, fetchText, { userAgent: options.userAgent });
  if (found.blocked) return { ...base, status: "blocked" };
  if (!found.reachable) return { ...base, status: "unreachable" };

  const feeds: FeedCandidate[] = [];
  let lang: string | undefined;
  for (const candidate of found.candidates) {
    if (feeds.length >= MAX_FEEDS) break;
    const v = await validateFeed(candidate, domain, fetchText, { now });
    if (!v.ok) {
      base.rejected.push({ url: candidate.url, reason: v.reason ?? "rejected" });
      continue;
    }
    if (!feeds.some((f) => f.url === v.url)) feeds.push({ url: v.url, kind: v.kind });
    lang ??= v.lang;
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
