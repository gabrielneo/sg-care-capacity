import { AUTHOR, AUTHOR_LINKS } from "@/lib/author";

/**
 * "Built by …" with the CV, LinkedIn, GitHub and email links. One line, so it can sit in the footer of every page
 * and at the top of the case study without taking the page's first screen.
 */
export function AuthorByline({ className = "" }: { className?: string }) {
  return (
    <p className={className} data-testid="author-byline">
      Built by <strong className="font-semibold text-ink">{AUTHOR.name}</strong>, {AUTHOR.role}.{" "}
      <span className="whitespace-nowrap">
        {AUTHOR_LINKS.map((l, i) => (
          <span key={l.id}>
            {i > 0 ? " · " : null}
            <a href={l.href} {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {l.label}
              {l.external ? <span className="sr-only"> (opens in a new tab)</span> : null}
            </a>
          </span>
        ))}
      </span>
    </p>
  );
}
