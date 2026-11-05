import { countryCode } from "../query/compile.js";
import { isCrawlable, type CatalogEntry, type CatalogVerification } from "./catalog.js";
import { decodeEntities } from "../ingest/headlines.js";
import { promoteDomain, type Promotion, type PromotionStatus } from "./promote.js";

const DEFAULT_RETRY_DAYS = 7;
/** The owner chose these sites, so a thin or slow feed is still worth reading for headlines. */
const CATALOG_FEED_VALIDATION = { minItems: 1, maxAgeDays: 180 };

export interface VerifyCatalogOptions {
  entries: CatalogEntry[];
  /** Domains already covered by sources.yaml; they are crawled already and not checked again. */
  curatedDomains: Set<string>;
  fetchText: (url: string) => Promise<string>;
  now: Date;
  /** Most domains checked in one run. */
  limit: number;
  concurrency: number;
  saveVerification: (id: string, v: CatalogVerification) => Promise<void>;
  /** Stores the promotion like registry promotion does, so a working feed becomes a crawl source. */
  savePromotion: (p: Promotion) => Promise<void>;
  onResult?: (domain: string, v: CatalogVerification) => void;
  /** How long after a failed check a record is checked again. Default 7 days. */
  retryAfterDays?: number;
}

export interface VerifyCatalogResult {
  tried: number;
  tally: Partial<Record<PromotionStatus, number>>;
  failed: number;
}

/**
 * Checks the next crawlable catalog records (ADR 0001), one check per domain shared by all its records:
 * robots.txt, homepage and feeds through `promoteDomain`, plus the name the homepage gives itself. Held,
 * quarantined and archive records are never fetched. Bounded by `limit` and `concurrency`; never throws.
 */
export async function verifyCatalog(o: VerifyCatalogOptions): Promise<VerifyCatalogResult> {
  const retryAfterMs = (o.retryAfterDays ?? DEFAULT_RETRY_DAYS) * 86_400_000;
  const due = (e: CatalogEntry) =>
    !e.verification || (e.verification.status !== "active" && o.now.getTime() - Date.parse(e.verification.checkedAt) >= retryAfterMs);

  const byDomain = new Map<string, CatalogEntry[]>();
  for (const e of [...o.entries].sort(byPriority)) {
    if (!isCrawlable(e) || !due(e) || o.curatedDomains.has(e.domain)) continue;
    byDomain.set(e.domain, [...(byDomain.get(e.domain) ?? []), e]);
  }
  const picked = [...byDomain.entries()].slice(0, o.limit);

  const result: VerifyCatalogResult = { tried: 0, tally: {}, failed: 0 };
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(o.concurrency, picked.length) }, async () => {
      while (next < picked.length) {
        const [domain, records] = picked[next++]!;
        result.tried++;
        try {
          const v = await verifyDomain(domain, records[0]!, o);
          for (const r of records) await o.saveVerification(r.id, v);
          result.tally[v.status] = (result.tally[v.status] ?? 0) + 1;
          o.onResult?.(domain, v);
        } catch {
          result.failed++;
        }
      }
    }),
  );
  return result;
}

async function verifyDomain(domain: string, lead: CatalogEntry, o: VerifyCatalogOptions): Promise<CatalogVerification> {
  // The homepage is fetched by feed discovery anyway; keep it for the identity check instead of fetching twice.
  let home: string | undefined;
  const fetchText = async (url: string) => {
    const text = await o.fetchText(url);
    if (home === undefined && new URL(url).pathname === "/") home = text;
    return text;
  };
  const name = String(lead.record.name ?? domain);
  const country = countryOf(lead.record.country);
  const promotion = await promoteDomain(domain, fetchText, { now: o.now, countryOf: () => country, validation: CATALOG_FEED_VALIDATION, headlines: true });
  if (promotion.source) promotion.source.name = name;
  await o.savePromotion(promotion);

  const siteName = home === undefined ? undefined : siteNameOf(home);
  return {
    status: promotion.status,
    checkedAt: promotion.checkedAt,
    identity: home === undefined ? "no_page" : siteName && sameName(siteName, name) ? "name_matches" : "name_not_found",
    ...(siteName && { siteName }),
    ...(promotion.status !== "active" && promotion.rejected[0] && { reason: promotion.rejected[0].reason }),
  };
}

const PRIORITY_ORDER = (e: CatalogEntry) => (e.record.priority === "P1" ? 0 : e.record.priority === "P2" ? 1 : 2);
const byPriority = (a: CatalogEntry, b: CatalogEntry) => PRIORITY_ORDER(a) - PRIORITY_ORDER(b) || a.id.localeCompare(b.id);

/** The business records English country names ("Egypt"); "Global" and unknown names give no country. */
function countryOf(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return countryCode(value).toUpperCase();
  } catch {
    return undefined;
  }
}

const META = /<meta\b[^>]*property\s*=\s*["']og:site_name["'][^>]*>/i;
const CONTENT = /content\s*=\s*["']([^"']*)["']/i;
const TITLE = /<title[^>]*>([^<]*)<\/title>/i;

/** What a page calls its site: `og:site_name`, else the `<title>`. */
function siteNameOf(html: string): string | undefined {
  const meta = html.match(META)?.[0].match(CONTENT)?.[1] ?? html.match(TITLE)?.[1];
  const name = meta && decodeEntities(meta).replace(/\s+/g, " ").trim();
  return name || undefined;
}

const words = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && w !== "the");

/** Loose: every significant word of the shorter name appears in the other. */
function sameName(a: string, b: string): boolean {
  const [short, long] = [words(a), words(b)].sort((x, y) => x.length - y.length);
  if (short!.length === 0) return false;
  const pool = new Set(long);
  return short!.every((w) => pool.has(w));
}
