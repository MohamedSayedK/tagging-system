import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSources } from "../src/ingest/sources.js";

function file(yaml: string) {
  const p = join(mkdtempSync(join(tmpdir(), "sources-")), "sources.yaml");
  writeFileSync(p, yaml);
  return p;
}

const base = `    domain: a.com
    sourcetype: BLOG
    feeds:
      - { url: "https://a.com/rss", kind: rss }
`;

describe("loadSources", () => {
  it("defaults the crawl interval to 15 minutes and reads per-source overrides", () => {
    const sources = loadSources(
      file(`sources:\n  - name: A\n${base}  - name: B\n    interval: 2h\n${base}`),
    );

    expect(sources.map((s) => [s.name, s.interval])).toEqual([["A", 900_000], ["B", 7_200_000]]);
  });

  it("caps how many of a feed's newest items are read per run: 100 by default, overridable", () => {
    const sources = loadSources(file(`sources:\n  - name: A\n${base}  - name: B\n    maxItems: 25\n${base}`));

    expect(sources.map((s) => s.maxItems)).toEqual([100, 25]);
  });

  it("rejects a maxItems that is not a positive whole number", () => {
    expect(() => loadSources(file(`sources:\n  - name: Big\n    maxItems: 0\n${base}`))).toThrow(/Big.*maxItems/);
  });

  it("rejects an invalid interval, naming the source", () => {
    expect(() => loadSources(file(`sources:\n  - name: Slow\n    interval: whenever\n${base}`))).toThrow(/Slow.*interval/i);
  });

  it("rejects duplicate source names, since names key the run history", () => {
    expect(() => loadSources(file(`sources:\n  - name: A\n${base}  - name: A\n${base}`))).toThrow(/duplicate/i);
  });
});

