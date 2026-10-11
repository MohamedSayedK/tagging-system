import { describe, expect, it } from "vitest";
import type { SourceRecord } from "../src/registry/registry.js";
import { MENA_COUNTRIES, outletQuery, parseOutlets, seedFromWikidata } from "../src/registry/wikidata.js";

/** The shape of a Wikidata SPARQL JSON answer: one binding per outlet. */
const answer = (rows: { site: string; country: string; lang?: string }[]) => ({
  results: {
    bindings: rows.map((r) => ({
      site: { type: "uri", value: r.site },
      country: { type: "literal", value: r.country },
      ...(r.lang && { lang: { type: "literal", value: r.lang } }),
    })),
  },
});

describe("parseOutlets", () => {
  it("turns official-website URLs into bare domains with their country and language", () => {
    const outlets = parseOutlets(
      answer([
        { site: "https://www.AlMasryAlYoum.com/", country: "EG", lang: "ar" },
        { site: "http://english.ahram.org.eg/Home/", country: "EG", lang: "en" },
      ]),
    );

    expect(outlets).toEqual([
      { domain: "almasryalyoum.com", country: "EG", languages: ["ar"] },
      { domain: "english.ahram.org.eg", country: "EG", languages: ["en"] },
    ]);
  });

  it("merges repeated rows for one site into one outlet with all its languages", () => {
    const outlets = parseOutlets(
      answer([
        { site: "https://aawsat.com", country: "SA", lang: "ar" },
        { site: "https://aawsat.com/", country: "SA", lang: "en" },
        { site: "https://aawsat.com", country: "SA" },
      ]),
    );

    expect(outlets).toEqual([{ domain: "aawsat.com", country: "SA", languages: ["ar", "en"] }]);
  });

  it("skips entries that are not usable sites: social pages, malformed URLs, and platforms", () => {
    const outlets = parseOutlets(
      answer([
        { site: "https://www.facebook.com/somepaper", country: "EG" },
        { site: "not a url", country: "EG" },
        { site: "https://real-paper.com", country: "EG" },
      ]),
    );

    expect(outlets.map((o) => o.domain)).toEqual(["real-paper.com"]);
  });
});

describe("outletQuery", () => {
  it("asks only for the MENA countries, by ISO code", () => {
    const query = outletQuery();

    for (const code of ["SA", "AE", "EG", "MA", "IQ"]) expect(query).toContain(`"${code}"`);
    expect(query).not.toContain('"US"');
    expect(MENA_COUNTRIES).toContain("QA");
  });
});

describe("seedFromWikidata", () => {
  const memory = (initial: SourceRecord[] = []) => {
    const records = new Map(initial.map((r) => [r.domain, r]));
    return {
      records,
      async getMany(domains: string[]) {
        return domains.flatMap((d) => records.get(d) ?? []);
      },
      async putMany(rs: SourceRecord[]) {
        for (const r of rs) records.set(r.domain, r);
      },
    };
  };
  const NOW = new Date("2026-10-11T12:00:00Z");

  it("adds outlets the registry has never seen, with no articles counted yet", async () => {
    const store = memory();

    const result = await seedFromWikidata({
      store,
      now: NOW,
      query: async () => answer([{ site: "https://www.okaz.com.sa", country: "SA", lang: "ar" }]),
    });

    expect(result).toEqual({ outlets: 1, added: 1, updated: 0 });
    expect(store.records.get("okaz.com.sa")).toEqual({
      domain: "okaz.com.sa",
      firstSeen: NOW.toISOString(),
      lastSeen: NOW.toISOString(),
      articleCount: 0,
      languages: ["ara"],
      country: "SA",
    });
  });

  it("enriches a domain GDELT already found without disturbing its counts or dates", async () => {
    const seen: SourceRecord = {
      domain: "argaam.com",
      firstSeen: "2026-10-10T08:00:00.000Z",
      lastSeen: "2026-10-11T08:00:00.000Z",
      articleCount: 604,
      languages: ["ara"],
    };
    const store = memory([seen]);

    const result = await seedFromWikidata({
      store,
      now: NOW,
      query: async () => answer([{ site: "https://argaam.com", country: "SA", lang: "en" }]),
    });

    expect(result).toMatchObject({ added: 0, updated: 1 });
    expect(store.records.get("argaam.com")).toEqual({ ...seen, languages: ["ara", "eng"], country: "SA" });
  });

  it("does not overwrite a country that is already recorded", async () => {
    const store = memory([
      { domain: "x.com", firstSeen: "2026-10-10T00:00:00.000Z", lastSeen: "2026-10-10T00:00:00.000Z", articleCount: 1, languages: ["eng"], country: "AE" },
    ]);

    await seedFromWikidata({ store, now: NOW, query: async () => answer([{ site: "https://x.com", country: "SA" }]) });

    expect(store.records.get("x.com")?.country).toBe("AE");
  });
});
