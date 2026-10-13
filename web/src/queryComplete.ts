import { FIELD_ALIASES } from "../../src/query/lexer.js";
import { KNOWN_SOURCE_TYPES, sourceTypeName } from "./names";

export interface Suggestion {
  label: string;
  /** What replaces the typed prefix. */
  insert: string;
  /** Where the caret goes, counted from the start of `insert`; the end when absent. */
  caret?: number;
  detail?: string;
}
export interface Completion {
  /** The typed prefix being completed: text[from, to). */
  from: number;
  to: number;
  items: Suggestion[];
}

const FIELDS: { name: string; detail: string }[] = [
  { name: "title", detail: "headline text" },
  { name: "headline", detail: "headline text (Newsdesk name)" },
  { name: "body", detail: "article text" },
  { name: "content", detail: "article text (Newsdesk name)" },
  { name: "byline", detail: "author (Newsdesk name)" },
  { name: "author", detail: "author text" },
  { name: "text", detail: "headline and article text" },
  { name: "stem", detail: "also finds other forms of a word (الوزير, وزراء)" },
  { name: "source", detail: "outlet name, exact" },
  { name: "sourcetype", detail: "kind of source, exact" },
  { name: "sourcecountry", detail: "country name or code" },
  { name: "lang", detail: "language code" },
  { name: "domain", detail: "website, exact" },
];
const OPERATORS: { name: string; detail: string }[] = [
  { name: "AND", detail: "both must match" },
  { name: "OR", detail: "either may match" },
  { name: "NOT", detail: "exclude what follows" },
  { name: "NEAR/", detail: "within n words, any order: a NEAR/5 b" },
  { name: "PRE/", detail: "within n words, in order: a PRE/5 b" },
  { name: "START/", detail: "in the headline or first n words: START/20:term" },
  { name: "MULTIPLE/", detail: "at least n times in the body (2 to 10): MULTIPLE/3:term" },
];
const LANGUAGES = ["ar", "en", "fr", "tr", "fa", "he", "ur"];
const BOUNDARY = /[\s()"“”]/;

const startsWith = (label: string, prefix: string) => label.toLowerCase().startsWith(prefix.toLowerCase());

export function suggest(text: string, caret: number, now: Date = new Date()): Completion | null {
  if (caret < text.length && !BOUNDARY.test(text[caret]!)) return null; // only at the end of a word
  const before = text.slice(0, caret);
  if ((before.match(/["“”]/g) ?? []).length % 2 === 1) return null; // inside a phrase
  if ((before.match(/\[/g) ?? []).length > (before.match(/]/g) ?? []).length) return null; // inside a date range
  let from = caret;
  while (from > 0 && !BOUNDARY.test(text[from - 1]!)) from--;
  const word = text.slice(from, caret);

  const colon = word.indexOf(":");
  if (colon > 0) {
    const field = FIELD_ALIASES[word.slice(0, colon).toLowerCase()];
    const prefix = word.slice(colon + 1);
    const values =
      field === "sourcetype"
        ? KNOWN_SOURCE_TYPES.map((t) => ({ label: t.toUpperCase(), detail: sourceTypeName(t) }))
        : field === "lang"
          ? LANGUAGES.map((l) => ({ label: l, detail: undefined }))
          : [];
    const items = values.filter((v) => startsWith(v.label, prefix) && v.label !== prefix).map((v) => ({ label: v.label, insert: v.label, detail: v.detail }));
    return items.length ? { from: from + colon + 1, to: caret, items } : null;
  }

  if (word.length < 2) return null;
  const items: Suggestion[] = [];
  for (const f of FIELDS) if (startsWith(f.name + ":", word) && f.name + ":" !== word) items.push({ label: f.name + ":", insert: f.name + ":", detail: f.detail });
  const today = now.toISOString().slice(0, 10);
  for (const d of ["harvestDate", "publishedDate"]) {
    if (!startsWith(d, word) || d + ":" === word) continue;
    const start = `${d}:[`;
    items.push({
      label: `${d}:[ ]`,
      insert: `${start}${today} TO *]`,
      caret: start.length + today.length,
      detail: d === "harvestDate" ? "when the crawler stored it; date range" : "outlet's date; date range",
    });
  }
  if (/^[A-Z]+$/.test(word)) {
    for (const o of OPERATORS) if (o.name.startsWith(word) && o.name !== word) items.push({ label: o.name, insert: o.name, detail: o.detail });
  }
  return items.length ? { from, to: caret, items } : null;
}

export function applySuggestion(text: string, c: Completion, s: Suggestion): { text: string; caret: number } {
  return { text: text.slice(0, c.from) + s.insert + text.slice(c.to), caret: c.from + (s.caret ?? s.insert.length) };
}