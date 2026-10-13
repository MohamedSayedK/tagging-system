import { QuerySyntaxError } from "./ast.js";

export type Token =
  | { kind: "lparen" | "rparen" | "and" | "or" | "not"; pos: number }
  | { kind: "near"; distance: number; ordered: boolean; pos: number }
  | { kind: "phrase"; value: string; slop?: number; boost?: number; pos: number }
  | { kind: "word"; value: string; boost?: number; pos: number }
  | { kind: "field"; field: string; pos: number }
  | { kind: "range"; field: "fetched" | "published"; from?: string; to?: string; pos: number };

// Prefixes before ':' that are treated as field filters; anything else (e.g. https:) stays a word.
export const FIELD_ALIASES: Record<string, string> = {
  title: "title",
  headline: "title", // Newsdesk's name
  body: "body",
  content: "body", // Newsdesk's name
  byline: "author", // Newsdesk's name
  text: "text",
  stem: "stem", // opt-in stemmed search: stem:المستفيد also finds للمستفيدين
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

// `NEAR/3`, `PRE/3`. Shared with the editor's colouring so the two cannot disagree.
export const PROXIMITY = /^(NEAR|PRE)\/(\d+)$/;

// `harvestDate:[2026-10-01 TO 2026-10-12]`. Newsdesk's name for the ingestion date is harvestDate; ours is `fetched`.
export const DATE_RANGE_FIELDS: Record<string, "fetched" | "published"> = { harvestdate: "fetched", publisheddate: "published" };
export const DATE_RANGE_START = /^(harvestDate|publishedDate):\[/i;
const DATE_BOUND = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function lexDateRange(input: string, start: number): { token: Token; end: number } | null {
  const head = DATE_RANGE_START.exec(input.slice(start));
  if (!head) return null;
  const close = input.indexOf("]", start);
  if (close < 0) throw new QuerySyntaxError("Unterminated date range; expected [from TO to]", start);
  const parts = input.slice(start + head[0].length, close).trim().split(/\s+TO\s+/);
  if (parts.length !== 2) throw new QuerySyntaxError("A date range needs [from TO to], for example [2026-10-01 TO 2026-10-12]", start);
  const bound = (s: string): string | undefined => {
    if (s === "*") return undefined;
    if (!DATE_BOUND.test(s) || Number.isNaN(Date.parse(s))) throw new QuerySyntaxError(`"${s}" is not a date; use YYYY-MM-DD or YYYY-MM-DDThh:mm:ssZ, or *`, start);
    return s;
  };
  const from = bound(parts[0]!);
  const to = bound(parts[1]!);
  if (from === undefined && to === undefined) throw new QuerySyntaxError("A date range needs at least one date", start);
  if (from !== undefined && to !== undefined && Date.parse(from) > Date.parse(to)) throw new QuerySyntaxError("The end of the date range is before its start", start);
  const field = DATE_RANGE_FIELDS[head[1]!.toLowerCase()]!;
  return { token: { kind: "range", field, ...(from && { from }), ...(to && { to }), pos: start }, end: close + 1 };
}

const WORD_BREAK = /[\s()"]/;

function parseBoost(text: string, pos: number): number {
  const n = /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
  if (!(n > 0)) throw new QuerySyntaxError(`A boost must be a positive number, as in term^2 (got "^${text}")`, pos);
  return n;
}

// `budget^2` is the word `budget` with boost 2; a bare `^2` (after a space or a bracket) belongs to nothing.
function wordToken(raw: string, pos: number): Token {
  if (/^\^/.test(raw)) throw new QuerySyntaxError("A boost must directly follow a term or a phrase, as in term^2", pos);
  const caret = raw.lastIndexOf("^");
  if (caret < 0) return { kind: "word", value: raw, pos };
  return { kind: "word", value: raw.slice(0, caret), boost: parseBoost(raw.slice(caret + 1), pos), pos };
}

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
      const slop = /^~(\d+)(?![^\s()^])/.exec(input.slice(i));
      if (slop) i += slop[0].length;
      // `"a b"^2`: how strongly a match counts in the relevance order
      let boost: number | undefined;
      if (input[i] === "^") {
        let end = i + 1;
        while (end < input.length && !WORD_BREAK.test(input[end]!)) end++;
        boost = parseBoost(input.slice(i + 1, end), i);
        i = end;
      }
      out.push({ kind: "phrase", value, ...(slop && { slop: Number(slop[1]) }), ...(boost !== undefined && { boost }), pos: start });
      continue;
    }
    const start = i;
    const range = lexDateRange(input, i);
    if (range) { out.push(range.token); i = range.end; continue; }
    while (i < input.length && !WORD_BREAK.test(input[i]!)) i++;
    const raw = input.slice(start, i);
    const near = PROXIMITY.exec(raw);
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
        if (rest) out.push(wordToken(rest, start + colon + 1));
        continue;
      }
    }
    out.push(wordToken(raw, start));
  }
  return out;
}
