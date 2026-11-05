import { describe, expect, it } from "vitest";
import type { CatalogEntry, CatalogVerification } from "../src/registry/catalog.js";
import { verifyCatalog } from "../src/registry/catalogVerify.js";
import type { Promotion } from "../src/registry/promote.js";

const NOW = new Date("2026-10-25T12:00:00Z");
const rss = (domain: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel>${Array.from({ length: 5 }, (_, i) => {
    const t = new Date(NOW.getTime() - (i + 1) * 3_600_000).toUTCString();
    return `<item><title>Economy headline number ${i} for readers today</title><link>https://${domain}/n/${i}</link><pubDate>${t}</pubDate></item>`;
  }).join("")}</channel></rss>`;

/** good.com: "Good Daily" with a feed. other.com: names itself "Something Else", has a feed. nofeed.com: no feed. */
const fetched: string[] = [];
const fetchText = async (url: string) => {
  fetched.push(url);
  const { hostname, pathname } = new URL(url);
  const site = (name: string) =>
    `<html><head><meta property="og:site_name" content="${name}"><link rel="alternate" type="application/rss+xml" href="/rss"></head></html>`;
  if (pathname === "/robots.txt" && ["good.com", "other.com"].includes(hostname)) return "";
  if (hostname === "good.com" && pathname === "/") return site("Good Daily");
  if (hostname === "other.com" && pathname === "/") return site("Something Else");
  if (hostname === "amp.com" && pathname === "/") return site("Salt &amp; Pepper &#8211; News&#x21;");
  if (hostname === "amp.com" && pathname === "/robots.txt") return "";
  if (["good.com", "other.com"].includes(hostname) && pathname === "/rss") return rss(hostname);
  if (hostname === "nofeed.com") return pathname === "/" || pathname === "/robots.txt" ? "<html><title>No Feed News</title></html>" : Promise.reject(new Error("HTTP 404"));
  throw new Error("unreachable");
};

const entry = (id: string, domain: string, name: string, crawl_handling = "candidate_verify_first", priority = "P1"): CatalogEntry => ({
  id,
  domain,
  record: { id, name, homepage_url: `https://${domain}`, crawl_handling, priority, country: "Egypt" },
});

function run(entries: CatalogEntry[], over: Partial<Parameters<typeof verifyCatalog>[0]> = {}) {
  const verified = new Map<string, CatalogVerification>();
  const promotions: Promotion[] = [];
  const result = verifyCatalog({
    entries,
    curatedDomains: new Set(),
    fetchText,
    now: NOW,
    limit: 100,
    concurrency: 2,
    saveVerification: async (id, v) => void verified.set(id, v),
    savePromotion: async (p) => void promotions.push(p),
    ...over,
  });
  return result.then((r) => ({ result: r, verified, promotions }));
}

describe("verifyCatalog", () => {
  it("checks each crawlable record's site, stores the outcome on the record and makes a source of a working feed", async () => {
    const { result, verified, promotions } = await run([
      entry("A", "good.com", "Good Daily"),
      entry("B", "nofeed.com", "No Feed News"),
      entry("C", "down.com", "Down Times"),
    ]);

    expect(result.tally).toEqual({ active: 1, no_feed: 1, unreachable: 1 });
    expect(verified.get("A")).toMatchObject({ status: "active", checkedAt: NOW.toISOString(), identity: "name_matches", siteName: "Good Daily" });
    expect(verified.get("B")).toMatchObject({ status: "no_feed" });
    expect(verified.get("C")).toMatchObject({ status: "unreachable", identity: "no_page" });
    const good = promotions.find((p) => p.domain === "good.com");
    expect(good?.source).toMatchObject({ name: "Good Daily", country: "EG", feeds: [{ url: "https://good.com/rss", kind: "rss" }] });
  });

  it("makes a source of a business site whose feed is thin or slow, since the owner chose the site", async () => {
    const twoMonthsAgo = new Date(NOW.getTime() - 60 * 86_400_000).toUTCString();
    const thin = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>The only headline we published</title><link>https://thin.com/n/1</link><pubDate>${twoMonthsAgo}</pubDate></item></channel></rss>`;
    const thinSite = async (url: string) => {
      const { pathname } = new URL(url);
      if (pathname === "/robots.txt") return "";
      if (pathname === "/") return `<html><head><link rel="alternate" type="application/rss+xml" href="/rss"></head></html>`;
      if (pathname === "/rss") return thin;
      throw new Error("HTTP 404");
    };

    const { result, promotions } = await run([entry("T", "thin.com", "Thin News")], { fetchText: thinSite });

    expect(result.tally).toEqual({ active: 1 });
    expect(promotions[0]?.source?.feeds).toEqual([{ url: "https://thin.com/rss", kind: "rss" }]);
  });

  it("falls back to the front page headlines for a business site that publishes no feed", async () => {
    const front = Array.from({ length: 6 }, (_, i) => `<a href="/news/2026/10/story-number-${i}-about-the-economy">Economy story number ${i} grips the nation today</a>`).join("");
    const noFeedSite = async (url: string) => {
      const { pathname } = new URL(url);
      if (pathname === "/robots.txt") return "";
      if (pathname === "/") return `<html><body>${front}</body></html>`;
      throw new Error("HTTP 404");
    };

    const { result, promotions } = await run([entry("H", "headlines.com", "Headlines Daily")], { fetchText: noFeedSite });

    expect(result.tally).toEqual({ active: 1 });
    expect(promotions[0]?.source?.feeds).toEqual([{ url: "https://headlines.com/", kind: "html" }]);
  });

  it("does not take a front page with only a couple of article links for a source", async () => {
    const front = `<a href="/news/2026/10/one-story-about-the-economy">One story about the economy today</a>`;
    const sparse = async (url: string) => {
      const { pathname } = new URL(url);
      if (pathname === "/robots.txt") return "";
      if (pathname === "/") return `<html><body>${front}</body></html>`;
      throw new Error("HTTP 404");
    };

    const { result } = await run([entry("S", "sparse.com", "Sparse News")], { fetchText: sparse });

    expect(result.tally).toEqual({ no_feed: 1 });
  });

  it("never fetches records quarantined or archive-only", async () => {
    fetched.length = 0;
    const { result, verified } = await run([
      entry("A", "good.com", "Good Daily", "archive_only_do_not_crawl"),
      entry("Q", "other.com", "Something Else", "quarantine_do_not_crawl"),
    ]);

    expect(result.tried).toBe(0);
    expect(fetched).toEqual([]);
    expect(verified.size).toBe(0);
  });

  it("checks a domain shared by several records once and gives every record the outcome", async () => {
    fetched.length = 0;
    const { result, verified } = await run([entry("A", "good.com", "Good Daily"), entry("B", "good.com", "Good Daily Sport")]);

    expect(result.tried).toBe(1);
    expect(fetched.filter((u) => u === "https://good.com/")).toHaveLength(1);
    expect(verified.get("B")?.status).toBe("active");
  });

  it("records a homepage that names another publisher as evidence, without refusing the feed", async () => {
    const { verified } = await run([entry("A", "other.com", "Cairo Morning Post")]);

    expect(verified.get("A")).toMatchObject({ status: "active", identity: "name_not_found", siteName: "Something Else" });
  });

  it("takes P1 records first, stops at the limit and leaves curated domains alone", async () => {
    const { verified } = await run(
      [entry("A", "nofeed.com", "No Feed News", undefined, "P2"), entry("B", "good.com", "Good Daily", undefined, "P1"), entry("C", "other.com", "Something Else")],
      { limit: 1, curatedDomains: new Set(["other.com"]) },
    );

    expect([...verified.keys()]).toEqual(["B"]);
  });

  it("skips records checked recently or already active, and retries a failure once a week has passed", async () => {
    const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
    const withCheck = (e: CatalogEntry, status: CatalogVerification["status"], days: number): CatalogEntry => ({ ...e, verification: { status, checkedAt: at(days) } });

    const { verified } = await run([
      withCheck(entry("A", "good.com", "Good Daily"), "active", 30),
      withCheck(entry("B", "nofeed.com", "No Feed News"), "no_feed", 2),
      withCheck(entry("C", "down.com", "Down Times"), "unreachable", 8),
    ]);

    expect([...verified.keys()]).toEqual(["C"]);
  });

  it("keeps going when storing one outcome fails", async () => {
    let first = true;
    const saved: string[] = [];
    const { result } = await run([entry("A", "good.com", "Good Daily"), entry("B", "nofeed.com", "No Feed News")], {
      concurrency: 1,
      saveVerification: async (id) => {
        if (first) {
          first = false;
          throw new Error("store down");
        }
        saved.push(id);
      },
    });

    expect(result).toMatchObject({ tried: 2, failed: 1 });
    expect(saved).toEqual(["B"]);
  });

  it("reads the site name as text, with HTML entities decoded", async () => {
    const { verified } = await run([entry("A", "amp.com", "Salt & Pepper")]);

    expect(verified.get("A")).toMatchObject({ siteName: "Salt & Pepper – News!", identity: "name_matches" });
  });

  it("checks records the business had on hold like any other (owner, 2026-10-26)", async () => {
    const { verified } = await run([entry("H", "good.com", "Good Daily", "hold_check_access_policies")]);

    expect(verified.get("H")?.status).toBe("active");
  });
});
