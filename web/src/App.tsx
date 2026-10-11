import { Fragment, useState } from "react";
import { createTopic, deleteTopic, FacetName, Facets, listSources, listTopics, ResultsPage, Topic, topicFacet, topicResults, updateTopic } from "./api";
import { NO_FACETS } from "./facets";
import { ColorPicker } from "./ColorPicker";
import { ConfirmDialog } from "./ConfirmDialog";
import { FilterBar } from "./FilterBar";
import { FilterPanel } from "./FilterPanel";
import { ErrorNotice, Loading } from "./Notices";
import { QueryField, useQueryCheck } from "./QueryField";
import { ResultsChart } from "./ResultsChart";
import { Density, ResultsList } from "./ResultsList";
import { SourcesPage } from "./SourcesPage";
import { colorName } from "./topicColors";
import { useRemote } from "./useRemote";
import { Theme, useTheme } from "./useTheme";

const PAGE_SIZE = 25;

// Days are UTC; the end day is inclusive.
const range = (from: string, to: string) => ({
  ...(from && { from: `${from}T00:00:00.000Z` }),
  ...(to && { to: `${to}T23:59:59.999Z` }),
});

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

const DENSITY_KEY = "tagging.density";
function savedDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable"; // storage can be unavailable (private windows, blocked site data)
  }
}

export function App({ now = () => new Date() }: { now?: () => Date }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [exclude, setExclude] = useState("");
  const [color, setColor] = useState("");
  const [sort, setSort] = useState<"recent" | "oldest">("recent");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [facets, setFacets] = useState<Facets>(NO_FACETS);
  const [view, setView] = useState<"topics" | "sources">("topics");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState(true); // the topic form: open for a new topic, folded while reading one
  const [density, setDensityState] = useState<Density>(savedDensity);
  const [theme, setTheme] = useTheme();
  // The range that was active before a chart bar narrowed the view to one day; null when not drilled in.
  const [drilledFrom, setDrilledFrom] = useState<{ from: string; to: string } | null>(null);
  const [refresh, setRefresh] = useState(0); // bumped when a saved edit may change the results
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const queryCheck = useQueryCheck(query);
  const excludeCheck = useQueryCheck(exclude);

  const topicsLoad = useRemote(() => listTopics(), []);
  const topics: Topic[] = topicsLoad.data ?? [];
  const setTopics = (next: Topic[]) => topicsLoad.setData(next);

  // Tagged with its topic so one topic's results are never shown as another's while loading.
  const resultsLoad = useRemote(
    () =>
      selectedId
        ? topicResults(selectedId, { sort, size: PAGE_SIZE, ...range(from, to), ...facets }).then((page) => ({ topicId: selectedId, page }))
        : null,
    [selectedId, sort, from, to, facets, refresh],
  );
  const loaded = resultsLoad.data && resultsLoad.data.topicId === selectedId ? resultsLoad.data.page : null;
  const refreshing = resultsLoad.status === "loading" && loaded !== null;

  const sourcesLoad = useRemote(() => (view === "sources" ? listSources() : null), [view]);

  function setDensity(d: Density) {
    setDensityState(d);
    try {
      localStorage.setItem(DENSITY_KEY, d);
    } catch {
      /* remembering is a convenience */
    }
  }

  function toggleFacet(facet: FacetName, value: string) {
    setFacets((f) => ({
      ...f,
      [facet]: f[facet].includes(value) ? f[facet].filter((v) => v !== value) : [...f[facet], value],
    }));
  }

  function select(t: Topic) {
    setSelectedId(t.id);
    setFacets(NO_FACETS);
    setName(t.name);
    setQuery(t.query);
    setExclude(t.exclude ?? "");
    setColor(t.color ?? "");
    setEditing(false);
    setActionError(null);
    setMoreError(null);
  }

  function startNew() {
    setEditing(true);
    setSelectedId(null);
    setName("");
    setQuery("");
    setExclude("");
    setColor("");
    setActionError(null);
  }

  const excludeOk = excludeCheck === "empty" || (typeof excludeCheck === "object" && excludeCheck.ok);
  const canSave = name.trim() !== "" && typeof queryCheck === "object" && queryCheck.ok && excludeOk && !saving;

  async function save() {
    const draft = { name: name.trim(), query, ...(exclude.trim() && { exclude }), ...(color && { color }) };
    setSaving(true);
    setActionError(null);
    try {
      if (selectedId) {
        const updated = await updateTopic(selectedId, draft);
        setTopics(topics.map((t) => (t.id === updated.id ? updated : t)));
        setRefresh((n) => n + 1);
        setEditing(false);
      } else {
        const created = await createTopic(draft);
        setTopics([...topics, created]);
        setSelectedId(created.id);
        setEditing(false);
      }
    } catch (e) {
      setActionError(`Couldn't save the topic: ${reason(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selectedId) return;
    setActionError(null);
    setDeleting(true);
    try {
      await deleteTopic(selectedId);
      setTopics(topics.filter((t) => t.id !== selectedId));
      startNew();
    } catch (e) {
      setActionError(`Couldn't delete the topic: ${reason(e)}`);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function loadMore(page: ResultsPage) {
    if (!selectedId) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = await topicResults(selectedId, { sort, size: PAGE_SIZE, offset: page.results.length, ...range(from, to), ...facets });
      resultsLoad.setData({ topicId: selectedId, page: { ...page, total: next.total, results: [...page.results, ...next.results] } });
    } catch (e) {
      setMoreError(`Couldn't load more results: ${reason(e)}`);
    } finally {
      setLoadingMore(false);
    }
  }

  const selectedTopic = topics.find((t) => t.id === selectedId) ?? null;

  const toolbar = (
    <div className="results-tools">
      <label className="inline">
        Sort by
        <select value={sort} onChange={(e) => setSort(e.target.value as "recent" | "oldest")}>
          <option value="recent">Most recent</option>
          <option value="oldest">Oldest first</option>
        </select>
      </label>
      <div className="segmented" role="group" aria-label="Density">
        {(["comfortable", "compact"] as const).map((d) => (
          <button key={d} type="button" aria-pressed={density === d} onClick={() => setDensity(d)}>
            {d === "comfortable" ? "Comfortable" : "Compact"}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <header className="app-nav">
        <span className="brand">
          Tagging <b>System</b>
        </span>
        <button type="button" aria-pressed={view === "topics"} onClick={() => setView("topics")}>
          Topics
        </button>
        <button type="button" aria-pressed={view === "sources"} onClick={() => setView("sources")}>
          Sources
        </button>
        <div className="segmented theme-toggle" role="group" aria-label="Theme">
          {(["light", "dark", "auto"] as Theme[]).map((k) => (
            <button key={k} type="button" aria-pressed={theme === k} onClick={() => setTheme(k)}>
              {k === "light" ? "Light" : k === "dark" ? "Dark" : "Auto"}
            </button>
          ))}
        </div>
      </header>
      {confirmingDelete && selectedId && (
        <ConfirmDialog
          title={`Delete “${name}”?`}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          cancelLabel="Keep topic"
          busy={deleting}
          onConfirm={remove}
          onCancel={() => setConfirmingDelete(false)}
        >
          <p>This removes the topic and its saved query. The articles themselves are not affected. This can't be undone.</p>
        </ConfirmDialog>
      )}
      {view === "sources" ? (
        sourcesLoad.status === "error" ? (
          <ErrorNotice title="Couldn't load the sources." reason={sourcesLoad.error} onRetry={sourcesLoad.retry} />
        ) : sourcesLoad.data ? (
          <SourcesPage sources={sourcesLoad.data} now={now()} />
        ) : (
          <Loading>Loading sources…</Loading>
        )
      ) : (
        <>
          <FilterBar
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((o) => !o)}
            facets={facets}
            onRemove={toggleFacet}
            onClearAll={() => setFacets(NO_FACETS)}
            from={from}
            to={to}
            onRange={(f, t) => {
              setDrilledFrom(null);
              setFrom(f);
              setTo(t);
            }}
            now={now()}
          />
          <div className="shell">
            <div className="rail">
              <nav aria-label="Topics">
                <button type="button" className="primary" onClick={startNew}>
                  New topic
                </button>
                {topicsLoad.status === "loading" && topics.length === 0 && <Loading>Loading topics…</Loading>}
                {topicsLoad.status === "error" && (
                  <ErrorNotice title="Couldn't load the topics." reason={topicsLoad.error} onRetry={topicsLoad.retry} />
                )}
                {topics.map((t) => (
                  <Fragment key={t.id}>
                    <button
                      type="button"
                      dir="auto"
                      aria-pressed={t.id === selectedId}
                      aria-describedby={t.color ? `topic-color-${t.id}` : undefined}
                      onClick={() => select(t)}
                    >
                      {t.color && <span className="topic-dot" style={{ background: t.color }} aria-hidden="true" />}
                      {t.name}
                    </button>
                    {t.color && (
                      <span id={`topic-color-${t.id}`} className="visually-hidden">
                        Color: {colorName(t.color)}
                      </span>
                    )}
                  </Fragment>                ))}
              </nav>
              {panelOpen && (
                <FilterPanel
                  aggregations={loaded?.aggregations ?? null}
                  selected={facets}
                  onToggle={toggleFacet}
                  loadFacet={(facet, q, size) =>
                    selectedId ? topicFacet(selectedId, facet, { q, size, ...range(from, to), ...facets }) : Promise.resolve([])
                  }
                  scopeKey={JSON.stringify([selectedId, from, to, facets, refresh])}
                />
              )}
            </div>
            <main>
              <section aria-label="Topic editor" className="topic">
                <header className="topic-head">
                  <div>
                    <div className="topic-title">
                      {selectedTopic?.color && (
                        <span className="topic-dot big" data-testid="topic-color" data-color={selectedTopic.color} style={{ background: selectedTopic.color }} aria-hidden="true" />
                      )}
                      <h1 dir="auto">{selectedTopic?.name ?? "New topic"}</h1>
                    </div>
                    {selectedTopic && (
                      <p className="topic-query">
                        <code dir="auto">{selectedTopic.query}</code>
                        {selectedTopic.exclude && <span> · excluding <code dir="auto">{selectedTopic.exclude}</code></span>}
                      </p>
                    )}
                  </div>
                  <div className="topic-actions">
                    <button type="button" aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
                      Edit topic
                    </button>
                    {selectedId && (
                      <button type="button" className="quiet" onClick={() => setConfirmingDelete(true)}>
                        Delete topic
                      </button>
                    )}
                  </div>
                </header>
                <div className="editor-form" data-open={editing}>
                  <label>
                    Topic name
                    <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <QueryField label="Topic query" value={query} onChange={setQuery} check={queryCheck} />
                  <QueryField label="Exclude from topic" value={exclude} onChange={setExclude} check={excludeCheck} />
                  <ColorPicker value={color} onChange={setColor} />
                  <button type="button" className="primary save" disabled={!canSave} onClick={save}>
                    {saving ? "Saving…" : "Save topic"}
                  </button>
                </div>
                {actionError && <ErrorNotice title={actionError} />}
              </section>
              {selectedId && resultsLoad.status === "error" && (
                <ErrorNotice title="Couldn't load the results." reason={resultsLoad.error} onRetry={resultsLoad.retry} />
              )}
              {selectedId && resultsLoad.status === "loading" && !loaded && <Loading>Loading results…</Loading>}
              {loaded && resultsLoad.status !== "error" && (
                <div className="results-area" aria-busy={refreshing}>
                  {refreshing && <Loading>Updating results…</Loading>}
                  {drilledFrom && (
                    <button
                      type="button"
                      className="back"
                      onClick={() => {
                        setFrom(drilledFrom.from);
                        setTo(drilledFrom.to);
                        setDrilledFrom(null);
                      }}
                    >
                      Back to full view
                    </button>
                  )}
                  <ResultsChart
                    buckets={loaded.aggregations?.overTime ?? []}
                    interval={loaded.aggregations?.interval ?? "day"}
                    onSelectRange={(f, t) => {
                      setDrilledFrom((prev) => prev ?? { from, to });
                      setFrom(f);
                      setTo(t);
                    }}
                  />
                  <ResultsList total={loaded.total} results={loaded.results} density={density} now={now()} toolbar={toolbar} />
                  {moreError && <ErrorNotice title={moreError} />}
                  {loaded.results.length < loaded.total && (
                    <button type="button" className="more" disabled={loadingMore} onClick={() => loadMore(loaded)}>
                      {loadingMore ? "Loading…" : "Load more"}
                    </button>
                  )}
                </div>
              )}
            </main>
          </div>
        </>
      )}
    </>
  );
}