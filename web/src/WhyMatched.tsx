import { Explanation } from "./api";
import { ErrorNotice, Loading } from "./Notices";
import { useRemote } from "./useRemote";

// More alternatives than this are folded to the ones that matched: a synonym list can run to dozens.
const FOLD_AFTER = 6;

function Clause({ node }: { node: Explanation }) {
  const leaves = node.children.length > FOLD_AFTER && node.children.every((c) => c.children.length === 0);
  const status = node.matched ? "matched: " : "not matched: ";
  const mark = (
    <>
      <span className="why-mark" aria-hidden="true">
        {node.matched ? "✓" : "–"}
      </span>
      <span className="visually-hidden">{status}</span>
    </>
  );

  if (leaves) {
    const hit = node.children.filter((c) => c.matched);
    const miss = node.children.filter((c) => !c.matched);
    return (
      <li className="why-clause" data-matched={node.matched}>
        {mark}
        <span>
          {node.children.length} alternatives, {hit.length} matched
        </span>
        <ul>
          {hit.map((c) => (
            <Clause key={c.label} node={c} />
          ))}
        </ul>
        {miss.length > 0 && (
          <details>
            <summary>Show the {miss.length} that did not match</summary>
            <ul>
              {miss.map((c) => (
                <Clause key={c.label} node={c} />
              ))}
            </ul>
          </details>
        )}
      </li>
    );
  }

  return (
    <li className="why-clause" data-matched={node.matched}>
      {mark}
      <code dir="ltr">{node.label}</code>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c, i) => (
            <Clause key={`${i}-${c.label}`} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Which clauses of the topic's query matched one article, for "why is this result here?". */
export function WhyMatched({ load }: { load: () => Promise<Explanation> }) {
  const got = useRemote(load, []);
  if (got.status === "error") return <ErrorNotice title="Couldn’t explain this result." reason={got.error} onRetry={got.retry} />;
  if (got.status !== "ready") return <Loading>Checking the query against this article…</Loading>;
  const root = got.data;
  return (
    <section className="why" role="region" aria-label="Why this matched">
      <p>
        {root.matched ? "This article is a result because the query matches it." : "The query as a whole does not match this article."}
        {root.excluded && " It is taken out again by the topic’s exclude query."}
      </p>
      <ul>
        <Clause node={root} />
      </ul>
    </section>
  );
}