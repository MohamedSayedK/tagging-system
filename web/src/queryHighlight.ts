import { DATE_RANGE_START, FIELD_ALIASES, LIMIT_PREFIX, PROXIMITY } from "../../src/query/lexer.js";

export type SegmentKind = "space" | "and" | "or" | "not" | "proximity" | "field" | "range" | "phrase" | "term" | "boost" | "paren";

export interface Segment {
  text: string;
  kind: SegmentKind;
  /** Offset of the first character in the query text. */
  start: number;
  /** Brackets only: nesting level (outermost pair = 0), and whether the bracket has no partner. */
  depth?: number;
  unmatched?: boolean;
  /** Brackets only: offset of the partner bracket, when there is one. */
  partner?: number;
}

export interface BracketMatch {
  open: number | null;
  close: number | null;
}

const WORD_BREAK = /[\s()"“”]/;
const QUOTES = /["“”]/;

// Tolerant counterpart of the query lexer: it never throws and its segments cover the whole text,
// so half-typed queries (an open phrase, a stray bracket) still get coloured.
export function highlightQuery(text: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const start = i;
    const c = text[i]!;
    if (/\s/.test(c)) {
      while (i < text.length && /\s/.test(text[i]!)) i++;
      out.push({ text: text.slice(start, i), kind: "space", start });
    } else if (c === "(" || c === ")") {
      i++;
      out.push({ text: c, kind: "paren", start });
    } else if (DATE_RANGE_START.test(text.slice(i)) && text.indexOf("]", i) > 0) {
      i = text.indexOf("]", i) + 1;
      out.push({ text: text.slice(start, i), kind: "range", start });
    } else if (QUOTES.test(c)) {
      i++;
      while (i < text.length && !QUOTES.test(text[i]!)) i++;
      if (i < text.length) {
        i++;
        const slop = /^~\d+(?![^\s()^])/.exec(text.slice(i));
        if (slop) i += slop[0].length;
      }
      out.push({ text: text.slice(start, i), kind: "phrase", start });
      if (text[i] === "^") {
        const boost = /^\^[^\s()"“”]*/.exec(text.slice(i))![0];
        out.push({ text: boost, kind: "boost", start: i });
        i += boost.length;
      }
    } else {
      while (i < text.length && !WORD_BREAK.test(text[i]!)) i++;
      const raw = text.slice(start, i);
      const colon = raw.indexOf(":");
      if (raw === "AND") out.push({ text: raw, kind: "and", start });
      else if (raw === "OR") out.push({ text: raw, kind: "or", start });
      else if (raw === "NOT") out.push({ text: raw, kind: "not", start });
      else if (PROXIMITY.test(raw)) out.push({ text: raw, kind: "proximity", start });
      else if (LIMIT_PREFIX.test(raw)) {
        // START/5:budget: the operator, then its operand if it is attached
        const op = LIMIT_PREFIX.exec(raw)![0];
        out.push({ text: op, kind: "proximity", start });
        if (raw.length > op.length) out.push(...termWithBoost(raw.slice(op.length), start + op.length));
      }
      else if (colon > 0 && FIELD_ALIASES[raw.slice(0, colon).toLowerCase()]) {
        out.push({ text: raw.slice(0, colon + 1), kind: "field", start });
        if (raw.length > colon + 1) out.push(...termWithBoost(raw.slice(colon + 1), start + colon + 1));
      } else out.push(...termWithBoost(raw, start));
    }
  }
  pairBrackets(out);
  return out;
}

// `budget^2`: the word, then its boost as a segment of its own.
function termWithBoost(raw: string, start: number): Segment[] {
  const m = /^(.+?)(\^\d+(?:\.\d+)?)$/.exec(raw);
  if (!m) return [{ text: raw, kind: "term", start }];
  return [
    { text: m[1]!, kind: "term", start },
    { text: m[2]!, kind: "boost", start: start + m[1]!.length },
  ];
}

function pairBrackets(segments: Segment[]) {
  const open: Segment[] = [];
  for (const s of segments) {
    if (s.kind !== "paren") continue;
    if (s.text === "(") {
      s.depth = open.length;
      s.unmatched = true;
      open.push(s);
    } else {
      const partner = open.pop();
      s.depth = open.length;
      s.unmatched = !partner;
      if (partner) {
        partner.unmatched = false;
        partner.partner = s.start;
        s.partner = partner.start;
      }
    }
  }
}

// The bracket touching the caret (the one just before it wins, as in most editors) and its partner.
export function matchBracket(text: string, caret: number): BracketMatch | null {
  const parens = highlightQuery(text).filter((s) => s.kind === "paren");
  const hit = parens.find((s) => s.start === caret - 1) ?? parens.find((s) => s.start === caret);
  if (!hit) return null;
  const mine = hit.start;
  const other = hit.partner ?? null;
  return hit.text === "(" ? { open: mine, close: other } : { open: other, close: mine };
}
