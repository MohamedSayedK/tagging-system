export interface JobOptions {
  name: string;
  /** Minimum time between the starts of two runs, ms. */
  everyMs: number;
  run: () => Promise<unknown>;
  now?: () => number;
  /** Hold the first run back this long (ms) after the job is created. Default: run on the first tick. */
  startAfterMs?: number;
}

export interface JobStatus {
  name: string;
  runs: number;
  running: boolean;
  lastRun?: string;
  lastError?: string;
  lastResult?: unknown;
}

/**
 * A recurring background task for the worker (registry discovery, promotion). `tick()` starts a run when one
 * is due and none is going; a failure is recorded, never thrown, and retried after the interval.
 */
export function createJob({ name, everyMs, run, now = Date.now, startAfterMs = 0 }: JobOptions) {
  let nextRun = now() + startAfterMs;
  let running = false;
  const status: JobStatus = { name, runs: 0, running: false };

  return {
    /** Resolves when the run it started has finished (immediately when nothing was due). */
    async tick(): Promise<void> {
      if (running || now() < nextRun) return;
      running = true;
      status.running = true;
      nextRun = now() + everyMs;
      status.runs++;
      status.lastRun = new Date(now()).toISOString();
      try {
        status.lastResult = await run();
        status.lastError = undefined;
      } catch (e) {
        status.lastError = e instanceof Error ? e.message : String(e);
      } finally {
        running = false;
        status.running = false;
      }
    },
    status: (): JobStatus => ({ ...status }),
  };
}
