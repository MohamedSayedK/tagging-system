# 0003 — Take website addresses for sources from the owner's Newsdesk account

Status: Accepted (2026-10-28). Supersedes D-022 for the owner's own Newsdesk account only.

## Context

D-022 (2026-10-11) said Nexis Newsdesk is a feature reference only and its licensed source registry is not harvested, because of the licence and the crawling rules (F-026, F-034 record that the licence terms were never checked). The owner has since said, in chat on 2026-10-28, that their licence allows it and that they are logged in with their own account.

The Manage Sources page lists 97,098 sources but the server serves at most 10,000 of any one query (`maxPaginatedResults`, 50 pages of 200). The list carries a name, country, rank, media type and licensor but no website; each source's detail (`sourceInfo`) carries `sourceUrls`.

## Decision

- Source names, ranks and website addresses were read from the owner's logged-in session through the page's own API: 50 list pages, then one detail request per source, three at a time with a pause, stopping on any 401/403/429. Only the 10,000 sources of one query (rank order, so all rank 1 and 2 and part of rank 3) were taken.
- The extracted data stays in the gitignored `business-input/` folder and is not committed to the public repo. Only website addresses, which are public, feed our own catalog; Newsdesk's own metadata (rank, licensor, counts) is not republished.
- Extraction is a one-off. It does not replace D-022 for anything else: no article content, no scheduled harvesting.

## Consequences

- The owner carries the licence risk; F-026 stays open until the terms are read in writing.
- The 10,000 cap means 87,098 sources were not taken. More can be reached by splitting the query by country or media type.
- Newsdesk's ranks are a signal for priority, not for permission to crawl: our own checks (robots.txt, feeds, ADR 0001/0002) still decide.
