import { KeyboardEvent, ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { QueryCheck, validateQuery } from "./api";
import { applySuggestion, suggest } from "./queryComplete";
import { formatQuery } from "./queryFormat";
import { highlightQuery, matchBracket } from "./queryHighlight";

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

// The coloured copy of the query that sits behind the (transparent-text) textarea. One block per
// line. Left-to-right throughout: the operators are Latin and the structure must not flip on Arabic lines.
function ColouredQuery({ value, caret }: { value: string; caret: number | null }) {
  const match = caret === null ? null : matchBracket(value, caret);
  const paired = match && match.open !== null && match.close !== null ? [match.open, match.close] : [];
  const lines: ReactNode[][] = [[]];
  for (const s of highlightQuery(value)) {
    s.text.split("\n").forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (!piece) return;
      const key = `${s.start}-${i}`;
      lines[lines.length - 1]!.push(
        s.kind === "space" ? (
          piece
        ) : (
          <span
            key={key}
            data-token={s.kind}
            data-start={s.kind === "paren" ? s.start : undefined}
            data-depth={s.depth === undefined ? undefined : s.depth % 4}
            data-unmatched={s.kind === "paren" ? String(!!s.unmatched) : undefined}
            data-match={s.kind === "paren" && paired.includes(s.start) ? "true" : undefined}
          >
            {piece}
          </span>
        ),
      );
    });
  }
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} dir="ltr">
          {line.length ? line : "​"}
        </div>
      ))}
    </>
  );
}

// Read-only, laid out and coloured, for showing a saved query.
export function QueryView({ query }: { query: string }) {
  return (
    <code className="query-code" dir="ltr">
      <ColouredQuery value={formatQuery(query)} caret={null} />
    </code>
  );
}

export function QueryField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  check: ReturnType<typeof useQueryCheck>;
  /** Offer a "Format query" button that lays the text out one clause per line. */
  formattable?: boolean;
}) {
  const { label, value, onChange, check, formattable } = props;
  const text =
    check === "checking" ? "Checking query…" : check === "empty" ? "" : check.ok ? "Query is valid" : check.message;
  const statusId = useId();
  const [caret, setCaret] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null); // offset of the bracket under the pointer
  const backdrop = useRef<HTMLDivElement>(null);
  // The textarea sits on top and takes the pointer, so find the bracket by where the pointer is
  // relative to the coloured copy's brackets.
  const bracketUnder = (x: number, y: number): number | null => {
    for (const el of backdrop.current?.querySelectorAll("[data-token='paren']") ?? []) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return Number(el.getAttribute("data-start"));
    }
    return null;
  };
  const readCaret = (el: HTMLTextAreaElement) => setCaret(el.selectionStart === el.selectionEnd ? el.selectionStart : null);

  // Completion: suggestions for the word before the caret. Escape hides them until the text changes.
  const labelId = useId();
  const listId = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [active, setActive] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const completion = caret !== null && dismissedFor !== value ? suggest(value, caret) : null;
  const itemsKey = completion ? completion.items.map((i) => i.label).join("|") : "";
  useEffect(() => setActive(0), [itemsKey]);
  useLayoutEffect(() => {
    if (pendingCaret.current !== null && field.current) {
      field.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });
  const accept = (index: number) => {
    if (!completion) return;
    const done = applySuggestion(value, completion, completion.items[index]!);
    pendingCaret.current = done.caret;
    setCaret(done.caret);
    onChange(done.text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!completion) return;
    const n = completion.items.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      accept(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDismissedFor(value);
    }
  };
  return (
    <div>
      <label>
        <span id={labelId}>{label}</span>
        <span className="query-box">
          <div className="query-view" aria-hidden="true" ref={backdrop}>
            <ColouredQuery value={value} caret={hover !== null ? hover + 1 : caret} />
          </div>
          <textarea
            ref={field}
            dir="ltr"
            onKeyDown={onKeyDown}
            aria-labelledby={labelId}
            aria-autocomplete="list"
            aria-expanded={!!completion}
            aria-controls={completion ? listId : undefined}
            aria-activedescendant={completion ? `${listId}-${active}` : undefined}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              readCaret(e.target);
            }}
            onSelect={(e) => readCaret(e.currentTarget)}
            onKeyUp={(e) => readCaret(e.currentTarget)}
            onClick={(e) => readCaret(e.currentTarget)}
            onBlur={() => setCaret(null)}
            onMouseMove={(e) => setHover(bracketUnder(e.clientX, e.clientY))}
            onMouseLeave={() => setHover(null)}
            onScroll={(e) => {
              if (backdrop.current) backdrop.current.scrollTop = e.currentTarget.scrollTop;
            }}
            rows={8}
            aria-describedby={statusId}
            spellCheck={false}
          />
          {completion && (
            // mousedown is held back so the textarea keeps focus (and the suggestions) while one is picked
            <ul id={listId} role="listbox" aria-label="Suggestions" className="query-suggest" onMouseDown={(e) => e.preventDefault()}>
              {completion.items.map((s, i) => (
                <li key={s.label} id={`${listId}-${i}`} role="option" aria-selected={i === active} onClick={() => accept(i)}>
                  <code>{s.label}</code>
                  {s.detail && <span>{s.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </span>
      </label>
      <p id={statusId} role="status">
        {text}
      </p>
      {formattable && (
        <button type="button" className="format-query" disabled={!value.trim()} onClick={() => onChange(formatQuery(value))}>
          Format query
        </button>
      )}
    </div>
  );
}

