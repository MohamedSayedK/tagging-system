import { Node, QuerySyntaxError } from "./ast.js";
import { lex, Token } from "./lexer.js";

// Precedence, loosest to tightest: OR < AND / NOT / implicit-AND < NEAR/n < unary NOT < field: < atom
// `A NOT B` means `A AND NOT B`. Adjacent operands are joined with AND.
export function parse(input: string): Node {
  const tokens = lex(input);
  if (tokens.length === 0) throw new QuerySyntaxError("Empty query");
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++]!;

  const startsOperand = (t: Token | undefined) =>
    !!t && (t.kind === "lparen" || t.kind === "word" || t.kind === "phrase" || t.kind === "field" || t.kind === "not");

  function parseOr(): Node {
    const kids = [parseAnd()];
    while (peek()?.kind === "or") { next(); kids.push(parseAnd()); }
    return kids.length === 1 ? kids[0]! : { type: "or", children: kids };
  }

  function parseAnd(): Node {
    const kids = [parseNear()];
    for (;;) {
      const t = peek();
      if (t?.kind === "and") { next(); kids.push(parseNear()); }
      else if (startsOperand(t)) kids.push(parseNear()); // implicit AND, incl. `A NOT B`
      else break;
    }
    return kids.length === 1 ? kids[0]! : { type: "and", children: kids };
  }

  function parseNear(): Node {
    let left = parseUnary();
    while (peek()?.kind === "near") {
      const op = next() as Extract<Token, { kind: "near" }>;
      const right = parseUnary();
      left = { type: "near", children: [left, right], distance: op.distance };
    }
    return left;
  }

  function parseUnary(): Node {
    if (peek()?.kind === "not") { next(); return { type: "not", child: parseUnary() }; }
    return parseAtom();
  }

  function parseAtom(): Node {
    const t = peek();
    if (!t) throw new QuerySyntaxError("Unexpected end of query");
    next();
    switch (t.kind) {
      case "lparen": {
        const inner = parseOr();
        if (peek()?.kind !== "rparen") throw new QuerySyntaxError("Missing closing parenthesis", t.pos);
        next();
        return inner;
      }
      case "word": return { type: "term", value: t.value };
      case "phrase": return { type: "phrase", value: t.value };
      case "field": return { type: "field", field: t.field, child: parseAtom() };
      default: throw new QuerySyntaxError(`Unexpected ${t.kind.toUpperCase()}`, t.pos);
    }
  }

  const ast = parseOr();
  const rest = peek();
  if (rest) throw new QuerySyntaxError(rest.kind === "rparen" ? "Unbalanced closing parenthesis" : `Unexpected ${rest.kind}`, rest.pos);
  return ast;
}
