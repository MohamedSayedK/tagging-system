export type Node =
  | { type: "term"; value: string }
  | { type: "phrase"; value: string; slop?: number }
  | { type: "and"; children: Node[] }
  | { type: "or"; children: Node[] }
  | { type: "not"; child: Node }
  | { type: "near"; children: Node[]; distance: number; ordered?: boolean }
  | { type: "field"; field: string; child: Node };

export class QuerySyntaxError extends Error {
  constructor(message: string, public pos?: number) {
    super(pos === undefined ? message : `${message} (at position ${pos})`);
  }
}
