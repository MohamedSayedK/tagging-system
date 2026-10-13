import { highlightQuery } from "./queryHighlight";

// Lay a query out for reading. Only whitespace changes: tokens and their order are untouched, so the
// meaning is the same. A bracketed group that is long and has several AND / OR parts is split one part
// per line; everything else stays on one line.
const WIDTH = 60;

type Item = { text: string; gap: boolean; op: boolean } | { group: Item[]; closed: boolean; gap: boolean };

const isGroup = (i: Item): i is Extract<Item, { group: Item[] }> => "group" in i;

function build(text: string): Item[] {
  const root: Item[] = [];
  const stack: Extract<Item, { group: Item[] }>[] = [];
  const current = () => (stack.length ? stack[stack.length - 1]!.group : root);
  let gap = false;
  for (const s of highlightQuery(text)) {
    if (s.kind === "space") {
      gap = true;
      continue;
    }
    const first = current().length === 0;
    if (s.text === "(" && s.kind === "paren") {
      const g = { group: [] as Item[], closed: false, gap: gap && !first };
      current().push(g);
      stack.push(g);
    } else if (s.text === ")" && s.kind === "paren" && stack.length) {
      stack.pop()!.closed = true;
    } else {
      current().push({ text: s.text, gap: gap && !first, op: s.kind === "and" || s.kind === "or" });
    }
    gap = false;
  }
  return root;
}

function inline(items: Item[]): string {
  return items
    .map((it, i) => {
      const lead = it.gap && i > 0 ? " " : "";
      return lead + (isGroup(it) ? `(${inline(it.group)}${it.closed ? ")" : ""}` : it.text);
    })
    .join("");
}

// A list of plain words, phrases and operators with no brackets inside: long synonym lists are read as
// one run, so they are left to wrap rather than put one word per line.
const isFlat = (items: Item[]) => items.every((i) => !isGroup(i));

function clauses(items: Item[]): Item[][] {
  const out: Item[][] = [[]];
  items.forEach((it, i) => {
    if (i > 0 && !isGroup(it) && it.op) out.push([]);
    out[out.length - 1]!.push(it);
  });
  return out;
}

function renderClause(items: Item[]): string {
  return items
    .map((it, i) => {
      const lead = it.gap && i > 0 ? " " : "";
      if (!isGroup(it)) return lead + it.text;
      const parts = clauses(it.group);
      const close = it.closed ? ")" : "";
      if (parts.length < 2 || isFlat(it.group) || inline([it]).length <= WIDTH) return `${lead}(${parts.map(renderClause).join(" ")}${close}`;
      const body = parts.map(renderClause).join("\n").split("\n").map((l) => "  " + l).join("\n");
      return `${lead}(\n${body}\n${close}`;
    })
    .join("");
}

export function formatQuery(text: string): string {
  const items = build(text);
  const parts = clauses(items);
  if (parts.length < 2 || isFlat(items) || inline(items).length <= WIDTH) return parts.map(renderClause).join(" ");
  return parts.map(renderClause).join("\n");
}
