import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.CATALOG_INDEX = "source_catalog_test";
const { client, ensureIndices, CATALOG_INDEX } = await import("../src/search/index-def.js");
const { openSearchCatalog } = await import("../src/search/catalogStore.js");

const entry = (id: string, domain: string, record: Record<string, unknown> = {}) => ({
  id,
  domain,
  record: { id, name: domain, homepage_url: `https://${domain}`, crawl_handling: "candidate_verify_first", ...record },
});

describe("openSearchCatalog (needs OpenSearch)", () => {
  const drop = () => client.indices.delete({ index: CATALOG_INDEX }, { ignore: [404] });
  beforeAll(async () => {
    await drop();
    await ensureIndices();
  });
  afterAll(drop);

  it("reads an empty catalog when nothing was ever imported, so the crawl runs without one", async () => {
    await drop();
    expect(await openSearchCatalog().all()).toEqual([]);
    await ensureIndices();
  });

  it("stores every imported record and reads them back with their original fields", async () => {
    const store = openSearchCatalog();

    await store.importEntries([entry("OUT-1", "angop.ao", { priority: "P1" }), entry("OUT-2", "bbc.com")]);

    const all = await store.all();
    expect(all.map((e) => e.id).sort()).toEqual(["OUT-1", "OUT-2"]);
    expect(all.find((e) => e.id === "OUT-1")).toMatchObject({ domain: "angop.ao", record: { priority: "P1" } });
  });

  it("keeps our verification result when the file is imported again with changed business fields", async () => {
    const store = openSearchCatalog();
    await store.saveVerification("OUT-1", { status: "active", checkedAt: "2026-10-25T10:00:00.000Z", identity: "name_matches" });

    await store.importEntries([entry("OUT-1", "angop.ao", { priority: "P2" })]);

    const again = (await store.all()).find((e) => e.id === "OUT-1");
    expect(again?.record.priority).toBe("P2");
    expect(again?.verification).toEqual({ status: "active", checkedAt: "2026-10-25T10:00:00.000Z", identity: "name_matches" });
    expect(await store.all()).toHaveLength(2); // a record missing from a later file is not dropped
  });
});
