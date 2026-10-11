// Needs a running OpenSearch. Uses a throwaway index.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ARTICLES_INDEX = "articles_facets_test";
const { client, ensureIndices, INDEX } = await import("../src/search/index-def.js");
const { search, facetValues } = await import("../src/search/search.js");

// 25 domains: d01.com has 25 docs, d02.com 24, ... d25.com 1 (so counts rank them), plus a few other facets.
const domains = Array.from({ length: 25 }, (_, i) => `d${String(i + 1).padStart(2, "0")}.com`);
const docs = domains.flatMap((domain, i) =>
  Array.from({ length: 25 - i }, (_, n) => ({
    title: "facetword story",
    body: "facetword",
    domain,
    sourcetype: i % 2 === 0 ? "blog" : "onlinenews_newspaper",
    sourcecountry: "us",
    lang: "en",
    published: `2026-10-${String((n % 9) + 1).padStart(2, "0")}T10:00:00Z`,
  })),
);

beforeAll(async () => {
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
  await ensureIndices();
  await client.bulk({ refresh: true, body: docs.flatMap((d) => [{ index: { _index: INDEX } }, d]) });
});
afterAll(async () => {
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
});

const keys = (b: { key: string }[]) => b.map((x) => x.key);

describe("facetValues: every value of one facet, beyond the top 20 in /search", () => {
  it("/search only carries the 20 most frequent values", async () => {
    const r = await search({ query: "facetword" });
    expect(r.aggregations.domains).toHaveLength(20);
  });

  it("returns all values with counts, most frequent first", async () => {
    const r = await facetValues({ query: "facetword", facet: "domain", size: 100 });
    expect(r).toHaveLength(25);
    expect(r[0]).toEqual({ key: "d01.com", count: 25 });
    expect(r[24]).toEqual({ key: "d25.com", count: 1 });
  });

  it("finds values containing the text, case-insensitively, even if they are rare", async () => {
    expect(keys(await facetValues({ query: "facetword", facet: "domain", q: "D25" }))).toEqual(["d25.com"]);
    expect(keys(await facetValues({ query: "facetword", facet: "domain", q: ".COM", size: 3 }))).toEqual(["d01.com", "d02.com", "d03.com"]);
  });

  it("treats the search text literally, not as a pattern", async () => {
    expect(await facetValues({ query: "facetword", facet: "domain", q: "d.*" })).toEqual([]);
    expect(await facetValues({ query: "facetword", facet: "domain", q: "[" })).toEqual([]);
  });

  it("counts under the other facets' filters but not its own", async () => {
    const r = await facetValues({ query: "facetword", facet: "domain", sourcetype: ["blog"], size: 100 });
    expect(r).toHaveLength(13); // even-indexed domains only
    const own = await facetValues({ query: "facetword", facet: "sourcetype", sourcetype: ["blog"] });
    expect(keys(own).sort()).toEqual(["blog", "onlinenews_newspaper"]);
  });

  it("respects the query's date range", async () => {
    const r = await facetValues({ query: "facetword", facet: "domain", from: "2026-10-01T00:00:00Z", to: "2026-10-01T23:59:59Z", size: 100 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.reduce((s: number, b: { count: number }) => s + b.count, 0)).toBe(
      (await search({ query: "facetword", from: "2026-10-01T00:00:00Z", to: "2026-10-01T23:59:59Z" })).total,
    );
  });
});

describe("results over time pick a readable bucket size", () => {
  it("uses days for a short span, with the interval reported", async () => {
    const r = await search({ query: "facetword" });
    expect(r.aggregations.interval).toBe("day");
  });

  it("switches to weeks, then months, as the span grows", async () => {
    const day = (iso: string) => ({ title: "spanword", body: "spanword", domain: "x.com", sourcetype: "blog", published: iso });
    await client.bulk({
      refresh: true,
      body: ["2026-03-01T00:00:00Z", "2026-10-01T00:00:00Z"].flatMap((d) => [{ index: { _index: INDEX } }, day(d)]),
    });
    expect((await search({ query: "spanword" })).aggregations.interval).toBe("week");

    await client.bulk({ refresh: true, body: [{ index: { _index: INDEX } }, day("2023-01-15T00:00:00Z")] });
    const long = await search({ query: "spanword" });
    expect(long.aggregations.interval).toBe("month");
    expect(long.aggregations.overTime.length).toBeLessThan(60);
  });

  it("an explicit interval still wins", async () => {
    expect((await search({ query: "spanword", interval: "month" })).aggregations.interval).toBe("month");
  });
});