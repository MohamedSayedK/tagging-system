# Project Ledger

Living record of open points, decisions and follow-ups across sessions. Updated at the end of each session (with the handoff).
Closed or dropped rows move to `ledger-archive.md`. IDs are never reused.

## Open

| ID | Type | Summary | Opened | Last touched | Untouched | Notes |
|----|------|---------|--------|--------------|-----------|-------|
| F-009 | Follow-up | Still no usable source from this machine: Al Jazeera (AR/EN, Al-Araby, Al-Quds, Middle East Eye, Gulf Times, Anadolu: fetch failed), Al Arabiya (403), Elaph and Arabian Business (403), Al Riyadh (fetch failed), Al Watan and Al Yaum (only archive sitemaps), SPA (sitemap is stale: newest Mar 2026, 40k URLs without titles), Argaam (news sitemaps empty). Try a different network/egress, or HTML section pages | 2026-10-11 (sources) | 2026-10-11 | 0 | 13 outlets added via news sitemaps 2026-10-11 (Sabq, Al Madina, Al Eqtisadiah, Al Khaleej, Emarat Al Youm, Gulf News, The National, Khaleej Times, Zawya EN/AR, Times of Israel, Dostor, Elwatan). Saudi still lacks Al Arabiya, Al Riyadh, SPA |
| F-010 | Follow-up | Worker has no per-domain politeness yet (several sources of one domain can run in parallel; article fetches are only capped by INGEST_CONCURRENCY) and no overall run lock: two workers would double-crawl | 2026-10-11 (sources) | 2026-10-11 | 0 | Extends F-003 |
| F-011 | Follow-up | Worker is a manual process (`npm run worker`): no auto-start with the machine / docker service; no alerting when a source keeps failing | 2026-10-11 (sources) | 2026-10-11 | 0 | |
| F-012 | Follow-up | Youm7 feed has no dates (stamped with first-seen time); RT Arabic included as state media | 2026-10-11 (sources) | 2026-10-11 | 0 | Owner to confirm RT stays |
| F-002 | Follow-up | Confirm `NEAR/n` semantics (max n words between terms, any order) against known Talkwalker results | 2026-10-11 (v0-build) | 2026-10-11 | 0 | Assumption made in `src/query/compile.ts` |
| F-003 | Follow-up | Ingest has no per-domain rate limit; sourcetype is configured per source, not detected | 2026-10-11 (v0-build) | 2026-10-11 | 0 | |
| F-004 | Follow-up | Choose next build: more sources + scheduling, loading/error states (F-005), or saved filter sets | 2026-10-11 (v0-build) | 2026-10-11 | 0 | Owner decision. Done 2026-10-11: editor, results list, over-time chart, filter bar + panel with source type/country/language/domain filters, facet search and Show more |
| F-008 | Follow-up | Filter bar/panel is an interim copy of the reference layout; needs the UI/UX review the owner mentioned. Pinned filters, saved filter sets, source-type names are my wording (owner to approve; table in `web/src/names.ts`). Countries and languages show full English names since 2026-10-11, via `Intl.DisplayNames`; unknown codes show raw | 2026-10-11 (filter-bar) | 2026-10-11 | 0 | Panel pushes content (not an overlay); presets are UTC days |
| F-014 | Follow-up | Redesign leftovers: the Sources page and filter panel are restyled only (not individually designed); design/prototypes fonts load from Google Fonts (the app too, via web/index.html: self-host if offline use matters); Impeccable skill update v4.5.2 available | 2026-10-11 (redesign) | 2026-10-11 | 0 | |
| F-005 | Follow-up | UI polish: no confirmation after saving a topic (only the list changes), layout only checked at ~800px. Loading and error states done 2026-10-11 (topics, results, load more, save/delete, query check, sources, filter panel) | 2026-10-11 (web-ui) | 2026-10-11 | 0 | Test-first when picked up |
| F-006 | Follow-up | Highlights use OpenSearch `<em>` tags; article text containing a literal `<em>` would be shown as a highlight (safe, not XSS). Switch to private-use pre/post tags | 2026-10-11 (web-ui) | 2026-10-11 | 0 | |
| F-007 | Follow-up | Date range is UTC days; no timezone setting. Throwaway topic "Saudi and ministers" left in the dev `topics` index from the manual check | 2026-10-11 (web-ui) | 2026-10-11 | 0 | Delete it from the UI |

## Decided

| ID | Type | Decision | Rationale | Decided | Reference |
|----|------|----------|-----------|---------|-----------|
| D-001 | Decision | Stack: Node/TypeScript + OpenSearch (Docker) | Owner knows TS; `NEAR` over OR-groups needs span/intervals queries, which SQLite FTS5 cannot do | 2026-10-11 | README.md |
| D-002 | Decision | Sources via RSS/Atom/news-sitemaps + article extraction; robots.txt respected | Legal-friendly, no API cost, works for Arabic outlets | 2026-10-11 | `src/ingest/` |
| D-006 | Decision | Scheduling: worker with per-source `interval`, exponential backoff (cap 6h), run history in OpenSearch `source_runs` (one doc per source), status via `GET /sources` and a Sources tab | Owner chose "worker + source health" 2026-10-11 | 2026-10-11 | `src/ingest/scheduler.ts`, README |
| D-007 | Decision | Destructive actions confirm in an in-app dialog (`ConfirmDialog`), never `window.confirm`; focus starts on the safe choice | Owner 2026-10-11: the native browser warning is unfriendly | 2026-10-11 | `web/src/ConfirmDialog.tsx` |
| D-008 | Decision | Visual system: The Rundown (broadcast running-order sheet), chosen by the owner from three prototypes; recorded in DESIGN.md | Owner 2026-10-11: readability first, low cognitive load | 2026-10-11 | DESIGN.md, PRODUCT.md |
| D-009 | Decision | Ingest skips items older than maxAgeDays (default 90); /search picks day/week/month buckets from the span of matches | A monitoring stream is about now; evergreen feed entries stretched the chart over years | 2026-10-11 | README, src/ingest/, src/search/search.ts |
| D-010 | Decision | Article text is accepted only if it reads as prose (no glued words, no endless unpunctuated runs, under a third link text); otherwise the page's own description, then the feed summary, is used. 
pm run repair re-extracts stored articles | Owner 2026-10-11: noisy excerpts. Menus in the body also caused false search matches | 2026-10-11 | src/ingest/article.ts |
| D-011 | Decision | The results chart has two views, Bars and Trend (same data, same labels, click-to-narrow); the choice is remembered | Owner 2026-10-11 asked for a toggle between chart types | 2026-10-11 | web/src/ResultsChart.tsx |
| D-012 | Decision | Dark theme via tokens: Light / Dark / Auto (system) switch, remembered, applied before first paint | Owner 2026-10-11: night reading | 2026-10-11 | DESIGN.md |
| D-013 | Decision | Topic colour: nine-colour named palette + None, stored as hex on the topic, validated server-side; labels topics only (list dot, heading dot), never recolours the UI | Owner 2026-10-11: teams give topic colours meaning | 2026-10-11 | web/src/topicColors.ts |
| D-014 | Decision | Free topic colour: own popover (hex + square + hue + palette) instead of a library; any six-digit hex is accepted by the API | Owner 2026-10-11: free select like their reference image | 2026-10-11 | web/src/ColorPicker.tsx, web/src/colorMath.ts |
| D-004 | Decision | All features are built test-first (`/tdd`), vertical slices, behaviour through public interfaces | Owner 2026-10-11; recorded in CLAUDE.md | 2026-10-11 | CLAUDE.md "Code rules" |
| D-005 | Decision | UI: React + Vite + TS in `web/`, tested with Testing Library; only `fetch` is stubbed (`web/src/test/fakeApi.ts`) | Owner approved 2026-10-11 | 2026-10-11 | `web/` |
| D-003 | Decision | `NEAR` compiles to OpenSearch `intervals`; AND/NOT not allowed inside NEAR operands | Intervals are analyzed like normal text (Arabic normalization); cannot express AND/NOT | 2026-10-11 | `src/query/compile.ts` |


