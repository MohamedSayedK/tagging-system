# Tagging-system (v0): media query + ingest + API

Talkwalker-style boolean query engine over crawled news. Node/TypeScript, OpenSearch.

## Run

```bash
docker compose up -d          # OpenSearch on :9200
npm run init-index            # create indices
npm run ingest                # one pass over sources.yaml
npm run worker                # scheduled crawler (keeps running; see "Sources and scheduling")
npm run discover:gdelt        # grow the source registry from GDELT (see "Source registry")
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

## Source registry

The **registry** is every news domain we know exists; it is not the same as the crawled sources above. A registry domain produces no articles until it is **promoted**: its feed or sitemap is found, validated, and added to what the worker crawls.

| Step | Command | What it does |
|---|---|---|
| Discover | `npm run discover:gdelt -- [--hours 6] [--max-stamps 96]` | Reads GDELT's 15-minute GKG files (English plus the translation feed for other languages, each about 1-3 MB) and records which domains publish. `--hours` is how far back the registry should cover; later runs continue from a cursor and backfill to it. Resumes after a failure |
| Seed | `npm run seed:wikidata` | Adds MENA newspapers and news agencies from Wikidata, with country and language (GDELT sees few Arabic outlets) |
| Promote | `npm run promote -- [--limit 100] [--lang ar]` | For the next domains (Arabic and regional ones first, aggregators and already-configured domains skipped): finds feeds on the homepage and in robots.txt, validates them, stores the outcome. Crawled sources then appear in the Sources tab as "From registry" |

Seeding and promotion fetch other people's sites and a public directory, so they refuse to run until `USER_AGENT` carries a contact URL. The worker does all three on a schedule (below).

`registry-overrides.yaml` is yours to edit: the country of outlets on `.com`/`.net` domains, extra aggregators, and domains the built-in aggregator list gets wrong.

`GET /registry?lang=ar&q=news&hideAggregators=true&from=0&size=50` lists domains, most articles seen first, each with `country`, `aggregator` and `crawl` (the outcome of the last promotion attempt). `lang` takes `ar` or `ara`. The UI shows it on the **Registry** tab (hidden in the public demo).

## Running it for real

```bash
# one analyst team, one machine
set BASIC_AUTH=analyst:a-long-password        # PowerShell: $env:BASIC_AUTH = "..."
set USER_AGENT=TaggingBot/0.1 (+https://your-site.example/contact)
docker compose --profile app up -d --build    # OpenSearch + API (serves the UI) + worker
```

Open http://127.0.0.1:3000. Put a TLS-terminating reverse proxy in front before exposing it beyond your network: Basic auth is only safe over HTTPS. `GET /health` is open; `GET /status` summarises articles, registry size and failing sources.

| Variable | Default | Meaning |
|---|---|---|
| `BASIC_AUTH` | none | `user:password`. Required to listen on anything but loopback (`HOST`) |
| `HOST`, `PORT` | `127.0.0.1`, `3000` | Where the API listens |
| `USER_AGENT` | none | Crawler identity; must contain a contact URL for promotion, seeding and discovery of real sites |
| `OPENSEARCH_URL` | `http://localhost:9200` | |
| `INGEST_CONCURRENCY` | 4 (16 in Docker) | Sources and article fetches in flight; per-site politeness still applies |
| `DOMAIN_MIN_INTERVAL_MS` | `1000` | Least time between requests to one site |
| `DISCOVER_EVERY`, `PROMOTE_EVERY` | `1h` | Worker jobs; `off` disables. `PROMOTE_BATCH` (25) sets domains per run, `DISCOVER_HOURS` (24) the window |
| `SEED_WIKIDATA_EVERY` | `7d` | `off` disables |
| `RETENTION_DAYS` | none | Delete articles published longer ago, checked daily (minimum 7). Off unless set |
| `OPENSEARCH_JAVA_OPTS` | `-Xms512m -Xmx512m` | Raise to 2g or more for a real deployment |

## Query syntax

| Syntax | Meaning |
|---|---|
| `a b`, `a AND b` | both (implicit AND) |
| `a OR b` | either |
| `NOT a`, `a NOT b` | exclude (`a NOT b` = `a AND NOT b`) |
| `"exact phrase"` | phrase |
| `"john kennedy"~2` | phrase whose words may be up to 2 positions apart (Newsdesk's `~n`); also `title:"…"~3` |
| `a PRE/5 b` | like `NEAR/5` but `a` must come before `b` (Newsdesk's `PRE/n`) |
| `a NEAR/8 b` | within 8 words, any order; operands: terms, phrases, OR groups, nested NEAR, and `term NOT (phrases)` (occurrences of the term outside those phrases) |
| `acc*`, `a?c` | wildcard (single terms) |
| `title:x`, `body:x`, `author:x` | text fields; Newsdesk's `headline:`, `content:` and `byline:` are accepted too |
| `sourcetype:BLOG`, `sourcecountry:sa` or `sourceCountry:"Saudi Arabia"`, `lang:ar`, `domain:bbc.com`, `authorshort:x`, `source:"Arab News"` | exact (case-insensitive); country accepts an English name or a two-letter code, unknown names are an error |
| `authorContains:Jadaan` (alias of `author:`) | author text contains the word |
| `title:(a OR b)` | field applied to a group |

Precedence: `OR` < `AND`/`NOT` < `NEAR`/`PRE` < `field:`. Operators must be UPPERCASE.

## API

- `POST /query/validate` `{query}` → AST + OpenSearch DSL, or 400 with position
- `POST /search` `{query, exclude?, from?, to?, sort?: recent|oldest, offset?, size?, interval?: hour|day|week|month, sourcetype?, sourcecountry?, domain?}` → results, highlights, aggregations (over time, source types, countries, domains). Facet filters take one value or an array (`GET /topics/:id/results?sourcetype=a&sourcetype=b`): OR within a facet, AND across facets. Each facet's own options ignore its own filter so more values can be added.
- `GET /registry?lang&q&hideAggregators&from&size` → `{total, items:[{domain, firstSeen, lastSeen, articleCount, languages, country?, aggregator, crawl?}]}`: domains the registry has seen (see "Source registry")
- `GET /status` → `{ok, articles, registry:{domains}, sources:{configured, fromRegistry, failing}}`; `GET /health` → `{ok}` (open even with `BASIC_AUTH`)
- `POST /search` and `GET /topics/:id/results` also take `dedupe=true`: leave out stories an earlier article already carried (same headline fingerprint)
- `GET /sources` → every configured source with `status` (`pending|ok|failing`), `lastRun`, `nextRun`, `found`/`indexed` of the last run, `consecutiveFailures`, `error`
- `GET /topics/:id/facets/:facet` (`facet` = `sourcetype|sourcecountry|domain|lang`) → `[{key,count}]`: every value beyond the top 20 in `/search`. Takes the same range/facet params as results, plus `q` (contains, case-insensitive, literal) and `size` (default 20, max 500).
- `POST /topics` `{name, query, exclude?, color?}` (`color` is a six-digit hex such as `#e5484d`; anything else is a 400), `GET /topics`, `PUT /topics/:id`, `DELETE /topics/:id`, `GET /topics/:id/results`

## Notes / limits

- `AND` inside `NEAR` operands is rejected, and so is a bare `NOT`; only `term NOT (...)` is supported (compiled with `not_contained_by`).
- Arabic: normalization (alef/ya/ta-marbuta, diacritics), no stemming.
- NEAR across title and body counts per field, not across them.
- Ingest respects robots.txt; set `USER_AGENT` env with a contact URL.
- Adding sources: edit `sources.yaml` (`kind: rss` or `sitemap` incl. Google News sitemaps).

## Links

- **Live demo (nothing to install):** https://mohamedsayedk.github.io/tagging-system/app/
- Project page: https://mohamedsayedk.github.io/tagging-system/
- Design prototypes (three directions, clickable): https://mohamedsayedk.github.io/tagging-system/prototypes/

## License

MIT. See [LICENSE](LICENSE).

## The public demo

The GitHub Pages demo is the real UI with the API replaced by an in-browser implementation (web/src/demo/): the same query parser, an equivalent search over a trimmed snapshot of crawled articles (web/public/demo-data.json, refreshed with 
pm run demo:data), and topics kept in the visitor's own browser. Build it locally with 
pm run build:demo.
