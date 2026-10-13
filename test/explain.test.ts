import { describe, expect, it } from "vitest";
import { explainTree, parse, unparse } from "../src/query/index.js";

describe("unparse: a query node as text again", () => {
  const roundTrip = (q: string) => unparse(parse(q));

  it("writes terms, phrases, fields, boosts, ranges and proximity the way they are typed", () => {
    expect(roundTrip('title:budget^2 AND "حساب المواطن"~2')).toBe('title:budget^2 AND "حساب المواطن"~2');
    expect(roundTrip("a NEAR/5 b PRE/2 c")).toBe("a NEAR/5 b PRE/2 c");
    expect(roundTrip("harvestDate:[2026-10-01 TO *]")).toBe("harvestDate:[2026-10-01 TO *]");
    expect(roundTrip("stem:(a OR b)")).toBe("stem:(a OR b)");
  });

  it("brackets only where precedence needs them, and the result parses back to the same query", () => {
    expect(roundTrip("a AND (b OR c)")).toBe("a AND (b OR c)");
    expect(roundTrip("(a AND b) OR c")).toBe("a AND b OR c");
    expect(roundTrip("a NOT (b OR c)")).toBe("a AND NOT (b OR c)");
    for (const q of ["a AND (b OR c)", "(a OR b) NEAR/3 c", "NOT a OR b", 'x NOT (y NEAR/2 "z w")']) {
      expect(parse(unparse(parse(q)))).toEqual(parse(q));
    }
  });
});

describe("explainTree", () => {
  it("lists the clauses of a query as a tree, each with its own query to test against an article", () => {
    const tree = explainTree(parse("(a OR b) AND NOT c"));

    expect(tree).toMatchObject({ kind: "and", label: "(a OR b) AND NOT c" });
    expect(tree.children.map((c) => [c.kind, c.label])).toEqual([
      ["or", "a OR b"],
      ["not", "NOT c"],
    ]);
    expect(tree.children[0]!.children.map((c) => c.label)).toEqual(["a", "b"]);
    expect(JSON.stringify(tree.children[0]!.children[0]!.dsl)).toContain('"match_phrase"');
  });

  it("keeps a field's context for the clauses under it, and treats NEAR as one clause", () => {
    const tree = explainTree(parse("title:(a OR b) AND c NEAR/3 d"));

    const field = tree.children[0]!;
    expect(field).toMatchObject({ kind: "field", label: "title:(a OR b)" });
    expect(JSON.stringify(field.children[0]!.children[0]!.dsl)).toContain('"title"');
    expect(JSON.stringify(field.children[0]!.children[0]!.dsl)).not.toContain('"body"');
    expect(tree.children[1]).toMatchObject({ kind: "near", children: [] });
  });
});