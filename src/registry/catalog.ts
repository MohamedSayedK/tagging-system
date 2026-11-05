import type { PromotionStatus } from "./promote.js";

/** One outlet from the business source list, kept exactly as given plus the domain it lives on. See ADR 0001. */
export interface CatalogEntry {
  /** The business's own stable ID (`OUT-00001`). */
  id: string;
  /** Homepage host without `www.`, lower case. Several entries can share one (sections of one site). */
  domain: string;
  /** Every field of the record as it was in the file. */
  record: Record<string, unknown>;
  /** Our own last check of the record; absent until it is verified. */
  verification?: CatalogVerification;
}

export interface CatalogVerification {
  /** The promotion outcome for the record's domain. */
  status: PromotionStatus;
  checkedAt: string;
  /** Whether the homepage names itself like the record does. Evidence only, not a confirmed identity. */
  identity?: "name_matches" | "name_not_found" | "no_page";
  /** The name the homepage gives itself (`og:site_name`, else `<title>`). */
  siteName?: string;
  /** Why no feed was taken, when none was. */
  reason?: string;
}

export interface ParsedCatalog {
  entries: CatalogEntry[];
  /** Records that could not be taken, with the reason; never silently dropped. */
  rejected: { index: number; id?: string; reason: string }[];
  /** `summary.total_sources` from the file, when it states one. */
  declaredTotal?: number;
}

/** Reads the business data file (`{ summary, sources: [...] }`). */
export function parseCatalog(text: string): ParsedCatalog {
  const doc = JSON.parse(text) as { summary?: { total_sources?: unknown }; sources?: unknown };
  if (!Array.isArray(doc.sources)) throw new Error("catalog file has no `sources` array");
  const total = doc.summary?.total_sources;
  const out: ParsedCatalog = { entries: [], rejected: [], ...(typeof total === "number" && { declaredTotal: total }) };
  const seen = new Set<string>();
  doc.sources.forEach((raw, index) => {
    const record = raw as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : undefined;
    const domain = typeof record.homepage_url === "string" ? hostOf(record.homepage_url) : undefined;
    if (!id) return void out.rejected.push({ index, reason: "no id" });
    if (seen.has(id)) return void out.rejected.push({ index, id, reason: "duplicate id" });
    if (!domain) return void out.rejected.push({ index, id, reason: `homepage_url is not a URL: ${JSON.stringify(record.homepage_url)}` });
    seen.add(id);
    out.entries.push({ id, domain, record });
  });
  return out;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// The owner treats every business record as one to verify, whatever its `crawl_handling`, except those
// quarantined (wrong publisher) or archive-only (ADR 0002). Those stay in the catalog and are never fetched.
const NEVER_CRAWLED = /^(quarantine|archive)/;

export const isCrawlable = (e: CatalogEntry) => !NEVER_CRAWLED.test(String(e.record.crawl_handling ?? ""));

/**
 * Catalog domains by what the business allows: `crawlable` when at least one of its records may be crawled,
 * `held` when none may (quarantined, archive only). Both bypass the region rule; see ADR 0001 and 0002.
 */
export function catalogDomains(entries: CatalogEntry[]): { crawlable: Set<string>; held: Set<string> } {
  const crawlable = new Set(entries.filter(isCrawlable).map((e) => e.domain));
  const held = new Set(entries.map((e) => e.domain).filter((d) => !crawlable.has(d)));
  return { crawlable, held };
}

export interface ImportCheck {
  /** `summary.total_sources` in the file, else the number of records in it. */
  declared: number;
  parsed: number;
  stored: number;
  rejected: ParsedCatalog["rejected"];
  /** Parsed records that are not in the store after the import. */
  missing: string[];
  /** Records per `identity_verification` value, as the business recorded it. */
  byIdentity: Record<string, number>;
  ok: boolean;
}

/** Whether every record the file declares made it into the store (`storedIds`: the IDs read back after writing). */
export function importCheck(parsed: ParsedCatalog, storedIds: Set<string>): ImportCheck {
  const declared = parsed.declaredTotal ?? parsed.entries.length + parsed.rejected.length;
  const missing = parsed.entries.map((e) => e.id).filter((id) => !storedIds.has(id));
  const byIdentity: Record<string, number> = {};
  for (const e of parsed.entries) {
    const k = String(e.record.identity_verification);
    byIdentity[k] = (byIdentity[k] ?? 0) + 1;
  }
  const stored = parsed.entries.length - missing.length;
  return {
    declared,
    parsed: parsed.entries.length,
    stored,
    rejected: parsed.rejected,
    missing,
    byIdentity,
    ok: parsed.rejected.length === 0 && missing.length === 0 && stored === declared,
  };
}

export interface ReportRow {
  id: string;
  name: string;
  country: string;
  priority: string;
  homepage_url: string;
  domain: string;
  crawl_handling: string;
  identity_verification: string;
  /** Where the record stands in our crawl, in words. */
  state: string;
  checked_at: string;
  status: string;
  identity_evidence: string;
  site_name: string;
  reason: string;
}

/**
 * One row per catalog record for business: their fields, then what we found. `crawledDomains` are the domains
 * with an active, in-scope promoted source.
 */
export function catalogReport(
  entries: CatalogEntry[],
  { curatedDomains, crawledDomains }: { curatedDomains: Set<string>; crawledDomains: Set<string> },
): ReportRow[] {
  const field = (e: CatalogEntry, k: string) => (e.record[k] == null ? "" : String(e.record[k]));
  return entries.map((e) => {
    const v = e.verification;
    let state: string;
    if (curatedDomains.has(e.domain)) state = "crawled (curated source)";
    else if (!isCrawlable(e)) state = `held by business rule: ${field(e, "crawl_handling")}`;
    else if (crawledDomains.has(e.domain)) state = "crawled";
    else if (v) state = `not crawled: ${v.status}`;
    else state = "waiting for verification";
    return {
      id: e.id,
      name: field(e, "name"),
      country: field(e, "country"),
      priority: field(e, "priority"),
      homepage_url: field(e, "homepage_url"),
      domain: e.domain,
      crawl_handling: field(e, "crawl_handling"),
      identity_verification: field(e, "identity_verification"),
      state,
      checked_at: v?.checkedAt ?? "",
      status: v?.status ?? "",
      identity_evidence: v?.identity ?? "",
      site_name: v?.siteName ?? "",
      reason: v?.reason ?? "",
    };
  });
}

/** RFC 4180 CSV with a header row from the first row's keys. */
export function toCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return "";
  const cell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const keys = Object.keys(rows[0]!);
  return [keys, ...rows.map((r) => keys.map((k) => r[k] ?? ""))].map((line) => line.map(cell).join(",")).join("\n") + "\n";
}
