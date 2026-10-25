import { describe, expect, it } from "vitest";
import { catalogDomains, catalogReport, importCheck, parseCatalog, toCsv } from "../src/registry/catalog.js";

const record = (over: Record<string, unknown> = {}) => ({
  id: "OUT-00001",
  name: "ANGOP",
  country: "Angola",
  region: "Africa (Sub-Saharan)",
  outlet_type: "News agency / wire",
  priority: "P1",
  homepage_url: "https://angop.ao",
  identity_verification: "unconfirmed",
  crawl_handling: "candidate_verify_first",
  last_http_status: "403",
  ...over,
});
const file = (sources: unknown[], total = sources.length) => JSON.stringify({ summary: { total_sources: total }, sources });

describe("source catalog: parsing the business file", () => {
  it("keeps every record under its own ID with all its original fields, and derives the domain from the homepage", () => {
    const { entries, rejected } = parseCatalog(
      file([record(), record({ id: "OUT-00002", name: "BBC Arabic", homepage_url: "https://www.BBC.com/arabic" })]),
    );

    expect(rejected).toEqual([]);
    expect(entries.map((e) => [e.id, e.domain])).toEqual([
      ["OUT-00001", "angop.ao"],
      ["OUT-00002", "bbc.com"],
    ]);
    expect(entries[0]!.record).toEqual(record());
  });

  it("reports records it cannot take, with the reason, instead of dropping them", () => {
    const { entries, rejected } = parseCatalog(
      file([record(), record({ id: undefined }), record({ id: "OUT-00003", homepage_url: "angop dot ao" }), record()]),
    );

    expect(entries.map((e) => e.id)).toEqual(["OUT-00001"]);
    expect(rejected).toEqual([
      { index: 1, reason: "no id" },
      { index: 2, id: "OUT-00003", reason: 'homepage_url is not a URL: "angop dot ao"' },
      { index: 3, id: "OUT-00001", reason: "duplicate id" },
    ]);
  });

  it("says how many records the file claims to hold, so an import can be checked against it", () => {
    expect(parseCatalog(file([record()], 1552)).declaredTotal).toBe(1552);
  });
});

describe("source catalog: which domains may be crawled", () => {
  const entries = (...rows: [string, string, string][]) =>
    parseCatalog(file(rows.map(([id, url, crawl_handling]) => record({ id, homepage_url: url, crawl_handling })))).entries;

  it("allows domains to verify or check, holds those on hold, quarantined or archive-only", () => {
    const { crawlable, held } = catalogDomains(
      entries(
        ["A", "https://verify.example", "candidate_verify_first"],
        ["B", "https://seen.example", "candidate_check_permissions"],
        ["C", "https://forbidden.example", "hold_check_access_policies"],
        ["D", "https://wrong.example", "quarantine_do_not_crawl"],
        ["E", "https://old.example", "archive_only_do_not_crawl"],
      ),
    );

    expect([...crawlable].sort()).toEqual(["seen.example", "verify.example"]);
    expect([...held].sort()).toEqual(["forbidden.example", "old.example", "wrong.example"]);
  });

  it("allows a shared domain when any of its sections may be crawled, and holds an unknown rule", () => {
    const { crawlable, held } = catalogDomains(
      entries(
        ["A", "https://bbc.com/arabic", "hold_check_access_policies"],
        ["B", "https://www.bbc.com/news", "candidate_verify_first"],
        ["C", "https://odd.example", "something_new"],
      ),
    );

    expect([...crawlable]).toEqual(["bbc.com"]);
    expect([...held]).toEqual(["odd.example"]);
  });
});

describe("source catalog: checking an import", () => {
  it("counts what the file declared, what was taken and what is stored, and names any record that is missing", () => {
    const parsed = parseCatalog(
      file(
        [
          record({ id: "A", identity_verification: "unconfirmed" }),
          record({ id: "B", identity_verification: "unconfirmed" }),
          record({ id: "C", identity_verification: "publisher_page_observed" }),
          record({ id: undefined }),
        ],
        5,
      ),
    );

    const check = importCheck(parsed, new Set(["A", "C"]));

    expect(check).toEqual({
      declared: 5,
      parsed: 3,
      stored: 2,
      rejected: [{ index: 3, reason: "no id" }],
      missing: ["B"],
      byIdentity: { unconfirmed: 2, publisher_page_observed: 1 },
      ok: false,
    });
  });

  it("is ok only when every declared record was taken and stored", () => {
    const parsed = parseCatalog(file([record({ id: "A" })], 1));
    expect(importCheck(parsed, new Set(["A"])).ok).toBe(true);
  });
});

describe("source catalog: the report for business", () => {
  const at = "2026-10-25T10:00:00.000Z";
  const rows = catalogReport(
    [
      { id: "A", domain: "arabnews.com", record: record({ id: "A", name: "Arab News" }) },
      { id: "B", domain: "good.com", record: record({ id: "B", name: "Good Daily" }), verification: { status: "active", checkedAt: at, identity: "name_matches", siteName: "Good Daily" } },
      { id: "C", domain: "nofeed.com", record: record({ id: "C", name: "No Feed" }), verification: { status: "no_feed", checkedAt: at, identity: "name_not_found", reason: "too few items (1)" } },
      { id: "D", domain: "forbidden.example", record: record({ id: "D", crawl_handling: "hold_check_access_policies" }) },
      { id: "E", domain: "later.example", record: record({ id: "E" }) },
    ],
    { curatedDomains: new Set(["arabnews.com"]), crawledDomains: new Set(["good.com"]) },
  );
  const state = (id: string) => rows.find((r) => r.id === id)?.state;

  it("says for every record whether it is crawled, and if not, why", () => {
    expect(rows).toHaveLength(5);
    expect(state("A")).toBe("crawled (curated source)");
    expect(state("B")).toBe("crawled");
    expect(state("C")).toBe("not crawled: no_feed");
    expect(state("D")).toBe("held by business rule: hold_check_access_policies");
    expect(state("E")).toBe("waiting for verification");
  });

  it("keeps the business's own fields beside our findings", () => {
    expect(rows.find((r) => r.id === "C")).toMatchObject({
      name: "No Feed",
      country: "Angola",
      priority: "P1",
      crawl_handling: "candidate_verify_first",
      identity_verification: "unconfirmed",
      checked_at: at,
      identity_evidence: "name_not_found",
      reason: "too few items (1)",
    });
  });

  it("writes CSV that quotes commas, quotes and line breaks", () => {
    const csv = toCsv([{ a: 'say "hi", then', b: "x\ny" }]);
    expect(csv).toBe('a,b\n"say ""hi"", then","x\ny"\n');
  });
});
