export interface Topic { id: string; name: string; query: string; exclude?: string; color?: string }
export type QueryCheck = { ok: true } | { ok: false; message: string };

/** An API failure with a message fit to show a person (never a stack or a bare status). */
export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

const UNREACHABLE = "Can't reach the server. Check that the API is running.";

async function send(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(UNREACHABLE);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    // 502/503/504 come from a proxy or gateway when the API behind it is down.
    if (!body.message && [502, 503, 504].includes(res.status)) throw new ApiError(UNREACHABLE, res.status);
    throw new ApiError(body.message ?? `The server answered ${res.status}.`, res.status);
  }
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await (await send(path, init)).json()) as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const listTopics = () => request<Topic[]>("/topics");

export interface Result {
  id: string;
  title: string;
  url: string;
  source: string;
  domain: string;
  published: string;
  sourcecountry?: string;
  lang?: string;
  highlight?: { title?: string[]; body?: string[] };
}
export interface Bucket { key: string; count: number }
export type Interval = "day" | "week" | "month";
export interface Aggregations {
  interval?: Interval;
  overTime?: Bucket[];
  sourceTypes?: Bucket[];
  countries?: Bucket[];
  domains?: Bucket[];
  languages?: Bucket[];
}
export interface ResultsPage { total: number; results: Result[]; aggregations?: Aggregations }

export type FacetName = "sourcetype" | "sourcecountry" | "domain" | "lang";
export type Facets = Record<FacetName, string[]>;

export interface ResultsQuery extends Partial<Facets> {
  sort?: "recent" | "oldest" | "relevance";
  offset?: number;
  size?: number;
  from?: string;
  to?: string;
  /** Leave out stories an earlier article already carried. */
  dedupe?: boolean;
}

function queryString(q: object) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else if (v !== undefined && v !== "" && v !== false) params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function topicResults(id: string, q: ResultsQuery = {}) {
  return request<ResultsPage>(`/topics/${encodeURIComponent(id)}/results${queryString(q)}`);
}

export function topicFacet(id: string, facet: FacetName, q: ResultsQuery & { q?: string } = {}) {
  return request<Bucket[]>(`/topics/${encodeURIComponent(id)}/facets/${facet}${queryString(q)}`);
}

export interface SourceStatus {
  name: string;
  /** `registry` for domains promoted from the registry; absent or `curated` for sources.yaml entries. */
  origin?: "curated" | "registry";
  domain: string;
  sourcetype: string;
  country?: string;
  lang?: string;
  feedCount: number;
  intervalMs: number;
  status: "pending" | "ok" | "failing";
  lastRun?: string;
  found?: number;
  indexed?: number;
  error?: string;
  consecutiveFailures?: number;
  nextRun?: string;
}

export const listSources = () => request<SourceStatus[]>("/sources");

/** A news domain the registry has seen publishing (GDELT discovery). Not necessarily crawled. */
export interface RegistryRecord {
  domain: string;
  firstSeen: string;
  lastSeen: string;
  articleCount: number;
  languages: string[];
  /** The outcome of the last attempt to find a feed; absent when the domain was never tried. */
  crawl?: { status: "active" | "no_feed" | "unreachable" | "blocked"; checkedAt: string };
  /** ISO 3166 code from the owner's overrides or the domain suffix; absent when unknown. */
  country?: string;
  /** Republishes other outlets' stories rather than reporting its own. */
  aggregator?: boolean;
}
export interface RegistryPage { total: number; items: RegistryRecord[] }
export interface RegistryQuery { lang?: string; q?: string; from?: number; size?: number; hideAggregators?: boolean }

export const listRegistry = (q: RegistryQuery = {}) => request<RegistryPage>(`/registry${queryString(q)}`);

export const createTopic = (t: Omit<Topic, "id">) => request<Topic>("/topics", post(t));

export const updateTopic = (id: string, t: Omit<Topic, "id">) =>
  request<Topic>(`/topics/${encodeURIComponent(id)}`, { ...post(t), method: "PUT" });

export const deleteTopic = (id: string) =>
  request<{ ok: true }>(`/topics/${encodeURIComponent(id)}`, { method: "DELETE" });

export async function validateQuery(query: string): Promise<QueryCheck> {
  try {
    await send("/query/validate", post({ query }));
    return { ok: true };
  } catch (e) {
    const err = e as ApiError;
    // A 400 is the query's own syntax error; anything else means we could not check it at all.
    return { ok: false, message: err.status === 400 ? err.message : `Couldn't check the query: ${err.message}` };
  }
}

