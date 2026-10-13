// Writes web/public/demo-data.json: a trimmed snapshot of the crawled articles, the sources' health and a few
// sample topics, for the serverless public demo. `npm run demo:data`
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DemoIndex } from "../../web/src/demo/engine.js";
import { client, INDEX } from "../search/index-def.js";
import { openSearchStore } from "./runStore.js";
import { loadSources } from "./sources.js";

const OUT = "web/public/demo-data.json";
const MAX_ARTICLES = 3000;
const BODY_CHARS = 320; // enough for a readable excerpt; this is a demo, not a mirror

const trimBody = (s: string) => {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= BODY_CHARS) return flat;
  const cut = flat.slice(0, BODY_CHARS);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), BODY_CHARS - 40)) + "…";
};

const res = await client.search({
  index: INDEX,
  body: {
    size: MAX_ARTICLES,
    sort: [{ published: "desc" }],
    _source: ["url", "title", "body", "source", "domain", "sourcetype", "sourcecountry", "lang", "published", "fetched"],
    query: { match_all: {} },
  } as never,
});
const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const fullArticles = (res.body as any).hits.hits
  .filter((h: any) => h._source.title && h._source.url)
  .map((h: any) => ({
    id: h._id as string,
    url: h._source.url as string,
    title: String(h._source.title).replace(/\s+/g, " ").trim(),
    body: flat(String(h._source.body ?? "")),
    source: h._source.source as string,
    domain: h._source.domain as string,
    sourcetype: h._source.sourcetype as string,
    sourcecountry: h._source.sourcecountry as string | undefined,
    lang: h._source.lang as string | undefined,
    published: h._source.published as string,
    fetched: h._source.fetched as string | undefined,
  }));

const runs = new Map((await openSearchStore().load()).map((r) => [r.name, r]));
const at = Date.now();
const sources = loadSources().map((s) => {
  const r = runs.get(s.name);
  const base = { name: s.name, domain: s.domain, sourcetype: s.sourcetype, country: s.country, lang: s.lang, feedCount: s.feeds.length, intervalMs: s.interval };
  if (!r) return { ...base, status: "pending" as const };
  return {
    ...base,
    status: r.consecutiveFailures > 0 ? ("failing" as const) : ("ok" as const),
    found: r.found,
    indexed: r.indexed,
    consecutiveFailures: r.consecutiveFailures,
    error: r.error,
    durationMs: r.durationMs,
    lastRunAgoMs: Math.max(60_000, at - Date.parse(r.lastRun)),
    nextInMs: Math.max(60_000, Date.parse(r.nextRun) - at),
  };
});

// `keepFullText`: articles that match this topic keep their whole body in the snapshot, because the match can sit
// far past the 320-character excerpt. Every other article stays trimmed.
const topics: { name: string; color: string; query: string; keepFullText?: boolean }[] = [
  {
    name: "Saudi Minister of Finance",
    color: "#3e63dd",
    keepFullText: true,
    query:
      '(((((Ministry OR Minister OR وزارة OR وزاره OR وزير OR ووزارة OR ووزاره OR ووزير OR لوزارة OR لوزاره OR لوزير OR بوزارة OR بوزاره OR بوزير) NEAR/2 (Finance OR المالية OR الماليه)) OR #وزيرالمالية OR #وزارةالمالية) NEAR/3 (KSA OR Saudi* OR السعودي* OR سعودي* OR (المملكة* NOT ("المملكة الأردنية" OR "المملكة الهاشمية" OR "المملكة المتحدة" OR "المملكة المغربية" OR "المملكة العربية السورية" OR "المملكة السورية" OR "AlMamlaka TV" OR "المملكة اليمنية" OR "المملكة الليبية")))) OR "Saudi Arabia\'s finance minister" OR "التواصل والمعرفة المالية" OR "Mohammed Al Jadaan" OR "Mohammed Aljadaan" OR authorContains:Aljadaan OR authorContains:Jadaan OR authorContains:الجدعان OR "محمد الجدعان" OR ((محمد OR Mohammed OR Mohamed) NEAR/3 (Aljadaan OR "Al-Jadaan" OR الجدعان OR Jadaan)) OR "رئيس مجلس إدارة هيئة الزكاة والضريبة والجمارك") OR ((((Ministry OR وزارة OR وزاره OR ووزارة OR ووزاره OR لوزارة OR لوزاره OR بوزارة OR بوزاره) NEAR/2 (Finance OR المالية OR الماليه))) AND sourceCountry:"Saudi Arabia") OR (منصة NEAR/1 (اعتماد OR إعتماد OR إحكام OR احكام))',
  },
  { name: "Economy and budgets", color: "#3e63dd", query: "budget OR الميزانية OR economy OR economic OR الاقتصاد OR الاقتصادية OR اقتصادي OR inflation OR التضخم" },
  { name: "Aviation and airport security", color: "#e5484d", query: "(airport OR مطار OR aviation OR الطيران) NEAR/10 (attack OR هجوم OR security OR أمن OR استهداف)" },
  { name: "Energy and oil", color: "#12a594", query: "oil OR crude OR OPEC OR نفط OR النفط OR أوبك" },
  { name: "Iran and the Gulf", color: "#8e4ec6", query: "(Iran OR إيران OR إيران) AND (Gulf OR الخليج OR Saudi OR السعودية)" },
  { name: "Technology and AI", color: "#f76808", query: '"artificial intelligence" OR AI OR "الذكاء الاصطناعي" OR technology OR تقنية OR التكنولوجيا' },
];

const fullIndex = new DemoIndex(fullArticles);
const keepFull = new Set<string>();
for (const t of topics.filter((t) => t.keepFullText)) {
  for (const r of fullIndex.search({ query: t.query, size: 100 }).results) keepFull.add(r.id);
}
const articles = fullArticles.map((a: any) => (keepFull.has(a.id) ? a : { ...a, body: trimBody(a.body) }));
console.log(`${keepFull.size} articles keep their full text (topic hits)`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), articles, sources, topics: topics.map(({ keepFullText, ...t }) => t) }),
);
const index = new DemoIndex(articles);
console.log(`${articles.length} articles, ${sources.length} sources -> ${OUT}`);
for (const t of topics) console.log(`  ${index.search({ query: t.query, size: 1 }).total} articles: ${t.name}`);