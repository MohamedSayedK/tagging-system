/** Turns the website list read from the owner's Newsdesk account (ADR 0003) into a business-catalog file. */

const MEDIA = { OnlineNews: "Online news", PrintMedia: "Newspaper / print", Broadcast: "Broadcaster" } as const;

export interface NewsdeskOptions {
  /** Newsdesk ranks 1 (top) to 3; sites with a worse rank are left out. */
  maxRank: number;
  /** Hostnames to leave out; their subdomains go with them. */
  exclude?: Set<string>;
}

export interface NewsdeskCatalog {
  /** A catalog file as `parseCatalog` reads it. */
  file: string;
  /** Sites left out because of `exclude`. */
  excluded: string[];
}

export function newsdeskToCatalog(csv: string, { maxRank, exclude = new Set() }: NewsdeskOptions): NewsdeskCatalog {
  const [head, ...rows] = parseCsv(csv);
  const col = Object.fromEntries((head ?? []).map((h, i) => [h, i]));
  for (const needed of ["website", "example_url", "names", "country", "best_rank", "media_types", "newsdesk_sources"]) {
    if (col[needed] === undefined) throw new Error(`not the Newsdesk website list: no "${needed}" column`);
  }
  const isExcluded = (host: string) => {
    const labels = host.split(".");
    return labels.some((_, i) => exclude.has(labels.slice(i).join(".")));
  };

  const sources: Record<string, unknown>[] = [];
  const excluded: string[] = [];
  for (const r of rows) {
    const rank = Number(r[col.best_rank!]);
    if (!(rank <= maxRank)) continue;
    const host = r[col.website!]!.trim().toLowerCase();
    if (isExcluded(host)) {
      excluded.push(host);
      continue;
    }
    const media = r[col.media_types!]!.split("/").map((m) => MEDIA[m as keyof typeof MEDIA] ?? m);
    sources.push({
      id: `ND-${host}`,
      name: r[col.names!]!.split(" | ")[0],
      country: r[col.country!],
      outlet_type: media.join(" / "),
      priority: `P${rank}`,
      homepage_url: r[col.example_url!],
      identity_verification: "unconfirmed",
      network_observation: "not_tested",
      crawl_handling: "candidate_verify_first",
      origin: "newsdesk",
      newsdesk_rank: rank,
      newsdesk_sources: Number(r[col.newsdesk_sources!]),
    });
  }
  const file = JSON.stringify({ schema_version: "1.0", database_name: "Websites from the owner's Newsdesk account", summary: { total_sources: sources.length }, sources });
  return { file, excluded };
}

/** RFC 4180 CSV, with an optional leading byte-order mark. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (quoted) {
      if (c !== '"') cell += c;
      else if (t[i + 1] === '"') (cell += '"'), i++;
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(cell), (cell = ""));
    else if (c === "\n") (row.push(cell), rows.push(row), (row = []), (cell = ""));
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) (row.push(cell), rows.push(row));
  return rows.filter((r) => r.length > 1);
}
