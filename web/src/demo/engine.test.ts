import { describe, expect, it } from "vitest";
import { DemoArticle, DemoIndex } from "./engine";

const doc = (id: string, over: Partial<DemoArticle>): DemoArticle => ({
  id,
  url: `https://x.test/${id}`,
  title: "",
  body: "",
  source: "S",
  domain: "x.test",
  sourcetype: "onlinenews_newspaper",
  sourcecountry: "sa",
  lang: "ar",
  published: "2026-10-10T10:00:00Z",
  ...over,
});

const docs: DemoArticle[] = [
  doc("1", { title: "حساب المواطن يعلن موعد الدعم", body: "أعلن برنامج حساب المواطن عن موعد صرف الدعم للمستفيدين في السعودية", domain: "a.sa", published: "2026-10-09T10:00:00Z" }),
  doc("2", { title: "Citizen account payment date", body: "The citizen account programme announced the support payment date for beneficiaries", sourcetype: "blog", sourcecountry: "us", lang: "en", domain: "b.com", published: "2026-10-10T10:00:00Z" }),
  doc("3", { title: "Weather", body: "citizen walked far away from the account of a long story about the weather today", sourcetype: "blog", sourcecountry: "us", lang: "en", domain: "b.com", published: "2026-10-10T11:00:00Z" }),
];
const index = new DemoIndex(docs);
const ids = (query: string, extra: object = {}) => index.search({ query, size: 100, ...extra }).results.map((r) => r.id).sort();

// These mirror test/integration.test.ts: the demo must answer the way the real engine does.
describe("demo engine: same answers as the OpenSearch engine", () => {
  it("matches an Arabic phrase", () => expect(ids('"حساب المواطن"')).toEqual(["1"]));
  it("normalises alef variants", () => expect(ids("اعلن")).toEqual(["1"]));
  it("NEAR within a distance", () => expect(ids("citizen NEAR/3 account")).toEqual(["2"]));
  it("NEAR too far for 3 but fine for 10", () => expect(ids("citizen NEAR/10 account")).toEqual(["2", "3"]));
  it("NEAR over OR groups", () => expect(ids('("حساب" OR citizen) NEAR/2 ("المواطن" OR account)')).toEqual(["1", "2"]));
  it("PRE/n needs the left operand first", () => {
    expect(ids("citizen PRE/3 account")).toEqual(["2"]);
    expect(ids("account PRE/3 citizen")).toEqual([]);
    expect(ids("citizen PRE/10 account")).toEqual(["2", "3"]);
  });
  it('"words"~n allows the words to be up to n positions apart', () => {
    // body: "citizen account programme announced the support payment" puts 5 words between them
    expect(ids('body:"citizen payment"~5')).toEqual(["2"]);
    expect(ids('body:"citizen payment"~4')).toEqual([]);
    // the title has them two words apart, so a title search finds it with a small slop
    expect(ids('title:"citizen payment"~1')).toEqual(["2"]);
  });
  it("accepts the Newsdesk field names content: and headline:", () => {
    expect(ids("headline:weather")).toEqual(["3"]);
    expect(ids("content:programme")).toEqual(["2"]);
  });
  it("publishedDate:[a TO b] covers whole days, and an open side reaches past the data", () => {
    expect(ids("publishedDate:[2026-10-10 TO 2026-10-10]")).toEqual(["2", "3"]);
    expect(ids("publishedDate:[2026-10-10T10:30:00Z TO *]")).toEqual(["3"]);
    expect(ids("publishedDate:[* TO 2026-10-09] OR weather")).toEqual(["1", "3"]);
    expect(ids("citizen AND publishedDate:[2026-10-10 TO *]")).toEqual(["2", "3"]);
  });
  it("harvestDate uses the harvest time when the article has one, else its publication date", () => {
    const withHarvest = new DemoIndex([
      doc("a", { title: "alpha", published: "2026-10-01T00:00:00Z", fetched: "2026-10-12T08:00:00Z" }),
      doc("b", { title: "alpha", published: "2026-10-12T00:00:00Z" }),
    ]);
    const found = (q: string) => withHarvest.search({ query: q, size: 10 }).results.map((r) => r.id).sort();
    expect(found("alpha AND harvestDate:[2026-10-12 TO 2026-10-12]")).toEqual(["a", "b"]);
    expect(found("alpha AND publishedDate:[2026-10-12 TO 2026-10-12]")).toEqual(["b"]);
  });
  it("a date range inside NEAR is refused, as the real engine does", () => {
    expect(() => index.search({ query: "citizen NEAR/3 harvestDate:[2026-10-01 TO *]" })).toThrow();
  });
  it("relevance sort puts boosted matches first and falls back to newest first on equal scores", () => {
    const order = (q: string, sort: "relevance" | "recent") => index.search({ query: q, sort, size: 10 }).results.map((r) => r.id);
    expect(order("programme^10 OR weather", "relevance")).toEqual(["2", "3"]);
    expect(order("programme OR weather^10", "relevance")).toEqual(["3", "2"]);
    expect(order("programme^10 OR weather", "recent")).toEqual(["3", "2"]);
    expect(order("body:citizen", "relevance")).toEqual(["3", "2"]); // one hit each: same score, newest first
  });
  it("a boost inside NEAR is refused, as the real engine does", () => {
    expect(() => index.search({ query: "citizen^2 NEAR/3 account" })).toThrow();
  });  it("stem: finds other forms of a word that the exact search does not (light Arabic stemmer, English plurals)", () => {
    // body 1 has "للمستفيدين" (for the beneficiaries); body 2 has "beneficiaries"
    expect(ids("المستفيد")).toEqual([]);
    expect(ids("stem:المستفيد")).toEqual(["1"]);
    expect(ids("beneficiary")).toEqual([]);
    expect(ids("stem:beneficiary")).toEqual(["2"]);
    expect(ids("stem:beneficiaries AND sourcetype:blog")).toEqual(["2"]);
    expect(ids('stem:"citizen accounts"')).toEqual(["2"]); // phrase: both words stemmed
    expect(ids("stem:(citizens NEAR/3 account)")).toEqual(["2"]);
  });
  it("stem: unifies a word with and without its article and conjunction (وزير, الوزير, والوزير)", () => {
    const words = new DemoIndex([
      doc("a", { title: "قال الوزير", body: "" }),
      doc("b", { title: "وزير المالية", body: "" }),
      doc("c", { title: "تحدث والوزير", body: "" }),
      doc("d", { title: "الميزانية", body: "" }),
    ]);
    const found = (q: string) => words.search({ query: q, size: 10 }).results.map((r) => r.id).sort();

    expect(found("وزير")).toEqual(["b"]);
    expect(found("stem:وزير")).toEqual(["a", "b", "c"]);
    expect(found("stem:الوزير")).toEqual(["a", "b", "c"]);
  });
  it("stem: highlights the words as written, not their stems", () => {
    const body = (q: string) => index.search({ query: q, size: 10 }).results[0]!.highlight?.body?.[0];

    expect(body("stem:المستفيد")).toContain("<em>للمستفيدين</em>");
    expect(body("stem:beneficiary")).toContain("<em>beneficiaries</em>");
    expect(body("beneficiary OR programme")).not.toContain("<em>beneficiaries</em>"); // exact search leaves it alone
  });
  it("explains which clauses of a query matched one article, like the real engine", () => {
    const tree = index.explain({ query: "(citizen OR حساب OR weather) AND NOT programme AND title:account", id: "2" })!;

    const flat = (n: any): [string, boolean][] => [[n.label, n.matched], ...n.children.flatMap(flat)];
    const by = Object.fromEntries(flat(tree));
    expect(by["citizen"]).toBe(true);
    expect(by["حساب"]).toBe(false);
    expect(by["weather"]).toBe(false);
    expect(by["citizen OR حساب OR weather"]).toBe(true);
    expect(by["NOT programme"]).toBe(false);
    expect(by["title:account"]).toBe(true);
    expect(tree.matched).toBe(false);
    expect(index.explain({ query: "citizen", exclude: "programme", id: "2" })).toMatchObject({ matched: true, excluded: true });
    expect(index.explain({ query: "citizen", id: "nope" })).toBeNull();
  });
  it("stem: refuses wildcards, as the real engine does", () => {
    expect(() => index.search({ query: "stem:benef*" })).toThrow(/wildcard/i);
  });  it("field filters are case-insensitive", () => expect(ids("citizen AND sourcetype:BLOG AND sourcecountry:US")).toEqual(["2", "3"]));
  it("NOT", () => expect(ids("citizen NOT weather")).toEqual(["2"]));
  it("wildcards", () => expect(ids("citiz*")).toEqual(["2", "3"]));
  it("title: only searches titles", () => expect(ids("title:weather")).toEqual(["3"]));
  it("exclude query and date range", () => {
    expect(ids("citizen", { exclude: "weather" })).toEqual(["2"]);
    expect(ids("citizen OR حساب", { from: "2026-10-10T00:00:00Z" })).toEqual(["2", "3"]);
  });
  it("`term NOT (phrase)` inside NEAR ignores occurrences inside that phrase", () => {
    expect(ids('(citizen NOT "citizen account") NEAR/10 account')).toEqual(["3"]);
  });
  it("a bare NOT or an AND inside NEAR is still rejected", () => {
    expect(() => index.search({ query: "(NOT citizen) NEAR/3 account" })).toThrow(/not allowed inside NEAR/i);
    expect(() => index.search({ query: "(citizen AND account) NEAR/3 payment" })).toThrow(/not allowed inside NEAR/i);
  });
  it("sourceCountry accepts an English country name", () => {
    expect(ids('citizen AND sourceCountry:"United States"')).toEqual(["2", "3"]);
  });
  it("an unknown country name fails loudly", () => {
    expect(() => index.search({ query: 'sourceCountry:"Atlantis"' })).toThrow(/Unknown country/);
  });
  it("rejects bad syntax with the parser's error", () => {
    expect(() => index.search({ query: "(a OR b" })).toThrow(/parenthesis/i);
  });
});

describe("demo engine: results shape", () => {
  it("sorts newest first by default, oldest on request, and pages", () => {
    expect(index.search({ query: "citizen OR حساب" }).results.map((r) => r.id)).toEqual(["3", "2", "1"]);
    expect(index.search({ query: "citizen OR حساب", sort: "oldest" }).results.map((r) => r.id)).toEqual(["1", "2", "3"]);
    const page = index.search({ query: "citizen OR حساب", size: 2, offset: 2 });
    expect(page.total).toBe(3);
    expect(page.results.map((r) => r.id)).toEqual(["1"]);
  });

  it("highlights matched words in a body snippet", () => {
    const r = index.search({ query: "payment" }).results[0]!;
    expect(r.highlight?.body?.[0]).toContain("<em>payment</em>");
  });

  it("highlights Arabic matches through normalisation", () => {
    const r = index.search({ query: "اعلن" }).results[0]!;
    expect(r.highlight?.body?.[0]).toContain("<em>أعلن</em>");
  });
});

describe("demo engine: facets", () => {
  it("OR within a facet, AND across, with each facet's own options kept", () => {
    expect(ids("citizen OR حساب", { sourcetype: ["blog"] })).toEqual(["2", "3"]);
    expect(ids("citizen OR حساب", { sourcetype: ["blog"], sourcecountry: ["sa"] })).toEqual([]);

    const a = index.search({ query: "citizen OR حساب", sourcetype: ["blog"] }).aggregations;
    expect(Object.fromEntries(a.sourceTypes.map((b) => [b.key, b.count]))).toEqual({ blog: 2, onlinenews_newspaper: 1 });
    expect(Object.fromEntries(a.countries.map((b) => [b.key, b.count]))).toEqual({ us: 2 });
    expect(a.overTime.map((b) => b.count)).toEqual([2]);
  });

  it("lists every value of a facet, searchable, under the other filters", () => {
    expect(index.facetValues({ query: "citizen OR حساب", facet: "domain" }).map((b) => b.key)).toEqual(["b.com", "a.sa"]);
    expect(index.facetValues({ query: "citizen OR حساب", facet: "domain", q: "A.S" })).toEqual([{ key: "a.sa", count: 1 }]);
    expect(index.facetValues({ query: "citizen OR حساب", facet: "domain", sourcetype: ["blog"] }).map((b) => b.key)).toEqual(["b.com"]);
  });
});

describe("demo engine: time buckets", () => {
  it("uses days for a short span and fills empty days", () => {
    const d = new DemoIndex([doc("a", { title: "x", published: "2026-10-01T10:00:00Z" }), doc("b", { title: "x", published: "2026-10-04T10:00:00Z" })]);
    const r = d.search({ query: "x" }).aggregations;
    expect(r.interval).toBe("day");
    expect(r.overTime.map((b) => [b.key.slice(0, 10), b.count])).toEqual([["2026-10-01", 1], ["2026-10-02", 0], ["2026-10-03", 0], ["2026-10-04", 1]]);
  });

  it("switches to weeks and months as the span grows", () => {
    const weeks = new DemoIndex([doc("a", { title: "x", published: "2026-03-01T10:00:00Z" }), doc("b", { title: "x", published: "2026-10-01T10:00:00Z" })]);
    expect(weeks.search({ query: "x" }).aggregations.interval).toBe("week");
    const months = new DemoIndex([doc("a", { title: "x", published: "2023-01-15T10:00:00Z" }), doc("b", { title: "x", published: "2026-10-01T10:00:00Z" })]);
    expect(months.search({ query: "x" }).aggregations.interval).toBe("month");
  });
});

describe("demo engine: shifting the clock", () => {
  it("moves every date so the newest article is 'now'", () => {
    const shifted = DemoIndex.shifted(docs, new Date("2027-01-01T12:00:00Z"));
    const newest = shifted.search({ query: "citizen OR حساب" }).results[0]!;
    expect(newest.published).toBe("2027-01-01T12:00:00.000Z");
  });
});