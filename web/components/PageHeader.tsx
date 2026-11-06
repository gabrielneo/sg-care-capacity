import type { ReactNode } from "react";

export function PageHeader({ title, intro }: { title: string; intro?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
      {intro ? <div className="mt-2 max-w-prose text-muted">{intro}</div> : null}
    </header>
  );
}
