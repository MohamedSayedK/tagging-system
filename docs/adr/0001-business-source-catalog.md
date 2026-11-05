# 0001 — Business source catalog, outside the regional crawl scope

Status: Accepted (2026-10-25); point 3 amended by ADR 0002 (2026-10-26)

## Context

Business supplied a list of 1,552 news outlets worldwide (`business-input/claude_code_news_sources_1552.json`, gitignored), each with a stable ID (`OUT-00001`), country, region, outlet type, priority, homepage URL and an audit of its reachability and identity. The data has its own crawl rule per record (`crawl_handling`): `candidate_verify_first`, `candidate_check_permissions`, `hold_check_access_policies`, `quarantine_do_not_crawl`, `archive_only_do_not_crawl`. Their brief asks that every record be kept, that nothing be hard-coded, that unconfirmed sites be verified before crawling, and that held, quarantined and archive records stay out of the crawl.

Two things in the code stood in the way:

- The registry (`source_registry`) is keyed by domain and holds what GDELT and Wikidata saw. The business list has several records per domain (sections of `bbc.com`, `theconversation.com`) and metadata the registry has no place for.
- D-038 crawls regional outlets only. About 241 of the 1,552 are regional.

## Decision

1. A separate **source catalog** (`source_catalog` index), one document per business record, id = the record's own ID. Every original field is kept as given, plus the derived `domain` (homepage host without `www.`) and our own `verification` result. It is loaded from the data file by `npm run catalog:import`; re-importing updates the business fields and never drops our verification or a record.
2. **The catalog is the owner's say on scope**, like `include:` in `registry-overrides.yaml`: a catalog domain may be crawled although the region rule would leave it out. `blocked:` still wins.
3. **Business crawl rules gate the crawl.** A domain whose catalog records are all `hold_*`, `quarantine_*` or `archive_*` is not crawled (treated as blocked), even if promotion already made it a source. A domain with at least one crawlable record is allowed. Curated `sources.yaml` entries are never filtered, as before.
4. **Verification reuses promotion** (`npm run catalog:verify`): for each crawlable record, the same feed discovery and validation as registry promotion (robots.txt first, bounded concurrency and timeouts, one attempt per domain per run, failures retried after 7 days). The outcome is stored on the catalog record and, when a feed validates, as a crawl source. The homepage's own name (`og:site_name`, `<title>`) is compared with the record's name and stored as identity evidence. It is evidence, not confirmation: publisher terms and permissions stay a human review.

## Why

- Keeping business records apart from the registry keeps both models simple: the registry stays "every domain seen publishing", the catalog stays "what business asked for", with their IDs intact.
- Reusing promotion means one crawl path, one set of politeness rules and one place where a domain becomes a source.
- Treating the catalog as an include list is the smallest change to scope and keeps the blocklist as the final word.

## Consequences

- The crawl can grow from about 300 to about 1,000 sources. The OpenSearch heap (512 MB) and the 30-minute read interval of promoted sources will likely need raising; to be decided from the first verification run.
- Domains on hold that were already crawled through the registry stop being crawled; their stored articles stay.
- Redirect history is not captured: `fetchText` follows redirects without exposing them. Recorded as a gap.
- Contradicts D-038 for catalog domains only; D-038 still applies to everything else.
