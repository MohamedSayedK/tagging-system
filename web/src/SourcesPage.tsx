import { useState } from "react";
import { SourceStatus } from "./api";
import { countryName, languageName, sourceTypeName } from "./names";
import { intervalText, relativeTime } from "./timeText";

type Filter = "all" | "failing" | "ok" | "pending";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "failing", label: "Failing" },
  { id: "ok", label: "Healthy" },
  { id: "pending", label: "Waiting" },
];
const rank = (s: SourceStatus) => (s.status === "failing" ? 0 : 1);

const nextTry = (s: SourceStatus, now: Date) =>
  !s.nextRun ? "" : Date.parse(s.nextRun) <= now.getTime() ? "due now" : relativeTime(s.nextRun, now);

function matches(s: SourceStatus, needle: string): boolean {
  if (!needle) return true;
  const hay = [s.name, s.domain, s.country && countryName(s.country), s.lang && languageName(s.lang), sourceTypeName(s.sourcetype)];
  return hay.some((h) => h && h.toLowerCase().includes(needle));
}

function Status({ s }: { s: SourceStatus }) {
  const text =
    s.status === "pending" ? "Waiting for first run" : s.status === "ok" ? "Healthy" : `Failing · ${s.consecutiveFailures} in a row`;
  return (
    <span className="status-badge" data-status={s.status}>
      <i aria-hidden="true" />
      {text}
    </span>
  );
}

export function SourcesPage({ sources, now }: { sources: SourceStatus[]; now: Date }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();

  const count = (f: Filter) => (f === "all" ? sources.length : sources.filter((s) => s.status === f).length);
  const failing = sources.filter((s) => s.status === "failing");
  const shown = sources
    .filter((s) => (filter === "all" || s.status === filter) && matches(s, needle))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  return (
    <section aria-label="Sources overview" className="sources-page">
      <header className="sources-head">
        <h2>Sources</h2>
        <p>
          {sources.length} {sources.length === 1 ? "source" : "sources"} · {failing.length} failing
        </p>
      </header>

      {failing.length > 0 && (
        <section role="region" aria-label="Needs attention" className="attention">
          <h3>Needs attention</h3>
          <ul>
            {failing.map((s) => (
              <li key={s.name}>
                <strong dir="auto">{s.name}</strong>
                <span>
                  failed {s.consecutiveFailures} {s.consecutiveFailures === 1 ? "time" : "times"} in a row
                  {s.nextRun && ` · next try ${nextTry(s, now)}`}
                </span>
                {s.error && <code>{s.error}</code>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sources-tools">
        <input
          type="search"
          aria-label="Search sources"
          placeholder="Search sources"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="segmented" role="group" aria-label="Show sources">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <span className="n">{count(f.id)}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <p>{needle ? `No sources match “${search.trim()}”.` : "No sources in this view."}</p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
          >
            Show all sources
          </button>
        </div>
      ) : (
        <div className="sources-table-wrap">
          <table aria-label="Sources">
            <thead>
              <tr>
                <th>Source</th>
                <th>Status</th>
                <th>Coverage</th>
                <th>Schedule</th>
                <th>Last run</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.name} className={s.status}>
                  <td dir="auto" className="name">
                    {s.name}
                    {s.origin === "registry" && <small className="cov muted">From registry</small>}
                  </td>
                  <td>
                    <Status s={s} />
                    {s.status === "failing" && s.error && <small className="error">{s.error}</small>}
                  </td>
                  <td>
                    <span className="cov domain">{s.domain}</span>
                    <span className="cov">{sourceTypeName(s.sourcetype)}</span>
                    <span className="cov">{s.country ? countryName(s.country) : "—"}</span>
                    <span className="cov">{s.lang ? languageName(s.lang) : "—"}</span>
                  </td>
                  <td>
                    <span className="cov">{intervalText(s.intervalMs)}</span>
                    <span className="cov muted">{s.nextRun ? (Date.parse(s.nextRun) <= now.getTime() ? "due now" : relativeTime(s.nextRun, now)) : "—"}</span>
                  </td>
                  <td>
                    <span className="cov">{s.lastRun ? relativeTime(s.lastRun, now) : "—"}</span>
                    <span className="cov muted">{s.status === "pending" || s.indexed === undefined ? "—" : `${s.indexed} new of ${s.found}`}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}