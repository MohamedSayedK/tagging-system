# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Media-monitoring analysts (the owner and a small team) who read hundreds of Arabic and English news articles per session at a desk monitor, during the working day, and keep a lot of information in their heads at once. They define topics with boolean queries, narrow by time, source type, country, language and domain, then read what comes back and open originals. Arabic (right-to-left) and English (left-to-right) text sit side by side on every screen.

## Product Purpose

A Talkwalker-style query system for published media and news outlets: save topics as boolean queries (AND/OR/NOT, NEAR/n, field filters), crawl outlets on a schedule, and read matching coverage with time, source and country context. It is meant to grow into the owner's own brand. Success is that an analyst can see what was published on a topic, when, and from where, and get to the original article with minimal effort and minimal cognitive load.

## Positioning

Built around the owner's real workflow and syntax (Talkwalker-compatible query language, Arabic-first normalization, sitemaps and RSS from Gulf/Arab and international outlets), as the owner's own brand rather than a licensed tool.

## Operating Context

- Topics are saved queries plus an exclusion query; results are articles with title, source, domain, country, language, published time and a highlighted excerpt.
- A background worker crawls ~34 outlets on per-source intervals; a Sources view shows health.
- Single user or small team on a local network today; no authentication yet.

## Capabilities and Constraints

- Existing features that must keep working unchanged: topic CRUD with live query validation, filter bar (date presets, From/To), filters panel (source type, country, language, domain; search; show more), results over time chart (click a day, back to full view), results list with load more and sort, Sources page, in-app delete dialog, loading and error states.
- Full country and language names; friendly source-type names; UTC days.
- Behaviour is covered by tests (Vitest + Testing Library): accessible names and roles are part of the contract.
- Open: a density toggle (comfortable vs compact results) is requested and not built.

## Brand Commitments

The product name is open ("Tagging System" is a working title; the owner intends their own brand later). No logo or identity assets exist yet.

## Evidence on Hand

Real crawled data (hundreds of articles, ~34 sources) in the local OpenSearch index; screenshots of the reference product the owner uses at work (dark navy top bar, left filter drawer). No customers, testimonials or benchmarks exist and none should be invented.

## Product Principles

1. Readability beats everything: type size, contrast, line length and spacing are tuned for hours of reading.
2. Low cognitive load: one clear primary action per area, quiet everything else, no decoration that carries no information.
3. Important actions must pop: save topic, pick a day or range, apply filters, open the article.
4. Arabic and English are equals: direction, shaping and mixed-script lines must look right.
5. Charts earn their space: they answer a question (when, how much, is something unusual), not decorate.

## Accessibility & Inclusion

WCAG AA contrast minimum, aiming higher for body text; visible focus; keyboard operable; respects reduced motion; RTL text rendered correctly with `dir="auto"`.
