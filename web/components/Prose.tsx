import type { ElementType, ReactNode } from "react";

const SIZE = { body: "text-body", small: "text-small", meta: "text-meta" } as const;
const TONE = { ink: "text-ink", muted: "text-muted" } as const;

/**
 * Running text: never wider than 68 characters (--container-prose), left-aligned with the content column.
 * Every sentence-length note, lede and explanation goes through this, so no paragraph is wider than a person can read.
 */
export function Prose({ as: Tag = "p", size = "body", tone = "ink", className = "", children, ...rest }: {
  as?: ElementType; size?: keyof typeof SIZE; tone?: keyof typeof TONE; className?: string; children: ReactNode; "data-testid"?: string; id?: string;
}) {
  return <Tag className={`max-w-prose ${SIZE[size]} ${TONE[tone]} ${className}`.trim()} {...rest}>{children}</Tag>;
}
