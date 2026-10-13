// A stand-in for the HTTP API that runs entirely in the browser (the public demo has no server).
// Same routes, same JSON, same error messages; topics are kept in localStorage.
import { QuerySyntaxError, parse } from "../../../src/query/index.js";
import { toIso3 } from "../../../src/registry/language.js";
import { DemoArticle, DemoIndex, FacetName } from "./engine";

/** One domain of the registry snapshot. Times are relative to when the snapshot was taken, like sources. */
export interface DemoRegistryRecord {
  domain: string;
  articleCount: number;
  languages: string[];
  country?: string;
  aggregator?: boolean;
  /** The outcome of the last attempt to turn the domain into a crawled source; absent when never tried. */
  crawl?: "active" | "no_feed" | "unreachable" | "blocked";
  lastSeenAgoMs: number;
}

export interface DemoSource {
  name: string;
  origin?: "curated" | "registry";
  domain: string;
  sourcetype: string;
  country?: string;
  lang?: string;
  feedCount: number;
  intervalMs: number;
  status: "ok" | "failing" | "pending";
  found?: number;
  indexed?: number;
  consecutiveFailures?: number;
  error?: string;
  lastRunAgoMs?: number;
  nextInMs?: number;
  durationMs?: number;
}
export interface DemoTopicSeed { name: string; query: string; exclude?: string; color?: string }
export interface DemoData {
  generatedAt: string;
  articles: DemoArticle[];
  sources: DemoSource[];
  topics: DemoTopicSeed[];
  /** The source registry snapshot; optional, the demo works without it. */
  registry?: DemoRegistryRecord[];
}
/** What `demo-registry.json` holds: the registry and the sources promoted from it. */
export interface RegistrySnapshot {
  registry: DemoRegistryRecord[];
  sources: DemoSource[];
}

/**
 * The main snapshot plus the registry snapshot. A missing or malformed registry file leaves the demo as it was,
 * and a source already in the main snapshot is never listed twice.
 */
export function withRegistrySnapshot(data: DemoData, extra: RegistrySnapshot | null | undefined): DemoData {
  if (!extra || !Array.isArray(extra.registry) || !Array.isArray(extra.sources)) return data;
  const have = new Set(data.sources.map((s) => s.name));
  return { ...data, registry: extra.registry, sources: [...data.sources, ...extra.sources.filter((s) => !have.has(s.name))] };
}

interface StoredTopic extends DemoTopicSeed { id: string }
interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

const KEY = "tagging.demo.topics";
const FACET_NAMES: FacetName[] = ["sourcetype", "sourcecountry", "domain", "lang"];
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

class BadRequest extends Error {}

function validate(t: Partial<DemoTopicSeed>) {
  if (!t?.name) throw new QuerySyntaxError("`name` is required");
  parse(t.query ?? "");
  if (t.exclude) parse(t.exclude);
  if (t.color != null && !/^#[0-9a-fA-F]{6}$/.test(t.color)) throw new BadRequest("`color` must be a hex colour like #e5484d");
}

export function createDemoFetch(
  data: DemoData,
  opts: { now?: () => Date; storage?: StorageLike } = {},
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const now = opts.now ?? (() => new Date());
  const memory = new Map<string, string>();
  const storage: StorageLike = {
    getItem(k) {
      try {
        return (opts.storage ?? localStorage).getItem(k);
      } catch {
        return memory.get(k) ?? null;
      }
    },
    setItem(k, v) {
      memory.set(k, v);
      try {
        (opts.storage ?? localStorage).setItem(k, v);
      } catch {
        /* the demo still works for this visit */
      }
    },
  };
  const index = DemoIndex.shifted(data.articles, now());
  let seq = 0;
  const newId = () => `demo-${Date.now().toString(36)}-${(seq++).toString(36)}`;

  const load = (): StoredTopic[] => {
    try {
      const raw = storage.getItem(KEY);
      if (raw) return JSON.parse(raw) as StoredTopic[];
    } catch {
      /* fall through to the seed */
    }
    return data.topics.map((t, i) => ({ id: `seed-${i + 1}`, ...t }));
  };
  const save = (topics: StoredTopic[]) => storage.setItem(KEY, JSON.stringify(topics));

  const searchParams = (q: URLSearchParams, topic: StoredTopic) => ({
    query: topic.query,
    exclude: topic.exclude,
    from: q.get("from") ?? undefined,
    to: q.get("to") ?? undefined,
    sort: (q.get("sort") as "recent" | "oldest" | "relevance" | null) ?? undefined,
    offset: q.get("offset") ? Number(q.get("offset")) : undefined,
    size: q.get("size") ? Number(q.get("size")) : undefined,
    interval: (q.get("interval") as never) ?? undefined,
    sourcetype: q.getAll("sourcetype"),
    sourcecountry: q.getAll("sourcecountry"),
    domain: q.getAll("domain"),
    lang: q.getAll("lang"),
  });

  async function route(method: string, path: string, q: URLSearchParams, body: any): Promise<Response> {
    if (method === "GET" && path === "/health") return json(200, { ok: true });

    if (method === "POST" && path === "/query/validate") {
      parse(String(body?.query ?? ""));
      return json(200, { ok: true });
    }

    if (method === "GET" && path === "/sources") {
      const at = now().getTime();
      return json(
        200,
        data.sources.map((s) => ({
          name: s.name,
          ...(s.origin && { origin: s.origin }),
          domain: s.domain,
          sourcetype: s.sourcetype,
          country: s.country,
          lang: s.lang,
          feedCount: s.feedCount,
          intervalMs: s.intervalMs,
          status: s.status,
          ...(s.status !== "pending" && {
            lastRun: new Date(at - (s.lastRunAgoMs ?? 0)).toISOString(),
            nextRun: new Date(at + (s.nextInMs ?? 0)).toISOString(),
            found: s.found,
            indexed: s.indexed,
            error: s.error,
            consecutiveFailures: s.consecutiveFailures,
            durationMs: s.durationMs,
          }),
        })),
      );
    }

    // Same filters and order as the server's GET /registry, over the snapshot.
    if (method === "GET" && path === "/registry") {
      const at = now().getTime();
      const lang = q.get("lang")?.trim().toLowerCase();
      const needle = q.get("q")?.trim().toLowerCase();
      const from = Math.max(0, Number(q.get("from") ?? 0) || 0);
      const size = Math.min(500, Math.max(1, Number(q.get("size") ?? 50) || 50));
      const matching = (data.registry ?? [])
        .filter((r) => !lang || r.languages.includes(toIso3(lang)))
        .filter((r) => !needle || r.domain.toLowerCase().includes(needle))
        .filter((r) => q.get("hideAggregators") !== "true" || !r.aggregator)
        .sort((a, b) => b.articleCount - a.articleCount || a.domain.localeCompare(b.domain));
      return json(200, {
        total: matching.length,
        items: matching.slice(from, from + size).map((r) => {
          const lastSeen = new Date(at - r.lastSeenAgoMs).toISOString();
          return {
            domain: r.domain,
            firstSeen: lastSeen,
            lastSeen,
            articleCount: r.articleCount,
            languages: r.languages,
            ...(r.country && { country: r.country }),
            aggregator: r.aggregator === true,
            ...(r.crawl && { crawl: { status: r.crawl, checkedAt: lastSeen } }),
          };
        }),
      });
    }

    if (path === "/topics" && method === "GET") return json(200, load());
    if (path === "/topics" && method === "POST") {
      validate(body);
      const topic: StoredTopic = { id: newId(), name: body.name, query: body.query, ...(body.exclude && { exclude: body.exclude }), ...(body.color && { color: body.color }) };
      save([...load(), topic]);
      return json(201, topic);
    }

    const one = /^\/topics\/([^/]+)$/.exec(path);
    if (one && (method === "PUT" || method === "DELETE")) {
      const topics = load();
      const at = topics.findIndex((t) => t.id === one[1]);
      if (at < 0) return json(404, { error: "not_found" });
      if (method === "DELETE") {
        save(topics.filter((t) => t.id !== one[1]));
        return json(200, { ok: true });
      }
      validate(body);
      const updated: StoredTopic = { id: one[1]!, name: body.name, query: body.query, ...(body.exclude && { exclude: body.exclude }), ...(body.color && { color: body.color }) };
      topics[at] = updated;
      save(topics);
      return json(200, updated);
    }

    const results = /^\/topics\/([^/]+)\/results$/.exec(path);
    const facet = /^\/topics\/([^/]+)\/facets\/([^/]+)$/.exec(path);
    if (method === "GET" && (results || facet)) {
      const id = (results ?? facet)![1];
      if (facet && !FACET_NAMES.includes(facet[2] as FacetName)) return json(400, { error: "unknown_facet" });
      const topic = load().find((t) => t.id === id);
      if (!topic) return json(404, { error: "not_found" });
      if (results) return json(200, index.search(searchParams(q, topic)));
      return json(200, index.facetValues({ ...searchParams(q, topic), facet: facet![2] as FacetName, q: q.get("q") ?? "" }));
    }

    return json(404, { error: "not_found" });
  }

  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://demo.local");
    const path = url.pathname.replace(/^.*?\/api(?=\/)/, "");
    const method = (init.method ?? "GET").toUpperCase();
    let body: unknown;
    try {
      body = init.body ? JSON.parse(String(init.body)) : undefined;
    } catch {
      return json(400, { error: "bad_request", message: "Body must be JSON" });
    }
    try {
      return await route(method, path, url.searchParams, body);
    } catch (e) {
      if (e instanceof QuerySyntaxError) return json(400, { error: "query_syntax", message: e.message });
      if (e instanceof BadRequest) return json(400, { error: "bad_request", message: e.message });
      return json(500, { error: "internal", message: (e as Error).message });
    }
  };
}