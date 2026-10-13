// Needs a running OpenSearch. Uses throwaway indices.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

process.env.ARTICLES_INDEX = "articles_serve_test";
process.env.TOPICS_INDEX = "topics_serve_test";
process.env.RUNS_INDEX = "source_runs_serve_test";
process.env.REGISTRY_INDEX = "source_registry_serve_test";
process.env.CRAWL_SOURCES_INDEX = "crawl_sources_serve_test";
const { buildApp } = await import("../src/api/app.js");
const { assertSafeBinding } = await import("../src/api/security.js");
const { client, INDEX, TOPICS_INDEX, RUNS_INDEX, REGISTRY_INDEX, REGISTRY_STATE_INDEX, CRAWL_SOURCES_INDEX } = await import("../src/search/index-def.js");

const basic = (user: string, pass: string) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const make = async (opts: Parameters<typeof buildApp>[0] = {}) => {
  const app = await buildApp(opts);
  apps.push(app);
  return app;
};

afterAll(async () => {
  await client.indices.delete({ index: [INDEX, TOPICS_INDEX, RUNS_INDEX, REGISTRY_INDEX, REGISTRY_STATE_INDEX, CRAWL_SOURCES_INDEX] }, { ignore: [404] });
  await Promise.all(apps.map((a) => a.close()));
});

describe("basic authentication", () => {
  it("asks for credentials on every route but /health when a password is configured", async () => {
    const app = await make({ basicAuth: "analyst:s3cret" });

    const anon = await app.inject({ method: "GET", url: "/topics" });
    expect(anon.statusCode).toBe(401);
    expect(anon.headers["www-authenticate"]).toMatch(/^Basic realm=/);

    const wrong = await app.inject({ method: "GET", url: "/topics", headers: { authorization: basic("analyst", "nope") } });
    expect(wrong.statusCode).toBe(401);

    const right = await app.inject({ method: "GET", url: "/topics", headers: { authorization: basic("analyst", "s3cret") } });
    expect(right.statusCode).toBe(200);

    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  });

  it("is off when nothing is configured, as in development", async () => {
    const app = await make();

    expect((await app.inject({ method: "GET", url: "/topics" })).statusCode).toBe(200);
  });
});

describe("serving the web UI", () => {
  it("serves the built UI at / and the API under /api, so one process is the whole app", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ui-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Tagging System</title>");
    const app = await make({ staticDir: dir });

    const page = await app.inject({ method: "GET", url: "/" });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Tagging System");

    const api = await app.inject({ method: "GET", url: "/api/topics" });
    expect(api.statusCode).toBe(200);
    expect(Array.isArray(api.json())).toBe(true);
  });
});

describe("assertSafeBinding", () => {
  it("allows loopback without a password, and a public address only with one", () => {
    expect(() => assertSafeBinding("127.0.0.1", undefined)).not.toThrow();
    expect(() => assertSafeBinding("localhost", undefined)).not.toThrow();
    expect(() => assertSafeBinding("::1", undefined)).not.toThrow();
    expect(() => assertSafeBinding("0.0.0.0", "u:p")).not.toThrow();
    expect(() => assertSafeBinding("0.0.0.0", undefined)).toThrow(/BASIC_AUTH/);
    expect(() => assertSafeBinding("192.168.1.20", undefined)).toThrow(/BASIC_AUTH/);
  });

  it("rejects a malformed password setting", () => {
    expect(() => assertSafeBinding("127.0.0.1", "nocolon")).toThrow(/user:password/);
  });
});

describe("GET /status", () => {
  it("summarises the system for monitoring: articles, registry, sources and failing ones", async () => {
    const app = await make();

    const res = await app.inject({ method: "GET", url: "/status" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      ok: true,
      articles: expect.any(Number),
      registry: { domains: expect.any(Number) },
      sources: { configured: expect.any(Number), fromRegistry: expect.any(Number), failing: expect.any(Number) },
    });
  });
});

describe("GET /status: stuck sources", () => {
  it("names the sources that have failed three runs in a row, with the last error, so an outage is visible without opening the UI", async () => {
    const { loadSources } = await import("../src/ingest/sources.js");
    const { openSearchStore } = await import("../src/ingest/runStore.js");
    const [first, second] = loadSources();
    const store = openSearchStore();
    const run = (name: string, failures: number, error?: string) => ({
      name, lastRun: "2026-10-13T10:00:00.000Z", ok: failures === 0, found: 0, indexed: 0, ...(error && { error }),
      consecutiveFailures: failures, nextRun: "2026-10-13T11:00:00.000Z", durationMs: 10,
    });
    await store.save(run(first!.name, 4, "HTTP 503"));
    await store.save(run(second!.name, 1, "timeout")); // one failure is a blip, not an outage
    await client.indices.refresh({ index: RUNS_INDEX });
    const app = await make();

    const res = await app.inject({ method: "GET", url: "/status" });

    expect(res.json().sources.failing).toBe(2);
    expect(res.json().sources.stuck).toEqual([{ name: first!.name, consecutiveFailures: 4, error: "HTTP 503" }]);
  });
});