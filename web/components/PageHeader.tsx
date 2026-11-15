import type { ReactNode } from "react";

export function PageHeader({ title, intro }: { title: ReactNode; intro?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="font-semibold tracking-tight text-ink text-h1">{title}</h1>
      {intro ? <div className="mt-2 max-w-prose text-muted">{intro}</div> : null}
    </header>
  );
}
