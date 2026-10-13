import { promoteDomain, type Promotion, type PromotionStatus } from "./promote.js";
import { selectToPromote } from "./selectToPromote.js";

export interface PromoteBatchOptions {
  /** Registry domains to choose from, busiest first. */
  pool: () => Promise<{ domain: string; articleCount: number; languages?: string[]; country?: string }[]>;
  /** Last attempt per domain (see the promotion store). */
  attempts: (domains: string[]) => Promise<Map<string, { status: PromotionStatus; checkedAt: string }>>;
  save: (p: Promotion) => Promise<void>;
  /** Domains already covered by sources.yaml. */
  curatedDomains: Set<string>;
  fetchText: (url: string) => Promise<string>;
  now: Date;
  limit: number;
  concurrency: number;
  onResult?: (p: Promotion) => void;
  isAggregator?: (domain: string) => boolean;
  inScope?: (domain: string, languages: string[] | undefined, country: string | undefined) => boolean;
  countryOf?: (domain: string) => string | undefined;
  retryAfterDays?: number;
}

export interface PromoteBatchResult {
  tried: number;
  tally: Partial<Record<PromotionStatus, number>>;
  /** Domains whose outcome could not be stored or checked at all. */
  failed: number;
}

/** Picks the next registry domains to try (MENA first), checks each, and stores every outcome. */
export async function promoteBatch(o: PromoteBatchOptions): Promise<PromoteBatchResult> {
  const pool = await o.pool();
  const picked = selectToPromote({
    candidates: pool,
    attempts: await o.attempts(pool.map((p) => p.domain)),
    curatedDomains: o.curatedDomains,
    now: o.now,
    limit: o.limit,
    isAggregator: o.isAggregator,
    inScope: o.inScope,
    retryAfterDays: o.retryAfterDays,
  });

  const result: PromoteBatchResult = { tried: 0, tally: {}, failed: 0 };
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(o.concurrency, picked.length) }, async () => {
      while (next < picked.length) {
        const domain = picked[next++]!;
        result.tried++;
        try {
          const promotion = await promoteDomain(domain, o.fetchText, { now: o.now, countryOf: o.countryOf });
          await o.save(promotion);
          result.tally[promotion.status] = (result.tally[promotion.status] ?? 0) + 1;
          o.onResult?.(promotion);
        } catch {
          result.failed++;
        }
      }
    }),
  );
  return result;
}
