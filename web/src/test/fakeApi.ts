// Fake of the HTTP boundary: the only thing UI tests stub. Mirrors the real API contract.
import { vi } from "vitest";

export interface FakeTopic { id: string; name: string; query: string; exclude?: string; color?: string }
export interface FakeResult {
  id: string; title: string; source: string; domain: string; url: string; published: string;
  sourcetype?: string; sourcecountry?: string; lang?: string;
  highlight?: { body?: string[]; title?: string[] };
}

export interface FakeSource {
  name: string; domain: string; sourcetype: string; country?: string; lang?: string; feedCount: number; intervalMs: number;
  status: "pending" | "ok" | "failing";
  lastRun?: string; found?: number; indexed?: number; error?: string; consecutiveFailures?: number; nextRun?: string; durationMs?: number;
  origin?: "curated" | "registry";
}

export interface FakeRegistryRecord {
  domain: string; firstSeen: string; lastSeen: string; articleCount: number; languages: string[];
  crawl?: { status: "active" | "no_feed" | "unreachable" | "blocked"; checkedAt: string };
  country?: string;
  aggregator?: boolean;
}

type Rule = { pattern: RegExp; times: number } & (
  | { kind: "fail"; status: number; message?: string }
  | { kind: "network" }
  | { kind: "hold"; gate: Promise<void> }
);

export interface FakeApiState {
  /** Make the next `times` requests whose "METHOD /path?query" matches `pattern` answer with an error. */
  failNext(pattern: RegExp, opts?: { status?: number; message?: string; times?: number }): void;
  /** Make the next request matching `pattern` as if the server were unreachable. */
  networkDownNext(pattern: RegExp): void;
  /** Keep the next matching request pending until the returned function is called. */
  hold(pattern: RegExp): () => void;
  sources: FakeSource[];
  registry: FakeRegistryRecord[];
  topics: FakeTopic[];
  resultsByTopic: Record<string, FakeResult[]>;
  requests: { method: string; path: string; body?: any }[];
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function installFakeApi(init: Partial<FakeApiState> = {}) {
  const rules: Rule[] = [];
  const state: FakeApiState = {
    sources: [],
    registry: [],
    topics: [],
    resultsByTopic: {},
    requests: [],
    failNext: (pattern, o = {}) => void rules.push({ pattern, times: o.times ?? 1, kind: "fail", status: o.status ?? 500, message: o.message }),
    networkDownNext: (pattern) => void rules.push({ pattern, times: 1, kind: "network" }),
    hold: (pattern) => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      rules.push({ pattern, times: 1, kind: "hold", gate });
      return release;
    },
    ...init,
  };
  // The fake mutates its data (create/update/delete); never let that leak into arrays shared between tests.
  state.topics = state.topics.map((t) => ({ ...t }));
  state.sources = [...state.sources];
  let seq = 100;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, opts: RequestInit = {}) => {
      const url = new URL(String(input), "http://x");
      const method = (opts.method ?? "GET").toUpperCase();
      const body = opts.body ? JSON.parse(String(opts.body)) : undefined;
      state.requests.push({ method, path: url.pathname + url.search, body });
      const path = url.pathname.replace(/^\/api/, "");

      const rule = rules.find((r) => r.times > 0 && r.pattern.test(`${method} ${path}${url.search}`));
      if (rule) {
        rule.times--;
        if (rule.kind === "network") throw new TypeError("Failed to fetch");
        if (rule.kind === "fail") return json(rule.status, { error: "internal", ...(rule.message && { message: rule.message }) });
        await rule.gate;
      }

      if (method === "GET" && path === "/topics") return json(200, state.topics);
      if (method === "GET" && path === "/sources") return json(200, state.sources);

      // Like the real API: most active first, `lang` takes a two- or three-letter code, `q` is a
      // case-insensitive "contains" on the domain, paged by `from`/`size`.
      if (method === "GET" && path === "/registry") {
        const threeLetter: Record<string, string> = { ar: "ara", en: "eng", it: "ita" };
        const lang = url.searchParams.get("lang")?.toLowerCase();
        const q = url.searchParams.get("q")?.toLowerCase();
        const from = Number(url.searchParams.get("from") ?? 0);
        const size = Number(url.searchParams.get("size") ?? 50);
        const matching = state.registry
          .filter((r) => !lang || r.languages.includes(threeLetter[lang] ?? lang))
          .filter((r) => !q || r.domain.toLowerCase().includes(q))
          .filter((r) => url.searchParams.get("hideAggregators") !== "true" || !r.aggregator)
          .sort((a, b) => b.articleCount - a.articleCount || a.domain.localeCompare(b.domain));
        return json(200, { total: matching.length, items: matching.slice(from, from + size) });
      }

      if (method === "POST" && path === "/query/validate") {
        const q: string = body.query;
        const opens = (q.match(/\(/g) ?? []).length;
        const closes = (q.match(/\)/g) ?? []).length;
        if (opens > closes) return json(400, { error: "query_syntax", message: "Missing closing parenthesis (at position 0)", position: 0 });
        if (!q.trim()) return json(400, { error: "query_syntax", message: "Empty query" });
        return json(200, { ok: true });
      }

      if (method === "POST" && path === "/topics") {
        const t = { id: String(++seq), ...body };
        state.topics.push(t);
        return json(201, t);
      }

      // Scope like the real API: date range, then facets (OR within a facet, AND across; a facet
      // ignores its own filter when counting its own options).
      const scoped = (topicId: string) => {
        const from = url.searchParams.get("from");
        const to = url.searchParams.get("to");
        const t = (s: string) => new Date(s).getTime();
        const inRange = (state.resultsByTopic[topicId] ?? []).filter(
          (r) => (!from || t(r.published) >= t(from)) && (!to || t(r.published) <= t(to)),
        );
        const facets = { sourcetype: "sourcetype", sourcecountry: "sourcecountry", domain: "domain", lang: "lang" } as const;
        type F = keyof typeof facets;
        const chosen = (f: F) => url.searchParams.getAll(f).map((v) => v.toLowerCase());
        const matches = (r: FakeResult, skip?: F) =>
          (Object.keys(facets) as F[]).every((f) => {
            const vs = chosen(f);
            return f === skip || vs.length === 0 || vs.includes(String(r[f] ?? "").toLowerCase());
          });
        const countBy = (f: F, q = "") => {
          const m = new Map<string, number>();
          for (const r of inRange.filter((x) => matches(x, f))) {
            const k = String(r[f] ?? "").toLowerCase();
            if (k && k.includes(q.toLowerCase())) m.set(k, (m.get(k) ?? 0) + 1);
          }
          return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => ({ key, count }));
        };
        return { all: inRange.filter((r) => matches(r)), countBy };
      };

      const facetRoute = /^\/topics\/([^/]+)\/facets\/([^/]+)$/.exec(path);
      if (method === "GET" && facetRoute) {
        const { countBy } = scoped(facetRoute[1]!);
        const size = Number(url.searchParams.get("size") ?? 20);
        return json(200, countBy(facetRoute[2] as any, url.searchParams.get("q") ?? "").slice(0, size));
      }

      const results = /^\/topics\/([^/]+)\/results$/.exec(path);
      if (method === "GET" && results) {
        const { all, countBy } = scoped(results[1]!);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const size = Number(url.searchParams.get("size") ?? 25);
        const sort = url.searchParams.get("sort");
        // `relevance` keeps the fixture order: the fake has no scoring, the fixture says who is the best match.
        const ordered = sort === "relevance" ? [...all] : [...all].sort((a, b) => (sort === "oldest" ? a.published.localeCompare(b.published) : b.published.localeCompare(a.published)));
        // Like the real API: day buckets for a short span, week (Monday start) or month for a long one.
        const times = all.map((r) => new Date(r.published).getTime());
        const spanDays = times.length ? (Math.max(...times) - Math.min(...times)) / 86_400_000 : 0;
        const interval = url.searchParams.get("interval") || (spanDays <= 45 ? "day" : spanDays <= 400 ? "week" : "month");
        const bucketKey = (iso: string) => {
          const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
          if (interval === "week") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
          if (interval === "month") d.setUTCDate(1);
          return d.toISOString();
        };
        const perBucket = new Map<string, number>();
        for (const r of all) {
          const key = bucketKey(r.published);
          perBucket.set(key, (perBucket.get(key) ?? 0) + 1);
        }
        const overTime = [...perBucket].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ key, count }));        return json(200, { total: all.length, results: ordered.slice(offset, offset + size), aggregations: {
            interval,
            overTime,
            sourceTypes: countBy("sourcetype").slice(0, 20),
            countries: countBy("sourcecountry").slice(0, 20),
            domains: countBy("domain").slice(0, 20),
            languages: countBy("lang").slice(0, 20),
          },
        });
      }

      const one = /^\/topics\/([^/]+)$/.exec(path);
      if (one && method === "PUT") {
        const i = state.topics.findIndex((t) => t.id === one[1]);
        if (i < 0) return json(404, { error: "not_found" });
        // Like the real API: an update replaces the editable fields, so omitting `exclude`/`color` clears them.
        const { name, query, exclude, color } = body;
        state.topics[i] = { id: state.topics[i]!.id, name, query, ...(exclude && { exclude }), ...(color && { color }) };
        return json(200, state.topics[i]);
      }
      if (one && method === "DELETE") {
        state.topics = state.topics.filter((t) => t.id !== one[1]);
        return json(200, { ok: true });
      }
      return json(404, { error: "not_found" });
    }),
  );
  return state;
}





