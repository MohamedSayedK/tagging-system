import { QuerySyntaxError } from "./ast.js";

export type Token =
  | { kind: "lparen" | "rparen" | "and" | "or" | "not"; pos: number }
  | { kind: "near"; distance: number; ordered: boolean; pos: number }
  | { kind: "phrase"; value: string; slop?: number; pos: number }
  | { kind: "word"; value: string; pos: number }
  | { kind: "field"; field: string; pos: number };

// Prefixes before ':' that are treated as field filters; anything else (e.g. https:) stays a word.
export const FIELD_ALIASES: Record<string, string> = {
  title: "title",
  headline: "title", // Newsdesk's name
  body: "body",
  content: "body", // Newsdesk's name
  byline: "author", // Newsdesk's name
  text: "text",
  author: "author",
  authorcontains: "author",
  authorshort: "authorshort",
  sourcetype: "sourcetype",
  sourcecountry: "sourcecountry",
  authorcountry: "sourcecountry",
  country: "sourcecountry",
  lang: "lang",
  language: "lang",
  domain: "domain",
  site: "domain",
  source: "source",
};

const WORD_BREAK = /[\s()"]/;

export function lex(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (c === "(") { out.push({ kind: "lparen", pos: i++ }); continue; }
    if (c === ")") { out.push({ kind: "rparen", pos: i++ }); continue; }
    if (c === '"' || c === "“" || c === "”") {
      const start = i++;
      let value = "";
      while (i < input.length && input[i] !== '"' && input[i] !== "”" && input[i] !== "“") value += input[i++];
      if (i >= input.length) throw new QuerySyntaxError("Unterminated phrase", start);
      i++;
      // `"john kennedy"~2`: the words may be up to 2 positions apart
      const slop = /^~(\d+)(?![^\s()])/.exec(input.slice(i));
      if (slop) i += slop[0].length;
      out.push({ kind: "phrase", value, ...(slop && { slop: Number(slop[1]) }), pos: start });
      continue;
    }
    const start = i;
    while (i < input.length && !WORD_BREAK.test(input[i]!)) i++;
    const raw = input.slice(start, i);
    const near = /^(NEAR|PRE)\/(\d+)$/.exec(raw);
    if (near) { out.push({ kind: "near", distance: Number(near[2]), ordered: near[1] === "PRE", pos: start }); continue; }
    if (raw === "AND") { out.push({ kind: "and", pos: start }); continue; }
    if (raw === "OR") { out.push({ kind: "or", pos: start }); continue; }
    if (raw === "NOT") { out.push({ kind: "not", pos: start }); continue; }
    const colon = raw.indexOf(":");
    if (colon > 0) {
      const field = FIELD_ALIASES[raw.slice(0, colon).toLowerCase()];
      if (field) {
        out.push({ kind: "field", field, pos: start });
        const rest = raw.slice(colon + 1);
        if (rest) out.push({ kind: "word", value: rest, pos: start + colon + 1 });
        continue;
      }
    }
    out.push({ kind: "word", value: raw, pos: start });
  }
  return out;
}
