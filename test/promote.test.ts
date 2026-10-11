import { describe, expect, it } from "vitest";
import { countryFromDomain } from "../src/registry/country.js";
import { promoteDomain } from "../src/registry/promote.js";

const NOW = new Date("2026-10-11T12:00:00Z");
const rss = (n = 5, title = (i: number) => `عاجل: خبر اقتصادي رقم ${i} من الوزارة`) =>
  `<?xml version="1.0"?><rss version="2.0"><channel>${Array.from({ length: n }, (_, i) => {
    const t = new Date(NOW.getTime() - (i + 1) * 3_600_000).toUTCString();
    return `<item><title>${title(i)}</title><link>https://site.com.eg/n/${i}</link><pubDate>${t}</pubDate></item>`;
  }).join("")}</channel></rss>`;
const web = (pages: Record<string, string>) => async (url: string) => {
  const body = pages[url];
  if (body === undefined) throw new Error(`HTTP 404 ${url}`);
  return body;
};

describe("countryFromDomain", () => {
  it.each([
    ["alyaum.com.sa", "SA"],
    ["youm7.com", undefined],
    ["emaratalyoum.ae", "AE"],
    ["egypttoday.org.eg", "EG"],
    ["bbc.co.uk", "GB"],
    ["al-monitor.io", undefined], // .io is used as a generic suffix
    ["hespress.ma", "MA"],
  ])("%s -> %s", (domain, country) => {
    expect(countryFromDomain(domain)).toBe(country);
  });
});

describe("promoteDomain", () => {
  it("turns a domain with a working feed into a crawl source with its country, language and feeds", async () => {
    const fetchText = web({
      "https://site.com.eg/robots.txt": "",
      "https://site.com.eg/": `<link rel="alternate" type="application/rss+xml" href="/rss">`,
      "https://site.com.eg/rss": rss(),
    });

    const result = await promoteDomain("site.com.eg", fetchText, { now: NOW });

    expect(result).toMatchObject({
      status: "active",
      domain: "site.com.eg",
      source: {
        name: "site.com.eg",
        domain: "site.com.eg",
        sourcetype: "ONLINENEWS_OTHER",
        country: "EG",
        lang: "ar",
        feeds: [{ url: "https://site.com.eg/rss", kind: "rss" }],
      },
    });
  });

  it("uses the owner's country override for outlets on generic domains", async () => {
    const fetchText = web({
      "https://argaam.com/robots.txt": "",
      "https://argaam.com/": `<link rel="alternate" type="application/rss+xml" href="/rss">`,
      "https://argaam.com/rss": rss().replace(/site\.com\.eg/g, "argaam.com"),
    });

    const result = await promoteDomain("argaam.com", fetchText, { now: NOW, countryOf: (d) => (d === "argaam.com" ? "SA" : undefined) });

    expect(result.source?.country).toBe("SA");
  });

  it("keeps only feeds that validate and records why the others were rejected", async () => {
    const fetchText = web({
      "https://site.com.eg/robots.txt": "Sitemap: https://site.com.eg/sitemap.xml",
      "https://site.com.eg/": `<link rel="alternate" type="application/rss+xml" href="/rss">`,
      "https://site.com.eg/rss": rss(),
      "https://site.com.eg/sitemap.xml": "<html>nope</html>",
    });

    const result = await promoteDomain("site.com.eg", fetchText, { now: NOW });

    expect(result.status).toBe("active");
    expect(result.source!.feeds).toEqual([{ url: "https://site.com.eg/rss", kind: "rss" }]);
    expect(result.rejected).toEqual([{ url: "https://site.com.eg/sitemap.xml", reason: "not a feed" }]);
  });

  it("reports no_feed with the reasons when nothing validates", async () => {
    const fetchText = web({
      "https://site.com.eg/robots.txt": "",
      "https://site.com.eg/": `<link rel="alternate" type="application/rss+xml" href="/rss">`,
      "https://site.com.eg/rss": rss(1),
    });

    const result = await promoteDomain("site.com.eg", fetchText, { now: NOW });

    expect(result).toMatchObject({ status: "no_feed", rejected: [{ url: "https://site.com.eg/rss", reason: expect.stringMatching(/too few/) }] });
    expect(result.source).toBeUndefined();
  });

  it("distinguishes a site that cannot be reached from one that forbids crawlers", async () => {
    const down = await promoteDomain("down.example", web({}), { now: NOW });
    const blocked = await promoteDomain(
      "closed.example",
      web({ "https://closed.example/robots.txt": "User-agent: *\nDisallow: /" }),
      { now: NOW },
    );

    expect(down.status).toBe("unreachable");
    expect(blocked.status).toBe("blocked");
  });
});
