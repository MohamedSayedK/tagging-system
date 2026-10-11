import type { Observation } from "./gdelt.js";

/** What the registry knows about one news domain. */
export interface SourceRecord {
  domain: string;
  firstSeen: string;
  lastSeen: string;
  articleCount: number;
  languages: string[];
  /** ISO 3166 alpha-2, when a directory (Wikidata) told us where the outlet is based. */
  country?: string;
}

/** Fold observations into per-domain records. Pure: returns new records, never mutates the input. */
export function addObservations(records: SourceRecord[], observations: Observation[]): SourceRecord[] {
  const byDomain = new Map<string, SourceRecord>();
  for (const r of records) byDomain.set(r.domain, { ...r, languages: [...r.languages] });
  for (const o of observations) {
    const r = byDomain.get(o.domain);
    if (!r) {
      byDomain.set(o.domain, {
        domain: o.domain,
        firstSeen: o.seenAt,
        lastSeen: o.seenAt,
        articleCount: 1,
        languages: [o.language],
      });
      continue;
    }
    if (o.seenAt < r.firstSeen) r.firstSeen = o.seenAt;
    if (o.seenAt > r.lastSeen) r.lastSeen = o.seenAt;
    r.articleCount++;
    if (!r.languages.includes(o.language)) r.languages.push(o.language);
  }
  for (const r of byDomain.values()) r.languages.sort();
  return [...byDomain.values()];
}
