// Needs a running OpenSearch. Uses throwaway indices.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ARTICLES_INDEX = "articles_registry_api_test";
process.env.TOPICS_INDEX = "topics_registry_api_test";
process.env.RUNS_INDEX = "source_runs_registry_api_test";
process.env.REGISTRY_INDEX = "source_registry_api_test";
process.env.CRAWL_SOURCES_INDEX = "crawl_sources_registry_api_test";
const { mkdtempSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const overridesFile = `${mkdtempSync(`${tmpdir()}/overrides-`)}/registry-overrides.yaml`;
writeFileSync(overridesFile, "country:\n  argaam.com: SA\n");
process.env.REGISTRY_OVERRIDES_FILE = overridesFile;
const { buildApp } = await import("../src/api/app.js");
const { client, INDEX, TOPICS_INDEX, RUNS_INDEX, REGISTRY_INDEX, REGISTRY_STATE_INDEX, CRAWL_SOURCES_INDEX } = await import("../src/search/index-def.js");
const { openSearchRegistry } = await import("../src/search/registryStore.js");
const { openSearchPromotions } = await import("../src/search/promotionStore.js");

const record = (domain: string, articleCount: number, languages: string[]) => ({
  domain,
  firstSeen: "2026-10-11T08:00:00.000Z",
  lastSeen: "2026-10-11T12:00:00.000Z",
  articleCount,
  languages,
});

const drop = () =>
  client.indices.delete({ index: [INDEX, TOPICS_INDEX, RUNS_INDEX, REGISTRY_INDEX, REGISTRY_STATE_INDEX, CRAWL_SOURCES_INDEX] }, { ignore: [404] });
const app = await buildApp();

beforeAll(async () => {
  await openSearchRegistry().putMany([
    record("argaam.com", 305, ["ara"]),
    { ...record("dostor.org", 91, ["ara"]), country: "EG" }, // as seeded from Wikidata
    record("arabnews.com", 40, ["eng"]),
    record("zazoom.it", 270, ["ita"]),
  ]);
  await openSearchPromotions().save({
    domain: "argaam.com",
    status: "active",
    checkedAt: "2026-10-11T12:00:00.000Z",
    rejected: [],
    source: { name: "argaam.com", domain: "argaam.com", sourcetype: "ONLINENEWS_OTHER", lang: "ar", feeds: [{ url: "https://argaam.com/rss", kind: "rss" }] },
  });
  await openSearchPromotions().save({
    domain: "zazoom.it",
    status: "no_feed",
    checkedAt: "2026-10-10T12:00:00.000Z",
    rejected: [{ url: "https://zazoom.it/feed", reason: "items link to other sites" }],
  });
});
afterAll(async () => {
  await drop();
  await app.close();
});

const get = async (url: string) => (await app.inject({ method: "GET", url })).json();

describe("GET /registry", () => {
  it("lists known domains by volume, and filters by language using the two-letter code", async () => {
    const all = await get("/registry");
    expect(all.total).toBe(4);
    expect(all.items.map((r: { domain: string }) => r.domain)).toEqual(["argaam.com", "zazoom.it", "dostor.org", "arabnews.com"]);

    const arabic = await get("/registry?lang=ar");
    expect(arabic.total).toBe(2);
    expect(arabic.items.map((r: { domain: string }) => r.domain)).toEqual(["argaam.com", "dostor.org"]);
  });

  it("says, per domain, whether it is crawled yet: active, tried without success, or never tried", async () => {
    const all = await get("/registry");
    const byDomain = Object.fromEntries(all.items.map((r: { domain: string }) => [r.domain, r]));

    expect(byDomain["argaam.com"].crawl).toEqual({ status: "active", checkedAt: "2026-10-11T12:00:00.000Z" });
    expect(byDomain["zazoom.it"].crawl).toEqual({ status: "no_feed", checkedAt: "2026-10-10T12:00:00.000Z" });
    expect(byDomain["dostor.org"].crawl).toBeUndefined();
  });

  it("adds the outlet's country (owner override, else domain suffix) and flags known aggregators", async () => {
    const all = await get("/registry");
    const byDomain = Object.fromEntries(all.items.map((r: { domain: string }) => [r.domain, r]));

    expect(byDomain["argaam.com"]).toMatchObject({ country: "SA", aggregator: false });
    expect(byDomain["zazoom.it"]).toMatchObject({ country: "IT", aggregator: true });
    // a country recorded from a directory is used when there is no override and the suffix says nothing
    expect(byDomain["dostor.org"].country).toBe("EG");
    expect(byDomain["arabnews.com"].country).toBeUndefined();
  });

  it("can leave aggregators out, with the count following", async () => {
    const real = await get("/registry?hideAggregators=true");

    expect(real.total).toBe(3);
    expect(real.items.map((r: { domain: string }) => r.domain)).not.toContain("zazoom.it");
  });

  it("finds domains containing the text, case-insensitively and literally", async () => {
    const found = await get("/registry?q=ARAB");
    expect(found.items.map((r: { domain: string }) => r.domain)).toEqual(["arabnews.com"]);

    const wildcard = await get("/registry?q=*");
    expect(wildcard.total).toBe(0);
  });

  it("pages through the list", async () => {
    const page = await get("/registry?from=1&size=2");
    expect(page.total).toBe(4);
    expect(page.items.map((r: { domain: string }) => r.domain)).toEqual(["zazoom.it", "dostor.org"]);
  });
});
