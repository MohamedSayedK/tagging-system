# Project Ledger

Living record of open points, decisions and follow-ups across sessions. Updated at the end of each session (with the handoff).
Closed or dropped rows move to `ledger-archive.md`. IDs are never reused.

## Open

| ID | Type | Summary | Opened | Last touched | Untouched | Notes |
|----|------|---------|--------|--------------|-----------|-------|
| F-015 | Follow-up | The public demo's snapshot (`web/public/demo-data.json`) contains real outlets' headlines, links and ~300-character excerpts in a PUBLIC repo. Decide: keep, headlines only, or synthetic articles | 2026-10-11 (demo) | 2026-10-11 | 0 | Raised to owner at the end of the session; not answered |
| F-016 | Follow-up | Demo search engine (`web/src/demo/engine.ts`) is a re-implementation of the OpenSearch behaviour, checked against a 3-document fixture only; no stemming, no relevance order. Add a parity test on a larger corpus | 2026-10-11 (demo) | 2026-10-11 | 0 | |
| F-017 | Follow-up | Demo data refresh is manual (`npm run demo:data`, commit, CI redeploys). Snapshot ages; consider a scheduled refresh | 2026-10-11 (demo) | 2026-10-11 | 0 | Needs the local OpenSearch with crawled data |
| F-018 | Follow-up | Project page screenshots (`site/img`) are narrow-pane captures, not wide desktop; retake | 2026-10-11 (demo) | 2026-10-11 | 0 | |
| F-019 | Follow-up | Confirm the MIT copyright holder name ("Mohamed Sayed", from git config) and the repo name `tagging-system` | 2026-10-11 (demo) | 2026-10-11 | 0 | |
| F-020 | Follow-up | Not verified: layout on a real phone; colour popover can run past the bottom of a short screen; pointer drag on the colour square and hue slider is untested (keyboard and typing are) | 2026-10-11 (demo) | 2026-10-11 | 0 | |
| F-009 | Follow-up | Still no usable source from this machine: Al Jazeera (AR/EN, Al-Araby, Al-Quds, Middle East Eye, Gulf Times, Anadolu: fetch failed), Al Arabiya (403), Elaph and Arabian Business (403), Al Riyadh (fetch failed), Al Watan and Al Yaum (only archive sitemaps), SPA (sitemap stale: newest Mar 2026, 40k URLs without titles), Argaam (news sitemaps empty). Try a different network/egress, or HTML section pages | 2026-10-11 (sources) | 2026-10-11 | 0 | 13 outlets added via news sitemaps. Saudi still lacks Al Arabiya, Al Riyadh, SPA |
| F-010 | Follow-up | Worker has no per-domain politeness (several sources of one domain can run in parallel; article fetches capped only by INGEST_CONCURRENCY) and no run lock: two workers would double-crawl | 2026-10-11 (sources) | 2026-10-11 | 0 | Extends F-003 |
| F-011 | Follow-up | Worker is a manual process (`npm run worker`): no auto-start with the machine / docker service; no alerting when a source keeps failing | 2026-10-11 (sources) | 2026-10-11 | 0 | |
| F-012 | Follow-up | Youm7 feed has no dates (stamped with first-seen time); RT Arabic included as state media | 2026-10-11 (sources) | 2026-10-11 | 0 | Owner to confirm RT stays |
| F-002 | Follow-up | Confirm `NEAR/n` semantics (max n words between terms, any order) against known Talkwalker results | 2026-10-11 (v0-build) | 2026-10-11 | 0 | Assumption in `src/query/compile.ts` (and the demo engine) |
| F-003 | Follow-up | Ingest has no per-domain rate limit; sourcetype is configured per source, not detected | 2026-10-11 (v0-build) | 2026-10-11 | 0 | See F-010 |
| F-004 | Follow-up | Choose next build: more chart types (calendar heatmap, stacked by country/source type, ranked sources bar), saved filter sets | 2026-10-11 (v0-build) | 2026-10-11 | 0 | Owner decision. Done so far: editor, results, chart (Bars/Trend), filters, facet search, sources + scheduling, themes, topic colour, demo |
| F-008 | Follow-up | Filter bar/panel is an interim copy of the reference layout; needs the owner's UI/UX review. Pinned filters and saved filter sets not built. Source-type display names are my wording (owner to approve; table in `web/src/names.ts`) | 2026-10-11 (filter-bar) | 2026-10-11 | 0 | Panel pushes content (not an overlay) |
| F-014 | Follow-up | Redesign leftovers: Sources page and filter panel restyled, not individually designed; fonts load from Google Fonts (self-host if offline use matters); Impeccable skill update v4.5.2 available | 2026-10-11 (redesign) | 2026-10-11 | 0 | |
| F-005 | Follow-up | UI polish: no confirmation after saving a topic (only the list changes). Loading and error states are done | 2026-10-11 (web-ui) | 2026-10-11 | 0 | Test-first when picked up |
| F-006 | Follow-up | Highlights use OpenSearch `<em>` tags; article text containing a literal `<em>` would show as a highlight (safe, not XSS). Switch to private-use pre/post tags | 2026-10-11 (web-ui) | 2026-10-11 | 0 | |
| F-007 | Follow-up | Date range is UTC days; no timezone setting. Throwaway topic "Saudi and ministers" and the sample topics "Aviation security" / "Energy and oil" (coloured) remain in the dev `topics` index | 2026-10-11 (web-ui) | 2026-10-11 | 0 | Delete from the UI if unwanted |

## Decided

| ID | Type | Decision | Rationale | Decided | Reference |
|----|------|----------|-----------|---------|-----------|
| D-015 | Decision | Licence: MIT, holder "Mohamed Sayed" | Owner asked for MIT | 2026-10-11 | LICENSE |
| D-016 | Decision | Public repo `MohamedSayedK/tagging-system`; GitHub Pages deployed by Actions (project page + serverless live demo) | Owner: shareholders must be able to use the app immediately, nothing to install | 2026-10-11 | `.github/workflows/pages.yml`, README |
| D-017 | Decision | Demo = the real UI with `/api` answered in the browser from a bundled snapshot (same query parser; dates shifted so the newest article is "now"; topics kept in localStorage; opens on the first topic) | No server on Pages; owner wants a hands-on feel | 2026-10-11 | `web/src/demo/`, `src/ingest/exportDemo.ts` |
| D-001 | Decision | Stack: Node/TypeScript + OpenSearch (Docker) | Owner knows TS; `NEAR` over OR-groups needs intervals queries, which SQLite FTS5 cannot do | 2026-10-11 | README.md |
| D-002 | Decision | Sources via RSS/Atom/news-sitemaps + article extraction; robots.txt respected | Legal-friendly, no API cost, works for Arabic outlets | 2026-10-11 | `src/ingest/` |
| D-003 | Decision | `NEAR` compiles to OpenSearch `intervals`; AND not allowed inside NEAR operands; `term NOT (...)` allowed (via `not_contained_by`, see D-019) | Intervals are analysed like normal text; cannot express AND | 2026-10-11 | `src/query/compile.ts` |
| D-004 | Decision | All features are built test-first (`/tdd`), vertical slices, behaviour through public interfaces | Owner 2026-10-11 | 2026-10-11 | CLAUDE.md "Code rules" |
| D-005 | Decision | UI: React + Vite + TS in `web/`, Testing Library; only `fetch` is stubbed (`web/src/test/fakeApi.ts`) | Owner approved | 2026-10-11 | `web/` |
| D-006 | Decision | Scheduling: worker with per-source `interval`, exponential backoff (cap 6h), run history in `source_runs`, status via `GET /sources` and a Sources tab | Owner chose "worker + source health" | 2026-10-11 | `src/ingest/scheduler.ts` |
| D-007 | Decision | Destructive actions confirm in an in-app dialog (`ConfirmDialog`), never `window.confirm`; focus starts on the safe choice | Owner: native warning is unfriendly | 2026-10-11 | `web/src/ConfirmDialog.tsx` |
| D-008 | Decision | Visual system: The Rundown, chosen by the owner from three prototypes | Owner: readability first, low cognitive load | 2026-10-11 | DESIGN.md, PRODUCT.md |
| D-009 | Decision | Ingest skips items older than `maxAgeDays` (default 90); `/search` picks day/week/month buckets from the span of matches | Evergreen feed entries stretched the chart over years | 2026-10-11 | README, `src/search/search.ts` |
| D-010 | Decision | Article text is accepted only if it reads as prose (no glued words, no endless unpunctuated runs, under a third link text); otherwise page description, then feed summary. `npm run repair` re-extracts stored articles | Owner: noisy excerpts; menus also caused false matches | 2026-10-11 | `src/ingest/article.ts` |
| D-011 | Decision | Results chart has Bars and Trend views (same data, labels, click-to-narrow); choice remembered | Owner asked for a toggle | 2026-10-11 | `web/src/ResultsChart.tsx` |
| D-012 | Decision | Dark theme via tokens: Light / Dark / Auto switch, remembered, applied before first paint | Owner: night reading | 2026-10-11 | DESIGN.md |
| D-013 | Decision | Topic colour: nine-colour named palette + None, hex on the topic, validated server-side; labels topics only | Owner: teams give colours meaning | 2026-10-11 | `web/src/topicColors.ts` |
| D-014 | Decision | Free topic colour: own popover (hex + square + hue + palette), any six-digit hex accepted | Owner: free select like their reference | 2026-10-11 | `web/src/ColorPicker.tsx` |
| D-018 | Decision | Subtle entrance and chart animations in CSS only, exponential ease-out, off under reduced motion | Owner asked for subtle animations | 2026-10-11 | DESIGN.md "Motion" |
| D-019 | Decision | Stakeholder's Saudi Minister of Finance Talkwalker query runs unchanged: `term NOT (...)` inside NEAR, `authorContains:` alias, `sourceCountry:` accepts English names (mapped to ISO codes). Dev topic "Minister of Finance (Saudi)" matches the aawsat 5328230 article | Talkwalker compatibility is the product; stakeholder needs aawsat.com | 2026-10-11 | `test/query.test.ts`, README |
