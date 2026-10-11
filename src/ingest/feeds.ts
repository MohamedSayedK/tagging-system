import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  url: string;
  title?: string;
  published?: string; // ISO
  summary?: string;
  author?: string;
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
// fast-xml-parser yields objects for elements with attributes; pull the text out.
const text = (v: any): string | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "object") return text(v["#text"]);
  const s = String(v).trim();
  return s || undefined;
};
const iso = (v: any): string | undefined => {
  const t = text(v);
  const d = t ? new Date(t) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;
};
const stripHtml = (s?: string) => s?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || undefined;

export function parseFeed(body: string, kind: "rss" | "sitemap"): FeedItem[] {
  const doc = xml.parse(body);
  if (kind === "sitemap") {
    return arr<any>(doc.urlset?.url)
      .map((u) => ({
        url: text(u.loc)!,
        title: text(u["news:news"]?.["news:title"]),
        published: iso(u["news:news"]?.["news:publication_date"] ?? u.lastmod),
      }))
      .filter((i) => i.url);
  }
  // RSS 2.0
  const rss = arr<any>(doc.rss?.channel?.item).map((i) => ({
    url: text(i.link)!,
    title: text(i.title),
    published: iso(i.pubDate ?? i["dc:date"]),
    summary: stripHtml(text(i["content:encoded"]) ?? text(i.description)),
    author: text(i["dc:creator"]) ?? text(i.author),
  }));
  // Atom
  const atom = arr<any>(doc.feed?.entry).map((e) => {
    const link = arr<any>(e.link).find((l) => !l["@_rel"] || l["@_rel"] === "alternate");
    return {
      url: link?.["@_href"] as string,
      title: text(e.title),
      published: iso(e.published ?? e.updated),
      summary: stripHtml(text(e.content) ?? text(e.summary)),
      author: text(e.author?.name),
    };
  });
  return [...rss, ...atom].filter((i) => i.url);
}
