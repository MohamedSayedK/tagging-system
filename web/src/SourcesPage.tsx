import { useState } from "react";
import { SourceStatus } from "./api";
import { countryName, languageName, sourceTypeName } from "./names";
import { intervalText, relativeTime } from "./timeText";

// Failing sources have their own tab, so a long list of them never buries the working ones.
type Tab = "working" | "failing";
type Filter = "all" | "ok" | "pending";
const PAGE_SIZE = 50;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "ok", label: "Healthy" },
  { id: "pending", label: "Waiting" },
];

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
  const [tab, setTab] = useState<Tab>("working");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const needle = search.trim().toLowerCase();

  const failing = sources.filter((s) => s.status === "failing");
  const working = sources.filter((s) => s.status !== "failing");
  const count = (f: Filter) => (f === "all" ? working.length : working.filter((s) => s.status === f).length);
  const shown = (tab === "failing" ? failing : working)
    .filter((s) => (tab === "failing" || filter === "all" || s.status === filter) && matches(s, needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pageCount = Math.ceil(shown.length / PAGE_SIZE);
  const first = Math.min(page, Math.max(pageCount - 1, 0)) * PAGE_SIZE;
  const visible = shown.slice(first, first + PAGE_SIZE);
  // Any change to what is listed starts again at its first page.
  const show = (change: () => void) => {
    change();
    setPage(0);
  };
  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: "working", label: "Working", n: working.length },
    { id: "failing", label: "Failing", n: failing.length },
  ];

  return (
    <section aria-label="Sources overview" className="sources-page">
      <header className="sources-head">
        <h2>Sources</h2>
        <p>
          {sources.length} {sources.length === 1 ? "source" : "sources"} · {failing.length} failing
        </p>
      </header>

      <div role="tablist" aria-label="Source lists" className="source-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`sources-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="sources-panel"
            data-tab={t.id}
            onClick={() => show(() => setTab(t.id))}
          >
            {t.label} <span className="n">{t.n}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id="sources-panel" aria-labelledby={`sources-tab-${tab}`}>
        <div className="sources-tools">
          <input
            type="search"
            aria-label="Search sources"
            placeholder="Search sources"
            value={search}
            onChange={(e) => show(() => setSearch(e.target.value))}
          />
          {tab === "working" && (
            <div className="segmented" role="group" aria-label="Show sources">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => show(() => setFilter(f.id))}>
                  {f.label} <span className="n">{count(f.id)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="empty">
            <p>{needle ? `No sources match “${search.trim()}”.` : tab === "failing" ? "Nothing is failing." : "No sources in this view."}</p>
            {(needle || filter !== "all") && (
              <button
                type="button"
                onClick={() =>
                  show(() => {
                    setSearch("");
                    setFilter("all");
                  })
                }
              >
                Show all sources
              </button>
            )}
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
                {visible.map((s) => (
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
        {pageCount > 1 && (
          <nav aria-label="Source pages" className="pager">
            <button type="button" aria-label="Previous page" disabled={first === 0} onClick={() => setPage(first / PAGE_SIZE - 1)}>
              ‹ Previous
            </button>
            <span>
              {first + 1}–{first + visible.length} of {shown.length}
            </span>
            <button type="button" aria-label="Next page" disabled={first + PAGE_SIZE >= shown.length} onClick={() => setPage(first / PAGE_SIZE + 1)}>
              Next ›
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}