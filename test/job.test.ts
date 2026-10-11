import { describe, expect, it } from "vitest";
import { createJob } from "../src/ingest/job.js";

function setup(over: Partial<Parameters<typeof createJob>[0]> = {}) {
  let t = 0;
  const calls: number[] = [];
  const job = createJob({
    name: "test",
    everyMs: 1000,
    now: () => t,
    run: async () => void calls.push(t),
    ...over,
  });
  return { job, calls, advance: (ms: number) => void (t += ms) };
}

describe("createJob", () => {
  it("runs on the first tick, then not again until its interval has passed", async () => {
    const { job, calls, advance } = setup();

    await job.tick();
    advance(999);
    await job.tick();
    advance(1);
    await job.tick();

    expect(calls).toEqual([0, 1000]);
  });

  it("can hold back its first run, so a freshly started worker is not doing everything at once", async () => {
    const { job, calls, advance } = setup({ startAfterMs: 5000 });

    await job.tick();
    advance(4999);
    await job.tick();
    expect(calls).toEqual([]);

    advance(1);
    await job.tick();
    expect(calls).toEqual([5000]);
  });

  it("does not start a second run while one is still going", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started = 0;
    const { job, advance } = setup({
      run: async () => {
        started++;
        await gate;
      },
    });

    const first = job.tick();
    advance(5000);
    const second = job.tick();
    release();
    await Promise.all([first, second]);

    expect(started).toBe(1);
  });

  it("survives a failing run, remembers the error and tries again after the interval", async () => {
    let fail = true;
    const { job, advance } = setup({
      run: async () => {
        if (fail) throw new Error("GDELT down");
      },
    });

    await job.tick();
    expect(job.status()).toMatchObject({ lastError: "GDELT down", runs: 1 });

    fail = false;
    advance(1000);
    await job.tick();
    expect(job.status()).toMatchObject({ lastError: undefined, runs: 2 });
  });

  it("reports what the last run returned", async () => {
    const { job } = setup({ run: async () => ({ domains: 12 }) });

    await job.tick();

    expect(job.status().lastResult).toEqual({ domains: 12 });
  });
});
