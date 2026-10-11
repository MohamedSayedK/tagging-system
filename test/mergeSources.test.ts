import { describe, expect, it } from "vitest";
import { mergeSources } from "../src/ingest/mergeSources.js";
import type { Source } from "../src/ingest/sources.js";

const yamlSource = (name: string, domain: string): Source => ({
  name,
  domain,
  sourcetype: "ONLINENEWS_NEWSPAPER",
  feeds: [{ url: `https://${domain}/rss`, kind: "rss" }],
  interval: 900_000,
  maxItems: 100,
  maxAgeDays: 90,
});
const promoted = (domain: string) => ({
  name: domain,
  domain,
  sourcetype: "ONLINENEWS_OTHER",
  country: "EG",
  lang: "ar",
  feeds: [{ url: `https://${domain}/feed`, kind: "rss" as const }],
});

describe("mergeSources", () => {
  it("adds promoted sources after the configured ones, with gentler crawl defaults", () => {
    const merged = mergeSources([yamlSource("Arab News", "arabnews.com")], [promoted("dostor.org")]);

    expect(merged.map((s) => s.name)).toEqual(["Arab News", "dostor.org"]);
    expect(merged[1]).toMatchObject({ country: "EG", lang: "ar", interval: 30 * 60_000, maxItems: 50 });
  });

  it("lets sources.yaml win when it already covers a domain, so the owner's name and settings are kept", () => {
    const merged = mergeSources([yamlSource("Okaz", "okaz.com.sa")], [promoted("okaz.com.sa"), promoted("sabq.org")]);

    expect(merged.map((s) => s.name)).toEqual(["Okaz", "sabq.org"]);
  });

  it("never produces two sources with the same name, since names key the run history", () => {
    const merged = mergeSources([yamlSource("dostor.org", "other.example")], [promoted("dostor.org")]);

    expect(new Set(merged.map((s) => s.name)).size).toBe(merged.length);
  });
});
