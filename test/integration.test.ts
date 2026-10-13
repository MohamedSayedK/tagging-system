// Needs a running OpenSearch (docker compose up -d). Uses a throwaway index.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ARTICLES_INDEX = "articles_test";
const { client, ensureIndices, INDEX } = await import("../src/search/index-def.js");
const { search } = await import("../src/search/search.js");
const { explainMatch } = await import("../src/search/explain.js");

const docs = [
  { id: "1", title: "حساب المواطن يعلن موعد الدعم", body: "أعلن برنامج حساب المواطن عن موعد صرف الدعم للمستفيدين في السعودية", source: "A", domain: "a.sa", sourcetype: "onlinenews_newspaper", sourcecountry: "sa", lang: "ar", published: "2026-10-09T10:00:00Z" },
  { id: "2", title: "Citizen account payment date", body: "The citizen account programme announced the support payment date for beneficiaries", source: "B", domain: "b.com", sourcetype: "blog", sourcecountry: "us", lang: "en", published: "2026-10-10T10:00:00Z", fetched: "2026-10-12T08:00:00Z" },
  { id: "3", title: "Weather", body: "citizen walked far away from the account of a long story about the weather today", source: "B", domain: "b.com", sourcetype: "blog", sourcecountry: "us", lang: "en", published: "2026-10-10T11:00:00Z" },
];

describe("search against OpenSearch", () => {
  beforeAll(async () => {
    await client.indices.delete({ index: INDEX }, { ignore: [404] });
    await ensureIndices();
    await client.bulk({
      refresh: true,
      body: docs.flatMap(({ id, ...d }) => [{ index: { _index: INDEX, _id: id } }, d]),
    });
  });
  afterAll(async () => {
    await client.indices.delete({ index: INDEX }, { ignore: [404] });
  });

  const ids = async (query: string, extra = {}) => (await search({ query, ...extra })).results.map((r: any) => r.id).sort();

  it("matches Arabic phrase", async () => expect(await ids('"حساب المواطن"')).toEqual(["1"]));
  it("Arabic normalization: alef variants", async () => expect(await ids('اعلن')).toEqual(["1"]));
  it("NEAR within distance", async () => expect(await ids('citizen NEAR/3 account')).toEqual(["2"]));
  it("NEAR too far", async () => expect(await ids('citizen NEAR/10 account')).toEqual(["2", "3"]));
  it("NEAR over OR groups", async () => expect(await ids('("حساب" OR citizen) NEAR/2 ("المواطن" OR account)')).toEqual(["1", "2"]));
  it("field filters", async () => expect(await ids('citizen AND sourcetype:BLOG AND sourcecountry:us')).toEqual(["2", "3"]));
  it("NOT", async () => expect(await ids('citizen NOT weather')).toEqual(["2"]));
  it("exclude query + date range", async () => {
    expect(await ids("citizen", { exclude: "weather" })).toEqual(["2"]);
    expect(await ids("citizen OR حساب", { from: "2026-10-10T00:00:00Z" })).toEqual(["2", "3"]);
  });
  it("stem: finds other forms of a word that the exact search does not", async () => {
    // body 1 has "للمستفيدين" (for the beneficiaries); body 2 has "beneficiaries"
    expect(await ids("المستفيد")).toEqual([]);
    expect(await ids("stem:المستفيد")).toEqual(["1"]);
    expect(await ids("beneficiary")).toEqual([]);
    expect(await ids("stem:beneficiary")).toEqual(["2"]);
    expect(await ids("stem:beneficiaries AND sourcetype:blog")).toEqual(["2"]);
  });  it("START/n finds a term in the headline or the first n words; MULTIPLE/n counts occurrences in the body", async () => {
    // 2: title "Citizen account payment date", body "The citizen account programme announced the support ..."
    // 3: title "Weather", body "citizen walked far away from the account of a long story about the weather today"
    expect(await ids("START/1:citizen")).toEqual(["2", "3"]); // headline of 2, first body word of 3
    expect(await ids("START/1:account")).toEqual(["2"]);
    expect(await ids("START/2:programme")).toEqual([]);
    expect(await ids("START/4:programme")).toEqual(["2"]);
    expect(await ids('START/3:"citizen walked"')).toEqual(["3"]);
    expect(await ids("MULTIPLE/2:the")).toEqual(["2", "3"]);
    expect(await ids("MULTIPLE/3:the")).toEqual([]);
    expect(await ids("MULTIPLE/2:(citizen OR account)")).toEqual(["2", "3"]);
    expect(await ids("MULTIPLE/3:(citizen OR account)")).toEqual([]);
  });
  it("explains which clauses of a query matched one article", async () => {
    const tree = await explainMatch({ query: "(citizen OR ماليه OR weather) AND NOT programme AND title:account", id: "2" });

    const flat = (n: any): [string, boolean][] => [[n.label, n.matched], ...n.children.flatMap(flat)];
    const byLabel = Object.fromEntries(flat(tree));
    expect(byLabel["citizen"]).toBe(true);
    expect(byLabel["ماليه"]).toBe(false);
    expect(byLabel["weather"]).toBe(false);
    expect(byLabel["citizen OR ماليه OR weather"]).toBe(true);
    expect(byLabel["NOT programme"]).toBe(false); // article 2 mentions the programme, so this clause is why it fails
    expect(byLabel["title:account"]).toBe(true);
    expect(tree.matched).toBe(false);
  });

  it("explains a match that includes a NEAR clause and the exclude query", async () => {
    const tree = await explainMatch({ query: "citizen NEAR/3 account", exclude: "weather", id: "2" });

    expect(tree).toMatchObject({ kind: "near", matched: true, children: [], excluded: false });
    expect(await explainMatch({ query: "citizen", exclude: "programme", id: "2" })).toMatchObject({ matched: true, excluded: true });
  });

  it("stem: highlights the words as written in the article, not the stem", async () => {
    const [hit] = (await search({ query: "stem:المستفيد" })).results as any[];
    expect(hit.highlight.body[0]).toContain("<em>للمستفيدين</em>");

    const [english] = (await search({ query: "stem:beneficiary" })).results as any[];
    expect(english.highlight.body[0]).toContain("<em>beneficiaries</em>");
  });
  it("date ranges in the query: whole days for publishedDate, harvestDate on the fetched time", async () => {
    const all = "citizen OR حساب";
    expect(await ids(`(${all}) AND publishedDate:[2026-10-10 TO 2026-10-10]`)).toEqual(["2", "3"]);
    expect(await ids(`(${all}) AND publishedDate:[2026-10-10T10:30:00Z TO *]`)).toEqual(["3"]);
    expect(await ids(`(${all}) AND harvestDate:[2026-10-12 TO *]`)).toEqual(["2"]);
    expect(await ids(`(${all}) AND harvestDate:[* TO 2026-10-11]`)).toEqual([]);
  });
  it("relevance sort puts boosted matches first; date sorts ignore the boost", async () => {
    const order = async (query: string, sort: string) => (await search({ query, sort: sort as any })).results.map((r: any) => r.id);
    expect(await order("programme^10 OR weather", "relevance")).toEqual(["2", "3"]);
    expect(await order("programme OR weather^10", "relevance")).toEqual(["3", "2"]);
    expect(await order("programme^10 OR weather", "recent")).toEqual(["3", "2"]);
  });  describe("facet filters", () => {
    const all = "citizen OR حساب";
    const counts = (b: { key: string; count: number }[]) => Object.fromEntries(b.map((x) => [x.key, x.count]));

    it("narrows by source type, country and domain (case-insensitive)", async () => {
      expect(await ids(all, { sourcetype: ["BLOG"] })).toEqual(["2", "3"]);
      expect(await ids(all, { sourcecountry: ["sa"] })).toEqual(["1"]);
      expect(await ids(all, { domain: ["b.com"] })).toEqual(["2", "3"]);
    });

    it("filters and counts by language", async () => {
      expect(await ids(all, { lang: ["ar"] })).toEqual(["1"]);
      const r = await search({ query: all });
      expect(counts(r.aggregations.languages)).toEqual({ ar: 1, en: 2 });
      const narrowed = await search({ query: all, lang: "en" });
      expect(counts(narrowed.aggregations.languages)).toEqual({ ar: 1, en: 2 });
      expect(counts(narrowed.aggregations.countries)).toEqual({ us: 2 });
    });

    it("combines facets with AND and values within a facet with OR", async () => {
      expect(await ids(all, { sourcetype: ["blog"], sourcecountry: ["sa"] })).toEqual([]);
      expect(await ids(all, { sourcetype: ["blog", "onlinenews_newspaper"] })).toEqual(["1", "2", "3"]);
    });

    it("keeps each facet's own options visible so more values can be added, while other facets and the chart follow the filter", async () => {
      const r = await search({ query: all, sourcetype: ["blog"] });
      expect(r.total).toBe(2);
      expect(counts(r.aggregations.sourceTypes)).toEqual({ blog: 2, onlinenews_newspaper: 1 });
      expect(counts(r.aggregations.countries)).toEqual({ us: 2 });
      expect(counts(r.aggregations.domains)).toEqual({ "b.com": 2 });
      expect(r.aggregations.overTime.map((b: any) => b.count)).toEqual([2]);
    });
  });

  it("aggregations", async () => {
    const r = await search({ query: "citizen OR حساب" });
    expect(r.total).toBe(3);
    expect(r.aggregations.sourceTypes.length).toBe(2);
    expect(r.aggregations.overTime.length).toBe(2);
  });
});
