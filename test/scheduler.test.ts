import { describe, expect, it } from "vitest";
import { createScheduler, parseDuration, RunOutcome, RunRecord, StatusStore } from "../src/ingest/scheduler.js";

const MIN = 60_000;
const T0 = Date.parse("2026-10-11T10:00:00Z");

function memoryStore(initial: RunRecord[] = []): StatusStore & { saved: RunRecord[] } {
  const saved = [...initial];
  return {
    saved,
    load: async () => saved.map((r) => ({ ...r })),
    save: async (r) => {
      const i = saved.findIndex((x) => x.name === r.name);
      if (i >= 0) saved[i] = r;
      else saved.push(r);
    },
  };
}

function setup(opts: {
  sources?: { name: string; interval: number }[];
  outcomes?: Record<string, (RunOutcome | Error)[]>;
  store?: ReturnType<typeof memoryStore>;
  concurrency?: number;
  gate?: () => Promise<void>;
} = {}) {
  let t = T0;
  const calls: string[] = [];
  let running = 0;
  let peak = 0;
  const store = opts.store ?? memoryStore();
  const scheduler = createScheduler({
    sources: opts.sources ?? [{ name: "A", interval: 15 * MIN }],
    store,
    now: () => t,
    concurrency: opts.concurrency,
    maxBackoff: 60 * MIN,
    run: async (name) => {
      calls.push(name);
      running++;
      peak = Math.max(peak, running);
      try {
        await opts.gate?.();
        const next = opts.outcomes?.[name]?.shift() ?? { ok: true, found: 3, indexed: 2 };
        if (next instanceof Error) throw next;
        return next;
      } finally {
        running--;
      }
    },
  });
  return { scheduler, store, calls, advance: (ms: number) => (t += ms), peak: () => peak, now: () => t };
}

const record = (s: ReturnType<typeof setup>, name = "A") => s.store.saved.find((r) => r.name === name)!;

describe("scheduler", () => {
  it("runs every source on the first tick and schedules the next run one interval later", async () => {
    const s = setup({ sources: [{ name: "A", interval: 15 * MIN }, { name: "B", interval: 60 * MIN }] });

    expect(await s.scheduler.tick()).toEqual(["A", "B"]);

    expect(record(s, "A")).toMatchObject({ ok: true, found: 3, indexed: 2, consecutiveFailures: 0 });
    expect(record(s, "A").nextRun).toBe(new Date(T0 + 15 * MIN).toISOString());
    expect(record(s, "B").nextRun).toBe(new Date(T0 + 60 * MIN).toISOString());
  });

  it("only runs sources that are due", async () => {
    const s = setup({ sources: [{ name: "A", interval: 15 * MIN }, { name: "B", interval: 60 * MIN }] });
    await s.scheduler.tick();

    s.advance(14 * MIN);
    expect(await s.scheduler.tick()).toEqual([]);

    s.advance(1 * MIN);
    expect(await s.scheduler.tick()).toEqual(["A"]);

    s.advance(45 * MIN);
    expect(await s.scheduler.tick()).toEqual(["A", "B"]);
  });

  it("backs off exponentially after failures, capped, and recovers on success", async () => {
    const fail: RunOutcome = { ok: false, found: 0, indexed: 0, error: "all feeds failed" };
    const s = setup({ outcomes: { A: [fail, fail, fail, fail, fail, { ok: true, found: 1, indexed: 1 }] } });

    await s.scheduler.tick(); // failure 1 -> 15m * 2
    expect(record(s)).toMatchObject({ ok: false, consecutiveFailures: 1, error: "all feeds failed" });
    expect(record(s).nextRun).toBe(new Date(s.now() + 30 * MIN).toISOString());

    s.advance(30 * MIN);
    await s.scheduler.tick(); // failure 2 -> 15m * 4 = 60m (the cap)
    expect(record(s).consecutiveFailures).toBe(2);
    expect(record(s).nextRun).toBe(new Date(s.now() + 60 * MIN).toISOString());

    s.advance(60 * MIN);
    await s.scheduler.tick(); // failure 3 -> still capped at 60m
    expect(record(s).nextRun).toBe(new Date(s.now() + 60 * MIN).toISOString());

    s.advance(60 * MIN);
    await s.scheduler.tick();
    s.advance(60 * MIN);
    await s.scheduler.tick();
    s.advance(60 * MIN);
    await s.scheduler.tick(); // success
    expect(record(s)).toMatchObject({ ok: true, consecutiveFailures: 0 });
    expect(record(s).error).toBeUndefined();
    expect(record(s).nextRun).toBe(new Date(s.now() + 15 * MIN).toISOString());
  });

  it("polls a quiet feed less often, up to four times the interval, and goes back to normal when it publishes again", async () => {
    const quiet: RunOutcome = { ok: true, found: 20, indexed: 0 };
    const s = setup({ outcomes: { A: [quiet, quiet, quiet, quiet, { ok: true, found: 21, indexed: 1 }] } });
    const nextIn = () => Date.parse(record(s).nextRun) - s.now();

    await s.scheduler.tick(); // nothing new once: 15m * 2
    expect(nextIn()).toBe(30 * MIN);

    s.advance(30 * MIN);
    await s.scheduler.tick(); // twice: 15m * 4
    expect(nextIn()).toBe(60 * MIN);

    s.advance(60 * MIN);
    await s.scheduler.tick(); // still quiet: stays at the cap
    expect(nextIn()).toBe(60 * MIN);

    s.advance(60 * MIN);
    await s.scheduler.tick();
    s.advance(60 * MIN);
    await s.scheduler.tick(); // something new: back to the configured interval
    expect(nextIn()).toBe(15 * MIN);
    expect(record(s).idleRuns).toBe(0);
  });

  it("does not stretch the wait for a failing source (backoff already does that) and counts a failure as not idle", async () => {
    const fail: RunOutcome = { ok: false, found: 0, indexed: 0, error: "down" };
    const s = setup({ outcomes: { A: [{ ok: true, found: 5, indexed: 0 }, fail] } });
    await s.scheduler.tick();
    s.advance(30 * MIN);

    await s.scheduler.tick();

    expect(record(s)).toMatchObject({ ok: false, idleRuns: 0, consecutiveFailures: 1 });
  });
  it("records a thrown error as a failure and still runs the other sources", async () => {
    const s = setup({
      sources: [{ name: "A", interval: 15 * MIN }, { name: "B", interval: 15 * MIN }],
      outcomes: { A: [new Error("boom")] },
    });

    expect(await s.scheduler.tick()).toEqual(["A", "B"]);

    expect(record(s, "A")).toMatchObject({ ok: false, error: "boom", consecutiveFailures: 1 });
    expect(record(s, "B")).toMatchObject({ ok: true });
  });

  it("resumes from stored state after a restart instead of re-running everything", async () => {
    const store = memoryStore([
      { name: "A", lastRun: new Date(T0 - 5 * MIN).toISOString(), ok: true, found: 9, indexed: 4, consecutiveFailures: 0, nextRun: new Date(T0 + 10 * MIN).toISOString(), durationMs: 10 },
    ]);
    const s = setup({ store, sources: [{ name: "A", interval: 15 * MIN }, { name: "B", interval: 15 * MIN }] });

    expect(await s.scheduler.tick()).toEqual(["B"]); // A is not due yet; B has never run

    s.advance(10 * MIN);
    expect(await s.scheduler.tick()).toEqual(["A"]);
  });

  it("limits how many sources run at once", async () => {
    const s = setup({
      sources: ["A", "B", "C", "D", "E"].map((name) => ({ name, interval: 15 * MIN })),
      concurrency: 2,
      gate: () => new Promise((r) => setTimeout(r, 5)),
    });

    expect((await s.scheduler.tick()).sort()).toEqual(["A", "B", "C", "D", "E"]);
    expect(s.peak()).toBe(2);
  });

  it("never starts a source that is still running from an earlier tick", async () => {
    let release!: () => void;
    const s = setup({ gate: () => new Promise<void>((r) => (release = r)) });

    const first = s.scheduler.tick();
    await new Promise((r) => setTimeout(r, 0));
    s.advance(60 * MIN);
    expect(await s.scheduler.tick()).toEqual([]); // A still in flight
    release();
    await first;

    expect(s.calls).toEqual(["A"]);
  });
});

describe("parseDuration", () => {
  it("reads s, m, h and d", () => {
    expect(parseDuration("30s")).toBe(30_000);
    expect(parseDuration("15m")).toBe(900_000);
    expect(parseDuration("2h")).toBe(7_200_000);
    expect(parseDuration("1d")).toBe(86_400_000);
  });
  it("rejects anything else", () => {
    expect(() => parseDuration("soon")).toThrow();
    expect(() => parseDuration("0m")).toThrow();
    expect(() => parseDuration("10")).toThrow();
  });
});

