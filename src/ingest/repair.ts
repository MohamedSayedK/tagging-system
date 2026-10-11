// One-off cleanup: re-reads stored articles whose text is site chrome (menus, footers) rather than the article,
// using the current extraction rules. `npm run repair` (add `-- --dry-run` to only count).
import { client, INDEX } from "../search/index-def.js";
import { allowedByRobots, extractArticle, fetchText, looksLikeProse } from "./article.js";

const dryRun = process.argv.includes("--dry-run");
const bad: { id: string; url: string; title: string }[] = [];

let res = await client.search({ index: INDEX, scroll: "2m", body: { size: 500, _source: ["url", "title", "body"], query: { match_all: {} } } });
while (res.body.hits.hits.length) {
  for (const h of res.body.hits.hits as any[]) {
    const body: string = h._source.body ?? "";
    if (body && !looksLikeProse(body)) bad.push({ id: h._id, url: h._source.url, title: h._source.title });
  }
  res = await client.scroll({ scroll_id: res.body._scroll_id, scroll: "2m" });
}
console.log(`${bad.length} articles with chrome-like text${dryRun ? " (dry run)" : ""}`);

let fixed = 0, fallback = 0, failed = 0;
const queue = [...bad];
if (!dryRun) {
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let a = queue.shift(); a; a = queue.shift()) {
        try {
          const ex = (await allowedByRobots(a.url)) ? extractArticle(await fetchText(a.url), a.url) : null;
          // No usable text on the page: keep the title as the searchable text rather than menu words.
          await client.update({ index: INDEX, id: a.id, body: { doc: { body: ex?.body ?? a.title ?? "" } } });
          ex ? fixed++ : fallback++;
        } catch {
          failed++;
        }
      }
    }),
  );
  await client.indices.refresh({ index: INDEX });
  console.log(`fixed ${fixed}, reduced to title ${fallback}, failed ${failed}`);
}