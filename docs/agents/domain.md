# Domain Docs

How agents consume this repo's domain documentation.

Layout: single-context — one `CONTEXT.md` at the repo root + `docs/adr/`.

## Before exploring

- Read `CONTEXT.md` (glossary: topic, query, source, article, sourcetype, ...) if it exists.
- Read ADRs in `docs/adr/` that touch the area you are about to change.
- If either is missing, proceed silently; do not create them upfront.

## Vocabulary

Use glossary terms in issues, test names and proposals. Query-language terms follow Talkwalker usage:
`NEAR/n`, `sourcetype`, `sourcecountry`, `authorshort`, "topic", "exclude from topic".

## ADR conflicts

If your output contradicts an ADR, say so explicitly instead of silently overriding:

> _Contradicts ADR-0003 (...) — worth reopening because ..._
