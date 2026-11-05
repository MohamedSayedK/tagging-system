# 0004 — Catalog sites: lenient feed checks and a front-page headline fallback

Status: Accepted (2026-10-28)

## Context

Verifying the 731 Newsdesk rank 1 and 2 sites (ADR 0003) left 396 not crawled. The recorded reasons showed that many were our own thresholds, not the sites: feeds with fewer than 3 items, feeds whose newest item is older than 14 days, and sites with no feed at all. The owner wants at least the headlines of every site that allows it ("even if we can't get the content").

## Result

Re-verifying the 695 catalog records without a feed: 425 became active. Newsdesk rank 1 and 2 went from 335 to 523 of 731 crawled (68 of 90 and 455 of 641); 156 of them through front-page headlines. Left: 129 with no feed, 67 unreachable, 12 blocked by robots.txt.

## Decision

1. **Catalog verification uses looser feed checks** than registry promotion: at least 1 item (was 3) and a newest item up to 180 days old (was 14). The owner chose these sites; for registry domains nobody chose, the strict defaults stay. The options live on `validateFeed` / `promoteDomain`, and only `verifyCatalog` sets them.
2. **A site with no usable feed falls back to its front page.** `parseHeadlines` takes same-site links to pages below the root whose link text reads as a headline (at least 4 words, or 10 characters for unspaced scripts), leaving out menus, section pages and other sites. A front page with at least 5 such links becomes a feed of kind `html` on the crawl source. The worker reads it like any feed: new links are stored, the article page is fetched when robots.txt allows, and when it is not (or answers 403) the article is kept with its headline only.
3. **Unchanged:** robots.txt is checked first and still blocks; per-domain rate limits apply; a site that refuses our declared crawler (HTTP 403, unreachable) is not retried with a disguised client; the cross-site rule stays (a feed whose items live on another domain is refused, see Consequences).

## Why

- Thin feeds and slow publishers are real news sources; a 3-item floor only protects against junk in domains we never chose.
- CLAUDE.md prefers RSS and sitemaps over HTML scraping. This keeps that order: HTML is tried only when no feed validates.
- Reusing the feed path (a new feed `kind`) means one crawl loop, one dedupe, one set of politeness rules.

## Consequences

- Front-page headlines are a heuristic: some menu or promo links will be stored as articles. Articles whose page could not be read have an empty body and no `extraction` value, so they can be found and cleaned up later.
- Undated headline items are stamped with the time they were first seen.
- About 17 sites whose feed lives on a renamed domain (ms.now for msnbc.com, fm.co.za for financialmail.co.za, elnuevodia.com for primerahora.com, and others) are still refused by the cross-site rule. A feed host that is not the catalog domain cannot be told apart from a hijacked or spam domain (el-nacional.com points at a bitly-style host), so these need a human to add the new domain to the catalog.
- Sitemap indexes whose children parse to 0 items, and compressed sitemaps, are reported as "too few items" or "not a feed"; not addressed here.
