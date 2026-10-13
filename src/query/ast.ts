export type Node =
  | { type: "term"; value: string; boost?: number }
  | { type: "phrase"; value: string; slop?: number; boost?: number }
  | { type: "and"; children: Node[] }
  | { type: "or"; children: Node[] }
  | { type: "not"; child: Node }
  | { type: "near"; children: Node[]; distance: number; ordered?: boolean }
  | { type: "field"; field: string; child: Node }
  // `START/5:x`: x in the headline or the first 5 body words. `MULTIPLE/3:x`: at least 3 body occurrences of x.
  | { type: "start"; n: number; child: Node }
  | { type: "multiple"; n: number; child: Node }
  // `harvestDate:[a TO b]`: a date range on the stored `fetched` or `published` date; an absent side is open.
  | { type: "range"; field: "fetched" | "published"; from?: string; to?: string };

export class QuerySyntaxError extends Error {
  constructor(message: string, public pos?: number) {
    super(pos === undefined ? message : `${message} (at position ${pos})`);
  }
}
