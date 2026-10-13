import { describe, expect, it } from "vitest";
import { highlightQuery, matchBracket } from "./queryHighlight";

const kinds = (text: string) =>
  highlightQuery(text)
    .filter((s) => s.kind !== "space")
    .map((s) => [s.text, s.kind]);

describe("highlightQuery: colour classes", () => {
  it("tells boolean operators, proximity operators, fields, phrases and plain terms apart", () => {
    expect(kinds('title:budget AND "حساب المواطن" NEAR/8 دعم OR NOT x PRE/2 y')).toEqual([
      ["title:", "field"],
      ["budget", "term"],
      ["AND", "and"],
      ['"حساب المواطن"', "phrase"],
      ["NEAR/8", "proximity"],
      ["دعم", "term"],
      ["OR", "or"],
      ["NOT", "not"],
      ["x", "term"],
      ["PRE/2", "proximity"],
      ["y", "term"],
    ]);
  });

  it("colours a date range as one unit, brackets and TO included", () => {
    expect(kinds("budget harvestDate:[2026-10-01 TO *] AND x")).toEqual([
      ["budget", "term"],
      ["harvestDate:[2026-10-01 TO *]", "range"],
      ["AND", "and"],
      ["x", "term"],
    ]);
  });

  it("sets a boost apart from the term or phrase it weighs", () => {
    expect(kinds('budget^2 "a b"~1^3 title:x^1.5')).toEqual([
      ["budget", "term"],
      ["^2", "boost"],
      ['"a b"~1', "phrase"],
      ["^3", "boost"],
      ["title:", "field"],
      ["x", "term"],
      ["^1.5", "boost"],
    ]);
  });
  it("colours START/n: and MULTIPLE/n: as proximity operators, apart from their operand", () => {
    expect(kinds('START/5:budget MULTIPLE/3:"a b" START/2:(x OR y)')).toEqual([
      ["START/5:", "proximity"],
      ["budget", "term"],
      ["MULTIPLE/3:", "proximity"],
      ['"a b"', "phrase"],
      ["START/2:", "proximity"],
      ["(", "paren"],
      ["x", "term"],
      ["OR", "or"],
      ["y", "term"],
      [")", "paren"],
    ]);
  });

  it("keeps the phrase slop with its phrase and treats lowercase operators as plain terms", () => {
    expect(kinds('"john kennedy"~2 and')).toEqual([['"john kennedy"~2', "phrase"], ["and", "term"]]);
  });

  it("covers the whole text so the highlight lines up with what was typed", () => {
    const text = '(a  OR\n"b" )';
    expect(highlightQuery(text).map((s) => s.text).join("")).toBe(text);
  });

  it("still highlights an unfinished phrase instead of throwing", () => {
    expect(kinds('a "unfinished')).toEqual([["a", "term"], ['"unfinished', "phrase"]]);
  });
});

describe("matchBracket: the pair next to the caret", () => {
  const text = "(a OR (b AND c)) d";

  it("finds the partner of the bracket just before the caret", () => {
    expect(matchBracket(text, 7)).toEqual({ open: 6, close: 14 }); // caret right after the inner "("
    expect(matchBracket(text, 15)).toEqual({ open: 6, close: 14 }); // right after the inner ")"
  });

  it("falls back to the bracket just after the caret", () => {
    expect(matchBracket(text, 0)).toEqual({ open: 0, close: 15 });
  });

  it("returns nothing when no bracket touches the caret", () => {
    expect(matchBracket(text, 3)).toBeNull();
  });

  it("ignores brackets inside a phrase", () => {
    expect(matchBracket('"a (b" c', 4)).toBeNull();
  });

  it("reports an unmatched bracket as having no partner", () => {
    expect(matchBracket("(a OR b", 1)).toEqual({ open: 0, close: null });
    expect(matchBracket("a)", 2)).toEqual({ open: null, close: 1 });
  });
});

describe("highlightQuery: bracket depth", () => {
  it("numbers nesting depth on each bracket and flags the ones with no partner", () => {
    const parens = highlightQuery("((a) b))")
      .filter((s) => s.kind === "paren")
      .map((s) => [s.text, s.depth, s.unmatched]);
    expect(parens).toEqual([
      ["(", 0, false],
      ["(", 1, false],
      [")", 1, false],
      [")", 0, false],
      [")", 0, true],
    ]);
  });
});
