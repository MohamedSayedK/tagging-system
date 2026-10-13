# Ledger archive

Closed / dropped entries moved out of `docs/ledger.md`. Same ID scheme; newest first.

| ID | Type | Summary | Outcome | Closed |
|----|------|---------|---------|--------|
| F-031 | Follow-up | No run lock: two workers would crawl everything twice | Closed 2026-10-13: crawl lease in OpenSearch, one crawling worker at a time (D-039) | 2026-10-13 |
| F-036 | Follow-up | Promotion pulled in off-brief outlets (Asian news, US stock-spam) | Closed 2026-10-13: crawl scope (D-038); about half of the promoted sources dropped out; articles already stored are kept (F-041) | 2026-10-13 |
| F-037 | Follow-up | `term^n` boost needed a relevance sort | Closed 2026-10-13: `sort=relevance` across API, UI and demo; boost on terms and phrases (D-035) | 2026-10-13 |
| F-021 | Follow-up | Registry mixed aggregators with original outlets | Closed 2026-10-11: built-in list + owner list in `registry-overrides.yaml`; flag in `GET /registry`, "Hide aggregators" in the Registry tab, skipped by promotion (D-025) | 2026-10-11 |
| F-022 | Follow-up | Registry records had no country | Closed 2026-10-11: owner override, then Wikidata (`seed:wikidata`), then domain suffix (D-026). `.com` outlets still need an override entry | 2026-10-11 |
| F-025 | Follow-up | Discovery was manual and unscheduled | Closed 2026-10-11: the worker runs GDELT discovery, promotion and Wikidata seeding on schedules (D-024) | 2026-10-11 |
| F-010 | Follow-up | Worker had no per-domain politeness | Closed 2026-10-11: `src/ingest/domainLimiter.ts` spaces and serialises requests per site (default 1 per second, `DOMAIN_MIN_INTERVAL_MS`). A run lock for two workers is NOT built, see F-031 | 2026-10-11 |
| F-001 | Follow-up | Al Jazeera English RSS feed fails to fetch from the dev machine | Closed 2026-10-11: still unreachable here; removed from `sources.yaml`, tracked with the other unreachable outlets in F-009 | 2026-10-11 |
