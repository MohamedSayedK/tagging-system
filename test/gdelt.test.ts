import { describe, expect, it } from "vitest";
import { parseGkg } from "../src/registry/gdelt.js";

/** One GKG 2.1 row: 27 tab-separated columns; only the ones the registry reads are filled. */
function row({
  date = "20261011144500",
  domain = "example.com",
  url = "https://example.com/a",
  translation = "",
} = {}) {
  const c = Array<string>(27).fill("");
  c[0] = `${date}-0`;
  c[1] = date;
  c[2] = "1";
  c[3] = domain;
  c[4] = url;
  c[25] = translation;
  return c.join("\t");
}

describe("parseGkg", () => {
  it("returns one observation per row: the source's domain and when GDELT saw it", () => {
    const observations = parseGkg(row({ domain: "arabnews.com", date: "20261011144500" }));

    expect(observations.map((o) => [o.domain, o.seenAt])).toEqual([["arabnews.com", "2026-10-11T14:45:00.000Z"]]);
  });

  it("lowercases the domain and drops a leading www. so one outlet is one domain", () => {
    const text = [row({ domain: "WWW.ArabNews.com" }), row({ domain: "arabnews.com" })].join("\n");

    expect(parseGkg(text).map((o) => o.domain)).toEqual(["arabnews.com", "arabnews.com"]);
  });

  it("skips blank, truncated and domain-less rows instead of failing the whole file", () => {
    const text = [
      row({ domain: "a.com" }),
      "",
      "20261011144500-0\t20261011144500", // truncated mid-row
      row({ domain: "" }),
      row({ domain: "b.com", date: "not-a-date" }),
      row({ domain: "c.com" }) + "\r", // CRLF line ending
    ].join("\n");

    expect(parseGkg(text).map((o) => o.domain)).toEqual(["a.com", "c.com"]);
  });

  it("reports the source language from the translation info, and eng when the row was not translated", () => {
    const text = [
      row({ domain: "okaz.com.sa", translation: "srclc:ara;eng:Moses 2.1.1 / v2.1" }),
      row({ domain: "arabnews.com", translation: "" }),
    ].join("\n");

    expect(parseGkg(text).map((o) => [o.domain, o.language])).toEqual([
      ["okaz.com.sa", "ara"],
      ["arabnews.com", "eng"],
    ]);
  });
});
