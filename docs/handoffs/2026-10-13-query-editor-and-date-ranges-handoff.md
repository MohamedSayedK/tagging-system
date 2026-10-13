# Handoff: readable queries (colour, bracket matching, format) and date-range operators

Date: 2026-10-13. Repo state: `main` at `1b42e36` plus **uncommitted** work (nothing committed or pushed this session). 47 test files / 412 tests pass, `npm run typecheck` clean.

**Start Here:** read this handoff and `docs/ledger.md`, then `CLAUDE.md`. The previous handoff (`2026-10-13-public-demo-registry-snapshot-handoff.md`) covers the registry, promotion and the worker.

## Stale items

None: no open row has gone two sessions untouched.

## What happened

1. **Crawl check** (Docker stack was up): 212 sources (34 curated + 178 from the registry), 207 healthy, 18,923 articles (was 6,635), registry 12,208 domains. Failing: alquds.com, lbcgroup.tv, ami.mr, chinatimes.com, ifeng.com. `alsahwayemen.net` recovered. 96 sources have no country. Promotion pulled in off-brief outlets (Asian news, US stock-spam): F-036, owner call.
2. **Query editor** (D-033), test-first: tolerant highlighter (`web/src/queryHighlight.ts`), bracket pair marking at the caret, unbalanced brackets flagged, pure formatter (`queryFormat.ts`) behind a "Format query" button, and the saved query in the topic header shown formatted and coloured. Queries are forced left-to-right. Syntax colours are `--syn-*` tokens (DESIGN.md updated).
3. **Date ranges** (D-034): `harvestDate:[a TO b]` (stored `fetched`) and `publishedDate:[a TO b]`; `*` open side; date-only bounds cover the whole UTC day; malformed ranges fail with a position. Parser, compile, demo engine and OpenSearch integration tests; README table updated.
4. `lexer.ts` now exports `PROXIMITY` and `DATE_RANGE_*` so the editor colouring cannot drift from the real grammar.

## Files touched

- Server: `src/query/{ast,lexer,parser,compile}.ts`, `src/ingest/exportDemo.ts` (exports `fetched`).
- Web: `QueryField.tsx`, `App.tsx`, `queryHighlight.ts`, `queryFormat.ts`, `styles.css`, `demo/engine.ts`; tests `queryHighlight.test.ts`, `queryFormat.test.ts`, `QueryEditor.test.tsx`, `demo/engine.test.ts`, `Rundown.test.tsx` (one assertion now reads `textContent`, the header text is split across coloured spans).
- Docs: `README.md`, `DESIGN.md`, `docs/ledger.md`. New: `.claude/launch.json` (demo-mode dev server on :5174 for the preview pane).

## Facts learned

- Source files are CRLF: multi-line `String.Replace` from PowerShell silently does nothing; use the Edit tool.
- In PowerShell double-quoted strings a backtick before `r`, `t`, `n` is an escape; it corrupted ledger text once. Use single quotes.
- The `bash` tool's PATH is broken in this session (no `ls`, `git`); use PowerShell.
- The textarea-over-coloured-copy technique needs identical font, padding, wrapping and per-line direction on both layers; the textarea has `color: transparent`.

## Not verified

- Editor in light theme, on a phone, with very long queries (F-038).
- Existing articles stored before `fetched` was mapped have no `fetched`, so `harvestDate` skips them in the real engine; the demo falls back to `published`.
- The running Docker image still has the old code: `docker compose --profile app up -d --build` to get the editor and ranges there.

## Focus of the next session

1. Commit and push this work (owner has not asked yet), rebuild the Docker image.
2. `term^n` boost together with a relevance sort (F-037); then `START/n`, `MULTIPLE/n`.
3. Owner decisions: F-036 (off-brief outlets), F-015, F-034, F-030.

## Ledger Changes

- **Opened:** F-036, F-037, F-038
- **Decided:** D-033, D-034
- **Closed/Dropped:** none
- **Still open, touched:** F-027, F-029, F-033

## Addendum (same day): relevance sort and boost

- `sort=relevance` ("Most relevant" in the UI) and `term^n` / `"phrase"^n` boost: lexer, compile, `search.ts`, `ResultsList` ranked group, demo engine (hit-count scoring, not BM25), editor colouring of `^n`. D-035; F-037 closed. Bracket hover also added to the editor.
- Docker image rebuilt with all of this; app at http://127.0.0.1:3000. A Docker Desktop restart left host port 9200 stuck once: `docker restart tagging-system-opensearch-1` fixed it. A rebuild failed once on a Docker Hub timeout and worked on retry.
- Still uncommitted.

## Addendum 2: query completion

- D-036: the editor suggests field names, UPPERCASE operators, date ranges (today's date filled in) and `sourcetype:`/`lang:` values; Enter/Tab accept, arrows move, Esc hides. Pure logic in `web/src/queryComplete.ts`; the textarea is labelled with `aria-labelledby` so the open suggestion list does not change its accessible name. F-039 opened (static value lists only).
- 48 test files / 434 tests pass, typecheck clean. Docker image rebuilt afterwards. Still uncommitted.

## Addendum 3: saved filter sets

- D-037: name and save the active facets, date range and duplicate setting; chips under the filter bar apply or delete them. localStorage, presets stay relative. F-040 opened (not shared, not per topic). 49 files / 439 tests pass, typecheck clean, Docker image rebuilt, still uncommitted.

## Addendum 4: crawl cleanup

- D-038 crawl scope (`src/registry/scope.ts`): regional only by default; `include:`/`blocked:` in `registry-overrides.yaml`; `PROMOTE_SCOPE=all` to undo. Applied to new promotions (`selectToPromote`) and to already promoted sources (`mergeSources`, via `src/search/promotedScope.ts`, which reads each domain's language/country from the registry). Live result: 252 promoted -> 127 crawled (161 sources total); stock-spam and Asian dailies out; Arabic outlets with no recorded country kept through the registry's language.
- Found: `registry-overrides.yaml` was never in the Docker image. Now copied and mounted read-only in api and worker.
- Not done: stored articles from the dropped outlets remain (F-041, a deletion, needs the owner's yes). 450 tests pass, typecheck clean, Docker rebuilt, still uncommitted.

## Addendum 5: ingestion

- D-039. Measured first: on 3,000 recent articles p25 body length was 607 chars, 25% under 600; Sabq and Times of Israel answer 403 to article pages (feed summary only), Al Madina/aljadeed items are genuinely short, so most of the "short" share is not a Readability fault. Built: JSON-LD/microdata body, page publication date, `extraction` mark per article, conditional GET for feeds, adaptive polling, crawl lease (F-031 closed), `sources.stuck` in `/status`, `npm run report:extraction`. 473 tests pass.
- Next: run `npm run report:extraction` after a day of crawling and decide F-042 items from it. The raw-HTML question (F-042 1) needs the owner.

## Addendum 6: stemming (2026-10-14)

- D-040: `stem:` opt-in stemmed search (Arabic light stemmer + English plurals) on `title.stem`/`body.stem`; default analyzer untouched. Existing index upgraded in place at the next start (`ensureStemAnalyzer`: close, settings, open) and `npm run reindex:stem` back-fills. Demo engine mirrors both stemmers (parity tests). Editor completes `stem:`. F-043 opened (no highlight on stem matches, light stemmer only). 481 tests pass.

## Addendum 7: stem highlights

- Server highlights also read `title.stem` / `body.stem`; exact highlights win, stem ones are shown as the title/body ones (`withStemHighlights` in `search.ts`). Demo engine highlights words whose stem matches. 485 tests pass.
