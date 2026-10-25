# Handoff: query editor, search language, ingestion, Press Cuttings theme: built, merged to `main`, deployed

Date: 2026-10-25 (work done 2026-10-13 and 2026-10-14). Repo: `main` = `origin/main` = `f953232`, working tree clean apart from one deliberately untracked file (F-034). The Pages deploy for that commit succeeded.

**Start Here:** read this handoff and `docs/ledger.md`, then `CLAUDE.md` (TDD, UI and crawling rules). The earlier handoffs (`2026-10-13-public-demo-registry-snapshot-handoff.md`, then `2026-10-13-query-editor-and-date-ranges-handoff.md` with its nine addenda) hold the step-by-step detail; this one is the summary and where things stand.

## Stale items

Seven open entries have gone two sessions untouched. At the start of the next session decide for each: act, close, or drop.

- F-003 sourcetype is configured per source, not detected
- F-005 no confirmation after saving a topic
- F-006 highlights use `<em>`; a literal `<em>` in article text would show as a highlight
- F-007 date range is UTC days, no timezone; throwaway topics remain in the dev index
- F-012 Youm7 feed has no dates; owner to confirm RT Arabic stays
- F-019 confirm the MIT holder name and repo name
- F-028 duplicate removal only catches the same headline

## What happened

1. **Query editor** (D-033, D-036): colour-coded query text, bracket pairs lit by caret and by hover, unbalanced brackets flagged, a Format query button, the saved query shown formatted, completion of field names, UPPERCASE operators, date ranges and `sourcetype:`/`lang:` values.
2. **Search language**: `harvestDate:`/`publishedDate:` ranges (D-034), `term^n` boost and the Most relevant sort (D-035), opt-in `stem:` Arabic and English stemming with highlights (D-040), `START/n:` and `MULTIPLE/n:` (D-042), "Why this matched" per result (D-041). A bare `NEAR`/`PRE` is now an error, not a word (it used to turn a query into AND).
3. **Crawl and ingestion**: crawl scope limited to regional outlets, about half the promoted sources dropped (D-038); structured-data text, page dates, an `extraction` mark per article, conditional feeds, adaptive polling, a crawl lease so only one worker crawls, `sources.stuck` in `/status`, `npm run report:extraction` (D-039). Found and fixed: `registry-overrides.yaml` was missing from the Docker image.
4. **Saved filter sets** (D-037), per browser.
5. **Theme**: the interface was changed to Press Cuttings (prototype B), first recoloured and then rebuilt to its layout: masthead, folder tabs, slip bar, clippings, side column (D-043).
6. **Stakeholder pitch** written as a shared doc (F-046).
7. **Shipped** (D-044): 10 commits on `feature/editor-search-ingestion`, fast-forwarded into `main`, pushed, Pages deployed and checked.

## State right now

| | |
|---|---|
| Repo | `main` at `f953232`; branch `feature/editor-search-ingestion` still on GitHub, identical to `main` (F-050) |
| Tests | 56 files / 514 passing, `npm run typecheck` clean |
| Live demo | https://mohamedsayedk.github.io/tagging-system/app/ with the new theme and operators; its article and registry snapshots are from 2026-10-11 |
| Real system | **Docker Desktop was not running at the end**, so the crawler is stopped. Last known: about 36,000 articles, 161 sources (34 curated + 127 from the registry), index upgraded with the `stem` and `start` fields and back-filled |
| Pitch doc | https://claude.ai/code/artifact/d36b9b3f-113d-4895-bc1d-c4f94a498db7 (private until shared) |

## How to operate (commands that worked)

```bash
docker compose --profile app up -d --build      # whole stack; needs .env (BASIC_AUTH, USER_AGENT); the api upgrades the index at start
npm run reindex:stem                            # fills the stem and START fields of stored articles; safe to repeat
npm run report:extraction                       # how article text was obtained, per source (read-only)
npm test ; npm run typecheck
npm run build:demo                              # what the Pages workflow runs after the demo tests
```

The app is at http://127.0.0.1:3000 (user `analyst`, password in the gitignored `.env`, never print it). If host port 9200 hangs while OpenSearch is healthy, `docker restart tagging-system-opensearch-1`.

## Facts learned (these cost time)

- The Bash tool has no `ls`/`git`/`cat` on PATH here; use PowerShell. In PowerShell, `R` and `Rp` are aliases (`Invoke-History`, `Remove-ItemProperty`): do not name helper functions that. A backtick before `r`, `t` or `n` in a double-quoted string is an escape and corrupted ledger text once. Source files are CRLF, so multi-line `String.Replace` silently does nothing unless line endings are normalised; read and write with an explicit UTF-8 encoding (a default-encoded round trip broke one `·` in `styles.css`, which failed the Docker build).
- Console output of Arabic and of `…` shows as mojibake; the files are fine (check the bytes).
- `intervals` queries on a field whose analyzer has a char filter get that filter applied to the query text too. `START/n:` therefore analyses its rules with `news_text` (see D-042). The Arabic stemmer runs twice on purpose: one pass leaves `الوزير` and `وزير` on different stems.
- OpenSearch analyzers are index settings: changing one needs close, update, open (`ensureExtraAnalyzers` does it at start) and a reindex for old documents.
- The Pages workflow only deploys from `main` and filters on paths; it runs the demo tests then `build:demo`. The demo bundle imports `src/query/**` and `src/registry/language.ts`.
- `ResultsChart` is drawn at 340 px wide because it now sits in the side column; text keeps its size.

## Not verified

- Theme B on the Registry page, the confirm dialog, a real phone, high-contrast mode (F-044, F-047); the demo deployed build was checked by fetching its assets, not by looking at it.
- Whether the reference product counts `NEAR/n` as words between or as distance (F-002), and its behaviour for any operator (F-026): all from its public help, never run side by side.
- The reviewer's report that NEAR acts like AND: not reproduced on live data (distances hold); causes found are in F-002 and F-048. Ask for the exact query and result.
- Extraction quality per outlet: only about 900 articles carried the mark at the last report. Re-run `npm run report:extraction` after a day of crawling before deciding F-042.

## Focus of the next session

1. Restart Docker and let it crawl; re-run the extraction report; decide the F-042 items from it.
2. Owner decisions waiting (all in the pitch, F-046): Q-045 database, F-030 hosting, F-042 keep raw HTML, F-041 purge dropped outlets' articles, F-015 public-demo excerpts, F-034 audit file, the Turkish `.com` outlets in scope.
3. Product: entity and sentiment tagging (needs an ADR and the database), shared saved filters and named term lists (database), alerts, archive/sitemap backfill.
4. Housekeeping: stale items above, delete the merged branch, retake the project page screenshots in the new theme (F-018), refresh the demo snapshots once F-015 is answered.

## Suggested skills

- `/tdd` for every change (owner rule). `/diagnose` for the NEAR report once the exact query arrives. `/grill-with-docs` before the database ADR. `/handoff-conversation` at the end.

## Ledger Changes

- **Opened:** Q-045, F-046, F-047, F-048, F-049, F-050 (earlier in the session: F-036 to F-044; F-036 and F-037 closed and archived, F-031 closed)
- **Decided:** D-033 to D-044
- **Closed/Dropped:** F-031, F-036, F-037 (all moved to `ledger-archive.md`)
- **Still open, touched:** F-002, F-004, F-008, F-011, F-014, F-015, F-016, F-017, F-018, F-020, F-023, F-026, F-027, F-029, F-030, F-033, F-034, F-035, F-038
- **Still open, untouched:** F-009 (1), F-024 (1), F-032 (1), and stale: F-003, F-005, F-006, F-007, F-012, F-019, F-028 (2 each)
