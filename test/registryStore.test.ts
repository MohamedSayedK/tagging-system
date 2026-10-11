import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.REGISTRY_INDEX = "source_registry_test";
const { client, ensureIndices, REGISTRY_INDEX, REGISTRY_STATE_INDEX } = await import("../src/search/index-def.js");
const { openSearchRegistry } = await import("../src/search/registryStore.js");

const record = (domain: string, extra = {}) => ({
  domain,
  firstSeen: "2026-10-11T08:00:00.000Z",
  lastSeen: "2026-10-11T12:00:00.000Z",
  articleCount: 3,
  languages: ["eng"],
  ...extra,
});

describe("openSearchRegistry (needs OpenSearch)", () => {
  const drop = async () => {
    await client.indices.delete({ index: REGISTRY_INDEX }, { ignore: [404] });
    await client.indices.delete({ index: REGISTRY_STATE_INDEX }, { ignore: [404] });
  };
  beforeAll(async () => {
    await drop();
    await ensureIndices();
  });
  afterAll(drop);

  it("stores records by domain and reads back only the ones asked for", async () => {
    const store = openSearchRegistry();

    await store.putMany([record("a.com"), record("b.com", { languages: ["ara"] }), record("c.com")]);
    const got = await store.getMany(["b.com", "missing.com", "a.com"]);

    expect(got.map((r) => r.domain).sort()).toEqual(["a.com", "b.com"]);
    expect(got.find((r) => r.domain === "b.com")).toEqual(record("b.com", { languages: ["ara"] }));
  });

  it("keeps the cursor between runs and starts as null", async () => {
    const store = openSearchRegistry();
    expect(await store.getCursor()).toBeNull();

    await store.setCursor("20261011141500");

    expect(await openSearchRegistry().getCursor()).toBe("20261011141500");
  });

  it("keeps the floor and the cursor independently", async () => {
    const store = openSearchRegistry();
    expect(await store.getFloor()).toBeNull();

    await store.setFloor("20261011100000");
    await store.setCursor("20261011150000");

    const again = openSearchRegistry();
    expect(await again.getFloor()).toBe("20261011100000");
    expect(await again.getCursor()).toBe("20261011150000");
  });
});
