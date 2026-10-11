import Fastify from "fastify";
import { QuerySyntaxError, compileQuery, parse } from "../query/index.js";
import { loadSources } from "../ingest/sources.js";
import { openSearchStore } from "../ingest/runStore.js";
import { client, ensureIndices, TOPICS_INDEX } from "../search/index-def.js";
import { facetValues, isFacetName, search, SearchParams } from "../search/search.js";

interface Topic { name: string; query: string; exclude?: string; color?: string }

/** A request the caller can fix; reported as 400 with the reason. */
class BadRequest extends Error {}

function validateTopic(t: Topic) {
  if (!t?.name) throw new QuerySyntaxError("`name` is required");
  parse(t.query); // reject invalid queries up front
  if (t.exclude) parse(t.exclude);
  // Colours end up in inline styles in the UI, so only plain six-digit hex values are accepted.
  if (t.color != null && !/^#[0-9a-fA-F]{6}$/.test(t.color)) throw new BadRequest("`color` must be a hex colour like #e5484d");
}

export async function buildApp(opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof BadRequest) return reply.code(400).send({ error: "bad_request", message: err.message });
    if (err instanceof QuerySyntaxError) return reply.code(400).send({ error: "query_syntax", message: err.message });
    app.log.error(err);
    return reply.code(err.statusCode ?? 500).send({ error: "internal", message: err.message });
  });

  app.get("/health", async () => ({ ok: true }));

  // Live query checker (the "Checking query..." box in the topic editor).
  app.post<{ Body: { query: string } }>("/query/validate", async (req) => {
    const ast = parse(req.body.query);
    return { ok: true, ast, dsl: compileQuery(req.body.query) };
  });

  app.post<{ Body: SearchParams }>("/search", async (req) => {
    if (!req.body?.query) throw new QuerySyntaxError("`query` is required");
    return search(req.body);
  });

  app.post<{ Body: Topic }>("/topics", async (req, reply) => {
    validateTopic(req.body);
    const { name, query, exclude, color } = req.body;
    const res = await client.index({
      index: TOPICS_INDEX,
      refresh: true,
      body: { name, query, exclude, color, created: new Date().toISOString() },
    });
    return reply.code(201).send({ id: res.body._id, name, query, exclude, color });
  });

  app.get("/topics", async () => {
    const res = await client.search({ index: TOPICS_INDEX, body: { size: 200, query: { match_all: {} } } });
    return (res.body as any).hits.hits.map((h: any) => ({ id: h._id, ...h._source }));
  });

  app.put<{ Params: { id: string }; Body: Topic }>("/topics/:id", async (req, reply) => {
    validateTopic(req.body);
    const { name, query, exclude, color } = req.body;
    const exists = await client.exists({ index: TOPICS_INDEX, id: req.params.id });
    if (!exists.body) return reply.code(404).send({ error: "not_found" });
    await client.update({
      index: TOPICS_INDEX,
      id: req.params.id,
      refresh: true,
      // `exclude`/`color` are replaced, so clearing them in the editor really clears them
      body: { doc: { name, query, exclude: exclude ?? null, color: color ?? null, updated: new Date().toISOString() } },
    });
    return { id: req.params.id, name, query, exclude, color };
  });

  app.delete<{ Params: { id: string } }>("/topics/:id", async (req, reply) => {
    const res = await client.delete({ index: TOPICS_INDEX, id: req.params.id, refresh: true }, { ignore: [404] });
    if (res.statusCode === 404) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: Omit<SearchParams, "query" | "exclude"> }>(
    "/topics/:id/results",
    async (req, reply) => {
      const got = await client.get({ index: TOPICS_INDEX, id: req.params.id }, { ignore: [404] });
      if (!got.body.found) return reply.code(404).send({ error: "not_found" });
      const t = got.body._source as Topic;
      return search({ ...req.query, query: t.query, exclude: t.exclude ?? undefined });
    },
  );

  // Configured sources with the outcome of their latest crawl.
  app.get("/sources", async () => {
    const runs = new Map((await openSearchStore().load()).map((r) => [r.name, r]));
    return loadSources().map((s) => {
      const r = runs.get(s.name);
      return {
        name: s.name,
        domain: s.domain,
        sourcetype: s.sourcetype,
        country: s.country,
        lang: s.lang,
        feedCount: s.feeds.length,
        intervalMs: s.interval,
        status: !r ? "pending" : r.consecutiveFailures > 0 ? "failing" : "ok",
        ...(r && { lastRun: r.lastRun, found: r.found, indexed: r.indexed, error: r.error, consecutiveFailures: r.consecutiveFailures, nextRun: r.nextRun, durationMs: r.durationMs }),
      };
    });
  });

  // Every value of one facet (beyond the top 20 carried by results), optionally containing `q`.
  app.get<{ Params: { id: string; facet: string }; Querystring: Omit<SearchParams, "query" | "exclude"> & { q?: string } }>(
    "/topics/:id/facets/:facet",
    async (req, reply) => {
      if (!isFacetName(req.params.facet)) return reply.code(400).send({ error: "unknown_facet" });
      const got = await client.get({ index: TOPICS_INDEX, id: req.params.id }, { ignore: [404] });
      if (!got.body.found) return reply.code(404).send({ error: "not_found" });
      const t = got.body._source as Topic;
      const { q, size, ...rest } = req.query;
      return facetValues({ ...rest, query: t.query, exclude: t.exclude ?? undefined, facet: req.params.facet, q, size: size === undefined ? undefined : Number(size) });
    },
  );

  await ensureIndices();
  return app;
}


