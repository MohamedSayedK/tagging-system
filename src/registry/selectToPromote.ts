import type { PromotionStatus } from "./promote.js";
import { regionTier } from "./region.js";

const DEFAULT_RETRY_DAYS = 7;

interface Options {
  candidates: { domain: string; articleCount: number; languages?: string[]; country?: string }[];
  /** Last attempt per domain, from the promotion store. */
  attempts: Map<string, { status: PromotionStatus; checkedAt: string }>;
  /** Domains already covered by sources.yaml. */
  curatedDomains: Set<string>;
  now: Date;
  limit: number;
  /** Aggregators republish other outlets' stories; they are not worth a source of their own. */
  isAggregator?: (domain: string) => boolean;
  /** Is this domain within what the crawler is for? Out-of-scope domains are never tried. */
  inScope?: (domain: string, languages: string[] | undefined, country: string | undefined) => boolean;
  /** How long after a failed attempt a domain is tried again. Default 7 days. */
  retryAfterDays?: number;
}

const bare = (d: string) => d.toLowerCase().replace(/^www\./, "");

/**
 * Which registry domains to try next: regional (MENA) ones first, busiest first within each group, skipping
 * configured ones, active promotions, and failures from the last week.
 */
export function selectToPromote({ candidates, attempts, curatedDomains, now, limit, isAggregator, inScope, retryAfterDays = DEFAULT_RETRY_DAYS }: Options): string[] {
  const retryAfterMs = retryAfterDays * 86_400_000;
  const curated = new Set([...curatedDomains].map(bare));
  return [...candidates]
    .filter((c) => {
      if (curated.has(bare(c.domain))) return false;
      if (isAggregator?.(c.domain)) return false;
      if (inScope && !inScope(c.domain, c.languages, c.country)) return false;
      const attempt = attempts.get(c.domain);
      if (!attempt) return true;
      if (attempt.status === "active") return false;
      return now.getTime() - Date.parse(attempt.checkedAt) >= retryAfterMs;
    })
    .sort(
      (a, b) =>
        regionTier(a.domain, a.languages, a.country) - regionTier(b.domain, b.languages, b.country) ||
        b.articleCount - a.articleCount ||
        a.domain.localeCompare(b.domain),
    )
    .slice(0, limit)
    .map((c) => c.domain);
}
