"use client";

import { useSyncExternalStore } from "react";

import { applyTheme, currentTheme, NEXT_THEME, subscribeTheme, type ThemeChoice } from "@/lib/theme";

const LABEL: Record<ThemeChoice, { icon: string; text: string }> = {
  auto: { icon: "◐", text: "Auto" },
  light: { icon: "○", text: "Light" },
  dark: { icon: "●", text: "Dark" },
};

/** Footer theme control: Auto (the device's setting), Light, Dark. The choice is saved in this browser only. */
export function ThemeToggle() {
  // The server (and the first client render) say "auto"; the real choice is read from <html data-theme> straight after.
  const choice = useSyncExternalStore(subscribeTheme, currentTheme, () => "auto" as const);
  const next = NEXT_THEME[choice];
  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={() => applyTheme(next)}
      className="print-hide inline-flex min-h-11 items-center gap-2 rounded-md border border-control bg-surface px-3 text-small font-semibold text-ink hover:border-accent"
      aria-label={`Theme: ${LABEL[choice].text}. Switch to ${LABEL[next].text}.`}
    >
      <span aria-hidden="true">{LABEL[choice].icon}</span>
      Theme: {LABEL[choice].text}
    </button>
  );
}
