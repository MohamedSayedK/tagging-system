import { useCallback, useEffect, useRef, useState } from "react";

export type Remote<T> =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: T | null; error: null } // data kept from the previous load, if any
  | { status: "ready"; data: T; error: null }
  | { status: "error"; data: null; error: string };

/**
 * Loads `load()` whenever `deps` change (or `retry()` is called). `load` returning null means "nothing to
 * load yet". Answers to superseded loads are dropped. `setData` lets callers amend the loaded value.
 */
export function useRemote<T>(load: () => Promise<T> | null, deps: unknown[]) {
  const [state, setState] = useState<Remote<T>>({ status: "idle", data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const promise = loadRef.current();
    if (!promise) return setState({ status: "idle", data: null, error: null });
    let stale = false;
    setState((s) => ({ status: "loading", data: s.data, error: null }));
    promise.then(
      (data) => !stale && setState({ status: "ready", data, error: null }),
      (e: Error) => !stale && setState({ status: "error", data: null, error: e.message }),
    );
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const setData = useCallback((data: T) => setState({ status: "ready", data, error: null }), []);
  return { ...state, retry, setData };
}
