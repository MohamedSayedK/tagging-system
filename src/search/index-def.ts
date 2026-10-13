import { Client } from "@opensearch-project/opensearch";

export const INDEX = process.env.ARTICLES_INDEX ?? "articles";
export const TOPICS_INDEX = process.env.TOPICS_INDEX ?? "topics";
export const RUNS_INDEX = process.env.RUNS_INDEX ?? "source_runs";
export const REGISTRY_INDEX = process.env.REGISTRY_INDEX ?? "source_registry";
export const REGISTRY_STATE_INDEX = `${REGISTRY_INDEX}_state`;
export const CRAWL_SOURCES_INDEX = process.env.CRAWL_SOURCES_INDEX ?? "crawl_sources";
export const LEASE_INDEX = process.env.LEASE_INDEX ?? "worker_lease";

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
      // Behind `START/n:` only: the same analysis as news_text, on a body that begins with the marker word.
      news_start: {
        type: "custom",
        char_filter: ["body_start_marker"],
        tokenizer: "standard",
        filter: ["lowercase", "decimal_digit", "arabic_normalization"],
      },
      // Behind `stem:` only: the light Arabic stemmer (prefixes like ال/لل/وال, suffixes like ات/ون/ين/ة) and
      // English plurals. The default analyzer stays unstemmed so exact and phrase matches keep their meaning.
      // The Arabic stemmer runs twice: it strips one prefix per pass, so الوزير (the minister) comes out as وزير
      // and only the second pass takes it to the same stem as وزير itself.
      news_stem: {
        type: "custom",
        tokenizer: "standard",
        filter: ["lowercase", "decimal_digit", "arabic_normalization", "arabic_stem", "arabic_stem", "english_plurals"],
      },
    },
    filter: { english_plurals: { type: "stemmer", language: "minimal_english" } },
    // Puts a marker word in front of the body, so `START/n:` can ask for "within n words of the marker".
    char_filter: { body_start_marker: { type: "pattern_replace", pattern: "^", replacement: "zzbodystartzz " } },
    normalizer: { lc: { type: "custom", filter: ["lowercase"] } },
  },
};

const mappings: any = {
  properties: {
    url: { type: "keyword" },
    title: { type: "text", analyzer: "news_text", fields: { stem: { type: "text", analyzer: "news_stem" } } },
    body: {
      type: "text",
      analyzer: "news_text",
      fields: { stem: { type: "text", analyzer: "news_stem" }, start: { type: "text", analyzer: "news_start" } },
    },
    author: { type: "text", analyzer: "news_text" },
    authorshort: { type: "keyword", normalizer: "lc" },
    source: { type: "keyword", normalizer: "lc" },
    domain: { type: "keyword", normalizer: "lc" },
    sourcetype: { type: "keyword", normalizer: "lc" },
    sourcecountry: { type: "keyword", normalizer: "lc" },
    lang: { type: "keyword", normalizer: "lc" },
    published: { type: "date" },
    fetched: { type: "date" },
    // How the body was obtained: page, structured, description (page snippet) or feed (feed summary).
    extraction: { type: "keyword" },
    // Fingerprint of the headline, and whether an earlier article already carried the same story.
    titlekey: { type: "keyword" },
    duplicate: { type: "boolean" },
  },
};

/**
 * An index created before `stem:` or `START/n:` lacks their analyzers, and analyzers are settings, which only
 * change while the index is closed. Adding or replacing them takes a moment of closed index at the first start
 * after the upgrade; an index that is already current is left alone.
 */
const ADDED_ANALYSIS = ["news_stem", "news_start"] as const;
async function ensureExtraAnalyzers(): Promise<void> {
  const got = await client.indices.getSettings({ index: INDEX });
  const have = (got.body as any)[INDEX]?.settings?.index?.analysis ?? {};
  const want = settings.analysis;
  const same =
    ADDED_ANALYSIS.every((a) => JSON.stringify(have.analyzer?.[a]) === JSON.stringify(want.analyzer[a])) &&
    JSON.stringify(have.char_filter?.body_start_marker) === JSON.stringify(want.char_filter.body_start_marker) &&
    JSON.stringify(have.filter?.english_plurals) === JSON.stringify(want.filter.english_plurals);
  if (same) return;
  await client.indices.close({ index: INDEX });
  try {
    await client.indices.putSettings({
      index: INDEX,
      body: {
        analysis: {
          analyzer: Object.fromEntries(ADDED_ANALYSIS.map((a) => [a, want.analyzer[a]])),
          filter: want.filter,
          char_filter: want.char_filter,
        },
      },
    });
  } finally {
    await client.indices.open({ index: INDEX });
  }
}

export async function ensureIndices(): Promise<void> {
  const exists = await client.indices.exists({ index: INDEX });
  if (!exists.body) await client.indices.create({ index: INDEX, body: { settings, mappings } });
  // An index created before a field existed gets it added; adding a field never changes existing documents.
  else {
    await ensureExtraAnalyzers();
    await client.indices.putMapping({ index: INDEX, body: { properties: mappings.properties } });
  }
  const runs = await client.indices.exists({ index: RUNS_INDEX });
  if (!runs.body)
    await client.indices.create({
      index: RUNS_INDEX,
      body: {
        settings: { number_of_shards: 1, number_of_replicas: 0 },
        mappings: { properties: { name: { type: "keyword" }, lastRun: { type: "date" }, nextRun: { type: "date" } } },
      },
    });
  const registry = await client.indices.exists({ index: REGISTRY_INDEX });
  const registryProperties: any = {
    domain: { type: "keyword", normalizer: "lc" },
    languages: { type: "keyword" },
    country: { type: "keyword" },
    articleCount: { type: "integer" },
    firstSeen: { type: "date" },
    lastSeen: { type: "date" },
  };
  if (!registry.body)
    await client.indices.create({
      index: REGISTRY_INDEX,
      body: {
        settings: { number_of_shards: 1, number_of_replicas: 0, analysis: { normalizer: { lc: { type: "custom", filter: ["lowercase"] } } } },
        mappings: { properties: registryProperties },
      },
    });
  else await client.indices.putMapping({ index: REGISTRY_INDEX, body: { properties: registryProperties } });
  const registryState = await client.indices.exists({ index: REGISTRY_STATE_INDEX });
  if (!registryState.body)
    await client.indices.create({
      index: REGISTRY_STATE_INDEX,
      body: { settings: { number_of_shards: 1, number_of_replicas: 0 } },
    });
  const crawlSources = await client.indices.exists({ index: CRAWL_SOURCES_INDEX });
  if (!crawlSources.body)
    await client.indices.create({
      index: CRAWL_SOURCES_INDEX,
      body: {
        settings: { number_of_shards: 1, number_of_replicas: 0 },
        mappings: {
          properties: {
            domain: { type: "keyword" },
            status: { type: "keyword" },
            checkedAt: { type: "date" },
            // The feed list and rejection reasons are read back whole, never searched.
            source: { type: "object", enabled: false },
            rejected: { type: "object", enabled: false },
          },
        },
      },
    });
  const lease = await client.indices.exists({ index: LEASE_INDEX });
  if (!lease.body)
    await client.indices.create({
      index: LEASE_INDEX,
      body: {
        settings: { number_of_shards: 1, number_of_replicas: 0 },
        mappings: { properties: { owner: { type: "keyword" }, expires: { type: "date" } } },
      },
    });
  const t = await client.indices.exists({ index: TOPICS_INDEX });
  if (!t.body)
    await client.indices.create({
      index: TOPICS_INDEX,
      body: { settings: { number_of_shards: 1, number_of_replicas: 0 } },
    });
}


