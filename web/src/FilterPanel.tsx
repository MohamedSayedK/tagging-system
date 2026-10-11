import { useEffect, useState } from "react";
import { Aggregations, Bucket, FacetName, Facets } from "./api";
import { FACET_SECTIONS } from "./facets";
import { ErrorNotice } from "./Notices";
import { facetValueLabel, isCoded } from "./names";

const SEARCH_DEBOUNCE_MS = 200;
// /search carries this many values per facet; a list this long may have more behind it.
const TOP_VALUES = 20;
const MORE_SIZE = 200;
const FOUND_SIZE = 50;
const ALL_SIZE = 500; // coded facets (countries, languages) are small enough to fetch whole and search by name

type ByFacet = Partial<Record<FacetName, Bucket[]>>;

export function FilterPanel(props: {
  aggregations: Aggregations | null;
  selected: Facets;
  onToggle: (facet: FacetName, value: string) => void;
  /** Fetch the values of one facet under the current topic, range and filters. */
  loadFacet: (facet: FacetName, q: string, size: number) => Promise<Bucket[]>;
  /** Changes whenever loaded values go stale (topic, range, filters). */
  scopeKey: string;
}) {
  const { aggregations, selected, onToggle, loadFacet, scopeKey } = props;
  const [expanded, setExpanded] = useState<Set<FacetName>>(new Set());
  const [search, setSearch] = useState("");
  const [more, setMore] = useState<ByFacet>({});
  const [found, setFound] = useState<ByFacet>({});
  const [busy, setBusy] = useState<Partial<Record<FacetName, boolean>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const needle = search.trim().toLowerCase();

  useEffect(() => {
    setMore({});
    setProblem(null);
  }, [scopeKey]);

  useEffect(() => {
    setFound({});
    setProblem(null);
    if (!needle) return;
    let stale = false;
    const t = setTimeout(async () => {
      try {
      const entries = await Promise.all(
        FACET_SECTIONS.filter((s) => !s.label.toLowerCase().includes(needle)).map(async (s) => {
          if (!isCoded(s.facet)) return [s.facet, await loadFacet(s.facet, needle, FOUND_SIZE)] as const;
          // Codes are searched by their full name too, which the server doesn't know.
          const all = await loadFacet(s.facet, "", ALL_SIZE);
          return [
            s.facet,
            all.filter((b) => b.key.toLowerCase().includes(needle) || facetValueLabel(s.facet, b.key).toLowerCase().includes(needle)),
          ] as const;
        }),
      );
      if (!stale) setFound(Object.fromEntries(entries));
      } catch (e) {
        if (!stale) setProblem(`Couldn't search the filters: ${e instanceof Error ? e.message : e}`);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(t);
    };
    // loadFacet is recreated each render; scopeKey says when its results would differ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, scopeKey]);

  const toggleSection = (f: FacetName) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });

  return (
    <aside className="filter-panel" aria-label="Filters">
      <input
        type="search"
        aria-label="Search all filters"
        placeholder="Search all filters"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {!aggregations && <p className="hint">Select a topic to see its filters.</p>}
      {problem && <ErrorNotice title={problem} />}
      {aggregations &&
        FACET_SECTIONS.map(({ facet, label, options }) => {
          const top = options(aggregations);
          const labelMatches = label.toLowerCase().includes(needle);
          const full = more[facet];
          const shown = !needle || labelMatches ? (full ?? top) : (found[facet] ?? []);
          if (shown.length === 0) return null;
          const open = needle !== "" || expanded.has(facet);
          const canShowMore = !needle && full === undefined && top.length >= TOP_VALUES;
          return (
            <div key={facet} className="section">
              <button type="button" aria-expanded={open} onClick={() => toggleSection(facet)}>
                {label}
              </button>
              {open && (
                <fieldset>
                  <legend>{label}</legend>
                  {shown.map((o) => (
                    <label key={o.key}>
                      <input type="checkbox" checked={selected[facet].includes(o.key)} onChange={() => onToggle(facet, o.key)} />
                      <span dir="auto">{facetValueLabel(facet, o.key)}</span> <span className="count">({o.count})</span>
                    </label>
                  ))}
                  {canShowMore && (
                    <button
                      type="button"
                      className="show-more"
                      disabled={busy[facet]}
                      onClick={async () => {
                        setProblem(null);
                        setBusy((b) => ({ ...b, [facet]: true }));
                        try {
                          const all = await loadFacet(facet, "", MORE_SIZE);
                          setMore((m) => ({ ...m, [facet]: all }));
                        } catch (e) {
                          setProblem(`Couldn't load more values: ${e instanceof Error ? e.message : e}`);
                        } finally {
                          setBusy((b) => ({ ...b, [facet]: false }));
                        }
                      }}
                    >
                      {busy[facet] ? "Loading…" : "Show more"}
                    </button>
                  )}
                </fieldset>
              )}
            </div>
          );
        })}
    </aside>
  );
}

