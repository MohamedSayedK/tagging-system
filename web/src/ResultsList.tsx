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

// Arabic text is set larger than Latin: a script test on the text itself, not on the outlet's language setting.
const arabic = (s: string) => /[\u0600-\u06FF]/.test(s);

export function ResultsList({ total, results, density, now, toolbar, ranked = false, explain }: { total: number; results: Result[]; density: Density; now: Date; toolbar?: ReactNode; ranked?: boolean; /** Loads the clause-by-clause reason one result matched; omitted where there is no topic to explain against. */ explain?: (articleId: string) => Promise<Explanation> }) {
  const [explained, setExplained] = useState<string | null>(null);
  let position = 0; // the cutting number: where the clipping sits in the list, in the order the server gave
  return (
    <section aria-label="Results" className="cuttings">
      <header className="listhead">
        <h2>{total} results</h2>
        {toolbar}
      </header>
      {byDay(results, ranked).map((g) => (
        <section key={g.day} role="group" aria-label={g.day === RANKED ? "Best matches first" : dayLabel(g.day)} className="day">
          <header className="dayhead">
            <span>{g.day === RANKED ? "Best matches first" : dayLabel(g.day)}</span>
            <span>{articlesCount(g.items.length)}</span>
          </header>
          <ul>
            {g.items.map((r) => {
              const isNew = now.getTime() - Date.parse(r.published) < NEW_WITHIN_MS && now.getTime() >= Date.parse(r.published);
              position += 1;
              return (
                <li key={r.id}>
                  <article className="cutting">
                    <div className="slip">
                      <b dir="auto">{r.source}</b>
                      <span>{r.domain}</span>
                      {r.sourcecountry && <span>{countryName(r.sourcecountry)}</span>}
                      {r.lang && <span>{languageName(r.lang)}</span>}
                      <span className="when">
                        {ranked && <span className="when-date">{dayLabel(r.published.slice(0, 10))} · </span>}
                        <time dateTime={r.published} data-testid="time">
                          {timeLabel(r.published)}
                        </time>
                      </span>
                      {isNew && <span className="new">New</span>}
                      <span className="no">Cutting № {position}</span>
                    </div>
                    <div className="body">
                      <h3>
                        <a href={r.url} dir="auto" target="_blank" rel="noreferrer" className="headline">
                          {r.title}
                          <OpenIcon />
                        </a>
                      </h3>
                      {density === "comfortable" && r.highlight?.body?.[0] && (
                        <p dir="auto" className={arabic(r.highlight.body[0]) ? "excerpt ar" : "excerpt"}>
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
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </section>
  );
}