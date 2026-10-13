// Needs a running OpenSearch. Uses a throwaway lease index.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.LEASE_INDEX = "worker_lease_test";
const { client, ensureIndices, LEASE_INDEX } = await import("../src/search/index-def.js");
const { openSearchLease } = await import("../src/search/leaseStore.js");
const { createLease } = await import("../src/ingest/lease.js");

beforeAll(async () => {
  await client.indices.delete({ index: LEASE_INDEX }, { ignore: [404] });
  await ensureIndices();
});
afterAll(async () => {
  await client.indices.delete({ index: LEASE_INDEX }, { ignore: [404] });
});

describe("the crawl lease on OpenSearch", () => {
  it("is held by one worker at a time, and passes on when it is released", async () => {
    const store = openSearchLease();
    const a = createLease(store, "a", 60_000);
    const b = createLease(store, "b", 60_000);

    expect(await a.tryAcquire()).toBe(true);
    expect(await b.tryAcquire()).toBe(false);
    expect(await a.tryAcquire()).toBe(true); // renewing keeps it

    await a.release();

    expect(await b.tryAcquire()).toBe(true);
    expect(await a.tryAcquire()).toBe(false);
  });

  it("lets only one of two simultaneous first-time workers win", async () => {
    await client.indices.delete({ index: LEASE_INDEX }, { ignore: [404] });
    await ensureIndices();
    const store = openSearchLease();

    const results = await Promise.all([createLease(store, "x", 60_000).tryAcquire(), createLease(store, "y", 60_000).tryAcquire()]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });
});