# Handoff: from query engine to a public, hands-on demo

Date: 2026-10-11. Repo: https://github.com/MohamedSayedK/tagging-system (public, MIT). Branch `main` = `origin/main`, last commit `c8a0343` "Add a serverless public demo of the real UI". Working tree clean apart from local-only files.

**Start Here:** read this handoff and `docs/ledger.md` before doing anything else. Then `CLAUDE.md` (rules: TDD, UI rules, crawling rules), `PRODUCT.md`, `DESIGN.md`.

## Stale items

None: every ledger entry was created or touched this session (Untouched = 0). Several are owner decisions that are simply unanswered: F-015 (news text in the public demo data), F-019 (licence holder / repo name), F-012 (keep RT Arabic), F-008 (approve source-type display names).

## What exists now

A Talkwalker-style media monitoring system, built test-first (218 tests, typecheck clean):

- **Query language** (`src/query/`): AND/OR/NOT, phrases, wildcards, `NEAR/n`, field filters; compiled to OpenSearch. Pure parser, reused by the demo.
- **Search + API** (`src/search/`, `src/api/`): topics CRUD (name, query, exclude, colour), results with highlights, facets (source type, country, language, domain) with multi-select semantics, `GET /topics/:id/facets/:facet`, auto day/week/month time buckets, `GET /sources`.
- **Crawler** (`src/ingest/`): RSS/Atom/news sitemaps, 34 sources in `sources.yaml`, scheduler with per-source intervals and backoff, run history in OpenSearch, prose check on extracted text, `maxItems`/`maxAgeDays`. Commands: `npm run worker`, `ingest`, `repair`, `demo:data`.
- **Web UI** (`web/`): "The Rundown" design (see `DESIGN.md`): filter bar + panel, topic editor with free colour picker, Bars/Trend chart with average line and click-a-day, day-grouped results with density toggle, Sources health page, loading/error states, in-app delete dialog, light/dark/auto theme, subtle animations.
- **Public demo** (this session's last piece): `web/src/demo/` answers `/api` in the browser from `web/public/demo-data.json` (2,643 real headlines, trimmed). Built by `npm run build:demo` into `site/app` (gitignored), deployed by `.github/workflows/pages.yml`.
- **Live URLs:** project page https://mohamedsayedk.github.io/tagging-system/ , demo `/app/`, design prototypes `/prototypes/`.

## How the session went (in order)

1. Built query parser/compiler, OpenSearch search, ingest, API (v0). 2. Set up `docs/` + `CLAUDE.md`. 3. Web UI feature by feature: editor, results, chart, filters, facet search, scheduling + sources, loading/error states, delete dialog. 4. Impeccable redesign: PRODUCT.md, three prototypes, owner chose "The Rundown" (A), DESIGN.md. 5. Excerpt cleanup + Trend chart, Sources page, dark theme, topic colours + free picker, animations. 6. Git: public repo, MIT, Pages, then the serverless demo.

## Environment and recipes (these cost time)

- Windows, PowerShell. Start the stack: `docker compose up -d` (Docker Desktop must be running), then `npm run api`, `npm run web` (http://localhost:5173), `npm run worker`. The dev OpenSearch holds ~2.6k crawled articles; it is not in git.
- Tests: `npx vitest run` (node env for server, jsdom for `web/src/*.test.tsx`; integration tests need OpenSearch and use throwaway indices via env vars).
- When editing files from PowerShell, write with `UTF8Encoding($false)` (a BOM broke JSON for the Impeccable CLI) and avoid `Rep $t 'a' 'b' + "..."` (argument precedence mangled a file once).
- Vite dev proxy returns 502 when the API is down: the UI maps that to "Can't reach the server".
- Impeccable skill artefacts: `.impeccable/surfaces/web-src-app-tsx.md` (direction contract). The decision-page server was stopped.
- Capturing wide screenshots in the browser pane failed at 1440 (frame scaling); verified at pane width and 1280.

## Not verified

- Phone layout, wide-desktop screenshots, pointer drag on the colour square (F-018, F-020).
- Demo engine parity with OpenSearch beyond the small fixture (F-016).
- Nothing was run against a real Talkwalker export; `NEAR/n` word-distance semantics are an assumption (F-002).

## Focus of the next session

1. Ask the owner the open decisions: F-015 (keep real headlines/excerpts in the public repo?), F-019, F-012, F-008.
2. Pick from F-004: another chart type (heatmap / stacked / ranked sources) or saved filter sets.
3. Operational: F-011 (auto-start worker, alert on failing sources), F-010 (per-domain politeness), F-009 (unreachable outlets).
4. Demo hygiene: F-016 parity test, F-017 scheduled snapshot refresh, F-018 desktop screenshots.

## Suggested skills

- `/tdd` for every feature (owner rule, in CLAUDE.md). `/impeccable` (+ `polish`, `layout`) for UI; update `DESIGN.md` when tokens change. `/handoff-conversation` at the end of a session.

## Ledger Changes

- **Opened:** F-015, F-016, F-017, F-018, F-019, F-020
- **Decided:** D-015 (MIT), D-016 (public repo + Pages), D-017 (serverless demo design), D-018 (motion)
- **Closed/Dropped:** none (F-001 was archived earlier)
- **Updated:** F-004 (chart options), F-005 (loading/error done, save confirmation open), F-007 (sample topics), F-008, F-014, D-010 (formatting repaired)
- **Still open, untouched:** none
