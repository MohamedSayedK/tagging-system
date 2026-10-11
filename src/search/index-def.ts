import { Client } from "@opensearch-project/opensearch";

export const INDEX = process.env.ARTICLES_INDEX ?? "articles";
export const TOPICS_INDEX = process.env.TOPICS_INDEX ?? "topics";
export const RUNS_INDEX = process.env.RUNS_INDEX ?? "source_runs";

export const client = new Client({ node: process.env.OPENSEARCH_URL ?? "http://localhost:9200" });

// Text analyzer: Unicode-aware tokenization + Arabic orthographic normalization (alef/ya/ta-marbuta
// variants, diacritics), no stemming so phrase matches stay exact like Talkwalker.
const settings: any = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    analyzer: {
      news_text: {
        type: "custom",
        tokenizer: "standard",
        filter: ["lowercase", "decimal_digit", "arabic_normalization"],
      },
    },
    normalizer: { lc: { type: "custom", filter: ["lowercase"] } },
  },
};

const mappings: any = {
  properties: {
    url: { type: "keyword" },
    title: { type: "text", analyzer: "news_text" },
    body: { type: "text", analyzer: "news_text" },
    author: { type: "text", analyzer: "news_text" },
    authorshort: { type: "keyword", normalizer: "lc" },
    source: { type: "keyword", normalizer: "lc" },
    domain: { type: "keyword", normalizer: "lc" },
    sourcetype: { type: "keyword", normalizer: "lc" },
    sourcecountry: { type: "keyword", normalizer: "lc" },
    lang: { type: "keyword", normalizer: "lc" },
    published: { type: "date" },
    fetched: { type: "date" },
  },
};

export async function ensureIndices(): Promise<void> {
  const exists = await client.indices.exists({ index: INDEX });
  if (!exists.body) await client.indices.create({ index: INDEX, body: { settings, mappings } });
  const runs = await client.indices.exists({ index: RUNS_INDEX });
  if (!runs.body)
    await client.indices.create({
      index: RUNS_INDEX,
      body: {
        settings: { number_of_shards: 1, number_of_replicas: 0 },
        mappings: { properties: { name: { type: "keyword" }, lastRun: { type: "date" }, nextRun: { type: "date" } } },
      },
    });
  const t = await client.indices.exists({ index: TOPICS_INDEX });
  if (!t.body)
    await client.indices.create({
      index: TOPICS_INDEX,
      body: { settings: { number_of_shards: 1, number_of_replicas: 0 } },
    });
}


