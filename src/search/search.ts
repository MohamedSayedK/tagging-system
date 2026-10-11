import { compileQuery } from "../query/index.js";
import { client, INDEX } from "./index-def.js";

export interface SearchParams {
  query: string;
  exclude?: string;
  from?: string; // ISO date
  to?: string;
  sort?: "recent" | "oldest";
  offset?: number;
  size?: number;
  interval?: "auto" | "hour" | "day" | "week" | "month"; // auto (default) picks day/week/month from the span of matching articles
  // Facet filters (case-insensitive). Repeated query-string params arrive as arrays.
  sourcetype?: string | string[];
  sourcecountry?: string | string[];
  domain?: string | string[];
  lang?: string | string[];
}

export interface Article {
  id: string;
  url: string;
  title: string;
  body: string;
  author?: string;
  authorshort?: string;
  source: string;
  domain: string;
  sourcetype: string;
  sourcecountry?: string;
  lang?: string;
  published: string;
}

const FACETS = {
  sourcetype: { field: "sourcetype", agg: "by_sourcetype" },
  sourcecountry: { field: "sourcecountry", agg: "by_country" },
  domain: { field: "domain", agg: "by_domain" },
  lang: { field: "lang", agg: "by_lang" },
} as const;
export type FacetName = keyof typeof FACETS;
export const isFacetName = (s: string): s is FacetName => Object.hasOwn(FACETS, s);

// Query strings give one value as a string and repeats as an array; accept either.
const values = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).filter(Boolean);

// What a search is scoped to: the topic query, its exclusion, the date range, and the selected facet
// values (OR within a facet, AND across facets).
function scope(p: SearchParams) {
  const must = [compileQuery(p.query)];
  const must_not = p.exclude?.trim() ? [compileQuery(p.exclude)] : [];
  const filter = p.from || p.to ? [{ range: { published: { gte: p.from, lte: p.to } } }] : [];

  const facetFilter = (name: FacetName) => {
    const vs = values(p[name]).map((v) => v.toLowerCase());
    return vs.length ? { terms: { [FACETS[name].field]: vs } } : null;
  };
  const filtersExcept = (skip?: FacetName) =>
    (Object.keys(FACETS) as FacetName[]).filter((n) => n !== skip).flatMap((n) => facetFilter(n) ?? []);
  return { must, must_not, filter, filtersExcept };
}

const FACET_PAGE = 20;
const FACET_MAX = 500;
const luceneEscape = (s: string) => s.replace(/[.?+*|{}[\]()"\\#@&<>~]/g, "\\$&");

/** Values of one facet with counts: more than /search carries, optionally those containing `q`. */
export async function facetValues(p: SearchParams & { facet: FacetName; q?: string; size?: number }) {
  const { must, must_not, filter, filtersExcept } = scope(p);
  const needle = p.q?.trim().toLowerCase();
  const res = await client.search({
    index: INDEX,
    body: <any>{
      size: 0,
      query: { bool: { must, must_not, filter: [...filter, ...filtersExcept(p.facet)] } },
      aggs: {
        values: {
          terms: {
            field: FACETS[p.facet].field,
            size: Math.min(p.size ?? FACET_PAGE, FACET_MAX),
            ...(needle && { include: `.*${luceneEscape(needle)}.*` }),
          },
        },
      },
    },
  });
  return (res.body as any).aggregations.values.buckets.map((b: any) => ({ key: b.key as string, count: b.doc_count as number }));
}

type Bucket = "day" | "week" | "month";

/** Few bars for a long span, many for a short one: a chart needs to stay readable, not exhaustive. */
export function bucketFor(spanDays: number): Bucket {
  return spanDays <= 45 ? "day" : spanDays <= 400 ? "week" : "month";
}

export async function search(p: SearchParams) {
  const { must, must_not, filter, filtersExcept } = scope(p);
  const withFilters = (filters: object[], aggs: object) => ({ filter: { bool: { filter: filters } }, aggs });

  let interval: "hour" | Bucket | "week" | "month" = p.interval && p.interval !== "auto" ? p.interval : "day";
  if (!p.interval || p.interval === "auto") {
    const span = await client.search({
      index: INDEX,
      body: <any>{
        size: 0,
        query: { bool: { must, must_not, filter: [...filter, ...filtersExcept()] } },
        aggs: { first: { min: { field: "published" } }, last: { max: { field: "published" } } },
      },
    });
    const a = (span.body as any).aggregations;
    if (a.first.value != null) interval = bucketFor((a.last.value - a.first.value) / 86_400_000);
  }

  // Facets are applied as post_filter so each facet's own options stay visible (multi-select);
  // every aggregation sees the filters of all the other facets.
  const facetAggs = Object.fromEntries(
    (Object.keys(FACETS) as FacetName[]).map((n) => [
      FACETS[n].agg,
      withFilters(filtersExcept(n), { terms: { terms: { field: FACETS[n].field, size: FACET_PAGE } } }),
    ]),
  );

  const res = await client.search({
    index: INDEX,
    body: <any>{
      track_total_hits: true,
      from: p.offset ?? 0,
      size: Math.min(p.size ?? 25, 100),
      sort: [{ published: p.sort === "oldest" ? "asc" : "desc" }],
      query: { bool: { must, must_not, filter } },
      post_filter: { bool: { filter: filtersExcept() } },
      highlight: { fields: { title: {}, body: { fragment_size: 200, number_of_fragments: 1 } } },
      aggs: {
        over_time: withFilters(filtersExcept(), {
          h: { date_histogram: { field: "published", calendar_interval: interval } },
        }),
        ...facetAggs,
      },
    },
  });

  const body = res.body as any;
  const buckets = (a: any) => a.buckets.map((b: any) => ({ key: b.key_as_string ?? b.key, count: b.doc_count }));
  const aggs = body.aggregations;
  return {
    total: body.hits.total.value as number,
    results: body.hits.hits.map((h: any) => ({
      id: h._id,
      ...h._source,
      highlight: h.highlight,
    })),
    aggregations: {
      interval,
      overTime: buckets(aggs.over_time.h),
      sourceTypes: buckets(aggs.by_sourcetype.terms),
      countries: buckets(aggs.by_country.terms),
      domains: buckets(aggs.by_domain.terms),
      languages: buckets(aggs.by_lang.terms),
    },
  };
}




