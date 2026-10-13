import { describe, expect, it } from "vitest";
import { createDemoFetch, DemoData, withRegistrySnapshot } from "./api";

const data: DemoData = {
  generatedAt: "2026-10-10T00:00:00Z",
  articles: [
    { id: "1", url: "https://a/1", title: "Budget deficit narrows", body: "The budget deficit narrowed this quarter as spending fell", source: "Arab News", domain: "arabnews.com", sourcetype: "ONLINENEWS_NEWSPAPER", sourcecountry: "SA", lang: "en", published: "2026-10-10T09:00:00Z" },
    { id: "2", url: "https://a/2", title: "Oil prices", body: "Oil prices rose on Monday", source: "Gulf News", domain: "gulfnews.com", sourcetype: "ONLINENEWS_NEWSPAPER", sourcecountry: "AE", lang: "en", published: "2026-10-09T09:00:00Z" },
  ],
  sources: [
    { name: "Arab News", domain: "arabnews.com", sourcetype: "ONLINENEWS_NEWSPAPER", country: "SA", lang: "en", feedCount: 1, intervalMs: 900000, status: "ok", found: 50, indexed: 3, consecutiveFailures: 0, lastRunAgoMs: 300000, nextInMs: 600000 },
  ],
  topics: [{ name: "Budget", query: "budget NEAR/5 deficit", color: "#3e63dd" }],
};

function setup() {
  const store = new Map<string, string>();
  const fetch = createDemoFetch(data, { now: () => new Date("2026-10-10T09:00:00Z"), storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) } });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`/api${path}`, { method, ...(body !== undefined && { body: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
    return { status: res.status, json: (await res.json()) as any };
  };
  return { call, store, fetch };
}

describe("withRegistrySnapshot", () => {
  const registry = [{ domain: "dostor.org", articleCount: 5, languages: ["ara"], lastSeenAgoMs: 1000 }];
  const promoted = { name: "dostor.org", origin: "registry" as const, domain: "dostor.org", sourcetype: "ONLINENEWS_OTHER", feedCount: 1, intervalMs: 1, status: "pending" as const };

  it("adds the registry and the promoted sources to the main snapshot", () => {
    const merged = withRegistrySnapshot(data, { registry, sources: [promoted] });

    expect(merged.registry).toEqual(registry);
    expect(merged.sources.map((s) => s.name)).toEqual(["Arab News", "dostor.org"]);
    expect(data.registry).toBeUndefined(); // the input is not changed
  });

  it("never lists a source twice, and keeps the main snapshot's version", () => {
    const dup = { ...promoted, name: "Arab News" };

    const merged = withRegistrySnapshot(data, { registry, sources: [dup] });

    expect(merged.sources.filter((s) => s.name === "Arab News")).toHaveLength(1);
    expect(merged.sources[0]!.domain).toBe("arabnews.com");
  });

  it("leaves the snapshot alone when the registry file is missing or malformed", () => {
    expect(withRegistrySnapshot(data, null)).toBe(data);
    expect(withRegistrySnapshot(data, { nope: true } as never)).toBe(data);
  });
});

describe("demo API: the same routes as the server", () => {
  it("seeds sample topics, with ids and colours", async () => {
    const { call } = setup();
    const r = await call("GET", "/topics");
    expect(r.status).toBe(200);
    expect(r.json).toHaveLength(1);
    expect(r.json[0]).toMatchObject({ name: "Budget", color: "#3e63dd" });
    expect(typeof r.json[0].id).toBe("string");
  });

  it("creates, updates and deletes topics, remembering them in storage", async () => {
    const { call, store } = setup();
    const created = await call("POST", "/topics", { name: "Oil", query: "oil", color: "#e5484d" });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ name: "Oil", color: "#e5484d" });
    expect(store.get("tagging.demo.topics")).toContain("Oil");

    const updated = await call("PUT", `/topics/${created.json.id}`, { name: "Oil and gas", query: "oil OR gas" });
    expect(updated.json).toMatchObject({ name: "Oil and gas" });
    expect(updated.json.color).toBeUndefined(); // an update replaces the colour like the real API

    expect((await call("DELETE", `/topics/${created.json.id}`)).status).toBe(200);
    expect((await call("GET", "/topics")).json.map((t: any) => t.name)).toEqual(["Budget"]);
    expect((await call("DELETE", `/topics/${created.json.id}`)).status).toBe(404);
  });

  it("rejects an invalid query or colour with the server's messages", async () => {
    const { call } = setup();
    const badQuery = await call("POST", "/topics", { name: "x", query: "(broken" });
    expect(badQuery.status).toBe(400);
    expect(badQuery.json.error).toBe("query_syntax");
    expect(badQuery.json.message).toMatch(/parenthesis/i);
    const badColor = await call("POST", "/topics", { name: "x", query: "a", color: "red" });
    expect(badColor.status).toBe(400);
    expect(badColor.json.message).toMatch(/color/);
    expect((await call("POST", "/topics", { query: "a" })).status).toBe(400);
  });

  it("validates queries as the user types", async () => {
    const { call } = setup();
    expect((await call("POST", "/query/validate", { query: "budget AND deficit" })).status).toBe(200);
    const bad = await call("POST", "/query/validate", { query: "a OR" });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe("query_syntax");
  });

  it("returns a topic's results with highlights, aggregations and paging", async () => {
    const { call } = setup();
    const topic = (await call("GET", "/topics")).json[0];

    const r = await call("GET", `/topics/${topic.id}/results?size=10&sort=recent`);

    expect(r.status).toBe(200);
    expect(r.json.total).toBe(1);
    expect(r.json.results[0]).toMatchObject({ id: "1", title: "Budget deficit narrows" });
    expect(r.json.results[0].highlight.body[0]).toContain("<em>budget</em>");
    expect(r.json.aggregations.sourceTypes).toEqual([{ key: "onlinenews_newspaper", count: 1 }]);
    expect(r.json.aggregations.interval).toBe("day");
  });

  it("applies repeated facet params and lists facet values", async () => {
    const { call } = setup();
    const t = (await call("POST", "/topics", { name: "All", query: "budget OR oil" })).json;

    const filtered = await call("GET", `/topics/${t.id}/results?sourcecountry=ae&sourcecountry=sa`);
    expect(filtered.json.total).toBe(2);
    const onlyAe = await call("GET", `/topics/${t.id}/results?sourcecountry=ae`);
    expect(onlyAe.json.results.map((x: any) => x.id)).toEqual(["2"]);

    const values = await call("GET", `/topics/${t.id}/facets/domain?q=GULF`);
    expect(values.json).toEqual([{ key: "gulfnews.com", count: 1 }]);
    expect((await call("GET", `/topics/${t.id}/facets/bogus`)).status).toBe(400);
  });

  it("404s for an unknown topic and route", async () => {
    const { call } = setup();
    expect((await call("GET", "/topics/nope/results")).status).toBe(404);
    expect((await call("GET", "/nothing")).status).toBe(404);
  });

  it("lists sources with times relative to now", async () => {
    const { call } = setup();
    const r = await call("GET", "/sources");
    expect(r.json[0]).toMatchObject({ name: "Arab News", status: "ok", found: 50, indexed: 3, intervalMs: 900000 });
    expect(r.json[0].lastRun).toBe("2026-10-10T08:55:00.000Z");
    expect(r.json[0].nextRun).toBe("2026-10-10T09:10:00.000Z");
  });

  describe("registry snapshot", () => {
    const withRegistry: DemoData = {
      ...data,
      sources: [
        ...data.sources,
        { name: "dostor.org", origin: "registry", domain: "dostor.org", sourcetype: "ONLINENEWS_OTHER", country: "EG", lang: "ar", feedCount: 2, intervalMs: 1_800_000, status: "ok", found: 90, indexed: 50, consecutiveFailures: 0, lastRunAgoMs: 120000, nextInMs: 1_680_000 },
      ],
      registry: [
        { domain: "argaam.com", articleCount: 604, languages: ["ara"], country: "SA", aggregator: false, lastSeenAgoMs: 3_600_000 },
        { domain: "zazoom.it", articleCount: 270, languages: ["ita"], country: "IT", aggregator: true, lastSeenAgoMs: 600_000 },
        { domain: "dostor.org", articleCount: 776, languages: ["ara"], country: "EG", aggregator: false, crawl: "active", lastSeenAgoMs: 900_000 },
        { domain: "arabnews.com", articleCount: 40, languages: ["eng"], aggregator: false, crawl: "no_feed", lastSeenAgoMs: 7_200_000 },
      ],
    };
    const setupRegistry = () => {
      const fetch = createDemoFetch(withRegistry, { now: () => new Date("2026-10-10T09:00:00Z"), storage: { getItem: () => null, setItem: () => undefined } });
      return async (path: string) => (await (await fetch(`/api${path}`)).json()) as any;
    };

    it("lists domains by volume with country, aggregator flag, crawl status and times relative to now", async () => {
      const get = setupRegistry();

      const r = await get("/registry");

      expect(r.total).toBe(4);
      expect(r.items.map((i: any) => i.domain)).toEqual(["dostor.org", "argaam.com", "zazoom.it", "arabnews.com"]);
      expect(r.items[0]).toMatchObject({
        domain: "dostor.org",
        articleCount: 776,
        languages: ["ara"],
        country: "EG",
        aggregator: false,
        crawl: { status: "active" },
        lastSeen: "2026-10-10T08:45:00.000Z",
      });
      expect(r.items.find((i: any) => i.domain === "argaam.com").crawl).toBeUndefined();
    });

    it("filters by language (two- or three-letter), text and aggregators, and pages like the server", async () => {
      const get = setupRegistry();

      expect((await get("/registry?lang=ar")).items.map((i: any) => i.domain)).toEqual(["dostor.org", "argaam.com"]);
      expect((await get("/registry?lang=eng")).items.map((i: any) => i.domain)).toEqual(["arabnews.com"]);
      expect((await get("/registry?q=ARAB")).items.map((i: any) => i.domain)).toEqual(["arabnews.com"]);
      const noAgg = await get("/registry?hideAggregators=true");
      expect(noAgg.total).toBe(3);
      const page = await get("/registry?from=1&size=2");
      expect(page.total).toBe(4);
      expect(page.items.map((i: any) => i.domain)).toEqual(["argaam.com", "zazoom.it"]);
    });

    it("marks promoted sources with their origin", async () => {
      const get = setupRegistry();

      const sources = await get("/sources");

      expect(sources.find((s: any) => s.name === "dostor.org")).toMatchObject({ origin: "registry", country: "EG", lang: "ar" });
      expect(sources.find((s: any) => s.name === "Arab News").origin).toBeUndefined();
    });

    it("answers with an empty list when the snapshot carries no registry", async () => {
      const fetch = createDemoFetch(data, { now: () => new Date("2026-10-10T09:00:00Z") });

      const r = await (await fetch("/api/registry")).json();

      expect(r).toEqual({ total: 0, items: [] });
    });
  });

  it("keeps working when storage is unavailable", async () => {
    const fetch = createDemoFetch(data, {
      now: () => new Date("2026-10-10T09:00:00Z"),
      storage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } },
    });
    const res = await fetch("/api/topics", { method: "POST", body: JSON.stringify({ name: "A", query: "a" }) });
    expect(res.status).toBe(201);
    expect((await (await fetch("/api/topics")).json()).map((t: any) => t.name)).toContain("A");
  });
});
describe("explain route", () => {
  it("answers which clauses of the topic's query matched an article, and 404s for unknown ones", async () => {
    const { call } = setup();
    const topics = await call("GET", "/topics");
    const id = topics.json[0].id;

    const ok = await call("GET", `/topics/${id}/explain/1`);
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ kind: "near", label: "budget NEAR/5 deficit", matched: true });

    expect((await call("GET", `/topics/${id}/explain/nope`)).status).toBe(404);
    expect((await call("GET", "/topics/nope/explain/1")).status).toBe(404);
  });
});