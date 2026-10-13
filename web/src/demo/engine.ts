// In-browser search over a bundled snapshot, answering like the OpenSearch-backed API so the public demo
// is the real UI on real (crawled) data with no server. Parsing is the project's own pure parser.
import { countryCode, Node, parse, QuerySyntaxError, unparse } from "../../../src/query/index.js";

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
  /** When the crawler harvested it; snapshots made before this was exported fall back to `published`. */
  fetched?: string;
}

export interface SearchInput {
  query: string;
  exclude?: string;
  from?: string;
  to?: string;
  sort?: "recent" | "oldest" | "relevance";
  offset?: number;
  size?: number;
  interval?: "auto" | "day" | "week" | "month";
  sourcetype?: string | string[];
  sourcecountry?: string | string[];
  domain?: string | string[];
  lang?: string | string[];
}
export type FacetName = "sourcetype" | "sourcecountry" | "domain" | "lang";
export interface ExplainedClause { kind: string; label: string; matched: boolean; children: ExplainedClause[]; excluded?: boolean }
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

// ---- stemming, the same two filters the real `stem:` analyzer applies after folding ----
// Lucene's light Arabic stemmer: one prefix, then each suffix in turn, never leaving a stem under two letters.
const AR_PREFIXES = ["ال", "وال", "بال", "كال", "فال", "لل", "و"];
const AR_SUFFIXES = ["ها", "ان", "ات", "ون", "ين", "يه", "ية", "ه", "ة", "ي"];
function stemArabic(word: string): string {
  let w = word;
  for (const p of AR_PREFIXES) {
    if (w.length < (p.length === 1 ? 4 : p.length + 2) || !w.startsWith(p)) continue;
    w = w.slice(p.length);
    break;
  }
  for (const s of AR_SUFFIXES) {
    if (w.length <= (s.length === 1 ? 4 : s.length + 1) || !w.endsWith(s)) continue;
    w = w.slice(0, -s.length);
  }
  return w;
}
// Lucene's minimal English stemmer: plurals only (ies -> y, es/s dropped, never ss or us).
function stemEnglishPlural(w: string): string {
  if (w.length < 3 || !w.endsWith("s")) return w;
  const c = w[w.length - 2]!;
  if (c === "u" || c === "s") return w;
  if (c === "e") {
    if (w.length > 3 && w[w.length - 3] === "i" && w[w.length - 4] !== "a" && w[w.length - 4] !== "e") return w.slice(0, -3) + "y";
    if ("iaoe".includes(w[w.length - 3] ?? "")) return w;
  }
  return w.slice(0, -1);
}
// Two Arabic passes, like the real analyzer: one prefix per pass, so الوزير needs two to meet وزير.
const stemToken = (w: string) => stemEnglishPlural(stemArabic(stemArabic(w)));

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

/** `"a b c"~n`: every word within a window of the phrase's length plus n positions, in any order. */
function slopSpans(field: string[], words: string[], slop: number): Span[] {
  const out: Span[] = [];
  if (words.length === 0) return out;
  const width = words.length + slop;
  for (let i = 0; i < field.length; i++) {
    if (!words.includes(field[i]!)) continue;
    const window = field.slice(i, i + width);
    const pool = [...window];
    const all = words.every((w) => {
      const at = pool.indexOf(w);
      if (at < 0) return false;
      pool.splice(at, 1);
      return true;
    });
    if (all) out.push([i, Math.min(field.length, i + width) - 1]);
  }
  return out;
}

function leafSpans(field: string[], value: string, isTerm: boolean, slop?: number, stem = false): Span[] {
  if (isTerm && hasWildcard(value)) {
    const re = wildcardRegex(value);
    const out: Span[] = [];
    field.forEach((t, i) => re.test(t) && out.push([i, i]));
    return out;
  }
  const words = stem ? tokens(value).map(stemToken) : tokens(value);
  return slop === undefined ? phraseSpans(field, words) : slopSpans(field, words, slop);
}

/** Spans in one field where an operand of NEAR (term, phrase, OR group, nested NEAR) matches. */
function spansOf(node: Node, field: string[], stem = false): Span[] {
  switch (node.type) {
    case "term":
      return leafSpans(field, node.value, true, undefined, stem);
    case "phrase":
      return leafSpans(field, node.value, false, node.slop, stem);
    case "or":
      return node.children.flatMap((c) => spansOf(c, field, stem));
    case "and": {
      // `A NOT B` inside NEAR: occurrences of A that are not inside an occurrence of B.
      const positive = node.children.find((c) => c.type !== "not")!;
      const excluded = node.children.flatMap((c) => (c.type === "not" ? spansOf(c.child, field, stem) : []));
      return spansOf(positive, field, stem).filter(([s, e]) => !excluded.some(([xs, xe]) => xs <= s && e <= xe));
    }
    case "near": {
      let acc = spansOf(node.children[0]!, field, stem);
      for (const next of node.children.slice(1)) {
        const right = spansOf(next, field, stem);
        const merged: Span[] = [];
        for (const a of acc) {
          for (const b of right) {
            // PRE/n: the left operand must end before the right one starts.
            if (node.ordered && a[1] >= b[0]) continue;
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

function hasWildcardTerm(node: Node): boolean {
  switch (node.type) {
    case "term":
      return hasWildcard(node.value);
    case "and":
    case "or":
    case "near":
      return node.children.some(hasWildcardTerm);
    case "not":
    case "field":
      return hasWildcardTerm(node.child);
    default:
      return false;
  }
}

function assertSupported(node: Node, insideNear = false, keyword = false, stem = false): void {
  switch (node.type) {
    case "start":
    case "multiple":
      if (keyword || stem) throw new QuerySyntaxError(`${node.type.toUpperCase()} works on the headline and body text only, not inside a field prefix such as title: or stem:`);
      if (insideNear) throw new QuerySyntaxError(`${node.type.toUpperCase()} is not allowed inside NEAR, START or MULTIPLE; use terms, phrases, OR groups`);
      return assertSupported(node.child, true, false);
    case "near":
      if (keyword) throw new QuerySyntaxError("NEAR is not allowed on keyword fields");
      node.children.forEach((c) => assertSupported(c, true, keyword));
      return;
    case "field":
      if (node.field === "stem" && hasWildcardTerm(node.child)) {
        throw new QuerySyntaxError("Wildcards are not allowed with stem: a pattern has no stem to match");
      }
      return assertSupported(node.child, insideNear, KEYWORD_FIELDS.has(node.field), node.field === "stem");
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
    case "term":
    case "phrase":
      if (insideNear && node.boost !== undefined) throw new QuerySyntaxError("A boost (^n) is not allowed inside NEAR/PRE: interval rules carry no weight");
      return;
    case "range":
      if (insideNear) throw new QuerySyntaxError("RANGE is not allowed inside NEAR; use terms, phrases, OR groups");
      return;
    default:
      return;
  }
}

interface Prepared { art: DemoArticle; title: string[]; body: string[]; titleStem: string[]; bodyStem: string[] }
interface Ctx { fields: ("title" | "body")[]; keyword?: string; stem?: boolean }
const textOf = (d: Prepared, f: "title" | "body", stem?: boolean) => (stem ? (f === "title" ? d.titleStem : d.bodyStem) : d[f]);

/** Where a `field:` prefix points the search; null when the snapshot has nothing there (it keeps no author text). */
function fieldCtx(field: string): Ctx | null {
  if (KEYWORD_FIELDS.has(field)) return { fields: [], keyword: field };
  if (field === "author") return null;
  if (field === "stem") return { fields: ["title", "body"], stem: true };
  return { fields: field === "title" ? ["title"] : field === "body" ? ["body"] : ["title", "body"] };
}

function matches(node: Node, d: Prepared, ctx: Ctx = { fields: ["title", "body"] }): boolean {
  switch (node.type) {
    case "term":
    case "phrase": {
      if (ctx.keyword) {
        const have = String((d.art as unknown as Record<string, unknown>)[ctx.keyword] ?? "").toLowerCase();
        const want = (ctx.keyword === "sourcecountry" && !hasWildcard(node.value) ? countryCode(node.value) : node.value).toLowerCase();
        return hasWildcard(want) ? new RegExp(`^${want.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i").test(have) : have === want;
      }
      return ctx.fields.some((f) => leafSpans(textOf(d, f, ctx.stem), node.value, node.type === "term", node.type === "phrase" ? node.slop : undefined, ctx.stem).length > 0);
    }
    case "and":
      return node.children.every((c) => matches(c, d, ctx));
    case "or":
      return node.children.some((c) => matches(c, d, ctx));
    case "not":
      return !matches(node.child, d, ctx);
    case "field": {
      const inner = fieldCtx(node.field);
      return inner ? matches(node.child, d, inner) : false;
    }
    case "near":
      return ctx.fields.some((f) => spansOf(node, textOf(d, f, ctx.stem), ctx.stem).length > 0);
    case "start":
      // the headline, or an occurrence that begins within the first n words of the body
      return matches(node.child, d, { fields: ["title"] }) || spansOf(node.child, d.body).some(([s]) => s < node.n);
    case "multiple":
      return spansOf(node.child, d.body).length >= node.n;
    case "range": {
      const at = Date.parse(node.field === "fetched" ? d.art.fetched ?? d.art.published : d.art.published);
      // A date without a time covers its whole UTC day, as the real engine's `||/d` rounding does.
      const day = (s: string, end: boolean) => Date.parse(s) + (end && !s.includes("T") ? DAY - 1 : 0);
      return (node.from === undefined || at >= day(node.from, false)) && (node.to === undefined || at <= day(node.to, true));
    }
  }
}

/** Boost-weighted hit count of the positive leaves of a query; each matching leaf adds boost x ln(1 + hits). */
function relevance(node: Node, d: Prepared, fields: ("title" | "body")[] = ["title", "body"]): number {
  switch (node.type) {
    case "term":
    case "phrase": {
      const isTerm = node.type === "term";
      const slop = node.type === "phrase" ? node.slop : undefined;
      const weight = { title: 2, body: 1 };
      const hits = fields.reduce((n, f) => n + weight[f] * leafSpans(d[f], node.value, isTerm, slop).length, 0);
      return (node.boost ?? 1) * Math.log(1 + hits);
    }
    case "and":
    case "or":
      return node.children.reduce((sum, c) => sum + relevance(c, d, fields), 0);
    case "field":
      return KEYWORD_FIELDS.has(node.field) ? 0 : relevance(node.child, d, node.field === "title" ? ["title"] : node.field === "body" ? ["body"] : fields);
    case "near":
      return 1;
    default:
      return 0;
  }
}

/** Leaf terms to highlight: everything the query asks for, except what it excludes with NOT. */
interface Terms { words: Set<string>; patterns: RegExp[]; stems: Set<string> }
function highlightTerms(node: Node, out: Terms, negated = false, stem = false): void {
  if (negated) return;
  switch (node.type) {
    case "term":
      if (hasWildcard(node.value)) out.patterns.push(wildcardRegex(node.value));
      else tokens(node.value).forEach((w) => (stem ? out.stems.add(stemToken(w)) : out.words.add(w)));
      return;
    case "phrase":
      tokens(node.value).forEach((w) => (stem ? out.stems.add(stemToken(w)) : out.words.add(w)));
      return;
    case "not":
      return;
    case "field":
      if (!KEYWORD_FIELDS.has(node.field)) highlightTerms(node.child, out, false, stem || node.field === "stem");
      return;
    case "start":
    case "multiple":
      highlightTerms(node.child, out, false, stem);
      return;
    case "near":
    case "and":
    case "or":
      node.children.forEach((c) => highlightTerms(c, out, false, stem));
  }
}

function snippet(body: string, node: Node): string | undefined {
  const terms: Terms = { words: new Set<string>(), patterns: [] as RegExp[], stems: new Set<string>() };
  highlightTerms(node, terms);
  const isHit = (w: string) => {
    const f = fold(w);
    return terms.words.has(f) || terms.patterns.some((p) => p.test(f)) || (terms.stems.size > 0 && terms.stems.has(stemToken(f)));
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
    this.docs = articles.map((art) => {
      const title = tokens(art.title);
      const body = tokens(art.body);
      return { art, title, body, titleStem: title.map(stemToken), bodyStem: body.map(stemToken) };
    });
  }

  /** Moves every date so the newest article is `now`: a snapshot taken last week still reads as live. */
  static shifted(articles: DemoArticle[], now: Date): DemoIndex {
    const newest = Math.max(...articles.map((a) => Date.parse(a.published)));
    const delta = now.getTime() - newest;
    const move = (iso: string) => new Date(Date.parse(iso) + delta).toISOString();
    return new DemoIndex(articles.map((a) => ({ ...a, published: move(a.published), ...(a.fetched && { fetched: move(a.fetched) }) })));
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
    const newest = (a: Prepared, b: Prepared) => order * (Date.parse(a.art.published) - Date.parse(b.art.published));
    // Not BM25: a boost-weighted hit count, title hits twice as strong. Enough to rank, not to match scores.
    const score = new Map(hits.map((d) => [d, relevance(ast, d)]));
    const sorted = [...hits].sort(p.sort === "relevance" ? (a, b) => score.get(b)! - score.get(a)! || newest(a, b) : newest);

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

  /** Which clauses of a query match one article, shaped like GET /topics/:id/explain/:articleId; null for an unknown id. */
  explain(p: { query: string; exclude?: string; id: string }): ExplainedClause | null {
    const d = this.docs.find((x) => x.art.id === p.id);
    if (!d) return null;
    const ast = parse(p.query);
    assertSupported(ast);
    const walk = (n: Node, ctx: Ctx): ExplainedClause => {
      const base = { kind: n.type, label: unparse(n), matched: matches(n, d, ctx) };
      switch (n.type) {
        case "and":
        case "or":
          return { ...base, children: n.children.map((c) => walk(c, ctx)) };
        case "not":
          return { ...base, children: [walk(n.child, ctx)] };
        case "field": {
          const inner = fieldCtx(n.field);
          return { ...base, children: inner ? [walk(n.child, inner)] : [] };
        }
        default:
          return { ...base, children: [] };
      }
    };
    const tree = walk(ast, { fields: ["title", "body"] });
    if (p.exclude?.trim()) {
      const excl = parse(p.exclude);
      assertSupported(excl);
      tree.excluded = matches(excl, d);
    }
    return tree;
  }

  facetValues(p: SearchInput & { facet: FacetName; q?: string }): Bucket[] {
    const { pool } = this.base(p);
    return this.counts(pool.filter((d) => this.facetOk(d, p, p.facet)), p.facet, Math.min(p.size ?? 20, 500), (p.q ?? "").trim().toLowerCase());
  }
}