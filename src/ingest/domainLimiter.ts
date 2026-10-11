export interface DomainLimiterOptions {
  /** Least time between the starts of two requests to the same site, ms. */
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");

/**
 * Keeps the crawler polite: requests to one site run one at a time and at least `minIntervalMs` apart, while
 * different sites do not wait for each other. `www.` and the bare domain count as the same site.
 */
export function createDomainLimiter({ minIntervalMs, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: DomainLimiterOptions) {
  const tails = new Map<string, Promise<unknown>>(); // the last queued request per site
  const lastStart = new Map<string, number>();

  function run<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const site = bare(host);
    const previous = tails.get(site) ?? Promise.resolve();
    const result = previous.then(async () => {
      const last = lastStart.get(site);
      if (last !== undefined) {
        const wait = last + minIntervalMs - now();
        if (wait > 0) await sleep(wait);
      }
      lastStart.set(site, now());
      return fn();
    });
    // A failed request must not break the queue for the next one.
    const tail = result.catch(() => undefined);
    tails.set(site, tail);
    void tail.then(() => {
      if (tails.get(site) === tail) tails.delete(site);
    });
    return result;
  }

  return { run };
}
