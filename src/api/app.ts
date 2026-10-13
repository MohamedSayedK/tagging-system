import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { basicAuthMatches, parseBasicAuth } from "./security.js";
import { QuerySyntaxError, compileQuery, parse } from "../query/index.js";
import { mergeSources } from "../ingest/mergeSources.js";
import { loadSources } from "../ingest/sources.js";
import { aggregatorDomains, countryOf, isAggregator, loadOverrides } from "../registry/overrides.js";
import { promotedScope } from "../search/promotedScope.js";
import { openSearchPromotions } from "../search/promotionStore.js";
import { openSearchStore } from "../ingest/runStore.js";
import { client, ensureIndices, INDEX, REGISTRY_INDEX, TOPICS_INDEX } from "../search/index-def.js";
import { searchRegistry } from "../search/registrySearch.js";
import { explainMatch } from "../search/explain.js";
import { facetValues, isFacetName, search, SearchParams } from "../search/search.js";

const STUCK_AFTER = 3;

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

export interface AppOptions {
  logger?: boolean;
  /** `user:password`. When set, every route but /health asks for it (HTTP Basic). */
  basicAuth?: string;
  /** A built UI (web/dist) to serve at `/`; the API is then also reachable under `/api`. */
  staticDir?: string;
}

export async function buildApp(opts: AppOptions = {}) {
  if (opts.basicAuth !== undefined) parseBasicAuth(opts.basicAuth);
  const app = Fastify({
    logger: opts.logger ?? false,
    // The UI calls `/api/...` (as its dev proxy does); the routes themselves live at the root.
    rewriteUrl: (req) => (req.url ?? "/").replace(/^\/api(?=\/|\?|$)/, "") || "/",
  });

  if (opts.basicAuth !== undefined) {
    const setting = opts.basicAuth;
    app.addHook("onRequest", async (req, reply) => {
      if (req.url === "/health" || req.url.startsWith("/health?")) return;
      if (basicAuthMatches(req.headers.authorization, setting)) return;
      return reply.code(401).header("www-authenticate", 'Basic realm="Tagging System", charset="UTF-8"').send({ error: "unauthorized" });
    });
  }

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof BadRequest) return reply.code(400).send({ error: "bad_request", message: err.message });
    if (err instanceof QuerySyntaxError) return reply.code(400).send({ error: "query_syntax", message: err.message });
    app.log.error(err);
    return reply.code(err.statusCode ?? 500).send({ error: "internal", message: err.message });
  });

  app.get("/health", async () => ({ ok: true }));

  // One glance for monitoring: is data flowing, and is anything failing.
  app.get("/status", async () => {
    const [articles, registry, runs, promoted] = await Promise.all([
      client.count({ index: INDEX }),
      client.count({ index: REGISTRY_INDEX }),
      openSearchStore().load(),
      openSearchPromotions().activeSources(),
    ]);
    const curated = loadSources();
    const names = new Set(mergeSources(curated, promoted, { inScope: await promotedScope(promoted) }).map((s) => s.name));
    return {
      ok: true,
      articles: (articles.body as any).count as number,
      registry: { domains: (registry.body as any).count as number },
      sources: {
        configured: curated.length,
        fromRegistry: names.size - curated.length,
        failing: runs.filter((r) => names.has(r.name) && r.consecutiveFailures > 0).length,
        // Three failed runs in a row is an outage, not a blip: named here so monitoring can alert on it.
        stuck: runs
          .filter((r) => names.has(r.name) && r.consecutiveFailures >= STUCK_AFTER)
          .map((r) => ({ name: r.name, consecutiveFailures: r.consecutiveFailures, error: r.error })),
      },
    };
  });

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

  // Which clauses of the topic's query matched one article ("why is this here?").
  app.get<{ Params: { id: string; articleId: string } }>("/topics/:id/explain/:articleId", async (req, reply) => {
    const got = await client.get({ index: TOPICS_INDEX, id: req.params.id }, { ignore: [404] });
    if (!got.body.found) return reply.code(404).send({ error: "not_found" });
    const exists = await client.exists({ index: INDEX, id: req.params.articleId });
    if (!exists.body) return reply.code(404).send({ error: "not_found" });
    const t = got.body._source as Topic;
    return explainMatch({ query: t.query, exclude: t.exclude ?? undefined, id: req.params.articleId });
  });

  // Configured sources with the outcome of their latest crawl.
  app.get("/sources", async () => {
    const runs = new Map((await openSearchStore().load()).map((r) => [r.name, r]));
    const curated = loadSources();
    const curatedNames = new Set(curated.map((s) => s.name));
    const promoted = await openSearchPromotions().activeSources();
    return mergeSources(curated, promoted, { inScope: await promotedScope(promoted) }).map((s) => {
      const r = runs.get(s.name);
      return {
        name: s.name,
        origin: curatedNames.has(s.name) ? "curated" : "registry",
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

  // Every news domain the registry has seen (GDELT discovery), most active first. Not the same as /sources.
  app.get<{ Querystring: { lang?: string; q?: string; from?: string; size?: string; hideAggregators?: string } }>("/registry", async (req) => {
    const { lang, q, from, size, hideAggregators } = req.query;
    const overrides = loadOverrides();
    const page = await searchRegistry({
      lang,
      q,
      from: from === undefined ? undefined : Number(from),
      size: size === undefined ? undefined : Number(size),
      excludeDomains: hideAggregators === "true" ? aggregatorDomains(overrides) : undefined,
    });
    const attempts = await openSearchPromotions().attempts(page.items.map((r) => r.domain));
    return {
      total: page.total,
      items: page.items.map((r) => {
        const country = countryOf(r.domain, overrides, r.country);
        return {
          ...r,
          ...(country && { country }),
          aggregator: isAggregator(r.domain, overrides),
          ...(attempts.has(r.domain) && { crawl: attempts.get(r.domain) }),
        };
      }),
    };
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

  if (opts.staticDir) await app.register(fastifyStatic, { root: opts.staticDir });

  await ensureIndices();
  return app;
}


