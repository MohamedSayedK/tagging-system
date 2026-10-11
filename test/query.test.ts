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
