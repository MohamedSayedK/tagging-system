import { describe, expect, it } from "vitest";
import { createDomainLimiter } from "../src/ingest/domainLimiter.js";

/** A fake clock: sleeping just advances time, and every call is logged with the time it started. */
function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

describe("createDomainLimiter", () => {
  it("spaces requests to one domain by the minimum interval", async () => {
    const c = clock();
    const limiter = createDomainLimiter({ minIntervalMs: 1000, ...c });
    const starts: number[] = [];

    await Promise.all([1, 2, 3].map(() => limiter.run("a.com", async () => void starts.push(c.now()))));

    expect(starts).toEqual([0, 1000, 2000]);
  });

  it("never runs two requests to the same domain at once, even when they take time", async () => {
    const c = clock();
    const limiter = createDomainLimiter({ minIntervalMs: 0, ...c });
    let active = 0;
    let peak = 0;
    const slow = async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      await Promise.resolve();
      active--;
    };

    await Promise.all([1, 2, 3, 4].map(() => limiter.run("a.com", slow)));

    expect(peak).toBe(1);
  });

  it("does not make one domain wait for another", async () => {
    const c = clock();
    const limiter = createDomainLimiter({ minIntervalMs: 1000, ...c });
    const starts: Record<string, number[]> = { "a.com": [], "b.com": [] };

    await Promise.all([
      limiter.run("a.com", async () => void starts["a.com"]!.push(c.now())),
      limiter.run("b.com", async () => void starts["b.com"]!.push(c.now())),
    ]);

    expect(starts["a.com"]).toEqual([0]);
    expect(starts["b.com"]).toEqual([0]);
  });

  it("keeps going after a request fails, and passes the failure to its caller", async () => {
    const limiter = createDomainLimiter({ minIntervalMs: 0, ...clock() });

    await expect(limiter.run("a.com", async () => Promise.reject(new Error("HTTP 503")))).rejects.toThrow("HTTP 503");

    await expect(limiter.run("a.com", async () => "fine")).resolves.toBe("fine");
  });

  it("treats www and the bare domain as one site", async () => {
    const c = clock();
    const limiter = createDomainLimiter({ minIntervalMs: 500, ...c });
    const starts: number[] = [];

    await Promise.all([
      limiter.run("example.com", async () => void starts.push(c.now())),
      limiter.run("www.example.com", async () => void starts.push(c.now())),
    ]);

    expect(starts).toEqual([0, 500]);
  });
});
