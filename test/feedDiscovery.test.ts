import { describe, expect, it } from "vitest";
import { discoverFeeds, extractFeedLinks, sitemapsFromRobots } from "../src/registry/feedDiscovery.js";

/** A fake web: URL -> body. Anything else fails like an unreachable page. */
function web(pages: Record<string, string>) {
  const requested: string[] = [];
  const fetchText = async (url: string) => {
    requested.push(url);
    const body = pages[url];
    if (body === undefined) throw new Error(`HTTP 404 ${url}`);
    return body;
  };
  return { fetchText, requested };
}

describe("extractFeedLinks", () => {
  it("finds RSS and Atom links advertised in the page head, resolving relative URLs", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" title="Latest" href="/feed/">
      <link rel="alternate" type="application/atom+xml" href="https://example.com/atom.xml">
      <link rel="stylesheet" href="/site.css">
    </head><body></body></html>`;

    expect(extractFeedLinks(html, "https://example.com/")).toEqual([
      { url: "https://example.com/feed/", kind: "rss" },
      { url: "https://example.com/atom.xml", kind: "rss" },
    ]);
  });

  it("ignores comment feeds, repeated links and non-feed alternates", () => {
    const html = `<head>
      <link rel="alternate" type="application/rss+xml" href="/feed">
      <link rel="alternate" type="application/rss+xml" href="/feed">
      <link rel="alternate" type="application/rss+xml" title="Comments on Post" href="/comments/feed">
      <link rel="alternate" hreflang="ar" href="/ar">
    </head>`;

    expect(extractFeedLinks(html, "https://example.com")).toEqual([{ url: "https://example.com/feed", kind: "rss" }]);
  });

  it("copes with attributes in any order and unquoted or single-quoted values", () => {
    const html = `<link href='/rss.xml' type=application/rss+xml rel=alternate>`;

    expect(extractFeedLinks(html, "https://example.com")).toEqual([{ url: "https://example.com/rss.xml", kind: "rss" }]);
  });
});

describe("discoverFeeds", () => {
  it("offers the feeds the homepage advertises, then the sitemaps robots.txt lists", async () => {
    const { fetchText, requested } = web({
      "https://example.com/robots.txt": "Sitemap: https://example.com/news-sitemap.xml",
      "https://example.com/": `<link rel="alternate" type="application/rss+xml" href="/feed">`,
    });

    const found = await discoverFeeds("example.com", fetchText);

    expect(found.candidates).toEqual([
      { url: "https://example.com/feed", kind: "rss" },
      { url: "https://example.com/news-sitemap.xml", kind: "sitemap" },
    ]);
    expect(found.reachable).toBe(true);
    // Advertised feeds are enough: no blind probing of common paths.
    expect(requested).toEqual(["https://example.com/robots.txt", "https://example.com/"]);
  });

  it("falls back to probing common feed paths only when nothing is advertised", async () => {
    const { fetchText } = web({
      "https://example.com/robots.txt": "User-agent: *",
      "https://example.com/": "<html></html>",
      "https://example.com/rss.xml": "<rss></rss>",
    });

    const found = await discoverFeeds("example.com", fetchText);

    expect(found.candidates).toEqual([{ url: "https://example.com/rss.xml", kind: "rss" }]);
  });

  it("follows an RSS directory page the homepage links to, and offers the feeds listed there", async () => {
    const { fetchText } = web({
      "https://example.com/robots.txt": "",
      "https://example.com/": `<a href="/about">About</a> <a href="/rss">RSS</a>`,
      "https://example.com/rss": `<h1>Feeds</h1><a href="/rss/politics.xml">Politics</a> <a href="/rss/sport.xml">Sport</a> <a href="https://other.net/feed.xml">partner</a>`,
    });

    const found = await discoverFeeds("example.com", fetchText);

    expect(found.candidates).toEqual([
      { url: "https://example.com/rss/politics.xml", kind: "rss" },
      { url: "https://example.com/rss/sport.xml", kind: "rss" },
    ]);
  });

  it("does not offer a probed path that answers with an ordinary web page instead of a feed", async () => {
    const { fetchText } = web({
      "https://example.com/robots.txt": "",
      "https://example.com/": "<html></html>",
      "https://example.com/feed": "<html><body>Page not found</body></html>",
      "https://example.com/rss.xml": `<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>`,
    });

    const found = await discoverFeeds("example.com", fetchText);

    expect(found.candidates).toEqual([{ url: "https://example.com/rss.xml", kind: "rss" }]);
  });

  it("tries the www host when the bare domain cannot be read", async () => {
    const { fetchText } = web({
      "https://www.example.com/robots.txt": "",
      "https://www.example.com/": `<link rel="alternate" type="application/rss+xml" href="/feed">`,
    });

    const found = await discoverFeeds("example.com", fetchText);

    expect(found.candidates).toEqual([{ url: "https://www.example.com/feed", kind: "rss" }]);
  });

  it("says when the site cannot be reached at all, and finds nothing", async () => {
    const found = await discoverFeeds("gone.example", web({}).fetchText);

    expect(found).toEqual({ candidates: [], reachable: false, blocked: false });
  });

  it("does not fetch anything beyond robots.txt when robots.txt disallows the homepage for crawlers", async () => {
    const { fetchText, requested } = web({
      "https://example.com/robots.txt": "User-agent: *\nDisallow: /",
      "https://example.com/": `<link rel="alternate" type="application/rss+xml" href="/feed">`,
    });

    const found = await discoverFeeds("example.com", fetchText);

    expect(found).toEqual({ candidates: [], reachable: true, blocked: true });
    expect(requested).toEqual(["https://example.com/robots.txt"]);
  });
});

describe("sitemapsFromRobots", () => {
  it("lists the Sitemap lines of a robots.txt, news sitemaps first", () => {
    const robots = `User-agent: *
Disallow: /admin
Sitemap: https://example.com/sitemap.xml
sitemap: https://example.com/news-sitemap.xml
# Sitemap: https://example.com/commented.xml`;

    expect(sitemapsFromRobots(robots)).toEqual(["https://example.com/news-sitemap.xml", "https://example.com/sitemap.xml"]);
  });

  it("ignores Sitemap lines that are not absolute http(s) URLs", () => {
    const robots = "Sitemap: /relative.xml\nSitemap: sitemap.xml\nSitemap: ftp://example.com/s.xml\nSitemap: https://example.com/ok.xml";

    expect(sitemapsFromRobots(robots)).toEqual(["https://example.com/ok.xml"]);
  });
});
