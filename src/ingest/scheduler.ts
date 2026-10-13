export interface RunOutcome { ok: boolean; found: number; indexed: number; error?: string }

export interface RunRecord {
  name: string;
  lastRun: string; // ISO
  ok: boolean;
  found: number; // items seen in the feeds
  indexed: number; // new articles stored
  error?: string;
  consecutiveFailures: number;
  nextRun: string; // ISO
  durationMs: number;
  /** Successful runs in a row that stored nothing new; a quiet feed is polled less often. */
  idleRuns?: number;
}

export interface StatusStore {
  load(): Promise<RunRecord[]>;
  save(record: RunRecord): Promise<void>;
}

export interface SchedulerOptions {
  sources: { name: string; interval: number }[]; // interval in ms
  run: (name: string) => Promise<RunOutcome>;
  store: StatusStore;
  now?: () => number;
  concurrency?: number;
  /** Longest wait after repeated failures, ms. */
  maxBackoff?: number;
}

const MAX_IDLE_STRETCH = 4;

const UNITS = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

export function parseDuration(text: string): number {
  const m = /^(\d+)(s|m|h|d)$/.exec(text.trim());
  const ms = m ? Number(m[1]) * UNITS[m[2] as keyof typeof UNITS] : 0;
  if (!ms) throw new Error(`Invalid duration "${text}" (use e.g. 30s, 15m, 2h, 1d)`);
  return ms;
}

export function createScheduler(opts: SchedulerOptions) {
  const now = opts.now ?? Date.now;
  const concurrency = opts.concurrency ?? 4;
  const maxBackoff = opts.maxBackoff ?? 6 * 3_600_000;
  const records = new Map<string, RunRecord>();
  const inFlight = new Set<string>();
  let loaded = false;

  async function restore() {
    if (loaded) return;
    for (const r of await opts.store.load()) records.set(r.name, r);
    loaded = true;
  }

  const isDue = (name: string) => {
    const r = records.get(name);
    return !inFlight.has(name) && (!r || Date.parse(r.nextRun) <= now());
  };

  async function runOne(source: { name: string; interval: number }) {
    const started = now();
    const previous = records.get(source.name);
    const before = previous?.consecutiveFailures ?? 0;
    let outcome: RunOutcome;
    try {
      outcome = await opts.run(source.name);
    } catch (e) {
      outcome = { ok: false, found: 0, indexed: 0, error: e instanceof Error ? e.message : String(e) };
    }
    const failures = outcome.ok ? 0 : before + 1;
    // Failing feeds are retried less and less often, so one dead outlet doesn't get hammered.
    const idleRuns = outcome.ok && outcome.indexed === 0 ? (previous?.idleRuns ?? 0) + 1 : 0;
    // A feed that published nothing new is asked less often (2x, then 4x the interval), and every run that
    // finds something goes straight back to the configured interval.
    const quiet = source.interval * Math.min(2 ** idleRuns, MAX_IDLE_STRETCH);
    const wait = outcome.ok ? quiet : Math.min(source.interval * 2 ** failures, Math.max(maxBackoff, source.interval));
    const finished = now();
    const record: RunRecord = {
      name: source.name,
      lastRun: new Date(started).toISOString(),
      ok: outcome.ok,
      found: outcome.found,
      indexed: outcome.indexed,
      ...(outcome.error !== undefined && { error: outcome.error }),
      consecutiveFailures: failures,
      nextRun: new Date(finished + wait).toISOString(),
      durationMs: finished - started,
      idleRuns,
    };
    records.set(source.name, record);
    await opts.store.save(record);
  }

  return {
    /** Runs every source that is due (bounded concurrency) and returns their names. */
    async tick(): Promise<string[]> {
      await restore();
      const due = opts.sources.filter((s) => isDue(s.name));
      due.forEach((s) => inFlight.add(s.name));
      const queue = [...due];
      await Promise.all(
        Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
          for (let s = queue.shift(); s; s = queue.shift()) {
            try {
              await runOne(s);
            } finally {
              inFlight.delete(s.name);
            }
          }
        }),
      );
      return due.map((s) => s.name);
    },
    status: (): RunRecord[] => [...records.values()],
  };
}
