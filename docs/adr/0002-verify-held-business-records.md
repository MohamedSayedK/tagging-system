# 0002 — Verify business records on hold like the others

Status: Accepted (2026-10-26). Amends point 3 of ADR 0001.

## Context

ADR 0001 kept every record whose `crawl_handling` was `hold_check_access_policies` (250) out of verification and out of the crawl. That value only means the business's own test script was refused (HTTP 403 for 237 of them, also 401, 402, 405, 429). Our crawler was already reading four of those outlets without trouble, and five more are curated sources that crawl fine.

## Decision

The owner treats every record in the business list as `candidate_verify_first`, except `quarantine_*` and `archive_*` records, which stay in the catalog and are never fetched. A rule value we do not know is verified too.

## Consequences

- The 250 held records go through the same verification as the rest: robots.txt first, public feeds only. A refusal, paywall or login wall is not worked around; such a site ends up `blocked`, `unreachable` or `no_feed` in the report.
- Records the business wanted to review for access policies can now be crawled before that review. Publisher terms stay a human review (F-053).
- `blocked:` in `registry-overrides.yaml` remains the way to keep any of them out.
