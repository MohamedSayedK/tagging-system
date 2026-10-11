import { describe, expect, it } from "vitest";
import type { Promotion } from "../src/registry/promote.js";
import { promoteBatch } from "../src/registry/promoteBatch.js";

const NOW = new Date("2026-10-11T12:00:00Z");
const rss = (domain: string) =>
  `<?xml version="1.0"?><rss version="2.0"><channel>${Array.from({ length: 5 }, (_, i) => {
    const t = new Date(NOW.getTime() - (i + 1) * 3_600_000).toUTCString();
    return `<item><title>Economy headline number ${i} for readers today</title><link>https://${domain}/n/${i}</link><pubDate>${t}</pubDate></item>`;
  }).join("")}</channel></rss>`;

/** Sites: "good.com" has a feed, "nofeed.com" is a page without one, others are unreachable. */
const fetchText = async (url: string) => {
  const { hostname, pathname } = new URL(url);
  if (hostname === "good.com" && pathname === "/") return `<link rel="alternate" type="application/rss+xml" href="/rss">`;
  if (hostname === "good.com" && pathname === "/rss") return rss("good.com");
  if (hostname === "good.com" && pathname === "/robots.txt") return "";
  if (hostname === "nofeed.com") return pathname === "/" || pathname === "/robots.txt" ? "<html></html>" : Promise.reject(new Error("HTTP 404"));
  throw new Error("unreachable");
};

describe("promoteBatch", () => {
  it("tries the chosen domains, stores every outcome and reports the tally", async () => {
    const saved: Promotion[] = [];

    const result = await promoteBatch({
      pool: async () => [
        { domain: "good.com", articleCount: 50, languages: ["eng"] },
        { domain: "nofeed.com", articleCount: 40, languages: ["eng"] },
        { domain: "down.com", articleCount: 30, languages: ["eng"] },
      ],
      attempts: async () => new Map(),
      save: async (p) => void saved.push(p),
      curatedDomains: new Set(),
      fetchText,
      now: NOW,
      limit: 10,
      concurrency: 2,
    });

    expect(result.tried).toBe(3);
    expect(result.tally).toEqual({ active: 1, no_feed: 1, unreachable: 1 });
    expect(saved.find((p) => p.domain === "good.com")?.source?.feeds).toEqual([{ url: "https://good.com/rss", kind: "rss" }]);
  });

  it("stops at the limit and leaves configured and already-promoted domains alone", async () => {
    const saved: string[] = [];

    const result = await promoteBatch({
      pool: async () => [
        { domain: "good.com", articleCount: 90, languages: ["eng"] },
        { domain: "configured.com", articleCount: 80, languages: ["eng"] },
        { domain: "done.com", articleCount: 70, languages: ["eng"] },
        { domain: "nofeed.com", articleCount: 60, languages: ["eng"] },
        { domain: "down.com", articleCount: 50, languages: ["eng"] },
      ],
      attempts: async () => new Map([["done.com", { status: "active" as const, checkedAt: NOW.toISOString() }]]),
      save: async (p) => void saved.push(p.domain),
      curatedDomains: new Set(["configured.com"]),
      fetchText,
      now: NOW,
      limit: 2,
      concurrency: 1,
    });

    expect(saved).toEqual(["good.com", "nofeed.com"]);
    expect(result.tried).toBe(2);
  });

  it("keeps going when one domain's check throws unexpectedly", async () => {
    const saved: string[] = [];
    let first = true;

    const result = await promoteBatch({
      pool: async () => [
        { domain: "good.com", articleCount: 90, languages: ["eng"] },
        { domain: "nofeed.com", articleCount: 80, languages: ["eng"] },
      ],
      attempts: async () => new Map(),
      save: async (p) => {
        if (first) {
          first = false;
          throw new Error("store unavailable");
        }
        saved.push(p.domain);
      },
      curatedDomains: new Set(),
      fetchText,
      now: NOW,
      limit: 5,
      concurrency: 1,
    });

    expect(saved).toEqual(["nofeed.com"]);
    expect(result.failed).toBe(1);
  });
});
