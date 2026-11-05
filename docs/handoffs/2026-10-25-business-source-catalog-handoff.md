# Handoff: business source catalog (1,552 outlets) imported and verified

Date: 2026-10-25. Repo: `main` at `f953232` plus uncommitted work (nothing committed or pushed this session).

**Start Here:** this handoff, `docs/ledger.md` (F-051 to F-054, D-045), `docs/adr/0001-business-source-catalog.md`.

## What happened

1. Business handed over `business-input/` (gitignored now): `claude_code_news_sources_1552.json` (the data: 1,552 records with ID, country, priority, homepage, audit fields, `crawl_handling`), the same list as `.xlsx`, and a requirements brief (`.txt`). The brief mentions a `CLAUDE_CODE_PROMPT.txt` that was not supplied.
2. Owner decided: the list bypasses the regional rule, `blocked:` still wins, write an ADR (ADR 0001, D-045).
3. Built test-first:
   - `src/registry/catalog.ts`: `parseCatalog` (keeps every record, reports rejects and duplicate IDs), `catalogDomains` (crawlable vs held), `importCheck`, `catalogReport`, `toCsv`.
   - `src/registry/catalogVerify.ts`: `verifyCatalog`, one check per domain, P1 first, bounded, held records never fetched, homepage name as identity evidence (entities decoded), retry after 7 days.
   - `src/search/catalogStore.ts` + `source_catalog` index (re-import keeps verification, never drops records).
   - `loadScope(env, overrides, catalog)`; `crawlScope()` in `src/search/promotedScope.ts` used by the worker/API and by registry promotion.
   - Commands `catalog:import`, `catalog:verify`, `catalog:report` (README "Business source catalog").
4. Ran for real: import 1,552/1,552 stored (1,476 unconfirmed), check OK. Verification of 1,259 domains: 886 active, 280 no feed, 68 unreachable, 25 blocked, 0 failed.

## State right now

| | |
|---|---|
| Tests | 59 files / 537 passing, typecheck clean |
| Catalog report | `business-input/catalog-report.csv`: 895 crawled + 32 curated, 284 no feed, 68 unreachable, 25 blocked, 248 held by business rule |
| Real system | Rebuilt with a 2 GB OpenSearch heap; the worker crawls 1,046 sources (34 curated + 1,012 promoted); first catalog-only outlet (Burkina24) indexed. About 109,900 articles at the rebuild |

## Not verified

- A full crawl cycle over all 1,046 sources: only the first minutes were watched. Heap was at 9% of 2 GB then.
- Identity: 237 crawled records' homepages do not carry the record's name; not reviewed by a person.
- Redirect history, publisher terms (F-053).

## Next

1. Watch `/status` and the Sources tab for a day; re-run `npm run catalog:report` (F-051).
2. Send business the report; ask about the hold list (F-052).
3. Put `catalog:verify` on the worker's schedule (F-053).

## Addendum: Sources page tabs and pages

Owner asked for pagination and failing sources in their own tab (D-046). Built test-first in `web/src/Sources.test.tsx` (16 tests); checked in the demo build (dark theme, 1280 px: tabs, 50 rows, pager). The API container was rebuilt alone (`--no-deps api`) so the real app serves it. Not checked: light theme, phone width. Full `npm test` is flaky while the worker crawls (F-055).

## Addendum 2026-10-26: held records verified (ADR 0002, D-047)

Owner: treat every record as `candidate_verify_first` except quarantine and archive. Verified the 244 formerly held domains: 44 active, 94 no feed, 101 unreachable (mostly refusals), 5 blocked by robots.txt (Reuters among them). api and worker rebuilt (`--no-deps api worker`); the worker crawls 1,091 sources (34 curated + 1,057); about 162,750 articles; 16 failing, 7 stuck. chinatimes.com, previously active, now answers 403 on its sitemap and dropped out.

## Addendum 2026-10-28: Newsdesk extraction (ADR 0003, D-048)

Owner asked for every website from their open Newsdesk Manage Sources page (their own account, licence confirmed by them). Read through the page's own API: 50 list pages (the server caps a query at 10,000 of 97,098), then one `sourceInfo` call per source, 3 at a time, no failures. Result: `business-input/newsdesk-sources.csv` (7,750 websites), `newsdesk-new-sources.csv` and `newsdesk-new-domains.txt` (7,284 not in our catalog or `sources.yaml`). All gitignored. Not imported or verified (F-056, F-057). The browser pane cannot call local services, so the data left the page as a CSV download; a copy remains in C:/Users/dell/Downloads. Docker was down for a while on 2026-10-28 and is back.

Later the same day: rank 1 and 2 loaded. New tested converter `src/registry/newsdeskList.ts` and command `npm run catalog:from-newsdesk -- <csv> <out.json> --max-rank 2 [--exclude file]`; the 731 sites became catalog records `ND-<host>` (import, then `catalog:verify`). Owner chose to exclude nothing (an exclusion file exists in `business-input/` but is unused). Verified: 335 active (rank 1: 45 of 90; rank 2: 290 of 641), 346 not crawled. The running worker picked them up without a rebuild: 1,394 promoted sources, about 326,000 articles. Not checked: the quality of what the new journal and press-release sources produce.

## Addendum 2026-10-28: lenient feeds and headline fallback (ADR 0004, D-049)

Owner: titles alone are fine. `validateFeed` and `promoteDomain` take thresholds (`minItems`, `maxAgeDays`) and a `headlines` switch; only `verifyCatalog` sets them (1 item, 180 days, headlines on). New `src/ingest/headlines.ts` (`parseHeadlines`) and a feed kind `html`. Re-verified the 695 catalog records that had no feed: 425 now active. Newsdesk rank 1 and 2: 523 of 731 crawled (was 335); 156 of those through headlines. All catalog sites: 355 headline sources. api and worker rebuilt (`--no-deps api worker`); the worker reads 1,850 sources. Three headline sources (Kanal 7, CNN Japan, Law360 Canada) were ingested directly as a check: 12 articles each, full text extracted. Open: F-058. Not verified: what the other headline sources store; the worker had not reached them 15 minutes after the rebuild.

## 2026-11-01: hosted on Railway

Project `tagging-system` on Railway: services `opensearch` (image from `deploy/opensearch/`, volume, private host `opensearch.railway.internal`), `api` (public temp domain, `BASIC_AUTH`) and `worker` (`SERVICE_CMD=worker`). Sized for the $20 credit: OpenSearch heap 512 MB, Node heaps capped, `INGEST_CONCURRENCY=4`, `DISCOVER_EVERY`, `PROMOTE_EVERY` and `SEED_WIKIDATA_EVERY` off, `RETENTION_DAYS=14`. The catalog (2,283 records) and 965 verified crawl sources were copied from the local OpenSearch in one `_bulk` call over `railway ssh`; the worker reads 999 sources. Opened F-059, decided D-050. Not verified: cost after a day of crawling; the hosted UI against Railway data.

## Ledger Changes

- **Opened:** F-051, F-052, F-053, F-054, F-055, F-056, F-057, F-058, F-059
- **Decided:** D-045 (ADR 0001), D-046, D-047 (ADR 0002), D-048 (ADR 0003), D-049 (ADR 0004), D-050
- **Closed/Dropped:** none
