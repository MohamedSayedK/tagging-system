import { describe, expect, it } from "vitest";
import { validateFeed } from "../src/registry/feedValidation.js";

const NOW = new Date("2026-10-11T12:00:00Z");

interface Item { link: string; title: string; pubDate?: string }
const item = (n: number, over: Partial<Item> = {}): Item => ({
  link: `https://example.com/news/${n}`,
  title: `Headline number ${n} about the economy`,
  pubDate: new Date(NOW.getTime() - n * 3_600_000).toUTCString(),
  ...over,
});
const rss = (items: Item[]) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>Site</title>${items
    .map((i) => `<item><title>${i.title}</title><link>${i.link}</link>${i.pubDate ? `<pubDate>${i.pubDate}</pubDate>` : ""}</item>`)
    .join("")}</channel></rss>`;
const sitemap = (urls: string[]) =>
  `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls
    .map((u, i) => `<url><loc>${u}</loc><news:news><news:publication_date>${new Date(NOW.getTime() - i * 3_600_000).toISOString()}</news:publication_date><news:title>خبر رقم ${i}</news:title></news:news></url>`)
    .join("")}</urlset>`;

const serve = (pages: Record<string, string>) => async (url: string) => {
  const body = pages[url];
  if (body === undefined) throw new Error(`HTTP 404 ${url}`);
  return body;
};
const five = (over?: (n: number) => Partial<Item>) => Array.from({ length: 5 }, (_, i) => item(i + 1, over?.(i + 1)));

describe("validateFeed", () => {
  it("accepts a current feed whose items link to the same site, and reports what it found", async () => {
    const fetchText = serve({ "https://example.com/feed": rss(five()) });

    const result = await validateFeed({ url: "https://example.com/feed", kind: "rss" }, "example.com", fetchText, { now: NOW });

    expect(result).toMatchObject({ ok: true, items: 5, dated: 5, url: "https://example.com/feed", kind: "rss", lang: "en" });
  });

  it("recognises an Arabic feed from its headlines", async () => {
    const arabic = Array.from({ length: 5 }, (_, i) => item(i + 1, { title: `عاجل: وزير المالية يعلن ميزانية جديدة رقم ${i}` }));
    const fetchText = serve({ "https://example.com/feed": rss(arabic) });

    const result = await validateFeed({ url: "https://example.com/feed", kind: "rss" }, "example.com", fetchText, { now: NOW });

    expect(result).toMatchObject({ ok: true, lang: "ar" });
  });

  it("rejects a feed with too few items to be a news stream", async () => {
    const fetchText = serve({ "https://example.com/feed": rss([item(1), item(2)]) });

    const result = await validateFeed({ url: "https://example.com/feed", kind: "rss" }, "example.com", fetchText, { now: NOW });

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/too few/i) });
  });

  it("rejects a feed whose items mostly link to other sites", async () => {
    const fetchText = serve({
      "https://example.com/feed": rss(five((n) => ({ link: `https://ads.example.net/offer/${n}` }))),
    });

    const result = await validateFeed({ url: "https://example.com/feed", kind: "rss" }, "example.com", fetchText, { now: NOW });

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/other sites/i) });
  });

  it("accepts items on a subdomain of the registered domain", async () => {
    const fetchText = serve({
      "https://example.com/feed": rss(five((n) => ({ link: `https://english.example.com/news/${n}` }))),
    });

    const result = await validateFeed({ url: "https://example.com/feed", kind: "rss" }, "example.com", fetchText, { now: NOW });

    expect(result.ok).toBe(true);
  });

  it("rejects a feed whose newest item is more than two weeks old", async () => {
    const old = five((n) => ({ pubDate: new Date(NOW.getTime() - (20 + n) * 86_400_000).toUTCString() }));
    const fetchText = serve({ "https://example.com/feed": rss(old) });

    const result = await validateFeed({ url: "https://example.com/feed", kind: "rss" }, "example.com", fetchText, { now: NOW });

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/stale|old/i) });
  });

  it("accepts an undated feed but says so, since new articles will be stamped when first seen", async () => {
    const fetchText = serve({ "https://example.com/feed": rss(five(() => ({ pubDate: undefined }))) });

    const result = await validateFeed({ url: "https://example.com/feed", kind: "rss" }, "example.com", fetchText, { now: NOW });

    expect(result).toMatchObject({ ok: true, dated: 0 });
  });

  it("rejects a page that is not a feed at all", async () => {
    const fetchText = serve({ "https://example.com/feed": "<html><body>Welcome</body></html>" });

    const result = await validateFeed({ url: "https://example.com/feed", kind: "rss" }, "example.com", fetchText, { now: NOW });

    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/not a feed/i) });
  });

  it("reports why a feed could not be fetched", async () => {
    const result = await validateFeed({ url: "https://example.com/gone", kind: "rss" }, "example.com", serve({}), { now: NOW });

    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("404") });
  });

  it("follows a sitemap index to its news sitemap and validates that", async () => {
    const index = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap-news.xml</loc></sitemap></sitemapindex>`;
    const urls = Array.from({ length: 5 }, (_, i) => `https://example.com/a/${i}`);
    const fetchText = serve({ "https://example.com/sitemap.xml": index, "https://example.com/sitemap-news.xml": sitemap(urls) });

    const result = await validateFeed({ url: "https://example.com/sitemap.xml", kind: "sitemap" }, "example.com", fetchText, { now: NOW });

    expect(result).toMatchObject({ ok: true, kind: "sitemap", url: "https://example.com/sitemap-news.xml", items: 5, lang: "ar" });
  });
});
