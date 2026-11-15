import type { RailItem } from "@/components/OnThisPage";

/**
 * "Jump to section" for widths that have no right-hand list: a native <details> (works without JavaScript) holding the same links.
 * `className` says where it is hidden (for example "md:hidden": from 768px the sticky strip has its own).
 */
export function JumpMenu({ items, className = "" }: { items: readonly RailItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <details className={`jump-menu rounded-lg border border-line bg-surface ${className}`} data-testid="jump-menu">
      <summary className="flex min-h-11 cursor-pointer select-none items-center px-3 text-small font-semibold text-accent">Jump to section</summary>
      <ul className="border-t border-line px-3 py-1 text-small">
        {items.map((i) => (
          <li key={i.id}><a href={`#${i.id}`} className="inline-flex min-h-11 items-center">{i.label}</a></li>
        ))}
      </ul>
    </details>
  );
}
