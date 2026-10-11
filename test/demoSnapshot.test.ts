import { describe, expect, it } from "vitest";
import { buildRegistrySnapshot } from "../src/registry/demoSnapshot.js";
import { parseOverrides } from "../src/registry/overrides.js";
import type { SourceRecord } from "../src/registry/registry.js";

const NOW = new Date("2026-10-11T12:00:00Z");
const rec = (domain: string, over: Partial<SourceRecord> = {}): SourceRecord => ({
  domain,
  firstSeen: "2026-10-10T08:00:00.000Z",
  lastSeen: "2026-10-11T11:00:00.000Z",
  articleCount: 10,
  languages: ["ara"],
  ...over,
});
const base = { attempts: new Map(), overrides: parseOverrides("country:\n  argaam.com: SA\n"), promoted: [], runs: new Map(), now: NOW };

describe("buildRegistrySnapshot: registry", () => {
  it("keeps every domain, with country (owner override, then recorded, then suffix), aggregator flag and age", () => {
    const { registry } = buildRegistrySnapshot({
      ...base,
      records: [
        rec("argaam.com"),
        rec("dostor.org", { country: "EG" }),
        rec("okaz.com.sa"),
        rec("zazoom.it", { languages: ["ita"] }),
        rec("plain.com"),
      ],
    });

    const by = Object.fromEntries(registry.map((r) => [r.domain, r]));
    expect(registry).toHaveLength(5);
    expect(by["argaam.com"]).toMatchObject({ country: "SA", aggregator: false, articleCount: 10, languages: ["ara"], lastSeenAgoMs: 3_600_000 });
    expect(by["dostor.org"]!.country).toBe("EG");
    expect(by["okaz.com.sa"]!.country).toBe("SA");
    expect(by["zazoom.it"]).toMatchObject({ country: "IT", aggregator: true });
    expect(by["plain.com"]!.country).toBeUndefined();
  });

  it("carries the outcome of the last promotion attempt, and nothing for domains never tried", () => {
    const { registry } = buildRegistrySnapshot({
      ...base,
      records: [rec("live.com"), rec("nofeed.com"), rec("new.com")],
      attempts: new Map([
        ["live.com", { status: "active" as const, checkedAt: "2026-10-11T10:00:00.000Z" }],
        ["nofeed.com", { status: "no_feed" as const, checkedAt: "2026-10-11T10:00:00.000Z" }],
      ]),
    });

    const by = Object.fromEntries(registry.map((r) => [r.domain, r]));
    expect(by["live.com"]!.crawl).toBe("active");
    expect(by["nofeed.com"]!.crawl).toBe("no_feed");
    expect(by["new.com"]!.crawl).toBeUndefined();
  });

  it("never reports a last-seen time of less than a minute ago", () => {
    const { registry } = buildRegistrySnapshot({ ...base, records: [rec("a.com", { lastSeen: NOW.toISOString() })] });

    expect(registry[0]!.lastSeenAgoMs).toBe(60_000);
  });
});

describe("buildRegistrySnapshot: promoted sources", () => {
  const promoted = (domain: string) => ({
    name: domain,
    domain,
    sourcetype: "ONLINENEWS_OTHER",
    country: "EG",
    lang: "ar",
    feeds: [{ url: `https://${domain}/feed`, kind: "rss" as const }, { url: `https://${domain}/sitemap.xml`, kind: "sitemap" as const }],
  });

  it("lists each promoted source with its origin and how its latest crawl went", () => {
    const run = (over: object) => ({
      name: "",
      lastRun: "2026-10-11T11:30:00.000Z",
      ok: true,
      found: 90,
      indexed: 50,
      consecutiveFailures: 0,
      nextRun: "2026-10-11T12:30:00.000Z",
      durationMs: 4000,
      ...over,
    });
    const { sources } = buildRegistrySnapshot({
      ...base,
      records: [],
      promoted: [promoted("dostor.org"), promoted("broken.net"), promoted("fresh.org")],
      runs: new Map([
        ["dostor.org", run({ name: "dostor.org" })],
        ["broken.net", run({ name: "broken.net", ok: false, consecutiveFailures: 2, error: "HTTP 503", indexed: 0, found: 0 })],
      ]),
    });

    const by = Object.fromEntries(sources.map((s) => [s.name, s]));
    expect(by["dostor.org"]).toMatchObject({ origin: "registry", status: "ok", feedCount: 2, country: "EG", lang: "ar", found: 90, indexed: 50, lastRunAgoMs: 1_800_000, nextInMs: 1_800_000 });
    expect(by["broken.net"]).toMatchObject({ status: "failing", error: "HTTP 503", consecutiveFailures: 2 });
    expect(by["fresh.org"]).toMatchObject({ status: "pending", origin: "registry" });
    expect(by["fresh.org"]!.lastRunAgoMs).toBeUndefined();
  });
});
