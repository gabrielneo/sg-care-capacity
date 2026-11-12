"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { firstUseText, type GlossaryEntry, selfNamed, term } from "@/lib/glossary";

export interface TermViewProps {
  id: string;
  /** Whether this is the term's first use on the page: decided by the server (components/terms/Term.tsx). */
  first: boolean;
  children?: ReactNode;
  plural?: boolean;
  plain?: boolean;
}

/**
 * How a glossary term looks.
 * - Rule 1 (abbreviation): first use reads "Community Health Assist Scheme (CHAS)"; later uses
 *   read "CHAS", underlined, with the definition on hover, focus or tap.
 * - Self-named terms (SingHealth, polyclinic): the definition is available on every use.
 * - Rule 2 (explained word): the first use is underlined with its explanation; later uses are plain.
 * It never decides first use itself, so it renders the same on the server and in the browser.
 */
export function TermView({ id, first, children, plural = false, plain = false }: TermViewProps) {
  const t = term(id);
  const abbr = t.abbreviation ? `${t.abbreviation}${plural ? "s" : ""}` : null;
  const kind = t.category === "keep_abbreviation" && !selfNamed(t) ? "abbr" : "explain";
  const data = { "data-term": id, "data-kind": kind, "data-first": first ? "" : undefined };

  if (kind === "abbr") {
    if (first) return <span {...data}>{firstUseText(t, plural)}</span>;
    if (plain) return <span {...data}>{abbr}</span>;
    return <TermTip entry={t} label={abbr} data={data} />;
  }
  const text = children ?? abbr ?? t.full_name;
  const explain = selfNamed(t) || first;
  if (!explain || plain) return <span {...data}>{text}</span>;
  return <TermTip entry={t} label={text} data={data} />;
}

type DataAttrs = Record<string, string | undefined>;

function isKeyboardFocus(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/** The underlined term and its tooltip. */
function TermTip({ entry, label, data }: { entry: GlossaryEntry; label: ReactNode; data: DataAttrs }) {
  const title = entry.abbreviation && !selfNamed(entry) ? `${entry.full_name} (${entry.abbreviation})` : entry.full_name;
  return <Tip label={label} data={data}><strong>{title}:</strong> {entry.plain_definition}</Tip>;
}

/**
 * Underlined text with a tooltip: hover or keyboard focus opens it; a tap toggles it; Escape closes.
 * Glossary terms use it, and so does any short detail that belongs beside a figure (`children`).
 */
export function Tip({ label, children, data = {} }: { label: ReactNode; children: ReactNode; data?: DataAttrs }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const tipId = `tip-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const pointer = useRef<string>("");
  const wrap = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);

  const show = () => {
    setOpen(true);
    // Keep the tooltip inside the screen on narrow viewports.
    requestAnimationFrame(() => {
      const r = tip.current?.getBoundingClientRect();
      if (!r) return;
      const over = r.right - (window.innerWidth - 8);
      setShift((s) => (over > 0 ? s - over : r.left < 8 ? s + (8 - r.left) : s));
    });
  };
  const hide = () => {
    setOpen(false);
    setShift(0);
  };

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) hide();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <span ref={wrap} className="term-wrap" {...data}>
      <button
        type="button"
        className="term"
        aria-describedby={tipId}
        onPointerDown={(e) => {
          pointer.current = e.pointerType;
        }}
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
        onFocus={(e) => isKeyboardFocus(e.currentTarget) && show()}
        onBlur={hide}
        onClick={() => {
          if (pointer.current === "touch" || pointer.current === "pen") {
            if (open) hide();
            else show();
          } else show();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") hide();
        }}
      >
        {label}
      </button>
      <span ref={tip} role="tooltip" id={tipId} className="term-tip" data-open={open ? "true" : "false"}
            style={shift ? { transform: `translateX(${shift}px)` } : undefined}>
        {children}
      </span>
    </span>
  );
}
