import { useState } from "react";
import { FacetName, Facets } from "./api";
import { activePreset, PRESETS, presetRange } from "./dateRange";
import { FACET_SECTIONS, facetLabel, hasActiveFacets } from "./facets";
import { facetValueLabel } from "./names";
import { SavedFilter } from "./savedFilters";

export function FilterBar(props: {
  facets: Facets;
  onRemove: (facet: FacetName, value: string) => void;
  onClearAll: () => void;
  from: string;
  to: string;
  onRange: (from: string, to: string) => void;
  now: Date;
  dedupe: boolean;
  onDedupe: (on: boolean) => void;
  saved: SavedFilter[];
  onSave: (name: string) => void;
  onApply: (s: SavedFilter) => void;
  onDeleteSaved: (id: string) => void;
}) {
  const { facets, onRemove, onClearAll, from, to, onRange, now, dedupe, onDedupe, saved, onSave, onApply, onDeleteSaved } = props;
  const current = activePreset(from, to, now);
  const canSave = hasActiveFacets(facets) || !!from || !!to || dedupe;
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const commit = () => {
    if (!name.trim()) return;
    onSave(name);
    setName("");
    setNaming(false);
  };

  return (
    <section className="filter-bar" aria-label="Filter bar">
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

      {import.meta.env.MODE !== "demo" && (
        <label className="dedupe">
          <input type="checkbox" checked={dedupe} onChange={(e) => onDedupe(e.target.checked)} />
          Remove duplicates
        </label>
      )}

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

      <div className="saved-filters" role="group" aria-label="Saved filters">
        {saved.map((s) => (
          <span key={s.id} className="chip saved" dir="auto">
            <button type="button" className="apply" aria-label={`Apply saved filters: ${s.name}`} onClick={() => onApply(s)}>
              {s.name}
            </button>
            <button type="button" aria-label={`Delete saved filters: ${s.name}`} onClick={() => onDeleteSaved(s.id)}>
              ×
            </button>
          </span>
        ))}
        {naming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <input aria-label="Name for these filters" value={name} dir="auto" autoFocus onChange={(e) => setName(e.target.value)} />
            <button type="submit" disabled={!name.trim()}>
              Save
            </button>
            <button type="button" className="link" onClick={() => setNaming(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="link" disabled={!canSave} onClick={() => setNaming(true)}>
            Save filters
          </button>
        )}
      </div>
    </section>
  );
}

