# CLAUDE.md — Tagging-system

Rules for this project. Read at the start of every session. Keep it short; put detail in `docs/`.

## What this is

A Talkwalker-style media monitoring system, meant to grow into the owner's own brand. v0 = boolean query engine + crawler/ingest + search API over news outlets. Content is mostly Arabic and English.

Stack: Node/TypeScript (ESM), Fastify, OpenSearch 2.x in Docker, React + Vite (`web/`), Vitest + Testing Library. Windows host (PowerShell/Git Bash).

Layout: `src/query` (parser/compiler), `src/search`, `src/ingest`, `src/api` (`app.ts` builds the app, `server.ts` listens), `web/src` (UI), `test/` (server tests), `docs/`.

## Commands

```bash
docker compose up -d     # OpenSearch :9200
npm run init-index       # create indices
npm run ingest           # one pass over sources.yaml
npm run worker           # scheduled crawler: per-source intervals, backoff, run status (GET /sources)
npm run api              # API on 127.0.0.1:3000
npm run web              # UI dev server on http://localhost:5173 (proxies /api to :3000)
npm run build:web        # production build to web/dist
npm test                 # unit + UI + integration (integration needs OpenSearch)
npm run typecheck        # tsc for server and web
```

## Session protocol

1. Read the newest file in `docs/handoffs/` (sorted by name) and `docs/ledger.md` before doing anything else.
2. Read `CONTEXT.md` (when it exists) and any `docs/adr/` touching the area.
3. At the end of a session: write a handoff, update the ledger (move closed rows to `ledger-archive.md`).
4. The handoff and ledger are the source of truth for where work stopped, not chat history.

## Docs map (`docs/`)

See `docs/README.md` for the full table. Short version: `ledger.md` (open/decided), `handoffs/` (session snapshots), `adr/` (architecture decisions), `prd/` (feature specs), `plans/` (implementation plans), `architecture/` (system audits), `legal/` (compliance research), `agents/` (agent instructions).

- A decision with lasting cost to reverse → ADR. Smaller decisions → a `D-` row in the ledger.
- If your work contradicts an ADR, say so explicitly; never override silently.
- Dated files: `YYYY-MM-DD-<slug>-<kind>.md`. Numbered files are never renumbered. Ledger IDs are never reused.

## Code rules

- **Query language is a contract.** Grammar changes need a parser test and a compile test, and an update to the syntax table in `README.md`. Operators are UPPERCASE and case-sensitive.
- **TDD for every feature and fix (`/tdd`).** Vertical slices only: one failing test → minimal code to pass → next test. Never write all tests first, then all code. Never refactor while red.
  - Plan first: agree the public interface and the prioritised behaviours with the owner before the first test.
  - Tests exercise public interfaces and observable behaviour (HTTP responses, rendered UI, query results), not internals. Mock only at system boundaries (network, clock, OpenSearch in unit tests); never mock our own modules.
  - A test must survive a refactor that keeps behaviour unchanged.
  - Test names read as specifications ("topic editor shows the error position for an unbalanced parenthesis").
  - UI features are tested through the rendered DOM as a user would use it (labels, roles, text), not component internals.
  - Integration tests use a throwaway index (`ARTICLES_INDEX`), never the real `articles` index.
- **Parser/compiler stays pure** (no I/O, no OpenSearch client). Only `src/search/` and `src/ingest/` talk to OpenSearch.
- **Unsupported syntax fails loudly** with a `QuerySyntaxError` and a position; never silently match something else.
- **Arabic matters.** Any analyzer or mapping change must be re-verified with the Arabic cases in `test/integration.test.ts`.
- **Minimal diffs.** Change only what the task needs; no drive-by refactors (follow the global Karpathy guidelines).
- Typecheck (`npm run typecheck`) and tests must pass before declaring work done.

## UI rules

- The visual system is **The Rundown** (DESIGN.md, tokens in web/src/styles.css). New UI uses its tokens, type scale and components; no new colours or accents without updating DESIGN.md.
- Readability is the first requirement: AA contrast minimum, 16px+ body, Arabic at the larger Naskh size, dir=uto` on article text.
- Chosen from three prototypes in design/prototypes/ (A: Rundown, B: Press Cuttings, C: Split-Flap); B and C are kept as references only.

## Crawling rules

- Respect robots.txt; identify with `USER_AGENT` (must carry a contact URL before any real crawl).
- Prefer RSS / Atom / news sitemaps over HTML scraping. No login-walled or paywalled scraping, no CAPTCHA bypass.
- Rate-limit per domain; never hammer a single outlet.
- Store extracted text and metadata for monitoring; link back to the source URL.

## Secrets and safety

- No secrets in the repo or in chat. Config via environment variables (`OPENSEARCH_URL`, `USER_AGENT`, `SOURCES_FILE`, `PORT`, `INGEST_CONCURRENCY`).
- The API binds to `127.0.0.1` until authentication exists. Do not expose it publicly before then.
- Ask before anything outward-facing or hard to reverse: publishing, deploying, deleting indices/data, pushing to a remote.

## Working with the owner

- The owner is most comfortable in Node/TypeScript; keep to it unless an ADR says otherwise.
- Surface assumptions and trade-offs; give a recommendation rather than a survey.
- When something is unverified, say so in the handoff under "Not verified".
