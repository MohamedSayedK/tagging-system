import type { Node } from "./ast.js";

// Binding strength, loosest first: OR < AND < NEAR/PRE < NOT < a single word, phrase or bracketed group.
const LEVEL = { or: 0, and: 1, near: 2, not: 3, atom: 4 } as const;
const levelOf = (n: Node): number => (n.type === "or" ? 0 : n.type === "and" ? 1 : n.type === "near" ? 2 : n.type === "not" ? 3 : 4);

const DATE_FIELD = { fetched: "harvestDate", published: "publishedDate" } as const;

/** A query node written as query text again; it parses back to the same node. */
export function unparse(n: Node, parentLevel = -1): string {
  const text = body(n);
  return levelOf(n) < parentLevel ? `(${text})` : text;
}

function body(n: Node): string {
  switch (n.type) {
    case "term":
      return n.value + boost(n.boost);
    case "phrase":
      return `"${n.value}"` + (n.slop !== undefined ? `~${n.slop}` : "") + boost(n.boost);
    case "range":
      return `${DATE_FIELD[n.field]}:[${n.from ?? "*"} TO ${n.to ?? "*"}]`;
    case "field":
      return `${n.field}:${n.child.type === "term" || n.child.type === "phrase" ? unparse(n.child) : `(${unparse(n.child)})`}`;
    case "not":
      return `NOT ${n.child.type === "term" || n.child.type === "phrase" || n.child.type === "field" || n.child.type === "range" || n.child.type === "not" ? unparse(n.child) : `(${unparse(n.child)})`}`;
    case "or":
      return n.children.map((c) => unparse(c, LEVEL.or + 1)).join(" OR ");
    case "and":
      return n.children.map((c) => unparse(c, LEVEL.and + 1)).join(" AND ");
    case "near": {
      // Left-nested chains read left to right; a nested group on the right needs brackets.
      const [left, right] = n.children;
      const op = `${n.ordered ? "PRE" : "NEAR"}/${n.distance}`;
      return `${unparse(left!, LEVEL.near)} ${op} ${unparse(right!, LEVEL.near + 1)}`;
    }
  }
}

const boost = (b?: number) => (b === undefined ? "" : `^${b}`);