// Needs a running OpenSearch. Serves feeds and articles from a local HTTP server.
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.ARTICLES_INDEX = "articles_ingest_test";
process.env.DOMAIN_MIN_INTERVAL_MS = "0"; // the local test server is one "site"; do not wait between requests
const { client, ensureIndices, INDEX } = await import("../src/search/index-def.js");
const { ingestSource } = await import("../src/ingest/ingestSource.js");
const { search } = await import("../src/search/search.js");

let server: Server;
let base = "";

const article = (title: string, body: string) =>
  `<html lang="en"><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${body}</p><p>${body} Further paragraph so the extractor keeps it.</p></article></body></html>`;

const rss = (items: { title: string; path: string }[]) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items
    .map((i) => `<item><title>${i.title}</title><link>${base}${i.path}</link><pubDate>Sun, 11 Oct 2026 09:00:00 GMT</pubDate><description>summary of ${i.title}</description></item>`)
    .join("")}</channel></rss>`;

beforeAll(async () => {
  server = createServer((req, res) => {
    const send = (code: number, type: string, body = "") => {
      res.writeHead(code, { "content-type": type });
      res.end(body);
    };
    if (req.url === "/feed.xml") return send(200, "application/xml", rss([{ title: "Zebra crossing", path: "/a1" }, { title: "Giraffe census", path: "/a2" }]));
    if (req.url === "/a1") return send(200, "text/html", article("Zebra crossing", "Zebras crossed the road near the old quarry today."));
    if (req.url === "/a2") return send(200, "text/html", article("Giraffe census", "Giraffes were counted across the northern reserve this week."));
    if (req.url === "/stale.xml") {
      const items = [`<item><title>Fresh walrus</title><link>${base}/w1</link><pubDate>${new Date().toUTCString()}</pubDate></item>`, `<item><title>Ancient walrus</title><link>${base}/w2</link><pubDate>Mon, 03 Feb 2020 09:00:00 GMT</pubDate></item>`];
      return send(200, "application/xml", `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.join("")}</channel></rss>`);
    }
    if (req.url === "/w1" || req.url === "/w2") return send(200, "text/html", article("Walrus " + req.url, "Walruses were seen on the ice."));
    if (req.url === "/many.xml") {
      const day = (n: number) => `Sun, ${String(n).padStart(2, "0")} Sep 2026 09:00:00 GMT`;
      const items = [1, 2, 3, 4, 5].map((n) => `<item><title>Story ${n} elephant</title><link>${base}/m${n}</link><pubDate>${day(n)}</pubDate></item>`);
      return send(200, "application/xml", `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.join("")}</channel></rss>`);
    }
    if (req.url?.startsWith("/m")) return send(200, "text/html", article(`Story ${req.url.slice(2)} elephant`, "Elephants gathered by the river this morning."));
    if (req.url === "/ar.xml") {
      const items = ["/ar1", "/ar2"].map((p, i) => `<item><title>خبر عاجل ${i}</title><link>${base}${p}</link><pubDate>${new Date().toUTCString()}</pubDate></item>`);
      return send(200, "application/xml", `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.join("")}</channel></rss>`);
    }
    const arabic = (lang: string) =>
      `<html${lang}><head><title>وزير المالية يعلن الميزانية</title></head><body><article><h1>وزير المالية يعلن الميزانية</h1><p>أعلن وزير المالية اليوم عن الميزانية الجديدة للدولة وأكد أن الإنفاق سيرتفع في القطاعات الأساسية.</p><p>وأضاف الوزير أن الحكومة ستواصل دعم المشاريع الكبرى خلال العام المقبل بحسب البيان الرسمي.</p></article></body></html>`;
    if (req.url === "/ar1") return send(200, "text/html", arabic(' lang="ar-SA"'));
    if (req.url === "/ar2") return send(200, "text/html", arabic(""));
    // The same story republished by two outlets (one adds its name to the headline).
    if (req.url === "/syn-a.xml" || req.url === "/syn-b.xml") {
      const own = req.url === "/syn-a.xml" ? "/sa" : "/sb";
      const title = req.url === "/syn-a.xml" ? "Cabinet approves national housing programme for young citizens" : "Cabinet approves national housing programme for young citizens | Outlet B";
      return send(200, "application/xml", `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>${title}</title><link>${base}${own}</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
    }
    if (req.url === "/sa" || req.url === "/sb") return send(200, "text/html", article("Cabinet approves national housing programme for young citizens", "The cabinet approved the programme on Sunday."));
    // Pages that are not a plain <article>: structured data, a page-only date, a description shorter than the feed's summary.
    if (req.url === "/ex.xml") {
      const item = (title: string, path: string, withDate: boolean, summary = "") =>
        `<item><title>${title}</title><link>${base}${path}</link>${withDate ? `<pubDate>${new Date().toUTCString()}</pubDate>` : ""}${summary ? `<description>${summary}</description>` : ""}</item>`;
      const items = [
        item("Structured quokka", "/q1", true),
        item("Undated quokka", "/q2", false),
        item("Summary quokka", "/q3", true, "The feed summary for the quokka story is deliberately much longer than the short description the page offers, so the feed text is the better body."),
      ];
      return send(200, "application/xml", `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.join("")}</channel></rss>`);
    }
    const chrome = `<footer><ul>${Array.from({ length: 14 }, (_, i) => `<li><a href="/s${i}">Section${i}</a></li>`).join("")}</ul></footer>`;
    if (req.url === "/q1") {
      const body = "Quokkas were counted on the island this week and the survey found the population stable. Rangers said the count was the most complete in a decade, covering every part of the reserve.";
      return send(200, "text/html", `<html lang="en"><head><title>Structured quokka</title><script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", articleBody: body })}</script></head><body>${chrome}</body></html>`);
    }
    if (req.url === "/q2") return send(200, "text/html", `<html lang="en"><head><title>Undated quokka</title><meta property="article:published_time" content="2026-09-20T06:00:00Z"></head><body>${article("Undated quokka", "Quokkas gathered near the lake at dawn.")}</body></html>`);
    if (req.url === "/q3") return send(200, "text/html", `<html lang="en"><head><title>Summary quokka</title><meta property="og:description" content="A short quokka description of the page."></head><body>${chrome}</body></html>`);    if (req.url === "/broken.xml") return send(500, "text/plain", "nope");
    return send(404, "text/plain", "not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
  await ensureIndices();
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await client.indices.delete({ index: INDEX }, { ignore: [404] });
});

const source = (feeds: string[]) => ({
  name: "Local",
  domain: "local.test",
  sourcetype: "BLOG",
  country: "SA",
  lang: "en",
  feeds: feeds.map((p) => ({ url: `${base}${p}`, kind: "rss" as const })),
});

describe("ingestSource", () => {
  it("skips items older than maxAgeDays: a monitoring stream is about now, not evergreen feed entries", async () => {
    const outcome = await ingestSource({ ...source(["/stale.xml"]), maxAgeDays: 90 });

    expect(outcome).toMatchObject({ ok: true, found: 2, indexed: 1 });
    await client.indices.refresh({ index: INDEX });
    const r = await search({ query: "walrus" });
    expect(r.results.map((x: any) => x.title)).toEqual(["Fresh walrus"]);
  });

  it("reads only the newest `maxItems` of a large feed, and says how many it saw", async () => {
    const outcome = await ingestSource({ ...source(["/many.xml"]), maxItems: 2 });

    expect(outcome).toMatchObject({ ok: true, found: 5, indexed: 2 });
    await client.indices.refresh({ index: INDEX });
    const r = await search({ query: "elephant", sort: "oldest" });
    expect(r.results.map((x: any) => x.title)).toEqual(["Story 4 elephant", "Story 5 elephant"]);
  });

  it("indexes new articles with the source's metadata, and reports what it did", async () => {
    const outcome = await ingestSource(source(["/feed.xml"]));

    expect(outcome).toMatchObject({ ok: true, found: 2, indexed: 2 });
    await client.indices.refresh({ index: INDEX });
    const r = await search({ query: "zebras", sourcetype: "blog", sourcecountry: "sa" });
    expect(r.total).toBe(1);
    expect(r.results[0]).toMatchObject({ title: "Zebra crossing", source: "Local", domain: "local.test", lang: "en" });
  });

  it("does not index the same articles again", async () => {
    const outcome = await ingestSource(source(["/feed.xml"]));

    expect(outcome).toMatchObject({ ok: true, found: 2, indexed: 0 });
  });

  it("records a language for a source that configures none: the page's own, reduced to the base code, else detected from the text", async () => {
    const { lang: _unused, ...noLang } = source(["/ar.xml"]);
    const outcome = await ingestSource({ ...noLang, name: "Arabic Local" });

    expect(outcome).toMatchObject({ ok: true, indexed: 2 });
    await client.indices.refresh({ index: INDEX });
    const r = await search({ query: "المالية" });
    expect(r.results.map((x: any) => x.lang)).toEqual(["ar", "ar"]);
  });

  it("marks a story already stored under another outlet as a duplicate, and searches can leave duplicates out", async () => {
    await ingestSource({ ...source(["/syn-a.xml"]), name: "Outlet A", domain: "a.test" });
    await ingestSource({ ...source(["/syn-b.xml"]), name: "Outlet B", domain: "b.test" });
    await client.indices.refresh({ index: INDEX });

    const all = await search({ query: "housing programme" });
    const unique = await search({ query: "housing programme", dedupe: true });

    expect(all.total).toBe(2);
    expect(unique.total).toBe(1);
    expect(unique.results[0]).toMatchObject({ source: "Outlet A" }); // the first outlet to carry it is kept
    expect(unique.aggregations.domains.map((d: any) => d.key)).toEqual(["a.test"]);
  });

  it("keeps where the text came from, and uses the page's structured text when the page body is only chrome", async () => {
    await ingestSource({ ...source(["/ex.xml"]), name: "Extraction Local" });
    await client.indices.refresh({ index: INDEX });

    const r = await search({ query: "quokka" });
    const by = Object.fromEntries(r.results.map((x: any) => [x.title, x]));
    expect(by["Structured quokka"].extraction).toBe("structured");
    expect(by["Structured quokka"].body).toContain("population stable");
    expect(by["Undated quokka"].extraction).toBe("page");
  });

  it("dates an undated feed item from the page, and keeps the feed summary when it is fuller than the page description", async () => {
    const r = await search({ query: "quokka" });
    const by = Object.fromEntries(r.results.map((x: any) => [x.title, x]));

    expect(by["Undated quokka"].published).toBe("2026-09-20T06:00:00.000Z");
    expect(by["Summary quokka"].body).toMatch(/^The feed summary for the quokka story/);
    expect(by["Summary quokka"].extraction).toBe("feed");
  });
  it("fails when no feed of the source could be read, saying why", async () => {
    const outcome = await ingestSource(source(["/broken.xml"]));

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/500/);
    expect(outcome).toMatchObject({ found: 0, indexed: 0 });
  });

  it("still succeeds when only some feeds fail, and notes which", async () => {
    const outcome = await ingestSource(source(["/broken.xml", "/feed.xml"]));

    expect(outcome.ok).toBe(true);
    expect(outcome.found).toBe(2);
    expect(outcome.error).toMatch(/1 of 2 feeds failed/);
  });
});

