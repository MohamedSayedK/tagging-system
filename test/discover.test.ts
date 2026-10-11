import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { discover, type RegistryStore } from "../src/registry/discover.js";
import type { SourceRecord } from "../src/registry/registry.js";

const BASE = "http://data.gdeltproject.org/gdeltv2/";

/** One GKG 2.1 row with only the columns the registry reads. */
function row(date: string, domain: string, translation = "") {
  const c = Array<string>(27).fill("");
  c[0] = `${date}-0`;
  c[1] = date;
  c[3] = domain;
  c[25] = translation;
  return c.join("\t");
}

/** A fake GDELT: `lastupdate.txt` plus zipped GKG files, keyed by URL. */
function gdelt(latest: string, files: Record<string, string>) {
  const served = new Map<string, Uint8Array>();
  served.set(
    `${BASE}lastupdate.txt`,
    strToU8(`1 aa ${BASE}${latest}.export.CSV.zip\n1 bb ${BASE}${latest}.mentions.CSV.zip\n1 cc ${BASE}${latest}.gkg.csv.zip\n`),
  );
  for (const [name, csv] of Object.entries(files)) {
    served.set(BASE + name, zipSync({ [name.replace(/\.zip$/, "")]: strToU8(csv) }));
  }
  const requested: string[] = [];
  // Like the real fetch wrapper: bytes, or null for "404 not published", or a thrown error for anything else.
  const http = async (url: string) => {
    requested.push(url);
    return served.get(url) ?? null;
  };
  return { http, requested };
}

function memoryStore(): RegistryStore & { records: Map<string, SourceRecord>; cursor: string | null; floor: string | null } {
  const store = {
    records: new Map<string, SourceRecord>(),
    cursor: null as string | null,
    floor: null as string | null,
    async getFloor() {
      return store.floor;
    },
    async setFloor(id: string) {
      store.floor = id;
    },
    async getMany(domains: string[]) {
      return domains.flatMap((d) => store.records.get(d) ?? []);
    },
    async putMany(records: SourceRecord[]) {
      for (const r of records) store.records.set(r.domain, r);
    },
    async getCursor() {
      return store.cursor;
    },
    async setCursor(id: string) {
      store.cursor = id;
    },
  };
  return store;
}

describe("discover", () => {
  it("reads every stamp after the start point up to the newest, merges the sightings and moves the cursor", async () => {
    const { http } = gdelt("20261011141500", {
      "20261011140000.gkg.csv.zip": row("20261011140000", "a.com"),
      "20261011140000.translation.gkg.csv.zip": row("20261011140000", "b.com", "srclc:ara;eng:Moses"),
      "20261011141500.gkg.csv.zip": row("20261011141500", "a.com"),
      "20261011141500.translation.gkg.csv.zip": "",
    });
    const store = memoryStore();

    const result = await discover({ store, http, startAfter: "20261011134500" });

    expect(store.records.get("a.com")).toMatchObject({ articleCount: 2, languages: ["eng"] });
    expect(store.records.get("b.com")).toMatchObject({ articleCount: 1, languages: ["ara"] });
    expect(store.cursor).toBe("20261011141500");
    expect(store.floor).toBe("20261011140000");
    expect(result).toMatchObject({ stamps: 2, observations: 3, domains: 2, newDomains: 2 });
  });

  it("extends coverage backwards from the earliest stamp it has read, newest first, without touching newer ones", async () => {
    const { http, requested } = gdelt("20261011141500", {
      "20261011133000.gkg.csv.zip": row("20261011133000", "old.com"),
      "20261011133000.translation.gkg.csv.zip": "",
      "20261011134500.gkg.csv.zip": row("20261011134500", "old.com"),
      "20261011134500.translation.gkg.csv.zip": "",
    });
    const store = memoryStore();
    store.cursor = "20261011141500";
    store.floor = "20261011140000"; // 14:00 .. 14:15 already read

    const result = await discover({ store, http, startAfter: "20261011131500" });

    expect(requested.filter((u) => u.endsWith(".zip"))).toEqual([
      `${BASE}20261011134500.gkg.csv.zip`,
      `${BASE}20261011134500.translation.gkg.csv.zip`,
      `${BASE}20261011133000.gkg.csv.zip`,
      `${BASE}20261011133000.translation.gkg.csv.zip`,
    ]);
    expect(store.floor).toBe("20261011133000");
    expect(store.cursor).toBe("20261011141500");
    expect(store.records.get("old.com")).toMatchObject({ articleCount: 2, firstSeen: "2026-10-11T13:30:00.000Z" });
    expect(result.stamps).toBe(2);
  });

  it("resumes from the stored cursor and downloads nothing it has already processed", async () => {
    const { http, requested } = gdelt("20261011141500", {
      "20261011140000.gkg.csv.zip": row("20261011140000", "a.com"),
      "20261011140000.translation.gkg.csv.zip": "",
      "20261011141500.gkg.csv.zip": row("20261011141500", "b.com"),
      "20261011141500.translation.gkg.csv.zip": "",
    });
    const store = memoryStore();
    store.cursor = "20261011140000";

    await discover({ store, http, startAfter: "20261011100000" });

    expect(requested.filter((u) => u.endsWith(".zip"))).toEqual([
      `${BASE}20261011141500.gkg.csv.zip`,
      `${BASE}20261011141500.translation.gkg.csv.zip`,
    ]);
    expect([...store.records.keys()]).toEqual(["b.com"]);
  });

  it("keeps the cursor at the last stamp it finished when a download fails, and reports the error", async () => {
    const { http: gdeltHttp } = gdelt("20261011141500", {
      "20261011140000.gkg.csv.zip": row("20261011140000", "a.com"),
      "20261011140000.translation.gkg.csv.zip": "",
      "20261011141500.gkg.csv.zip": row("20261011141500", "b.com"),
      "20261011141500.translation.gkg.csv.zip": "",
    });
    const http = async (url: string) => {
      if (url.includes("20261011141500.gkg")) throw new Error("HTTP 503");
      return gdeltHttp(url);
    };
    const store = memoryStore();

    await expect(discover({ store, http, startAfter: "20261011134500" })).rejects.toThrow(/503/);

    expect(store.cursor).toBe("20261011140000");
    expect(store.records.has("a.com")).toBe(true);
  });

  it("waits for a stamp GDELT has not finished publishing: stops there without failing and keeps the earlier work", async () => {
    // GDELT posts the main file before its translation file; 14:15's translation is not there yet.
    const { http } = gdelt("20261011141500", {
      "20261011140000.gkg.csv.zip": row("20261011140000", "a.com"),
      "20261011140000.translation.gkg.csv.zip": "",
      "20261011141500.gkg.csv.zip": row("20261011141500", "b.com"),
    });
    const store = memoryStore();

    const result = await discover({ store, http, startAfter: "20261011134500" });

    expect(store.cursor).toBe("20261011140000");
    expect([...store.records.keys()]).toEqual(["a.com"]); // b.com is read next run, with its translation
    expect(result.stamps).toBe(1);
  });

  it("moves past a file GDELT never published for an old stamp and reports how many were missing", async () => {
    const files: Record<string, string> = {};
    for (const s of ["20261011141500", "20261011143000", "20261011144500", "20261011150000", "20261011151500"]) {
      files[`${s}.gkg.csv.zip`] = row(s, "a.com");
      if (s !== "20261011141500") files[`${s}.translation.gkg.csv.zip`] = ""; // 14:15's translation is a permanent gap
    }
    const { http } = gdelt("20261011151500", files);
    const store = memoryStore();

    const result = await discover({ store, http, startAfter: "20261011140000" });

    expect(store.cursor).toBe("20261011151500");
    expect(store.records.get("a.com")).toMatchObject({ articleCount: 5 });
    expect(result).toMatchObject({ stamps: 5, missingFiles: 1 });
  });

  it("reads at most maxStamps per run so a long gap is caught up over several runs", async () => {
    const { http } = gdelt("20261011141500", {
      "20261011140000.gkg.csv.zip": row("20261011140000", "a.com"),
      "20261011140000.translation.gkg.csv.zip": "",
      "20261011141500.gkg.csv.zip": row("20261011141500", "b.com"),
      "20261011141500.translation.gkg.csv.zip": "",
    });
    const store = memoryStore();

    const first = await discover({ store, http, startAfter: "20261011134500", maxStamps: 1 });
    expect(first.stamps).toBe(1);
    expect(store.cursor).toBe("20261011140000");

    await discover({ store, http, startAfter: "20261011134500", maxStamps: 1 });
    expect(store.cursor).toBe("20261011141500");
    expect([...store.records.keys()].sort()).toEqual(["a.com", "b.com"]);
  });
});
