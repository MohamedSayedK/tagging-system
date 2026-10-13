import { Node, QuerySyntaxError } from "./ast.js";
import { parse } from "./parser.js";
import { unparse } from "./unparse.js";

type Dsl = Record<string, unknown>;

const TEXT_FIELDS = ["title", "body"];
// The word the `body.start` field puts in front of every body (see the index mapping).
const START_MARKER = "zzbodystartzz";
// Stored country codes are ISO 3166 alpha-2; queries may use English country names ("Saudi Arabia").
let countryCodes: Map<string, string> | undefined;
export function countryCode(value: string): string {
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v;
  if (!countryCodes) {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    countryCodes = new Map();
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const name = names.of(code);
        if (name && name !== code) countryCodes.set(name.toLowerCase(), code);
      }
    }
  }
  const code = countryCodes.get(v.toLowerCase());
  if (!code) throw new QuerySyntaxError(`Unknown country "${v}"; use an English country name or a two-letter code`);
  return code;
}

const FIELD_MAP: Record<string, Ctx> = {
  text: { fields: TEXT_FIELDS, keyword: false },
  title: { fields: ["title"], keyword: false },
  body: { fields: ["body"], keyword: false },
  author: { fields: ["author"], keyword: false },
  authorshort: { fields: ["authorshort"], keyword: true },
  sourcetype: { fields: ["sourcetype"], keyword: true },
  sourcecountry: { fields: ["sourcecountry"], keyword: true, normalize: countryCode },
  lang: { fields: ["lang"], keyword: true },
  domain: { fields: ["domain"], keyword: true },
  source: { fields: ["source"], keyword: true },
  // The stemmed copies of title and body (see the index mapping): other forms of the same word match.
  stem: { fields: ["title.stem", "body.stem"], keyword: false, stem: true },
};

interface Ctx { fields: string[]; keyword: boolean; normalize?: (v: string) => string; stem?: boolean }
const DEFAULT_CTX: Ctx = { fields: TEXT_FIELDS, keyword: false };

const hasWildcard = (s: string) => /[*?]/.test(s);
const any = (clauses: Dsl[]): Dsl => (clauses.length === 1 ? clauses[0]! : { bool: { should: clauses, minimum_should_match: 1 } });

function compileNode(n: Node, ctx: Ctx): Dsl {
  switch (n.type) {
    case "term":
    case "phrase": {
      if (ctx.stem && hasWildcard(n.value)) throw new QuerySyntaxError("Wildcards are not allowed with stem: a pattern has no stem to match");
      const v = ctx.normalize && !hasWildcard(n.value) ? ctx.normalize(n.value) : n.value;
      const boost = n.boost === undefined ? {} : { boost: n.boost };
      if (ctx.keyword) {
        const value = v.toLowerCase();
        return any(
          ctx.fields.map((f) =>
            hasWildcard(v)
              ? { wildcard: { [f]: { value, ...boost } } }
              : { term: { [f]: n.boost === undefined ? value : { value, ...boost } } },
          ),
        );
      }
      const slop = n.type === "phrase" ? n.slop : undefined;
      return any(
        ctx.fields.map((f) =>
          n.type === "term" && hasWildcard(v)
            ? { wildcard: { [f]: { value: v.toLowerCase(), ...boost } } }
            : {
                match_phrase: {
                  [f]: slop === undefined && n.boost === undefined ? v : { query: v, ...(slop !== undefined && { slop }), ...boost },
                },
              },
        ),
      );
    }
    case "and": {
      const must: Dsl[] = [];
      const must_not: Dsl[] = [];
      for (const c of n.children) {
        if (c.type === "not") must_not.push(compileNode(c.child, ctx));
        else must.push(compileNode(c, ctx));
      }
      return { bool: { ...(must.length && { must }), ...(must_not.length && { must_not }) } };
    }
    case "or":
      return { bool: { should: n.children.map((c) => compileNode(c, ctx)), minimum_should_match: 1 } };
    case "not":
      return { bool: { must_not: [compileNode(n.child, ctx)] } };
    case "field": {
      const spec = FIELD_MAP[n.field];
      if (!spec) throw new QuerySyntaxError(`Unknown field "${n.field}"`);
      return compileNode(n.child, spec);
    }
    case "range": {
      // A date without a time covers the whole day: `||/d` rounds the start down and the end up.
      const edge = (d: string) => (d.includes("T") ? d : `${d}||/d`);
      return { range: { [n.field]: { ...(n.from && { gte: edge(n.from) }), ...(n.to && { lte: edge(n.to) }) } } };
    }
    case "start":
    case "multiple": {
      const text = ctx.fields === TEXT_FIELDS;
      if (ctx.keyword || ctx.stem || !text) {
        throw new QuerySyntaxError(`${n.type.toUpperCase()} works on the headline and body text only, not inside a field prefix such as title: or stem:`);
      }
      const operand = toInterval(n.child); // also what refuses AND, NOT and fields inside the operand
      if (n.type === "multiple") {
        // n separate matches of the operand anywhere in the body; intervals count repeats of one source apart
        return { intervals: { body: { all_of: { ordered: false, intervals: Array.from({ length: n.n }, () => operand) } } } };
      }
      // The first n words of the body: `body.start` is the body with a marker word in front, so "starts within
      // the first n words" is "at most n-1 words between the marker and the operand".
      return {
        bool: {
          should: [
            compileNode(n.child, { fields: ["title"], keyword: false }),
            {
              intervals: {
                "body.start": {
                  all_of: {
                    ordered: true,
                    max_gaps: n.n - 1,
                    intervals: [withPlainAnalyzer({ match: { query: START_MARKER, max_gaps: 0, ordered: true } }), withPlainAnalyzer(operand)],
                  },
                },
              },
            },
          ],
          minimum_should_match: 1,
        },
      };
    }
    case "near": {
      if (ctx.keyword) throw new QuerySyntaxError("NEAR is not allowed on keyword fields");
      return any(ctx.fields.map((f) => ({ intervals: { [f]: toInterval(n) } })));
    }
  }
}

// NEAR operands become Elasticsearch/OpenSearch `intervals` rules, which are analyzed like normal text.
// Only terms, phrases, OR groups and nested NEARs are valid operands.
function toInterval(n: Node): Dsl {
  if ((n.type === "term" || n.type === "phrase") && n.boost !== undefined) {
    throw new QuerySyntaxError("A boost (^n) is not allowed inside NEAR/PRE: interval rules carry no weight");
  }
  switch (n.type) {
    case "term":
      return hasWildcard(n.value)
        ? { wildcard: { pattern: n.value.toLowerCase() } }
        : { match: { query: n.value, max_gaps: 0, ordered: true } };
    case "phrase":
      return n.slop === undefined
        ? { match: { query: n.value, max_gaps: 0, ordered: true } }
        : { match: { query: n.value, max_gaps: n.slop, ordered: false } };
    case "or":
      return { any_of: { intervals: n.children.map(toInterval) } };
    case "near":
      return { all_of: { ordered: n.ordered === true, max_gaps: n.distance, intervals: n.children.map(toInterval) } };
    case "and": {
      // `A NOT B`: occurrences of A that are not inside an occurrence of B.
      const positives = n.children.filter((c) => c.type !== "not");
      const negatives = n.children.flatMap((c) => (c.type === "not" ? [c.child] : []));
      if (positives.length !== 1 || negatives.length === 0) {
        throw new QuerySyntaxError("AND is not allowed inside NEAR, START or MULTIPLE; use terms, phrases, OR groups, or `term NOT (...)`");
      }
      const excluded = negatives.map(toInterval);
      return {
        all_of: {
          ordered: true,
          intervals: [toInterval(positives[0]!)],
          filter: { not_contained_by: excluded.length === 1 ? excluded[0] : { any_of: { intervals: excluded } } },
        },
      };
    }
    default:
      throw new QuerySyntaxError(`${n.type.toUpperCase()} is not allowed inside NEAR, START or MULTIPLE; use terms, phrases, OR groups`);
  }
}

// `body.start` puts the marker word in front of every text it analyzes, query text included; match rules on it
// are analysed with the plain body analyzer so the operand is not preceded by a second marker.
function withPlainAnalyzer(rule: Dsl): Dsl {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "match" && x && typeof x === "object" ? { ...(walk(x) as object), analyzer: "news_text" } : walk(x)]));
    }
    return v;
  };
  return walk(rule) as Dsl;
}

export function compileAst(ast: Node): Dsl {
  return compileNode(ast, DEFAULT_CTX);
}

export function compileQuery(q: string): Dsl {
  return compileAst(parse(q));
}

/** One clause of a query, with the query that tests just that clause against an article. */
export interface ExplainNode {
  kind: Node["type"];
  /** The clause written as query text. */
  label: string;
  dsl: Dsl;
  children: ExplainNode[];
}

/**
 * A query broken into its clauses (AND/OR groups, NOT, fields and the leaves), each compiled on its own with the
 * field context it sits in. Used to answer "which part of the query matched this article?". NEAR and ranges are
 * leaves: their operands cannot be tested apart from the proximity rule.
 */
export function explainTree(ast: Node): ExplainNode {
  const walk = (n: Node, ctx: Ctx): ExplainNode => {
    const base = { kind: n.type, label: unparse(n), dsl: compileNode(n, ctx) };
    switch (n.type) {
      case "and":
      case "or":
        return { ...base, children: n.children.map((c) => walk(c, ctx)) };
      case "not":
        return { ...base, children: [walk(n.child, ctx)] };
      case "field": {
        const spec = FIELD_MAP[n.field];
        return { ...base, children: spec ? [walk(n.child, spec)] : [] };
      }
      default:
        return { ...base, children: [] };
    }
  };
  return walk(ast, DEFAULT_CTX);
}