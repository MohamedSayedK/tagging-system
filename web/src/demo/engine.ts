// In-browser search over a bundled snapshot, answering like the OpenSearch-backed API so the public demo
// is the real UI on real (crawled) data with no server. Parsing is the project's own pure parser.
import { countryCode, Node, parse, QuerySyntaxError } from "../../../src/query/index.js";

export interface DemoArticle {
  id: string;
  url: string;
  title: string;
  body: string;
  source: string;
  domain: string;
  sourcetype: string;
  sourcecountry?: string;
  lang?: string;
  published: string;
}

export interface SearchInput {
  query: string;
  exclude?: string;
  from?: string;
  to?: string;
  sort?: "recent" | "oldest";
  offset?: number;
  size?: number;
  interval?: "auto" | "day" | "week" | "month";
  sourcetype?: string | string[];
  sourcecountry?: string | string[];
  domain?: string | string[];
  lang?: string | string[];
}
export type FacetName = "sourcetype" | "sourcecountry" | "domain" | "lang";
export interface Bucket { key: string; count: number }
type Interval = "day" | "week" | "month";

const FACETS: FacetName[] = ["sourcetype", "sourcecountry", "domain", "lang"];
const KEYWORD_FIELDS = new Set(["authorshort", "sourcetype", "sourcecountry", "lang", "domain", "source"]);
const DAY = 86_400_000;

// ---- text normalisation: the same folds the OpenSearch analyzer applies ----
const ARABIC_MARKS = /[\u0640\u064B-\u065F\u0670]/g;
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(ARABIC_MARKS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}
const WORDS = /[\p{L}\p{N}]+/gu;
const tokens = (s: string) => fold(s).match(WORDS) ?? [];

type Span = [number, number]; // inclusive token positions

const hasWildcard = (s: string) => /[*?]/.test(s);
function wildcardRegex(pattern: string): RegExp {
  const body = fold(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[\\p{L}\\p{N}]*")
    .replace(/\?/g, "[\\p{L}\\p{N}]");
  return new RegExp(`^${body}$`, "u");
}

function phraseSpans(field: string[], phrase: string[]): Span[] {
  const out: Span[] = [];
  if (phrase.length === 0) return out;
  for (let i = 0; i + phrase.length <= field.length; i++) {
    if (phrase.every((w, k) => field[i + k] === w)) out.push([i, i + phrase.length - 1]);
  }
  return out;
}

function leafSpans(field: string[], value: string, isTerm: boolean): Span[] {
  if (isTerm && hasWildcard(value)) {
    const re = wildcardRegex(value);
    const out: Span[] = [];
    field.forEach((t, i) => re.test(t) && out.push([i, i]));
    return out;
  }
  return phraseSpans(field, tokens(value));
}

/** Spans in one field where an operand of NEAR (term, phrase, OR group, nested NEAR) matches. */
function spansOf(node: Node, field: string[]): Span[] {
  switch (node.type) {
    case "term":
      return leafSpans(field, node.value, true);
    case "phrase":
      return leafSpans(field, node.value, false);
    case "or":
      return node.children.flatMap((c) => spansOf(c, field));
    case "and": {
      // `A NOT B` inside NEAR: occurrences of A that are not inside an occurrence of B.
      const positive = node.children.find((c) => c.type !== "not")!;
      const excluded = node.children.flatMap((c) => (c.type === "not" ? spansOf(c.child, field) : []));
      return spansOf(positive, field).filter(([s, e]) => !excluded.some(([xs, xe]) => xs <= s && e <= xe));
    }
    case "near": {
      let acc = spansOf(node.children[0]!, field);
      for (const next of node.children.slice(1)) {
        const right = spansOf(next, field);
        const merged: Span[] = [];
        for (const a of acc) {
          for (const b of right) {
            const [first, second] = a[0] <= b[0] ? [a, b] : [b, a];
            const gap = Math.max(0, second[0] - first[1] - 1);
            if (gap <= node.distance) merged.push([Math.min(a[0], b[0]), Math.max(a[1], b[1])]);
          }
        }
        acc = merged;
      }
      return acc;
    }
    default:
      return [];
  }
}

function assertSupported(node: Node, insideNear = false, keyword = false): void {
  switch (node.type) {
    case "near":
      if (keyword) throw new QuerySyntaxError("NEAR is not allowed on keyword fields");
      node.children.forEach((c) => assertSupported(c, true, keyword));
      return;
    case "field":
      return assertSupported(node.child, insideNear, KEYWORD_FIELDS.has(node.field));
    case "and":
    case "not":
      if (insideNear && node.type === "and") {
        const negatives = node.children.filter((c) => c.type === "not");
        if (node.children.length - negatives.length === 1 && negatives.length > 0) {
          return node.children.forEach((c) => assertSupported(c.type === "not" ? c.child : c, true, keyword));
        }
      }
      if (insideNear) throw new QuerySyntaxError(`${node.type.toUpperCase()} is not allowed inside NEAR; use terms, phrases, OR groups`);
      return node.type === "and" ? node.children.forEach((c) => assertSupported(c, insideNear, keyword)) : assertSupported(node.child, insideNear, keyword);
    case "or":
      return node.children.forEach((c) => assertSupported(c, insideNear, keyword));
    default:
      return;
  }
}

interface Prepared { art: DemoArticle; title: string[]; body: string[] }
interface Ctx { fields: ("title" | "body")[]; keyword?: string }

function matches(node: Node, d: Prepared, ctx: Ctx = { fields: ["title", "body"] }): boolean {
  switch (node.type) {
    case "term":
    case "phrase": {
      if (ctx.keyword) {
        const have = String((d.art as unknown as Record<string, unknown>)[ctx.keyword] ?? "").toLowerCase();
        const want = (ctx.keyword === "sourcecountry" && !hasWildcard(node.value) ? countryCode(node.value) : node.value).toLowerCase();
        return hasWildcard(want) ? new RegExp(`^${want.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i").test(have) : have === want;
      }
      return ctx.fields.some((f) => leafSpans(d[f], node.value, node.type === "term").length > 0);
    }
    case "and":
      return node.children.every((c) => matches(c, d, ctx));
    case "or":
      return node.children.some((c) => matches(c, d, ctx));
    case "not":
      return !matches(node.child, d, ctx);
    case "field": {
      if (KEYWORD_FIELDS.has(node.field)) return matches(node.child, d, { fields: [], keyword: node.field });
      if (node.field === "author") return false; // snapshot has no author text
      const fields: ("title" | "body")[] = node.field === "title" ? ["title"] : node.field === "body" ? ["body"] : ["title", "body"];
      return matches(node.child, d, { fields });
    }
    case "near":
      return ctx.fields.some((f) => spansOf(node, d[f]).length > 0);
  }
}

/** Leaf terms to highlight: everything the query asks for, except what it excludes with NOT. */
function highlightTerms(node: Node, out: { words: Set<string>; patterns: RegExp[] }, negated = false): void {
  if (negated) return;
  switch (node.type) {
    case "term":
      if (hasWildcard(node.value)) out.patterns.push(wildcardRegex(node.value));
      else tokens(node.value).forEach((w) => out.words.add(w));
      return;
    case "phrase":
      tokens(node.value).forEach((w) => out.words.add(w));
      return;
    case "not":
      return;
    case "field":
      if (!KEYWORD_FIELDS.has(node.field)) highlightTerms(node.child, out);
      return;
    case "near":
    case "and":
    case "or":
      node.children.forEach((c) => highlightTerms(c, out));
  }
}

function snippet(body: string, node: Node): string | undefined {
  const terms = { words: new Set<string>(), patterns: [] as RegExp[] };
  highlightTerms(node, terms);
  const isHit = (w: string) => {
    const f = fold(w);
    return terms.words.has(f) || terms.patterns.some((p) => p.test(f));
  };
  const first = [...body.matchAll(WORDS)].find((m) => isHit(m[0]));
  if (!first) return undefined;
  const start = Math.max(0, first.index! - 70);
  const text = body.slice(start, start + 210);
  return (start > 0 ? "…" : "") + text.replace(WORDS, (w) => (isHit(w) ? `<em>${w}</em>` : w)) + (start + 210 < body.length ? "…" : "");
}

const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).filter(Boolean).map((s) => s.toLowerCase());

function bucketStart(ms: number, interval: Interval): number {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  if (interval === "week") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (interval === "month") d.setUTCDate(1);
  return d.getTime();
}
function nextBucket(ms: number, interval: Interval): number {
  const d = new Date(ms);
  if (interval === "day") d.setUTCDate(d.getUTCDate() + 1);
  else if (interval === "week") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.getTime();
}
const chooseInterval = (spanDays: number): Interval => (spanDays <= 45 ? "day" : spanDays <= 400 ? "week" : "month");

export class DemoIndex {
  private readonly docs: Prepared[];
  constructor(articles: DemoArticle[]) {
    this.docs = articles.map((art) => ({ art, title: tokens(art.title), body: tokens(art.body) }));
  }

  /** Moves every date so the newest article is `now`: a snapshot taken last week still reads as live. */
  static shifted(articles: DemoArticle[], now: Date): DemoIndex {
    const newest = Math.max(...articles.map((a) => Date.parse(a.published)));
    const delta = now.getTime() - newest;
    return new DemoIndex(articles.map((a) => ({ ...a, published: new Date(Date.parse(a.published) + delta).toISOString() })));
  }

  private base(p: SearchInput) {
    const ast = parse(p.query);
    assertSupported(ast);
    const excl = p.exclude?.trim() ? parse(p.exclude) : null;
    if (excl) assertSupported(excl);
    const from = p.from ? Date.parse(p.from) : -Infinity;
    const to = p.to ? Date.parse(p.to) : Infinity;
    const pool = this.docs.filter((d) => {
      const t = Date.parse(d.art.published);
      return t >= from && t <= to && matches(ast, d) && !(excl && matches(excl, d));
    });
    return { ast, pool };
  }

  private facetOk(d: Prepared, p: SearchInput, skip?: FacetName): boolean {
    return FACETS.every((f) => {
      const want = list(p[f]);
      return f === skip || want.length === 0 || want.includes(String(d.art[f] ?? "").toLowerCase());
    });
  }

  private counts(docs: Prepared[], f: FacetName, size: number, q = ""): Bucket[] {
    const m = new Map<string, number>();
    for (const d of docs) {
      const k = String(d.art[f] ?? "").toLowerCase();
      if (k && k.includes(q)) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, size).map(([key, count]) => ({ key, count }));
  }

  search(p: SearchInput) {
    const { ast, pool } = this.base(p);
    const hits = pool.filter((d) => this.facetOk(d, p));
    const order = p.sort === "oldest" ? 1 : -1;
    const sorted = [...hits].sort((a, b) => order * (Date.parse(a.art.published) - Date.parse(b.art.published)));

    // time buckets over everything that matches, with empty buckets filled like a date histogram
    const times = hits.map((d) => Date.parse(d.art.published));
    const spanDays = times.length ? (Math.max(...times) - Math.min(...times)) / DAY : 0;
    const interval: Interval = !p.interval || p.interval === "auto" ? chooseInterval(spanDays) : p.interval;
    const perBucket = new Map<number, number>();
    for (const t of times) perBucket.set(bucketStart(t, interval), (perBucket.get(bucketStart(t, interval)) ?? 0) + 1);
    const overTime: Bucket[] = [];
    if (times.length) {
      for (let k = bucketStart(Math.min(...times), interval); k <= bucketStart(Math.max(...times), interval); k = nextBucket(k, interval)) {
        overTime.push({ key: new Date(k).toISOString(), count: perBucket.get(k) ?? 0 });
      }
    }

    const facet = (f: FacetName) => this.counts(pool.filter((d) => this.facetOk(d, p, f)), f, 20);
    const offset = p.offset ?? 0;
    const size = Math.min(p.size ?? 25, 100);
    return {
      total: hits.length,
      results: sorted.slice(offset, offset + size).map((d) => {
        const hl = snippet(d.art.body, ast);
        return { ...d.art, ...(hl && { highlight: { body: [hl] } }) };
      }),
      aggregations: {
        interval,
        overTime,
        sourceTypes: facet("sourcetype"),
        countries: facet("sourcecountry"),
        domains: facet("domain"),
        languages: facet("lang"),
      },
    };
  }

  facetValues(p: SearchInput & { facet: FacetName; q?: string }): Bucket[] {
    const { pool } = this.base(p);
    return this.counts(pool.filter((d) => this.facetOk(d, p, p.facet)), p.facet, Math.min(p.size ?? 20, 500), (p.q ?? "").trim().toLowerCase());
  }
}