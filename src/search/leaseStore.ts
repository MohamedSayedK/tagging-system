import type { LeaseStore } from "../ingest/lease.js";
import { client, LEASE_INDEX } from "./index-def.js";

const ID = "crawl";

/** The crawl lease as one document, written with optimistic concurrency so two workers cannot both win. */
export function openSearchLease(): LeaseStore {
  return {
    async read() {
      const res = await client.get({ index: LEASE_INDEX, id: ID }, { ignore: [404] });
      const body = res.body as any;
      if (!body.found) return null;
      // seq_no and primary_term together are the version: pack them so the caller treats it as one number.
      return { owner: body._source.owner, expires: body._source.expires, version: body._seq_no * 1_000 + body._primary_term };
    },
    async write(next, expectedVersion) {
      try {
        if (expectedVersion === null) {
          await client.index({ index: LEASE_INDEX, id: ID, op_type: "create", body: next, refresh: true });
        } else {
          await client.index({
            index: LEASE_INDEX,
            id: ID,
            if_seq_no: Math.floor(expectedVersion / 1_000),
            if_primary_term: expectedVersion % 1_000,
            body: next,
            refresh: true,
          });
        }
        return true;
      } catch (e) {
        if ((e as { statusCode?: number }).statusCode === 409) return false; // somebody else wrote first
        throw e;
      }
    },
  };
}