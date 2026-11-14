"use client";

import { useSyncExternalStore } from "react";

import { colors, type ColorToken, TOKEN_VARS } from "./palette";
import { subscribeTheme } from "./theme";

function subscribe(onChange: () => void): () => void {
  const unsubscribe = subscribeTheme(onChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => { unsubscribe(); media.removeEventListener("change", onChange); };
}

/**
 * A token's colour as the browser resolves it right now, for code that cannot use var() (three.js).
 * It follows the toggle and the OS setting. On the server and before hydration it is the light value.
 */
export function useTokenColor(token: ColorToken): string {
  return useSyncExternalStore(
    subscribe,
    () => getComputedStyle(document.documentElement).getPropertyValue(TOKEN_VARS[token]).trim() || colors[token],
    () => colors[token],
  );
}
