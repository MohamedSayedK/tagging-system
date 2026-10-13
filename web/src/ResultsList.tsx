import { Fragment, ReactNode } from "react";
import { useState } from "react";
import { Explanation, Result } from "./api";
import { WhyMatched } from "./WhyMatched";
import { articlesCount, dayLabel, timeLabel } from "./dayFormat";
import { OpenIcon } from "./Icons";
import { countryName, languageName } from "./names";

export type Density = "comfortable" | "compact";
const NEW_WITHIN_MS = 60 * 60 * 1000;

// Highlights arrive as text with <em>…</em> around hits. Article text is untrusted, so never
// inject it as HTML: split on the tags and render everything as text nodes.
function Highlighted({ html }: { html: string }) {
  const parts = html.split(/(<em>.*?<\/em>)/gs);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("<em>") && p.endsWith("</em>") ? <mark key={i}>{p.slice(4, -5)}</mark> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

/** Consecutive results sharing a UTC day; the server's order (newest or oldest first) is kept. */
function byDay(results: Result[], ranked: boolean): { day: string; items: Result[] }[] {
  // Best match first: days interleave, so one group in the server's order instead of a heading per day.
  if (ranked) return [{ day: RANKED, items: results }];
  const groups: { day: string; items: Result[] }[] = [];
  for (const r of results) {
    const day = r.published.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(r);
    else groups.push({ day, items: [r] });
  }
  return groups;
}

const RANKED = "ranked";

export function ResultsList({ total, results, density, now, toolbar, ranked = false, explain }: { total: number; results: Result[]; density: Density; now: Date; toolbar?: ReactNode; ranked?: boolean; /** Loads the clause-by-clause reason one result matched; omitted where there is no topic to explain against. */ explain?: (articleId: string) => Promise<Explanation> }) {
  const [explained, setExplained] = useState<string | null>(null);
  return (
    <section aria-label="Results" className="rundown">
      <header className="rundown-head">
        <h2>{total} results</h2>
        {toolbar}
      </header>
      <div className="rundown-cols" aria-hidden="true">
        <span>Time</span>
        <span>Headline</span>
        <span>Source</span>
      </div>
      {byDay(results, ranked).map((g) => (
        <section key={g.day} role="group" aria-label={g.day === RANKED ? "Best matches first" : dayLabel(g.day)} className="rundown-day">
          <header className="rundown-day-head">
            <span>{g.day === RANKED ? "Best matches first" : dayLabel(g.day)}</span>
            <span>{articlesCount(g.items.length)}</span>
          </header>
          <ul>
            {g.items.map((r) => {
              const isNew = now.getTime() - Date.parse(r.published) < NEW_WITHIN_MS && now.getTime() >= Date.parse(r.published);
              return (
                <li key={r.id} className="rundown-row">
                  <div className="rundown-time">
                    {ranked && <span className="rundown-date">{dayLabel(r.published.slice(0, 10))}</span>}
                    <time dateTime={r.published} data-testid="time">
                      {timeLabel(r.published)}
                    </time>
                    {isNew && <span className="badge-new">New</span>}
                  </div>
                  <div className="rundown-main">
                    <a href={r.url} dir="auto" target="_blank" rel="noreferrer" className="headline">
                      {r.title}
                      <OpenIcon />
                    </a>
                    {density === "comfortable" && r.highlight?.body?.[0] && (
                      <p dir="auto" className="excerpt">
                        <Highlighted html={r.highlight.body[0]} />
                      </p>
                    )}
                    {explain && (
                      <>
                        <button
                          type="button"
                          className="link why-toggle"
                          aria-expanded={explained === r.id}
                          aria-label={`Why “${r.title}” matched`}
                          onClick={() => setExplained(explained === r.id ? null : r.id)}
                        >
                          Why this matched
                        </button>
                        {explained === r.id && <WhyMatched key={r.id} load={() => explain(r.id)} />}
                      </>
                    )}
                  </div>
                  <div className="rundown-source">
                    <strong dir="auto">{r.source}</strong>
                    <span>{r.domain}</span>
                    {(r.sourcecountry || r.lang) && (
                      <span>{[r.sourcecountry && countryName(r.sourcecountry), r.lang && languageName(r.lang)].filter(Boolean).join(" · ")}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}