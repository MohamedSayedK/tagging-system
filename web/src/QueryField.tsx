import { useEffect, useId, useState } from "react";
import { QueryCheck, validateQuery } from "./api";

const DEBOUNCE_MS = 250;

export function useQueryCheck(query: string): QueryCheck | "checking" | "empty" {
  const [state, setState] = useState<QueryCheck | "checking" | "empty">("empty");

  useEffect(() => {
    if (!query.trim()) return setState("empty");
    setState("checking");
    let stale = false;
    const t = setTimeout(() => {
      validateQuery(query).then((r) => !stale && setState(r));
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [query]);

  return state;
}

export function QueryField(props: { label: string; value: string; onChange: (v: string) => void; check: ReturnType<typeof useQueryCheck> }) {
  const { label, value, onChange, check } = props;
  const text =
    check === "checking" ? "Checking query…" : check === "empty" ? "" : check.ok ? "Query is valid" : check.message;
  const statusId = useId();
  return (
    <div>
      <label>
        {label}
        <textarea dir="auto" value={value} onChange={(e) => onChange(e.target.value)} rows={8} aria-describedby={statusId} />
      </label>
      <p id={statusId} role="status">
        {text}
      </p>
    </div>
  );
}
