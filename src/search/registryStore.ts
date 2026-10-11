import type { RegistryStore } from "../registry/discover.js";
import type { SourceRecord } from "../registry/registry.js";
import { client, REGISTRY_INDEX, REGISTRY_STATE_INDEX } from "./index-def.js";

const CURSOR_ID = "gdelt";

async function readState(field: "stamp" | "floor"): Promise<string | null> {
  const res = await client.get({ index: REGISTRY_STATE_INDEX, id: CURSOR_ID }, { ignore: [404] });
  return (res.body as any).found ? ((res.body as any)._source[field] ?? null) : null;
}

/** Partial update, so moving the cursor never loses the floor and the other way round. */
async function writeState(doc: { stamp?: string; floor?: string }): Promise<void> {
  await client.update({
    index: REGISTRY_STATE_INDEX,
    id: CURSOR_ID,
    body: { doc, doc_as_upsert: true },
    refresh: true,
  });
}

/** The source registry and its GDELT cursor and floor on OpenSearch. One document per domain (id = domain). */
export function openSearchRegistry(): RegistryStore {
  return {
    async getMany(domains) {
      if (domains.length === 0) return [];
      const res = await client.mget({ index: REGISTRY_INDEX, body: { ids: domains } });
      return ((res.body as any).docs as any[]).filter((d) => d.found).map((d) => d._source as SourceRecord);
    },
    async putMany(records: SourceRecord[]) {
      if (records.length === 0) return;
      const res = await client.bulk({
        refresh: true,
        body: records.flatMap((r) => [{ index: { _index: REGISTRY_INDEX, _id: r.domain } }, r]),
      });
      if ((res.body as any).errors) throw new Error("registry bulk write failed");
    },
    async getCursor() {
      return readState("stamp");
    },
    async setCursor(stamp) {
      await writeState({ stamp });
    },
    async getFloor() {
      return readState("floor");
    },
    async setFloor(stamp) {
      await writeState({ floor: stamp });
    },
  };
}
