import { PageHeader } from "./PageHeader";
import { EmptyState } from "./States";

/** Placeholder for a page whose charts aren't built yet. */
export function ComingNext({ title, intro, planned }: { title: string; intro: string; planned: string[] }) {
  return (
    <>
      <PageHeader title={title} intro={intro} />
      <EmptyState
        title="Coming next"
        message={
          <ul className="mt-2 list-disc space-y-1 pl-5 text-left">
            {planned.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        }
      />
    </>
  );
}
