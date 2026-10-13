import { describe, expect, it } from "vitest";
import { applySuggestion, suggest } from "./queryComplete";

const now = new Date("2026-10-13T09:00:00Z");
const labels = (text: string, caret = text.length) => suggest(text, caret, now)?.items.map((i) => i.label) ?? [];

describe("suggest: fields and operators", () => {
  it("offers field names for a word that starts like one, and nothing for ordinary words", () => {
    expect(labels("sourcet")).toEqual(["sourcetype:"]);
    expect(labels("so")).toEqual(["source:", "sourcetype:", "sourcecountry:"]);
    expect(labels("budget")).toEqual([]);
    expect(labels("s")).toEqual([]); // one letter is too eager
  });

  it("offers stem: for matching other forms of a word", () => {
    expect(labels("ste")).toEqual(["stem:"]);
  });
  it("offers operators only while the typed letters are upper case, since operators are case-sensitive", () => {
    expect(labels("a NE")).toEqual(["NEAR/"]);
    expect(labels("a AN")).toEqual(["AND"]);
    expect(labels("a ne")).toEqual([]);
    expect(labels("a NEAR/")).toEqual([]); // already complete
  });

  it("completes inside brackets and after a quote, and only at the end of a word", () => {
    expect(labels("(a OR titl")).toEqual(["title:"]);
    expect(labels("sourcet more", 7)).toEqual(["sourcetype:"]); // end of the word, text follows
    expect(labels("sourcet more", 4)).toEqual([]); // caret in the middle of a word
    expect(labels('"sourcet')).toEqual([]); // inside a phrase
  });

  it("offers the date ranges with today's date filled in and the caret inside the range", () => {
    const [harvest] = suggest("harvest", 7, now)!.items;
    expect(harvest!.label).toBe("harvestDate:[ ]");
    expect(applySuggestion("a AND harvest", suggest("a AND harvest", 13, now)!, harvest!)).toEqual({
      text: "a AND harvestDate:[2026-10-13 TO *]",
      caret: 29,
    });
  });
});

describe("suggest: values", () => {
  it("offers known source types after sourcetype:, matching case-insensitively", () => {
    expect(labels("sourcetype:onlinenews_n")).toEqual(["ONLINENEWS_NEWSPAPER", "ONLINENEWS_NEWSAGENCY"]);
    expect(labels("sourcetype:blo")).toEqual(["BLOG"]);
  });

  it("offers language codes after lang:", () => {
    expect(labels("lang:a")).toEqual(["ar"]);
  });

  it("replaces only the value that was typed", () => {
    const s = suggest("x AND sourcetype:blo", 20, now)!;
    expect(applySuggestion("x AND sourcetype:blo", s, s.items[0]!)).toEqual({ text: "x AND sourcetype:BLOG", caret: 21 });
  });
});