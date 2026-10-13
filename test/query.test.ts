import { describe, expect, it } from "vitest";
import { compileQuery, parse, QuerySyntaxError } from "../src/query/index.js";

describe("parser", () => {
  it("precedence: AND binds tighter than OR", () => {
    expect(parse("a OR b AND c")).toEqual({
      type: "or",
      children: [
        { type: "term", value: "a" },
        { type: "and", children: [{ type: "term", value: "b" }, { type: "term", value: "c" }] },
      ],
    });
  });

  it("NEAR binds tighter than AND", () => {
    const ast = parse('a AND b NEAR/5 c');
    expect(ast).toMatchObject({ type: "and", children: [{ type: "term" }, { type: "near", distance: 5 }] });
  });

  it("PRE/n is NEAR/n that also requires the order: left before right", () => {
    expect(parse("minister PRE/3 finance")).toEqual({
      type: "near",
      distance: 3,
      ordered: true,
      children: [{ type: "term", value: "minister" }, { type: "term", value: "finance" }],
    });
  });

  it('"words"~n is a phrase whose words may be up to n positions apart', () => {
    expect(parse('"john kennedy"~2')).toEqual({ type: "phrase", value: "john kennedy", slop: 2 });
    expect(parse('title:"bmw electric"~5')).toMatchObject({ type: "field", field: "title", child: { type: "phrase", slop: 5 } });
  });

  it("a ~ that is not a proximity stays part of the word", () => {
    expect(parse("a~b")).toEqual({ type: "term", value: "a~b" });
  });

  it("`A NOT B` is A AND NOT B", () => {
    expect(parse("a NOT b")).toEqual({
      type: "and",
      children: [{ type: "term", value: "a" }, { type: "not", child: { type: "term", value: "b" } }],
    });
  });

  it("handles Arabic phrases and field filters", () => {
    const ast = parse('("حساب المواطن" OR "برنامج") AND sourcetype:ONLINENEWS_NEWSPAPER AND sourcecountry:sa');
    expect(ast.type).toBe("and");
  });

  it("field with group applies to subtree", () => {
    expect(parse("title:(a OR b)")).toMatchObject({ type: "field", field: "title", child: { type: "or" } });
  });

  it("URLs are words, not fields", () => {
    expect(parse("https://x.com/a")).toEqual({ type: "term", value: "https://x.com/a" });
  });

  it("harvestDate:[a TO b] and publishedDate:[a TO b] are date ranges; * leaves a side open", () => {
    expect(parse("harvestDate:[2026-10-01 TO 2026-10-12]")).toEqual({ type: "range", field: "fetched", from: "2026-10-01", to: "2026-10-12" });
    expect(parse("publishedDate:[2026-10-01 TO *]")).toEqual({ type: "range", field: "published", from: "2026-10-01" });
    expect(parse("budget AND publisheddate:[* TO 2026-10-12T10:00:00Z]")).toMatchObject({
      type: "and",
      children: [{ type: "term" }, { type: "range", field: "published", to: "2026-10-12T10:00:00Z" }],
    });
  });

  it("a date range fails loudly when it is malformed", () => {
    expect(() => parse("harvestDate:[2026-10-01]")).toThrow(/at position 0/);
    expect(() => parse("harvestDate:[yesterday TO today]")).toThrow(/yesterday/);
    expect(() => parse("harvestDate:[2026-13-45 TO 2026-14-01]")).toThrow(QuerySyntaxError);
    expect(() => parse("harvestDate:[2026-10-12 TO 2026-10-01]")).toThrow(/before/);
    expect(() => parse("harvestDate:[* TO *]")).toThrow(QuerySyntaxError);
  });

  it("term^n and phrase^n boost how strongly a match counts in the relevance order", () => {
    expect(parse("budget^2")).toEqual({ type: "term", value: "budget", boost: 2 });
    expect(parse('"حساب المواطن"^1.5')).toEqual({ type: "phrase", value: "حساب المواطن", boost: 1.5 });
    expect(parse('"john kennedy"~2^3')).toEqual({ type: "phrase", value: "john kennedy", slop: 2, boost: 3 });
    expect(parse("title:budget^3")).toMatchObject({ type: "field", field: "title", child: { type: "term", value: "budget", boost: 3 } });
    expect(parse("a^2 OR b")).toMatchObject({ type: "or", children: [{ boost: 2 }, { type: "term", value: "b" }] });
  });

  it("a boost that is not a positive number, or sits on a group, fails loudly with a position", () => {
    expect(() => parse("a^")).toThrow(QuerySyntaxError);
    expect(() => parse("a^x")).toThrow(/position 0/);
    expect(() => parse("a^0")).toThrow(QuerySyntaxError);
    expect(() => parse("(a OR b)^2")).toThrow(/term or a phrase/);
    expect(() => parse("a ^2")).toThrow(/term or a phrase/);
  });
  it("START/n:x and MULTIPLE/n:x are prefix operators on one term, phrase or group", () => {
    expect(parse("START/5:budget")).toEqual({ type: "start", n: 5, child: { type: "term", value: "budget" } });
    expect(parse('MULTIPLE/3:"حساب المواطن"')).toEqual({ type: "multiple", n: 3, child: { type: "phrase", value: "حساب المواطن" } });
    expect(parse("START/10:(a OR b)")).toMatchObject({ type: "start", n: 10, child: { type: "or" } });
    expect(parse("x AND MULTIPLE/2:y")).toMatchObject({ type: "and", children: [{ type: "term" }, { type: "multiple", n: 2 }] });
  });

  it("START and MULTIPLE fail loudly when the count is out of range or the operand is missing", () => {
    expect(() => parse("MULTIPLE/1:a")).toThrow(/2 and 10/);
    expect(() => parse("MULTIPLE/11:a")).toThrow(/2 and 10/);
    expect(() => parse("START/0:a")).toThrow(/at least 1/);
    expect(() => parse("START/5:")).toThrow(QuerySyntaxError);
    expect(() => parse("START/5: AND b")).toThrow(QuerySyntaxError);
  });
  it("rejects bad syntax", () => {
    expect(() => parse("(a OR b")).toThrow(QuerySyntaxError);
    expect(() => parse("a OR")).toThrow(QuerySyntaxError);
    expect(() => parse('"abc')).toThrow(QuerySyntaxError);
    expect(() => parse("a)")).toThrow(QuerySyntaxError);
    expect(() => parse("")).toThrow(QuerySyntaxError);
  });
});

describe("compile", () => {
  it("NEAR over OR groups becomes intervals", () => {
    const dsl = JSON.stringify(compileQuery('("a" OR "b") NEAR/8 ("c" OR "d")'));
    expect(dsl).toContain('"intervals"');
    expect(dsl).toContain('"max_gaps":8');
    expect(dsl).toContain('"any_of"');
  });

  it("PRE/n becomes ordered intervals", () => {
    const dsl = JSON.stringify(compileQuery("minister PRE/3 finance"));

    expect(dsl).toContain('"max_gaps":3');
    expect(dsl).toContain('"ordered":true');
    // NEAR leaves the order free.
    expect(JSON.stringify(compileQuery("minister NEAR/3 finance"))).toContain('"all_of":{"ordered":false');
  });

  it('"words"~n becomes a phrase query with slop', () => {
    expect(compileQuery('body:"john kennedy"~2')).toEqual({ match_phrase: { body: { query: "john kennedy", slop: 2 } } });
  });

  it("accepts the Newsdesk names for the text fields: content, headline, byline", () => {
    expect(compileQuery("content:budget")).toEqual(compileQuery("body:budget"));
    expect(compileQuery("headline:budget")).toEqual(compileQuery("title:budget"));
    expect(compileQuery("byline:Jadaan")).toEqual(compileQuery("author:Jadaan"));
  });

  it("a date range becomes a range filter on the harvest (fetched) or publication date, whole days included", () => {
    expect(compileQuery("harvestDate:[2026-10-01 TO 2026-10-12]")).toEqual({
      range: { fetched: { gte: "2026-10-01||/d", lte: "2026-10-12||/d" } },
    });
    expect(compileQuery("publishedDate:[2026-10-01T08:30:00Z TO *]")).toEqual({
      range: { published: { gte: "2026-10-01T08:30:00Z" } },
    });
  });

  it("a date range cannot sit inside NEAR", () => {
    expect(() => compileQuery("a NEAR/3 harvestDate:[2026-10-01 TO 2026-10-12]")).toThrow(QuerySyntaxError);
  });

  it("a boost goes onto the clause it belongs to", () => {
    expect(compileQuery("title:budget^3")).toEqual({ match_phrase: { title: { query: "budget", boost: 3 } } });
    expect(compileQuery('body:"a b"~2^2')).toEqual({ match_phrase: { body: { query: "a b", slop: 2, boost: 2 } } });
    expect(compileQuery("title:bud*^2")).toEqual({ wildcard: { title: { value: "bud*", boost: 2 } } });
    expect(JSON.stringify(compileQuery("budget^2"))).toContain('"boost":2');
  });

  it("a boost inside NEAR is refused: intervals have no weight", () => {
    expect(() => compileQuery("a^2 NEAR/3 b")).toThrow(/boost/i);
  });
  it("stem:x searches the stemmed copy of the text, with phrases, groups and NEAR", () => {
    expect(compileQuery("stem:budget")).toEqual({
      bool: { should: [{ match_phrase: { "title.stem": "budget" } }, { match_phrase: { "body.stem": "budget" } }], minimum_should_match: 1 },
    });
    expect(JSON.stringify(compileQuery('stem:("a b" OR c)'))).toContain('"body.stem"');
    const near = JSON.stringify(compileQuery("stem:(a NEAR/3 b)"));
    expect(near).toContain('"intervals":{"body.stem"');
    expect(near).toContain('"max_gaps":3');
  });

  it("stem: refuses wildcards, which have no stem to match", () => {
    expect(() => compileQuery("stem:budg*")).toThrow(/wildcard/i);
  });
  it("START/n:x looks in the headline, or in the first n words of the body behind a start marker", () => {
    const dsl = compileQuery("START/5:budget") as any;

    expect(dsl.bool.minimum_should_match).toBe(1);
    expect(dsl.bool.should[0]).toEqual({ match_phrase: { title: "budget" } });
    expect(dsl.bool.should[1]).toEqual({
      intervals: {
        "body.start": {
          all_of: {
            ordered: true,
            max_gaps: 4, // the term may begin at word 1 to word 5, which leaves 0 to 4 words after the marker
            // analysed with the plain body analyzer: the start field would put a second marker in front of the query
            intervals: [
              { match: { query: "zzbodystartzz", max_gaps: 0, ordered: true, analyzer: "news_text" } },
              { match: { query: "budget", max_gaps: 0, ordered: true, analyzer: "news_text" } },
            ],
          },
        },
      },
    });
  });

  it("MULTIPLE/n:x asks the body for n separate matches of the operand", () => {
    const dsl = compileQuery("MULTIPLE/3:(a OR b)") as any;

    expect(dsl.intervals.body.all_of.ordered).toBe(false);
    expect(dsl.intervals.body.all_of.intervals).toHaveLength(3);
    expect(dsl.intervals.body.all_of.intervals[0]).toEqual({ any_of: { intervals: [{ match: { query: "a", max_gaps: 0, ordered: true } }, { match: { query: "b", max_gaps: 0, ordered: true } }] } });
  });

  it("START and MULTIPLE refuse operands and contexts they cannot honour", () => {
    expect(() => compileQuery("START/5:(a AND b)")).toThrow(QuerySyntaxError);
    expect(() => compileQuery("MULTIPLE/2:(a AND b)")).toThrow(QuerySyntaxError);
    expect(() => compileQuery("sourcetype:START/5:a")).toThrow(/START/);
    expect(() => compileQuery("stem:MULTIPLE/2:a")).toThrow(/MULTIPLE/);
    expect(() => compileQuery("START/5:a NEAR/3 b")).toThrow(QuerySyntaxError);
  });
  it("NOT goes to must_not", () => {
    expect(compileQuery("a NOT b")).toMatchObject({ bool: { must: [{}], must_not: [{}] } });
  });

  it("keyword fields use term, lowercased", () => {
    expect(compileQuery("sourcetype:BLOG")).toEqual({ term: { sourcetype: "blog" } });
  });

  it("AND inside NEAR is rejected", () => {
    expect(() => compileQuery("(a AND b) NEAR/3 c")).toThrow(QuerySyntaxError);
  });

  it("`term NOT (phrases)` inside NEAR excludes occurrences inside those phrases", () => {
    const dsl = JSON.stringify(compileQuery('(kingdom* NOT ("kingdom of jordan" OR "united kingdom")) NEAR/3 finance'));
    expect(dsl).toContain('"not_contained_by"');
    expect(dsl).toContain("kingdom of jordan");
    expect(dsl).toContain("united kingdom");
  });

  it("authorContains: filters on the author text, not as a plain word", () => {
    expect(compileQuery("authorContains:Jadaan")).toEqual({ match_phrase: { author: "Jadaan" } });
  });

  it("sourceCountry accepts a country name as well as a code", () => {
    expect(compileQuery('sourceCountry:"Saudi Arabia"')).toEqual({ term: { sourcecountry: "sa" } });
    expect(compileQuery("sourceCountry:SA")).toEqual({ term: { sourcecountry: "sa" } });
  });

  it("an unknown country name fails loudly", () => {
    expect(() => compileQuery('sourceCountry:"Atlantis"')).toThrow(QuerySyntaxError);
  });

  it("a NEAR operand that is only a NOT is rejected", () => {
    expect(() => compileQuery("(NOT a) NEAR/3 c")).toThrow(QuerySyntaxError);
  });
});
