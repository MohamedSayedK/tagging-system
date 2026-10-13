// One worker crawls at a time. Two would read every feed twice (per-domain politeness is per process), so the
// worker takes a short lease in the store, renews it on every tick, and stands by while someone else holds it.
export interface LeaseRecord {
  owner: string;
  /** ISO time after which the holder is considered gone. */
  expires: string;
}

export interface LeaseStore {
  /** The current lease with an opaque version for the compare-and-set below; null when nobody ever held one. */
  read(): Promise<(LeaseRecord & { version: number }) | null>;
  /** Writes only when the stored version is still `expectedVersion` (null: no lease exists). False means lost the race. */
  write(next: LeaseRecord, expectedVersion: number | null): Promise<boolean>;
}

export function createLease(store: LeaseStore, owner: string, ttlMs: number, now: () => number = Date.now) {
  return {
    /** True when this worker holds the lease after the call (taken, renewed or reclaimed from a dead holder). */
    async tryAcquire(): Promise<boolean> {
      try {
        const current = await store.read();
        const free = !current || current.owner === owner || Date.parse(current.expires) <= now();
        if (!free) return false;
        return await store.write({ owner, expires: new Date(now() + ttlMs).toISOString() }, current?.version ?? null);
      } catch {
        return false; // cannot tell, so do not crawl: standing by for a tick is cheap, crawling twice is not
      }
    },
    /** Gives the lease back on a clean stop. */
    async release(): Promise<void> {
      try {
        const current = await store.read();
        if (current?.owner === owner) await store.write({ owner, expires: new Date(0).toISOString() }, current.version);
      } catch {
        // it expires by itself
      }
    },
  };
}