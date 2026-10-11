import { Node, QuerySyntaxError } from "./ast.js";
import { parse } from "./parser.js";

type Dsl = Record<string, unknown>;

const TEXT_FIELDS = ["title", "body"];
const FIELD_MAP: Record<string, { fields: string[]; keyword: boolean }> = {
  text: { fields: TEXT_FIELDS, keyword: false },
  title: { fields: ["title"], keyword: false },
  body: { fields: ["body"], keyword: false },
  author: { fields: ["author"], keyword: false },
  authorshort: { fields: ["authorshort"], keyword: true },
  sourcetype: { fields: ["sourcetype"], keyword: true },
  sourcecountry: { fields: ["sourcecountry"], keyword: true },
  lang: { fields: ["lang"], keyword: true },
  domain: { fields: ["domain"], keyword: true },
  source: { fields: ["source"], keyword: true },
};

interface Ctx { fields: string[]; keyword: boolean }
const DEFAULT_CTX: Ctx = { fields: TEXT_FIELDS, keyword: false };

const hasWildcard = (s: string) => /[*?]/.test(s);
const any = (clauses: Dsl[]): Dsl => (clauses.length === 1 ? clauses[0]! : { bool: { should: clauses, minimum_should_match: 1 } });

function compileNode(n: Node, ctx: Ctx): Dsl {
  switch (n.type) {
    case "term":
    case "phrase": {
      const v = n.value;
      if (ctx.keyword) {
        const value = v.toLowerCase();
        return any(ctx.fields.map((f) => (hasWildcard(v) ? { wildcard: { [f]: { value } } } : { term: { [f]: value } })));
      }
      return any(
        ctx.fields.map((f) =>
          n.type === "term" && hasWildcard(v)
            ? { wildcard: { [f]: { value: v.toLowerCase() } } }
            : { match_phrase: { [f]: v } },
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
      return { match: { query: n.value, max_gaps: 0, ordered: true } };
    case "or":
      return { any_of: { intervals: n.children.map(toInterval) } };
    case "near":
      return { all_of: { ordered: false, max_gaps: n.distance, intervals: n.children.map(toInterval) } };
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
