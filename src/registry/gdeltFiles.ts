export interface GdeltFile {
  /** The 14-digit UTC stamp (YYYYMMDDHHMMSS) the file was published under. */
  id: string;
  /** `main` is the English-language GKG; `translation` carries every other language. */
  kind: "main" | "translation";
  url: string;
}

const GKG_FILE = /^(.*\/(\d{14})\.(translation\.gkg|gkg)\.csv\.zip)$/;

/**
 * Select the GKG files to read from the text of GDELT's `masterfilelist.txt` or `lastupdate.txt`
 * (lines of "size md5 url"): only those newer than the last processed stamp, oldest first.
 */
export function filesAfter(listing: string, lastId: string | null): GdeltFile[] {
  const files: GdeltFile[] = [];
  for (const line of listing.split("\n")) {
    const m = GKG_FILE.exec(line.trim().split(/\s+/).pop() ?? "");
    if (!m) continue;
    const [, url, id, name] = m as unknown as [string, string, string, string];
    if (lastId !== null && id <= lastId) continue;
    files.push({ id, kind: name === "gkg" ? "main" : "translation", url });
  }
  return files.sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind));
}
