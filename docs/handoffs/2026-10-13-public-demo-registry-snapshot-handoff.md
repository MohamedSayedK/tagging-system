# Handoff: real crawling is live, code is on `main`, the public demo shows the registry

Date: 2026-10-13 (work done 2026-10-11). Repo state: `main` = `origin/main` = `1b42e36`, working tree clean apart from one deliberately untracked file (see F-034).

**Start Here:** read this handoff and `docs/ledger.md`, then `CLAUDE.md` (TDD, UI and crawling rules). The previous handoff, `2026-10-11-source-registry-handoff.md`, describes what the registry, promotion and the worker are and how they fit together; this one covers what happened after it.

## Stale items

None: no open ledger entry has gone two sessions untouched (the oldest are at 1: F-028, F-029, F-031, F-018 to F-020, F-012, F-002 to F-008, F-014, F-005 to F-007).

## What happened since the previous handoff

1. **First real crawl** with `USER_AGENT` = the repo URL (D-032). Wikidata seeding: 410 outlets, 330 new. Promotion: 40 then 100 domains; about half became crawlable.
2. **Tuned from the real results**, test-first: English only from function words, Arabic and Arab-state domains first, RSS directory pages read, soft-404 probes ignored, malformed sitemap lines dropped, `--retry-days`.
3. **Docker stack** (api + worker + OpenSearch) running locally from `.env`; image built and smoke-tested.
4. **Failing sources fixed**: 13 healthy sources failed once in the startup burst. Added one retry for transient failures, errors that name the cause, a 3-minute grace for background jobs (D-029). 12 of 13 recovered; `alsahwayemen.net` still times out (F-033).
5. **Shipped**: two feature branches merged fast-forward to `main` and pushed; Pages deploy green.
6. **Public demo now shows the registry** (D-031): a second static snapshot answered in the browser.

## State right now

| | |
|---|---|
| Live demo | https://mohamedsayedk.github.io/tagging-system/app/ (articles from `demo-data.json`, registry from `demo-registry.json`: 9,325 domains, 83 promoted sources) |
| Real system | Docker stack on this machine at http://127.0.0.1:3000; user `analyst`, password in the gitignored `.env` (never print it) |
| Last numbers (2026-10-11) | 117 sources (34 curated + 83 from the registry), 108 healthy, 1 failing, 6,635 articles (about 70% Arabic), registry 9,325 domains |
| Tests | 44 files / 382 passing, `npm run typecheck` clean |

The containers keep crawling while Docker runs: `docker compose --profile app ps`, `docker logs tagging-system-worker-1`, `GET /api/status`.

## How to operate it (commands that worked)

```bash
docker compose --profile app up -d --build        # whole stack; needs .env (BASIC_AUTH, USER_AGENT)
npm run seed:wikidata                             # needs USER_AGENT in the shell
npm run promote -- --limit 100 --retry-days 0     # try domains now, retry failures
npm run discover:gdelt -- --hours 24
npm run demo:registry                             # refresh the demo's registry snapshot, then commit + push
npm test ; npm run typecheck
```

The dev UI on :5173 proxies `/api` to :3000, which is now behind Basic auth: use http://127.0.0.1:3000 instead. Stop any `npm run api` before starting the stack (both want port 3000).

## Facts learned (these cost time)

- Seeding and promotion refuse to run without a contact URL in `USER_AGENT` (`hasContactUrl`); the repo URL is what the owner chose.
- Vite blocks some ports in `fetch` ("bad port", e.g. 1); use a really closed port in tests. PowerShell quirks that bit: `"$u?x"` parses as a variable named `u?`, `$home` is read-only, `Start-Sleep` over a few minutes in the foreground is blocked (use a background job).
- Vite's dev server can cache a transform taken between two quick edits (blank page, "X is not defined"); touch the file or restart `npm run web`.
- A UI test that asserted on the *last* request was flaky because the editor sends live query checks; assert on the results requests instead.
- `origin/main` was one commit behind local `main` when merging; pushing `main` sent the owner's unpushed commit too.
- The Pages workflow only deploys from `main`, and its path filter must list any server file the demo bundle imports (`src/registry/language.ts` was added).
- Wikidata's endpoint answered a single SPARQL request fine with the repo URL as User-Agent; the QIDs written from memory (newspaper, online newspaper, news agency) returned results.

## Not verified

- Promotion beyond the first 140 domains; validation thresholds (F-023).
- Registry tab in light theme and at desktop width (F-032); demo on a real phone (F-020).
- Anything about hosting the real app publicly (F-030): options were offered (VPS, team-only behind TLS) and not chosen.
- The Newsdesk operator semantics (F-026).

## Focus of the next session

1. Look at what the worker collected (`GET /api/status`, Sources tab "From registry", failing ones) and tune promotion (F-023, F-027, F-033, F-035).
2. Owner decisions waiting: F-015 (excerpts in the public repo), F-034 (the audit file), F-030 (public hosting), F-019, F-012, F-008.
3. Product: remaining Newsdesk operators and the entities/sentiment decision (F-029), then production gaps (F-030, F-031).
4. Housekeeping: delete the two merged feature branches; refresh both demo snapshots when the owner answers F-015.

## Suggested skills

- `/tdd` for every change (owner rule). `/diagnose` for the next failing-source investigation. `/handoff-conversation` at the end.

## Ledger Changes

- **Opened:** F-033, F-034, F-035
- **Decided:** D-029, D-030, D-031, D-032
- **Closed/Dropped:** none
- **Still open, touched:** F-027, F-023, F-024, F-030, F-032, F-026, F-015, F-016, F-017, F-009, F-011
- **Still open, untouched:** F-028, F-029, F-031, F-018, F-019, F-020, F-012, F-002, F-003, F-004, F-008, F-014, F-005, F-006, F-007 (1 session each)
