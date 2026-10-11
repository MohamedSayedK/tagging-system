# Handoff: from 34 hand-written sources to a self-growing, MENA-first source registry

Date: 2026-10-11. Working tree is **uncommitted** (nothing committed or pushed this session).

**Start Here:** read this handoff and `docs/ledger.md`, then `CLAUDE.md`. The earlier handoff (`2026-10-11-demo-site-and-design-system-handoff.md`) still describes the rest of the app.

## Stale items

None: every ledger row was created or touched this session.

## The crawler is running

The owner chose the repo URL as the contact URL: `USER_AGENT=TaggingBot/0.1 (+https://github.com/MohamedSayedK/tagging-system)`. It is in the gitignored `.env` together with a generated `BASIC_AUTH` (user `analyst`; read the password from `.env`, it was never printed). `docker compose --profile app up -d --build` runs OpenSearch + API (UI and `/api` on http://127.0.0.1:3000) + worker. Stop the dev API (`npm run api`) before starting it: both want port 3000, and the dev UI on :5173 proxies to :3000 (it would meet Basic auth).

First real results (F-027): Wikidata seeding added 330 outlets; promotion tried 140 domains and about half became crawlable. The worker keeps going: GDELT discovery hourly, 25 promotions an hour, Wikidata weekly.

## What this session did

1. Set up REA (reverse-engineering MCP, registered for Claude Code). It lives outside this repo.
2. Studied Nexis Newsdesk as a **feature reference** (public help plus one observed authenticated session): `docs/architecture/2026-10-11-nexis-newsdesk-reference-audit.md`. Its licensed source list is not harvested (D-022).
3. Built the **source registry** from GDELT, then everything needed to turn it into crawled sources and a deployable app, all test-first.

## What exists now

| Area | Pieces |
|---|---|
| Discovery | `src/registry/gdelt.ts` (parse), `registry.ts` (merge), `discover.ts` (cursor + floor, backfill, retry-safe), CLI `discover:gdelt` |
| Seeding | `src/registry/wikidata.ts` (SPARQL for MENA newspapers/agencies; merge without touching counts), CLI `seed:wikidata` |
| Promotion | `feedDiscovery.ts`, `feedValidation.ts`, `promote.ts`, `selectToPromote.ts` (MENA first, skips aggregators/configured/recent failures), `promoteBatch.ts`, CLI `promote`; store `src/search/promotionStore.ts` (`crawl_sources` index) |
| Crawling | `src/ingest/mergeSources.ts` (curated + promoted), `domainLimiter.ts` (1 req/s per site), `job.ts` + `worker.ts` jobs, `titleKey.ts` + duplicate flags at ingest, article language detection (`ar-SA` -> `ar`, Arabic script) |
| Search | `dedupe=true`; `PRE/n`, `"a b"~n`, `content:`/`headline:`/`byline:` (engine + demo engine + README table); `retention.ts` |
| API | `GET /registry` (country, aggregator, crawl, `hideAggregators`), `GET /sources` (origin), `GET /status`, Basic auth, `/api` prefix + static UI |
| UI | Registry tab (search, language, hide aggregators, Show more, country, crawl status), Sources tab "From registry", "Remove duplicates" toggle |
| Ops | `Dockerfile`, `docker-compose.yml` (`--profile app`), `vitest.config.ts` (20 s timeouts for integration suites), README "Running it for real" |
| Data files | `registry-overrides.yaml` (owner-editable country, aggregators; seeded with ~35 MENA outlets) |

Last full run: **41 files / 355 tests pass, `npm run typecheck` clean.** The Docker image builds and passes a smoke test (refuses a public bind without `BASIC_AUTH`; serves UI + `/api` with it).

## State of the dev data (local OpenSearch, not in git)

- `source_registry`: 8,628 domains from a 24 h GDELT fill (4,253 with English, 140 with Arabic). Cursor 2026-10-11 15:30, floor 2026-10-10 16:00.
- `articles`: about 2,700 from the 34 curated sources; created before duplicate flags existed, so unflagged.
- `crawl_sources`: empty (no promotion run yet).

## Facts learned (these cost time)

- GDELT's translation GKG feed carries every non-English document (`srclc:xxx` in column 25); the main feed is English only. A stamp's main file is published before its translation file, so the newest stamp 404s for a while: treated as "not yet", never an error (D-021).
- `masterfilelist.txt` is 122 MB; file URLs are deterministic per stamp. GDELT's DOC API returned 429 on one query; use bulk files.
- Running API/UI: the in-app preview launcher cannot start npm scripts through `C:\Program Files` (spaces). Run `npm run api` and `npm run web` from a shell. `.claude/launch.json` lives in the `REA` folder, not this repo.
- Vite's dev server can cache a transform taken between two quick edits (blank page, "X is not defined"); touching the file or restarting `npm run web` fixes it. Unit tests are unaffected.
- `docker compose up -d` (dev) starts OpenSearch only; the compose file now has healthcheck/restart/heap-env on it, which takes effect the next time the container is recreated.
- Vitest's default 5 s timeout is too short when many integration suites create indices at once; `vitest.config.ts` sets 20 s.

## Not verified

- Promotion beyond the first 140 domains; validation thresholds were tuned from one 40- and one 100-domain run only.
- Turkish and other non-Arabic/English outlets: removed from the first run (they had been labelled `en`); they are tier 1 and will be re-promoted without a language label as the hourly job reaches them.
- Registry tab in light theme and at desktop width; the two checkboxes are unstyled (F-032).
- Production: not deployed; no TLS, no OpenSearch snapshots, single node (F-030, F-031).
- Newsdesk operator semantics were never run against Newsdesk, and the owner's licence terms were not checked (F-026).

## Focus of the next session

1. F-027: provide the contact URL, run seeding + promotion, read the tallies, tune `feedValidation.ts` (add tests from real failures).
2. Let the worker run for a day (`docker compose --profile app up -d --build` or `npm run worker`); check `GET /status` and the Sources tab for failing promoted sources.
3. F-029: `START/n`, `MULTIPLE/n`, `^n`; decide on entities/sentiment (ADR).
4. F-030/F-031: TLS proxy, OpenSearch snapshots, a run lock.
5. Owner decisions still open from earlier: F-015, F-019, F-012, F-008.

## Ledger changes

- **Opened:** F-027, F-028, F-029, F-030, F-031, F-032 (and F-021 to F-026 earlier in the session)
- **Decided:** D-020 to D-028
- **Closed:** F-010, F-021, F-022, F-025 (archived)
- **Updated:** F-003, F-011, F-023, F-024
- **Still open, untouched:** none
