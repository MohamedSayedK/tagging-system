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

## Ledger Changes

- **Opened:** F-051, F-052, F-053, F-054
- **Decided:** D-045 (ADR 0001)
- **Closed/Dropped:** none
