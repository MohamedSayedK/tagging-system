/** One sighting of a news domain in a GDELT GKG file. */
export interface Observation {
  domain: string;
  seenAt: string;
  /** ISO 639-2 source language; `eng` when GDELT did not translate the document. */
  language: string;
}

const STAMP = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;
const SOURCE_LANGUAGE = /srclc:([a-z]{3})/;

/** Parse the text of one GDELT GKG 2.1 file (tab-separated, one document per row). */
export function parseGkg(text: string): Observation[] {
  const observations: Observation[] = [];
  for (const line of text.split("\n")) {
    const cols = line.split("\t");
    const m = STAMP.exec(cols[1] ?? "");
    const domain = (cols[3] ?? "").trim().toLowerCase().replace(/^www\./, "");
    if (!m || !domain) continue;
    observations.push({
      domain,
      seenAt: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`,
      language: SOURCE_LANGUAGE.exec(cols[25] ?? "")?.[1] ?? "eng",
    });
  }
  return observations;
}
