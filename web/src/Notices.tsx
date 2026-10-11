export function Loading({ children }: { children: string }) {
  return (
    <p role="status" className="loading">
      {children}
    </p>
  );
}

export function ErrorNotice(props: { title: string; reason?: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="notice error">
      <strong>{props.title}</strong>
      {props.reason && <span> {props.reason}</span>}
      {props.onRetry && (
        <button type="button" onClick={props.onRetry}>
          {props.retryLabel ?? "Try again"}
        </button>
      )}
    </div>
  );
}
