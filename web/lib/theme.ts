/** The theme choice: "auto" follows the OS (prefers-color-scheme); "light" and "dark" are set by the footer toggle. */
export type ThemeChoice = "auto" | "light" | "dark";

export const THEME_KEY = "theme";
export const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { auto: "light", light: "dark", dark: "auto" };

export function parseTheme(value: string | null | undefined): ThemeChoice {
  return value === "light" || value === "dark" ? value : "auto";
}

export const THEME_EVENT = "themechange";

/** The choice in force on this page: whatever <html data-theme> says (set early by THEME_INIT_SCRIPT). */
export function currentTheme(): ThemeChoice {
  return parseTheme(document.documentElement.getAttribute("data-theme"));
}

/** For useSyncExternalStore. */
export function subscribeTheme(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

/** Reads the saved choice. localStorage can throw (private windows, blocked site data): then it is "auto". */
export function readTheme(): ThemeChoice {
  try { return parseTheme(window.localStorage.getItem(THEME_KEY)); } catch { return "auto"; }
}

/** Applies a choice to <html data-theme> and saves it; "auto" removes both. Storage failures are ignored. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", choice);
  try {
    if (choice === "auto") window.localStorage.removeItem(THEME_KEY); else window.localStorage.setItem(THEME_KEY, choice);
  } catch { /* the choice still applies for this page view */ }
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Runs in <head> before the first paint, so a saved choice never flashes the wrong theme. */
export const THEME_INIT_SCRIPT =
  `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
