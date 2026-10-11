import { Node, QuerySyntaxError } from "./ast.js";
import { parse } from "./parser.js";

type Dsl = Record<string, unknown>;

const TEXT_FIELDS = ["title", "body"];
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

const FIELD_MAP: Record<string, { fields: string[]; keyword: boolean; normalize?: (v: string) => string }> = {
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
};

interface Ctx { fields: string[]; keyword: boolean; normalize?: (v: string) => string }
const DEFAULT_CTX: Ctx = { fields: TEXT_FIELDS, keyword: false };

const hasWildcard = (s: string) => /[*?]/.test(s);
const any = (clauses: Dsl[]): Dsl => (clauses.length === 1 ? clauses[0]! : { bool: { should: clauses, minimum_should_match: 1 } });

function compileNode(n: Node, ctx: Ctx): Dsl {
  switch (n.type) {
    case "term":
    case "phrase": {
      const v = ctx.normalize && !hasWildcard(n.value) ? ctx.normalize(n.value) : n.value;
      if (ctx.keyword) {
        const value = v.toLowerCase();
        return any(ctx.fields.map((f) => (hasWildcard(v) ? { wildcard: { [f]: { value } } } : { term: { [f]: value } })));
      }
      const slop = n.type === "phrase" ? n.slop : undefined;
      return any(
        ctx.fields.map((f) =>
          n.type === "term" && hasWildcard(v)
            ? { wildcard: { [f]: { value: v.toLowerCase() } } }
            : { match_phrase: { [f]: slop === undefined ? v : { query: v, slop } } },
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
    case "near": {
      if (ctx.keyword) throw new QuerySyntaxError("NEAR is not allowed on keyword fields");
      return any(ctx.fields.map((f) => ({ intervals: { [f]: toInterval(n) } })));
    }
  }
}

// NEAR operands become Elasticsearch/OpenSearch `intervals` rules, which are analyzed like normal text.
// Only terms, phrases, OR groups and nested NEARs are valid operands.
function toInterval(n: Node): Dsl {
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
        throw new QuerySyntaxError("AND is not allowed inside NEAR; use terms, phrases, OR groups, or `term NOT (...)`");
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
      throw new QuerySyntaxError(`${n.type.toUpperCase()} is not allowed inside NEAR; use terms, phrases, OR groups`);
  }
}

export function compileAst(ast: Node): Dsl {
  return compileNode(ast, DEFAULT_CTX);
}

export function compileQuery(q: string): Dsl {
  return compileAst(parse(q));
}
