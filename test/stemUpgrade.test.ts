// Needs a running OpenSearch. An index made before `stem:` existed must be upgradable in place.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ARTICLES_INDEX = "articles_stem_upgrade_test";
const { client, ensureIndices, INDEX } = await import("../src/search/index-def.js");
const { reindexStem } = await import("../src/search/reindexStem.js");
const { search } = await import("../src/search/search.js");

beforeAll(async () => {
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
  // The index as it was before this feature: one analyzer, no stemmed subfields.
  await client.indices.create({
    index: INDEX,
    body: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          analyzer: { news_text: { type: "custom", tokenizer: "standard", filter: ["lowercase", "decimal_digit", "arabic_normalization"] } },
          normalizer: { lc: { type: "custom", filter: ["lowercase"] } },
        },
      },
      mappings: {
        properties: {
          title: { type: "text", analyzer: "news_text" },
          body: { type: "text", analyzer: "news_text" },
          sourcetype: { type: "keyword", normalizer: "lc" },
          published: { type: "date" },
        },
      },
    },
  });
  await client.index({
    index: INDEX,
    id: "old",
    refresh: true,
    body: { title: "المستفيدون", body: "أعلن البرنامج عن موعد الدعم للمستفيدين", sourcetype: "blog", published: "2026-10-10T10:00:00Z" },
  });
});
afterAll(async () => {
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
});

describe("upgrading an existing index for stem:", () => {
  it("adds the stemmed analyzer and fields in place, and stem: works on old articles once they are reindexed", async () => {
    await ensureIndices();
    const count = await reindexStem();
    await client.indices.refresh({ index: INDEX });

    expect(count).toBe(1);
    const ids = async (query: string) => (await search({ query })).results.map((r: any) => r.id);
    expect(await ids("المستفيد")).toEqual([]); // exact search is unchanged
    expect(await ids("stem:المستفيد")).toEqual(["old"]);
  });

  it("replaces an older stemmed analyzer with the current one, so a fix to the stemmer reaches existing indices", async () => {
    await client.indices.delete({ index: INDEX }, { ignore: [404] });
    await client.indices.create({
      index: INDEX,
      body: {
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
          analysis: {
            analyzer: {
              news_text: { type: "custom", tokenizer: "standard", filter: ["lowercase", "decimal_digit", "arabic_normalization"] },
              // the first version of the stemmed analyzer: one Arabic stemming pass
              news_stem: { type: "custom", tokenizer: "standard", filter: ["lowercase", "decimal_digit", "arabic_normalization", "arabic_stem", "english_plurals"] },
            },
            filter: { english_plurals: { type: "stemmer", language: "minimal_english" } },
            normalizer: { lc: { type: "custom", filter: ["lowercase"] } },
          },
        },
        mappings: { properties: { body: { type: "text", analyzer: "news_text", fields: { stem: { type: "text", analyzer: "news_stem" } } } } },
      },
    });
    await client.index({ index: INDEX, id: "x", refresh: true, body: { body: "قال الوزير إن الميزانية جاهزة", published: "2026-10-10T10:00:00Z" } });

    await ensureIndices();
    await reindexStem();
    await client.indices.refresh({ index: INDEX });

    // "وزير" and "الوزير" meet at the same stem only after the second pass
    expect((await search({ query: "stem:وزير" })).results.map((r: any) => r.id)).toEqual(["x"]);
  });

  it("is safe to run again", async () => {
    await expect(ensureIndices()).resolves.toBeUndefined();
  });
});