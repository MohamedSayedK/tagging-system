import { FacetName, Facets } from "./api";
import { activePreset, PRESETS, presetRange } from "./dateRange";
import { FACET_SECTIONS, facetLabel, hasActiveFacets } from "./facets";
import { facetValueLabel } from "./names";

export function FilterBar(props: {
  panelOpen: boolean;
  onTogglePanel: () => void;
  facets: Facets;
  onRemove: (facet: FacetName, value: string) => void;
  onClearAll: () => void;
  from: string;
  to: string;
  onRange: (from: string, to: string) => void;
  now: Date;
}) {
  const { panelOpen, onTogglePanel, facets, onRemove, onClearAll, from, to, onRange, now } = props;
  const current = activePreset(from, to, now);

  return (
    <section className="filter-bar" aria-label="Filter bar">
      <button type="button" className="filters-toggle" onClick={onTogglePanel} aria-expanded={panelOpen}>
        {panelOpen ? "Close Filters" : "Filters"}
      </button>

      <div className="active-filters">
        {hasActiveFacets(facets) ? (
          <>
            {FACET_SECTIONS.flatMap(({ facet }) =>
              facets[facet].map((value) => {
                const label = `${facetLabel(facet)}: ${facetValueLabel(facet, value)}`;
                return (
                  <span key={`${facet}:${value}`} className="chip" dir="auto">
                    {label}
                    <button type="button" aria-label={`Remove ${label}`} onClick={() => onRemove(facet, value)}>
                      ×
                    </button>
                  </span>
                );
              }),
            )}
            <button type="button" className="link" onClick={onClearAll}>
              Clear all filters
            </button>
          </>
        ) : (
          <span>No active filters.</span>
        )}
      </div>

      <div className="range">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={current === p}
            onClick={() => {
              const r = presetRange(p, now);
              onRange(r.from, r.to);
            }}
          >
            {p}
          </button>
        ))}
        <button type="button" aria-pressed={!from && !to} onClick={() => onRange("", "")}>
          All time
        </button>
        <label>
          From
          <input type="date" value={from} onChange={(e) => onRange(e.target.value, to)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => onRange(from, e.target.value)} />
        </label>
      </div>
    </section>
  );
}

