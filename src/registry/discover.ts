import { strFromU8, unzipSync } from "fflate";
import { parseGkg } from "./gdelt.js";
import { filesAfter } from "./gdeltFiles.js";
import { addObservations, type SourceRecord } from "./registry.js";

const GDELT = "http://data.gdeltproject.org/gdeltv2/";

/** Where the registry lives. OpenSearch in production, memory in tests. */
export interface RegistryStore {
  getMany(domains: string[]): Promise<SourceRecord[]>;
  putMany(records: SourceRecord[]): Promise<void>;
  /** The newest GDELT stamp fully processed, or null on a first run. */
  getCursor(): Promise<string | null>;
  setCursor(stamp: string): Promise<void>;
  /** The oldest GDELT stamp processed, or null on a first run. Everything between floor and cursor was read. */
  getFloor(): Promise<string | null>;
  setFloor(stamp: string): Promise<void>;
}

export interface DiscoverOptions {
  store: RegistryStore;
  /** Fetch a URL's bytes; null when it is not published (404); rejects on any other failure. */
  http: (url: string) => Promise<Uint8Array | null>;
  /** The registry should cover stamps strictly after this one: a first run starts here, later runs backfill to it. */
  startAfter: string;
  /** Upper bound on stamps read in one run; the cursor and floor let the next run continue. Default: no limit. */
  maxStamps?: number;
}

export interface DiscoverResult {
  stamps: number;
  observations: number;
  domains: number;
  newDomains: number;
  /** Files GDELT never published for stamps old enough that they will not appear later. */
  missingFiles: number;
}

const STEP = 900_000; // GDELT publishes every 15 minutes
// GDELT posts a stamp's main file before its translation file; within this window a missing file may still appear.
const SETTLE = 3_600_000;
const toDate = (s: string) =>
  new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14)));
const toStamp = (d: Date) => d.toISOString().replace(/[-:T]/g, "").slice(0, 14);

/** Every 15-minute stamp in (after, upTo], oldest first. */
function stampsBetween(after: string, upTo: string): string[] {
  const out: string[] = [];
  for (let t = toDate(after).getTime() + STEP; t <= toDate(upTo).getTime(); t += STEP) out.push(toStamp(new Date(t)));
  return out;
}

const minusStep = (s: string) => toStamp(new Date(toDate(s).getTime() - STEP));

function csvOf(zip: Uint8Array): string {
  return Object.values(unzipSync(zip))
    .map((entry) => strFromU8(entry))
    .join("\n");
}

/**
 * Read the GDELT GKG files the registry has not seen yet and merge the domains they mention into it:
 * stamps newer than the cursor first (a first run starts after `startAfter`), then older ones back to `startAfter`.
 */
export async function discover({ store, http, startAfter, maxStamps = Infinity }: DiscoverOptions): Promise<DiscoverResult> {
  const listing = await http(`${GDELT}lastupdate.txt`);
  if (!listing) throw new Error("GDELT lastupdate.txt is not available");
  const latest = filesAfter(strFromU8(listing), null).at(-1)?.id;
  const result: DiscoverResult = { stamps: 0, observations: 0, domains: 0, newDomains: 0, missingFiles: 0 };
  if (!latest) return result;

  const seenDomains = new Set<string>();
  const newDomains = new Set<string>();

  /** Reads one stamp. False means "not fully published yet": nothing was recorded, try again next run. */
  async function read(stamp: string): Promise<boolean> {
    const observations = [];
    let missing = 0;
    for (const name of [`${stamp}.gkg.csv.zip`, `${stamp}.translation.gkg.csv.zip`]) {
      const zip = await http(GDELT + name);
      if (!zip) missing++;
      else observations.push(...parseGkg(csvOf(zip)));
    }
    if (missing > 0 && toDate(latest!).getTime() - toDate(stamp).getTime() < SETTLE) return false;
    result.missingFiles += missing;
    const domains = [...new Set(observations.map((o) => o.domain))];
    const existing = await store.getMany(domains);
    const known = new Set(existing.map((r) => r.domain));
    await store.putMany(addObservations(existing, observations));
    for (const d of domains) {
      seenDomains.add(d);
      if (!known.has(d)) newDomains.add(d);
    }
    result.stamps++;
    result.observations += observations.length;
    return true;
  }

  const cursor = await store.getCursor();
  let startsHistory = cursor === null; // only a first run knows where its history begins
  const forward = stampsBetween(cursor ?? startAfter, latest).slice(0, maxStamps);
  for (const stamp of forward) {
    if (!(await read(stamp))) break;
    await store.setCursor(stamp);
    if (startsHistory) {
      await store.setFloor(stamp);
      startsHistory = false;
    }
  }

  const floor = await store.getFloor();
  if (floor !== null) {
    const backward = stampsBetween(startAfter, minusStep(floor)).reverse().slice(0, Math.max(0, maxStamps - result.stamps));
    for (const stamp of backward) {
      if (!(await read(stamp))) break;
      await store.setFloor(stamp);
    }
  }

  result.domains = seenDomains.size;
  result.newDomains = newDomains.size;
  return result;
}
