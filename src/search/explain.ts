import { compileQuery, explainTree, parse, type ExplainNode } from "../query/index.js";
import { client, INDEX } from "./index-def.js";

export interface MatchExplanation {
  kind: ExplainNode["kind"];
  label: string;
  /** Does this clause alone match the article? A NOT clause matches when the article lacks what it names. */
  matched: boolean;
  children: MatchExplanation[];
}

/** The top clause, plus whether the topic's exclude query takes the article out again. */
export type ArticleExplanation = MatchExplanation & { excluded?: boolean };

/**
 * Which clauses of a query match one article: every clause is run on its own against that article only, in a
 * single multi-search. The top node is the whole query, so `matched` there says whether the article is a result.
 */
export async function explainMatch(p: { query: string; id: string; exclude?: string }): Promise<ArticleExplanation> {
  const tree = explainTree(parse(p.query));
  const nodes: ExplainNode[] = [];
  const collect = (n: ExplainNode) => (nodes.push(n), n.children.forEach(collect));
  collect(tree);

  const tests = nodes.map((n) => n.dsl);
  if (p.exclude?.trim()) tests.push(compileQuery(p.exclude));
  const res = await client.msearch({
    body: tests.flatMap((dsl) => [
      { index: INDEX },
      { size: 0, track_total_hits: true, query: { bool: { filter: [{ ids: { values: [p.id] } }, dsl] } } },
    ]) as never,
  });
  const matched = new Map<ExplainNode, boolean>();
  const responses = (res.body as any).responses as any[];
  responses.forEach((r, i) => {
    if (r.error) throw new Error(`clause "${nodes[i]?.label ?? "exclude"}" could not be tested: ${r.error.reason ?? r.error.type}`);
    if (i < nodes.length) matched.set(nodes[i]!, r.hits.total.value > 0);
  });
  const excluded = tests.length > nodes.length ? responses[nodes.length].hits.total.value > 0 : undefined;

  const build = (n: ExplainNode): MatchExplanation => ({
    kind: n.kind,
    label: n.label,
    matched: matched.get(n)!,
    children: n.children.map(build),
  });
  return { ...build(tree), ...(excluded !== undefined && { excluded }) };
}