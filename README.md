# Tagging-system (v0): media query + ingest + API

Talkwalker-style boolean query engine over crawled news. Node/TypeScript, OpenSearch.

## Run

```bash
docker compose up -d          # OpenSearch on :9200
npm run init-index            # create indices
npm run ingest                # one pass over sources.yaml
npm run worker                # scheduled crawler (keeps running; see "Sources and scheduling")
npm run api                   # http://127.0.0.1:3000
npm run web                   # UI at http://localhost:5173 (needs the API running)
npm test                      # unit + UI + integration (needs OpenSearch)
```

## Web UI

Modelled on the reference monitoring UI (interim, pending a UI/UX review): a dark **filter bar** on top (Filters toggle, active-filter chips or "No active filters.", date presets 1D/7D/30D/3M/6M/1Y/All time, From/To) and a **filters panel** with collapsible sections (Source type, Country, Language, Domain) and "Search all filters". Not built yet: pinning, and the reference's sections that need data we don't have (sentiment, tags, demographics, ...).

Topic list, topic editor (name, query, exclude-from-topic, live validation with error position, save/edit/delete), a results-over-time chart you can switch between Bars and Trend (results per UTC day, or per week/month on long spans; follows the date range; click or press Enter on a bar to filter to that day, then "Back to full view" returns to the previous range), and results list (title, source, date, highlighted snippet; sort, UTC date range, load more). Arabic text uses `dir="auto"`. Light, Dark or Auto (follows the system) theme from the top bar. Article text is rendered as plain text, never as HTML.

## Sources and scheduling

`sources.yaml` lists the outlets (RSS/Atom or news sitemaps); each source takes an optional `interval` (`30s`, `15m`, `2h`, `1d`; default `15m`). `npm run worker` re-reads each source when it is due, picks up edits to `sources.yaml` without a restart, and stores the result of every run in the `source_runs` index, so a restart resumes its schedule. A source that fails is retried after 2x, 4x, 8x ... its interval (capped at 6h) and recovers on the first success. A source counts as failed only when none of its feeds could be read; if only some fail the run succeeds and notes which. Status: `GET /sources`, or the **Sources** tab in the UI.

Feeds can be RSS/Atom (`kind: rss`) or Google-News-style sitemaps (`kind: sitemap`, entries with `news:title` / `news:publication_date`). Only the newest `maxItems` entries of each source are read per run (default 100; sitemaps can list thousands). Feed URLs in `sources.yaml` were each fetched and parsed on 2026-10-11. Outlets that blocked or had no usable feed or sitemap from this machine (Al Jazeera, Al Arabiya, Al Riyadh, SPA, Argaam, ...) are not included; see `docs/ledger.md` F-009.

## Query syntax

| Syntax | Meaning |
|---|---|
| `a b`, `a AND b` | both (implicit AND) |
| `a OR b` | either |
| `NOT a`, `a NOT b` | exclude (`a NOT b` = `a AND NOT b`) |
| `"exact phrase"` | phrase |
| `a NEAR/8 b` | within 8 words, any order; operands: terms, phrases, OR groups, nested NEAR |
| `acc*`, `a?c` | wildcard (single terms) |
| `title:x`, `body:x`, `author:x` | text fields |
| `sourcetype:BLOG`, `sourcecountry:sa`, `lang:ar`, `domain:bbc.com`, `authorshort:x`, `source:"Arab News"` | exact (case-insensitive) |
| `title:(a OR b)` | field applied to a group |

Precedence: `OR` < `AND`/`NOT` < `NEAR` < `field:`. Operators must be UPPERCASE.

## API

- `POST /query/validate` `{query}` → AST + OpenSearch DSL, or 400 with position
- `POST /search` `{query, exclude?, from?, to?, sort?: recent|oldest, offset?, size?, interval?: hour|day|week|month, sourcetype?, sourcecountry?, domain?}` → results, highlights, aggregations (over time, source types, countries, domains). Facet filters take one value or an array (`GET /topics/:id/results?sourcetype=a&sourcetype=b`): OR within a facet, AND across facets. Each facet's own options ignore its own filter so more values can be added.
- `GET /sources` → every configured source with `status` (`pending|ok|failing`), `lastRun`, `nextRun`, `found`/`indexed` of the last run, `consecutiveFailures`, `error`
- `GET /topics/:id/facets/:facet` (`facet` = `sourcetype|sourcecountry|domain|lang`) → `[{key,count}]`: every value beyond the top 20 in `/search`. Takes the same range/facet params as results, plus `q` (contains, case-insensitive, literal) and `size` (default 20, max 500).
- `POST /topics` `{name, query, exclude?, color?}` (`color` is a six-digit hex such as `#e5484d`; anything else is a 400), `GET /topics`, `PUT /topics/:id`, `DELETE /topics/:id`, `GET /topics/:id/results`

## Notes / limits

- `AND`/`NOT` inside `NEAR` operands is rejected (OpenSearch intervals can't express it).
- Arabic: normalization (alef/ya/ta-marbuta, diacritics), no stemming.
- NEAR across title and body counts per field, not across them.
- Ingest respects robots.txt; set `USER_AGENT` env with a contact URL.
- Adding sources: edit `sources.yaml` (`kind: rss` or `sitemap` incl. Google News sitemaps).

