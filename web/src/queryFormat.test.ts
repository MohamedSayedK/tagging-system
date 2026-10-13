import { describe, expect, it } from "vitest";
import { parse } from "../../src/query/index.js";
import { formatQuery } from "./queryFormat";

const saudi =
  '(("وزير المالية" OR "Minister of Finance") NEAR/6 (السعودية OR Saudi OR "المملكة العربية السعودية")) ' +
  'AND NOT (sourcetype:SOCIALMEDIA_TWITTER OR title:"sports") ' +
  'AND (محمد NEAR/2 الجدعان OR "Mohammed Al-Jadaan" OR (Jadaan PRE/1 minister))';

describe("formatQuery", () => {
  it("leaves a short query on one line and collapses stray whitespace", () => {
    expect(formatQuery("  budget   AND\n  (saudi   OR  ksa) ")).toBe("budget AND (saudi OR ksa)");
  });

  it("breaks a long query before each top-level AND / OR and indents nested groups", () => {
    expect(formatQuery(saudi)).toBe(
      [
        '(("وزير المالية" OR "Minister of Finance") NEAR/6 (السعودية OR Saudi OR "المملكة العربية السعودية"))',
        "AND NOT (sourcetype:SOCIALMEDIA_TWITTER OR title:\"sports\")",
        "AND (",
        "  محمد NEAR/2 الجدعان",
        '  OR "Mohammed Al-Jadaan"',
        "  OR (Jadaan PRE/1 minister)",
        ")",
      ].join("\n"),
    );
  });

  it("keeps a long list of synonyms together instead of one word per line", () => {
    const synonyms = "(Ministry OR Minister OR وزارة OR وزاره OR وزير OR ووزارة OR ووزاره OR ووزير OR لوزارة OR لوزاره)";
    expect(formatQuery(`${synonyms} AND budget`)).toBe(`${synonyms}\nAND budget`);
  });

  it("never changes what the query means", () => {
    expect(parse(formatQuery(saudi))).toEqual(parse(saudi));
  });

  it("keeps a field attached to its operand", () => {
    expect(formatQuery('title:"a b"   source:x')).toBe('title:"a b" source:x');
  });

  it("copes with unbalanced brackets and unfinished phrases without losing text", () => {
    expect(formatQuery('(a OR  "b')).toBe('(a OR "b');
    expect(formatQuery("a ) b")).toBe("a ) b");
  });
});
