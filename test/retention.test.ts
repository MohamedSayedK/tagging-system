// Needs a running OpenSearch. Uses a throwaway index.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ARTICLES_INDEX = "articles_retention_test";
const { client, ensureIndices, INDEX } = await import("../src/search/index-def.js");
const { purgeOlderThan } = await import("../src/search/retention.js");

const NOW = new Date("2026-10-11T12:00:00Z");
const day = 86_400_000;
const article = (id: string, daysOld: number) => ({
  id,
  title: `Story ${id}`,
  body: "text",
  url: `https://x.test/${id}`,
  source: "S",
  domain: "x.test",
  sourcetype: "blog",
  published: new Date(NOW.getTime() - daysOld * day).toISOString(),
  fetched: NOW.toISOString(),
});

beforeAll(async () => {
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
  await ensureIndices();
  const docs = [article("fresh", 3), article("month", 30), article("old", 400), article("ancient", 900)];
  await client.bulk({ refresh: true, body: docs.flatMap(({ id, ...d }) => [{ index: { _index: INDEX, _id: id } }, d]) });
});
afterAll(async () => {
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
});

describe("purgeOlderThan", () => {
  it("removes articles published before the cutoff and keeps the rest", async () => {
    const removed = await purgeOlderThan({ days: 365, now: NOW });

    expect(removed).toBe(2);
    const left = await client.search({ index: INDEX, body: { size: 10, query: { match_all: {} }, sort: [{ published: "desc" }] } });
    expect(((left.body as any).hits.hits as any[]).map((h) => h._id)).toEqual(["fresh", "month"]);
  });

  it("refuses a retention shorter than a week, which is almost certainly a mistake", async () => {
    await expect(purgeOlderThan({ days: 0, now: NOW })).rejects.toThrow(/at least 7/);
    await expect(purgeOlderThan({ days: 3, now: NOW })).rejects.toThrow(/at least 7/);
  });
});
