import { useEffect, useRef, useState } from "react";
import { listRegistry, RegistryRecord } from "./api";
import { countryName, languageName } from "./names";
import { ErrorNotice, Loading } from "./Notices";
import { relativeTime } from "./timeText";
import { useRemote } from "./useRemote";

const CRAWL_LABEL: Record<string, string> = {
  active: "Crawled",
  no_feed: "No usable feed",
  unreachable: "Unreachable",
  blocked: "Blocks crawlers",
};

const LANGUAGES = [
  { code: "", label: "All" },
  { code: "ar", label: "Arabic" },
  { code: "en", label: "English" },
];

export function RegistryPage({ now }: { now: Date }) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState(""); // `search` once typing pauses, so each keystroke is not a request
  const [lang, setLang] = useState("");
  const [hideAggregators, setHideAggregators] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useRemote(() => listRegistry({ q, lang, hideAggregators }), [q, lang, hideAggregators]);
  const [more, setMore] = useState<RegistryRecord[]>([]); // pages after the first, for the current filters
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const filtersKey = useRef("");
  filtersKey.current = `${q}|${lang}|${hideAggregators}`;

  useEffect(() => {
    setMore([]);
    setMoreError(null);
  }, [q, lang, hideAggregators]);

  if (load.status === "error") return <ErrorNotice title="Couldn't load the registry." reason={load.error} onRetry={load.retry} />;
  if (!load.data) return <Loading>Loading the registry…</Loading>;
  const { total } = load.data;
  const items = [...load.data.items, ...more];

  async function showMore() {
    const key = filtersKey.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await listRegistry({ q, lang, hideAggregators, from: items.length });
      if (key === filtersKey.current) setMore((m) => [...m, ...page.items]);
    } catch (e) {
      setMoreError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }
  const filtered = q !== "" || lang !== "" || hideAggregators;
  const count = total.toLocaleString("en");
  const summary = filtered
    ? `${count} ${total === 1 ? "domain matches" : "domains match"}`
    : `${count} ${total === 1 ? "domain" : "domains"} known`;

  return (
    <section aria-label="Registry overview" className="sources-page">
      <header className="sources-head">
        <h2>Registry</h2>
        <p>{summary}</p>
      </header>

      <div className="sources-tools">
        <input
          type="search"
          aria-label="Search domains"
          placeholder="Search domains"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="segmented" role="group" aria-label="Show domains in">
          {LANGUAGES.map((l) => (
            <button key={l.code} type="button" aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>
              {l.label}
            </button>
          ))}
        </div>
        <label className="dedupe">
          <input type="checkbox" checked={hideAggregators} onChange={(e) => setHideAggregators(e.target.checked)} />
          Hide aggregators
        </label>
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <p>{q ? `No domains match “${q}”.` : "No domains in this view."}</p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setQ("");
              setLang("");
              setHideAggregators(false);
            }}
          >
            Show all domains
          </button>
        </div>
      ) : (
        <div className="sources-table-wrap">
          <table aria-label="Known domains">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Languages</th>
                <th>Articles seen</th>
                <th>Last seen</th>
                <th>Crawling</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.domain}>
                  <td className="name">
                    {r.domain}
                    {(r.country || r.aggregator) && (
                      <small className="cov muted">
                        {r.country && <span>{countryName(r.country)}</span>}
                        {r.country && r.aggregator && " · "}
                        {r.aggregator && <span>Aggregator</span>}
                      </small>
                    )}
                  </td>
                  <td>
                    <span className="cov">{r.languages.map(languageName).join(", ")}</span>
                  </td>
                  <td>
                    <span className="cov">{r.articleCount}</span>
                  </td>
                  <td>
                    <span className="cov">{relativeTime(r.lastSeen, now)}</span>
                  </td>
                  <td>
                    <span className="status-badge" data-status={r.crawl?.status === "active" ? "ok" : r.crawl ? "failing" : "pending"}>
                      <i aria-hidden="true" />
                      {r.crawl ? CRAWL_LABEL[r.crawl.status] ?? r.crawl.status : "Not tried yet"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 && (
        <footer className="sources-more">
          <p>
            Showing {items.length.toLocaleString("en")} of {count}
          </p>
          {moreError && <ErrorNotice title="Couldn't load more domains." reason={moreError} onRetry={showMore} />}
          {items.length < total && !moreError && (
            <button type="button" onClick={showMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          )}
        </footer>
      )}
    </section>
  );
}
