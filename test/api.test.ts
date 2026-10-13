// Needs a running OpenSearch. Uses throwaway indices.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ARTICLES_INDEX = "articles_api_test";
process.env.TOPICS_INDEX = "topics_api_test";
process.env.RUNS_INDEX = "source_runs_api_test";
process.env.CRAWL_SOURCES_INDEX = "crawl_sources_api_test";
process.env.REGISTRY_INDEX = "source_registry_api_sources_test";
const yaml = `sources:
  - { name: Alpha, domain: alpha.test, sourcetype: BLOG, country: SA, lang: en, feeds: [{ url: "https://alpha.test/rss", kind: rss }] }
  - { name: Beta, domain: beta.test, sourcetype: ONLINENEWS_NEWSPAPER, interval: 2h, feeds: [{ url: "https://beta.test/rss", kind: rss }] }
  - name: Gamma
    domain: gamma.test
    sourcetype: BLOG
    feeds:
      - { url: "https://gamma.test/a", kind: rss }
      - { url: "https://gamma.test/b", kind: sitemap }
`;
const { mkdtempSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const sourcesFile = `${mkdtempSync(`${tmpdir()}/api-sources-`)}/sources.yaml`;
writeFileSync(sourcesFile, yaml);
process.env.SOURCES_FILE = sourcesFile;
const { buildApp } = await import("../src/api/app.js");
const { client, INDEX, TOPICS_INDEX, RUNS_INDEX, CRAWL_SOURCES_INDEX, REGISTRY_INDEX, REGISTRY_STATE_INDEX } = await import("../src/search/index-def.js");

const app = await buildApp();
const post = (url: string, payload: unknown) => app.inject({ method: "POST", url, payload: payload as object });
const throwaway = [INDEX, TOPICS_INDEX, RUNS_INDEX, CRAWL_SOURCES_INDEX, REGISTRY_INDEX, REGISTRY_STATE_INDEX];

beforeAll(async () => {
  await client.indices.delete({ index: throwaway }, { ignore: [404] });
  const { ensureIndices } = await import("../src/search/index-def.js");
  await ensureIndices();
});
afterAll(async () => {
  await client.indices.delete({ index: throwaway }, { ignore: [404] });
  await app.close();
});

describe("sources API", () => {
  it("lists every configured source with its latest run, or 'pending' if it has never run", async () => {
    const { openSearchStore } = await import("../src/ingest/runStore.js");
    await openSearchStore().save({
      name: "Alpha",
      lastRun: "2026-10-11T10:00:00.000Z",
      ok: false,
      found: 0,
      indexed: 0,
      error: "HTTP 503",
      consecutiveFailures: 2,
      nextRun: "2026-10-11T11:00:00.000Z",
      durationMs: 1200,
    });
    await openSearchStore().save({
      name: "Beta",
      lastRun: "2026-10-11T10:05:00.000Z",
      ok: true,
      found: 40,
      indexed: 7,
      consecutiveFailures: 0,
      nextRun: "2026-10-11T10:20:00.000Z",
      durationMs: 800,
    });
    await client.indices.refresh({ index: RUNS_INDEX });

    const res = await app.inject({ method: "GET", url: "/sources" });

    expect(res.statusCode).toBe(200);
    const byName = Object.fromEntries(res.json().map((s: any) => [s.name, s]));
    expect(Object.keys(byName).sort()).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(byName.Alpha).toMatchObject({ domain: "alpha.test", sourcetype: "BLOG", country: "SA", intervalMs: 900_000, status: "failing", error: "HTTP 503", consecutiveFailures: 2 });
    expect(byName.Beta).toMatchObject({ status: "ok", found: 40, indexed: 7, intervalMs: 7_200_000, nextRun: "2026-10-11T10:20:00.000Z" });
    expect(byName.Gamma).toMatchObject({ status: "pending", feedCount: 2 });
    expect(byName.Gamma.lastRun).toBeUndefined();
    expect(byName.Alpha.origin).toBe("curated");
  });

  it("also lists sources promoted from the registry, marked as such, without overriding configured ones", async () => {
    const { openSearchPromotions } = await import("../src/search/promotionStore.js");
    const promoted = (domain: string) => ({
      domain,
      status: "active" as const,
      checkedAt: "2026-10-11T12:00:00.000Z",
      rejected: [],
      source: { name: domain, domain, sourcetype: "ONLINENEWS_OTHER", country: "EG", lang: "ar", feeds: [{ url: `https://${domain}/rss`, kind: "rss" as const }] },
    });
    await openSearchPromotions().save(promoted("dostor.test"));
    await openSearchPromotions().save(promoted("alpha.test")); // already configured as "Alpha"

    const sources = (await app.inject({ method: "GET", url: "/sources" })).json();

    const names = sources.map((s: any) => s.name).sort();
    expect(names).toEqual(["Alpha", "Beta", "Gamma", "dostor.test"]);
    expect(sources.find((s: any) => s.name === "dostor.test")).toMatchObject({ origin: "registry", country: "EG", lang: "ar", status: "pending" });
  });
});

describe("topics API", () => {
  it("edits a topic, rejecting an invalid query and unknown ids", async () => {
    const created = (await post("/topics", { name: "Budget", query: "budget" })).json();

    const ok = await app.inject({ method: "PUT", url: `/topics/${created.id}`, payload: { name: "Budget 2", query: "budget OR fiscal", exclude: "sports" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ id: created.id, name: "Budget 2", query: "budget OR fiscal", exclude: "sports" });

    const listed = (await app.inject({ method: "GET", url: "/topics" })).json();
    expect(listed.find((t: any) => t.id === created.id)).toMatchObject({ name: "Budget 2" });

    const bad = await app.inject({ method: "PUT", url: `/topics/${created.id}`, payload: { name: "x", query: "(broken" } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe("query_syntax");

    const missing = await app.inject({ method: "PUT", url: "/topics/nope", payload: { name: "x", query: "a" } });
    expect(missing.statusCode).toBe(404);
  });

  it("applies facet filters from repeated query-string params to a topic's results", async () => {
    const doc = (title: string, sourcetype: string, domain: string) => ({ title, body: title, sourcetype, domain, published: "2026-10-10T10:00:00Z" });
    await client.bulk({
      refresh: true,
      body: [
        { index: { _index: INDEX, _id: "f1" } }, doc("zebra one", "blog", "a.com"),
        { index: { _index: INDEX, _id: "f2" } }, doc("zebra two", "onlinenews_newspaper", "b.com"),
        { index: { _index: INDEX, _id: "f3" } }, doc("zebra three", "print_newspaper", "c.com"),
      ],
    });
    const topic = (await post("/topics", { name: "Zebra", query: "zebra" })).json();

    const res = await app.inject({ method: "GET", url: `/topics/${topic.id}/results?sourcetype=blog&sourcetype=print_newspaper` });

    expect(res.statusCode).toBe(200);
    expect(res.json().results.map((r: any) => r.id).sort()).toEqual(["f1", "f3"]);
    const single = await app.inject({ method: "GET", url: `/topics/${topic.id}/results?domain=b.com` });
    expect(single.json().results.map((r: any) => r.id)).toEqual(["f2"]);
  });

  it("explains which clauses of a topic's query matched one article, and 404s for unknown topics or articles", async () => {
    await client.index({ index: INDEX, id: "x1", refresh: true, body: { title: "okapi sighting", body: "an okapi was seen near the river", domain: "x.com", sourcetype: "blog", published: "2026-10-10T10:00:00Z" } });
    const topic = (await post("/topics", { name: "Okapi", query: "(okapi OR giraffe) AND NOT zebra", exclude: "river" })).json();

    const res = await app.inject({ method: "GET", url: `/topics/${topic.id}/explain/x1` });

    expect(res.statusCode).toBe(200);
    const tree = res.json();
    expect(tree).toMatchObject({ kind: "and", matched: true, excluded: true });
    expect(tree.children[0]).toMatchObject({ label: "okapi OR giraffe", matched: true });
    expect(tree.children[0].children.map((c: any) => [c.label, c.matched])).toEqual([["okapi", true], ["giraffe", false]]);
    expect(tree.children[1]).toMatchObject({ label: "NOT zebra", matched: true });
    expect(tree.children[0]).not.toHaveProperty("dsl");

    expect((await app.inject({ method: "GET", url: "/topics/nope/explain/x1" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/topics/${topic.id}/explain/missing` })).statusCode).toBe(404);
  });

  it("lists the values of one facet for a topic, searchable and under the other filters", async () => {
    await client.bulk({
      refresh: true,
      body: [
        { index: { _index: INDEX, _id: "g1" } }, { title: "yak a", body: "yak", domain: "alpha.com", sourcetype: "blog", published: "2026-10-10T10:00:00Z" },
        { index: { _index: INDEX, _id: "g2" } }, { title: "yak b", body: "yak", domain: "beta.com", sourcetype: "blog", published: "2026-10-10T10:00:00Z" },
        { index: { _index: INDEX, _id: "g3" } }, { title: "yak c", body: "yak", domain: "gamma.com", sourcetype: "print_newspaper", published: "2026-10-10T10:00:00Z" },
      ],
    });
    const topic = (await post("/topics", { name: "Yak", query: "yak" })).json();

    const all = await app.inject({ method: "GET", url: `/topics/${topic.id}/facets/domain` });
    expect(all.statusCode).toBe(200);
    expect(all.json().map((b: any) => b.key).sort()).toEqual(["alpha.com", "beta.com", "gamma.com"]);

    const found = await app.inject({ method: "GET", url: `/topics/${topic.id}/facets/domain?q=ALP` });
    expect(found.json()).toEqual([{ key: "alpha.com", count: 1 }]);

    const filtered = await app.inject({ method: "GET", url: `/topics/${topic.id}/facets/domain?sourcetype=print_newspaper` });
    expect(filtered.json()).toEqual([{ key: "gamma.com", count: 1 }]);

    expect((await app.inject({ method: "GET", url: `/topics/${topic.id}/facets/bogus` })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/topics/nope/facets/domain" })).statusCode).toBe(404);
  });

  it("stores a topic colour, returns it in the list, and lets it be changed or cleared", async () => {
    const created = (await post("/topics", { name: "Colourful", query: "colour", color: "#e5484d" })).json();
    expect(created.color).toBe("#e5484d");
    const listed = () => app.inject({ method: "GET", url: "/topics" }).then((r) => r.json().find((t: any) => t.id === created.id));
    expect((await listed()).color).toBe("#e5484d");

    await app.inject({ method: "PUT", url: `/topics/${created.id}`, payload: { name: "Colourful", query: "colour", color: "#3e63dd" } });
    expect((await listed()).color).toBe("#3e63dd");

    await app.inject({ method: "PUT", url: `/topics/${created.id}`, payload: { name: "Colourful", query: "colour" } });
    expect((await listed()).color ?? null).toBeNull();
  });

  it("rejects a colour that is not a six-digit hex value", async () => {
    for (const color of ["red", "#fff", "#12345g", "rgb(1,2,3)", "javascript:alert(1)"]) {
      const res = await post("/topics", { name: "Bad colour", query: "x", color });
      expect(res.statusCode, color).toBe(400);
      expect(res.json().message).toMatch(/colou?r/i);
    }
  });

  it("deletes a topic", async () => {
    const created = (await post("/topics", { name: "Temp", query: "temp" })).json();

    const del = await app.inject({ method: "DELETE", url: `/topics/${created.id}` });
    expect(del.statusCode).toBe(200);

    const listed = (await app.inject({ method: "GET", url: "/topics" })).json();
    expect(listed.some((t: any) => t.id === created.id)).toBe(false);
    expect((await app.inject({ method: "DELETE", url: `/topics/${created.id}` })).statusCode).toBe(404);
  });
});

