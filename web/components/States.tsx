import type { ReactNode } from "react";

export function EmptyState({ title, message, action }: { title: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center">
      <p className="font-medium text-ink">{title}</p>
      {message ? <div className="mx-auto mt-1 max-w-prose text-sm text-muted">{message}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export interface ErrorInfo {
  code?: string;
  message: string;
}

/** Something failed. Says what, never shows a figure, and offers a way forward if one exists. */
export function ErrorState({
  title = "This data couldn't be loaded",
  error,
  action,
}: {
  title?: string;
  error: ErrorInfo | string;
  action?: ReactNode;
}) {
  const info = typeof error === "string" ? { message: error } : error;
  return (
    <div role="alert" className="rounded-lg border border-bad/30 bg-bad-soft px-4 py-4 text-bad">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm">
        {info.message}
        {info.code ? <span className="ml-1 font-mono text-xs">({info.code})</span> : null}
      </p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** Placeholder while data loads. Announced once to screen readers; motion only if allowed. */
export function Skeleton({ className = "h-4 w-full", label = "Loading" }: { className?: string; label?: string }) {
  return (
    <div role="status" aria-live="polite">
      <div aria-hidden="true" className={`rounded bg-map-none motion-safe:animate-pulse ${className}`} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ChartCardSkeleton({ title }: { title?: string }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4" aria-busy="true">
      {title ? <h2 className="text-base font-semibold">{title}</h2> : <Skeleton className="h-5 w-1/3" label="Loading chart" />}
      <div className="mt-4">
        <Skeleton className="h-48 w-full" label={title ? `Loading ${title}` : "Loading"} />
      </div>
      <div className="mt-4 h-4 w-2/3 rounded bg-map-none" aria-hidden="true" />
    </section>
  );
}
