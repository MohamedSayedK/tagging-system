import { describe, expect, it } from "vitest";
import { filesAfter } from "../src/registry/gdeltFiles.js";

const url = (id: string, name: string) => `http://data.gdeltproject.org/gdeltv2/${id}.${name}`;
const line = (id: string, name: string) => `1234 abcdef0123456789abcdef0123456789 ${url(id, name)}`;

/** A slice of GDELT's masterfilelist.txt: three feeds per 15-minute stamp, of which we read two. */
const listing = (ids: string[]) =>
  ids
    .flatMap((id) => [line(id, "export.CSV.zip"), line(id, "mentions.CSV.zip"), line(id, "gkg.csv.zip"), line(id, "translation.gkg.csv.zip")])
    .join("\n");

describe("filesAfter", () => {
  it("returns the GKG and translation GKG files newer than the last processed stamp, oldest first", () => {
    const text = listing(["20261011140000", "20261011141500", "20261011143000"]);

    expect(filesAfter(text, "20261011140000")).toEqual([
      { id: "20261011141500", kind: "main", url: url("20261011141500", "gkg.csv.zip") },
      { id: "20261011141500", kind: "translation", url: url("20261011141500", "translation.gkg.csv.zip") },
      { id: "20261011143000", kind: "main", url: url("20261011143000", "gkg.csv.zip") },
      { id: "20261011143000", kind: "translation", url: url("20261011143000", "translation.gkg.csv.zip") },
    ]);
  });
});
