import { client, RUNS_INDEX } from "../search/index-def.js";
import { RunRecord, StatusStore } from "./scheduler.js";

/** Run history, one document per source (id = source name), so a restart keeps its schedule. */
export function openSearchStore(): StatusStore {
  return {
    async load() {
      const res = await client.search({ index: RUNS_INDEX, body: { size: 1000, query: { match_all: {} } } }, { ignore: [404] });
      return ((res.body as any).hits?.hits ?? []).map((h: any) => h._source as RunRecord);
    },
    async save(record) {
      await client.index({ index: RUNS_INDEX, id: record.name, body: record, refresh: true });
    },
  };
}
