import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.CRAWL_SOURCES_INDEX = "crawl_sources_test";
const { client, ensureIndices, CRAWL_SOURCES_INDEX } = await import("../src/search/index-def.js");
const { openSearchPromotions } = await import("../src/search/promotionStore.js");

const promotion = (domain: string, status: "active" | "no_feed" | "unreachable" | "blocked", checkedAt = "2026-10-11T12:00:00.000Z") => ({
  domain,
  status,
  checkedAt,
  rejected: status === "no_feed" ? [{ url: `https://${domain}/rss`, reason: "too few items (1)" }] : [],
  ...(status === "active" && {
    source: {
      name: domain,
      domain,
      sourcetype: "ONLINENEWS_OTHER",
      country: "EG",
      lang: "ar",
      feeds: [{ url: `https://${domain}/feed`, kind: "rss" as const }],
    },
  }),
});

describe("openSearchPromotions (needs OpenSearch)", () => {
  const drop = () => client.indices.delete({ index: CRAWL_SOURCES_INDEX }, { ignore: [404] });
  beforeAll(async () => {
    await drop();
    await ensureIndices();
  });
  afterAll(drop);

  it("returns only active promotions as crawlable sources", async () => {
    const store = openSearchPromotions();
    await store.save(promotion("dostor.org", "active"));
    await store.save(promotion("quiet.example", "no_feed"));
    await store.save(promotion("down.example", "unreachable"));

    const sources = await store.activeSources();

    expect(sources.map((s) => s.domain)).toEqual(["dostor.org"]);
    expect(sources[0]).toMatchObject({ lang: "ar", country: "EG", feeds: [{ url: "https://dostor.org/feed", kind: "rss" }] });
  });

  it("remembers what was tried and when, so the same domain is not retried straight away", async () => {
    const store = openSearchPromotions();

    const tried = await store.attempts(["quiet.example", "never.example", "dostor.org"]);

    expect(tried.get("quiet.example")).toEqual({ status: "no_feed", checkedAt: "2026-10-11T12:00:00.000Z" });
    expect(tried.has("never.example")).toBe(false);
    expect(tried.get("dostor.org")?.status).toBe("active");
  });
});
