import { describe, expect, it } from "vitest";
import { createLease, type LeaseRecord, type LeaseStore } from "../src/ingest/lease.js";

// An in-memory stand-in for the one document the real store keeps; `version` plays the role of seq_no.
function memoryStore(): LeaseStore & { held: () => LeaseRecord | null } {
  let rec: (LeaseRecord & { version: number }) | null = null;
  return {
    held: () => rec,
    async read() {
      return rec ? { owner: rec.owner, expires: rec.expires, version: rec.version } : null;
    },
    async write(next, expectedVersion) {
      if ((rec?.version ?? null) !== expectedVersion) return false; // somebody else wrote in between
      rec = { ...next, version: (rec?.version ?? 0) + 1 };
      return true;
    },
  };
}

const T0 = Date.parse("2026-10-13T12:00:00Z");

describe("crawl lease: only one worker crawls at a time", () => {
  it("is taken by the first worker that asks, and held by renewing it", async () => {
    const store = memoryStore();
    let now = T0;
    const a = createLease(store, "worker-a", 60_000, () => now);

    expect(await a.tryAcquire()).toBe(true);
    now += 30_000;
    expect(await a.tryAcquire()).toBe(true);
    expect(Date.parse(store.held()!.expires)).toBe(T0 + 30_000 + 60_000);
  });

  it("keeps a second worker out while the first is alive", async () => {
    const store = memoryStore();
    let now = T0;
    const a = createLease(store, "worker-a", 60_000, () => now);
    const b = createLease(store, "worker-b", 60_000, () => now);

    await a.tryAcquire();
    now += 10_000;

    expect(await b.tryAcquire()).toBe(false);
    expect(await a.tryAcquire()).toBe(true);
  });

  it("passes to the second worker once the first has stopped renewing", async () => {
    const store = memoryStore();
    let now = T0;
    const a = createLease(store, "worker-a", 60_000, () => now);
    const b = createLease(store, "worker-b", 60_000, () => now);
    await a.tryAcquire();

    now += 61_000;

    expect(await b.tryAcquire()).toBe(true);
    expect(await a.tryAcquire()).toBe(false); // the first one is told it lost it
  });

  it("lets a worker hand the lease back on a clean stop, so the next one need not wait", async () => {
    const store = memoryStore();
    const a = createLease(store, "worker-a", 60_000, () => T0);
    const b = createLease(store, "worker-b", 60_000, () => T0);
    await a.tryAcquire();

    await a.release();

    expect(await b.tryAcquire()).toBe(true);
  });

  it("does not let two workers both win a race for a free lease", async () => {
    const store = memoryStore();
    const a = createLease(store, "worker-a", 60_000, () => T0);
    const b = createLease(store, "worker-b", 60_000, () => T0);

    const results = await Promise.all([a.tryAcquire(), b.tryAcquire()]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("treats a store that cannot be reached as not holding the lease", async () => {
    const down: LeaseStore = {
      read: async () => {
        throw new Error("connection refused");
      },
      write: async () => false,
    };

    expect(await createLease(down, "worker-a", 60_000).tryAcquire()).toBe(false);
  });
});