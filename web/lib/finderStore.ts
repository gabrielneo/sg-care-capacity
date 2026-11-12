/**
 * The finder's state, shared by the search box, the results, the nearest EDs and the map.
 *
 * The search lives in the address bar's fragment (#near=460123&type=gp), which the browser never
 * sends to a server: a link can be shared and back/forward work, and nothing typed leaves the
 * browser. The place lists come from /places.json, fetched once and only when a search starts (the
 * request has no search text in it); matching and distances run here.
 */
import { useEffect, useSyncExternalStore } from "react";

import { parseType, type TypeFilter } from "./finder";
import type { Places } from "./nearby";

export interface FinderState {
  /** What was typed, as typed (at most 60 characters). */
  query: string;
  type: TypeFilter;
  load: "idle" | "loading" | "ready" | "error";
  places: Places | null;
}

const IDLE: FinderState = { query: "", type: "all", load: "idle", places: null };
let state: FinderState = IDLE;
const listeners = new Set<() => void>();

function set(next: Partial<FinderState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function parseHash(hash: string): { query: string; type: TypeFilter } {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  return { query: (q.get("near") ?? "").slice(0, 60), type: parseType(q.get("type")) };
}

export function hashFor(query: string, type: TypeFilter): string {
  const q = new URLSearchParams();
  if (query.trim()) q.set("near", query.trim().slice(0, 60));
  if (type !== "all") q.set("type", type);
  const s = q.toString();
  return s ? `#${s}` : "";
}

/** Fetch the place lists, once. A failed fetch can be tried again by searching again. */
export function ensurePlaces(): void {
  if (state.load === "loading" || state.load === "ready") return;
  set({ load: "loading" });
  fetch("/places.json")
    .then((res) => (res.ok ? (res.json() as Promise<Places>) : Promise.reject(new Error(String(res.status)))))
    .then((places) => set({ places, load: "ready" }))
    .catch(() => set({ load: "error" }));
}

function readHash() {
  const { query, type } = parseHash(window.location.hash);
  set({ query, type });
  if (query.trim()) ensurePlaces();
}

let listening = false;
/** Runs each time a finder part appears: the address is the truth, so a page you come back to follows it. */
function start() {
  readHash();
  if (listening) return;
  listening = true;
  window.addEventListener("hashchange", readHash);
}

/** Search for a postcode or area: the address bar's fragment changes, and every part of the page follows. */
export function search(query: string): void {
  const q = query.trim().slice(0, 60);
  set({ query: q });                                    // at once: the fragment's own event comes later
  if (q) ensurePlaces();                                // also retries a failed load
  const hash = hashFor(q, state.type);
  if (window.location.hash === hash) return;
  if (hash) window.location.hash = hash;
  else history.replaceState(null, "", window.location.pathname + window.location.search);
}

/** Change the kind of place shown. It replaces the history entry: a filter isn't a new page. */
export function setType(type: TypeFilter): void {
  const hash = hashFor(state.query, type);
  history.replaceState(null, "", window.location.pathname + window.location.search + hash);
  set({ type });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The finder's state. The first render is always the idle state, so server and browser agree. */
export function useFinder(): FinderState {
  useEffect(start, []);
  return useSyncExternalStore(subscribe, () => state, () => IDLE);
}

/** For tests: back to the idle state, listeners kept. */
export function resetFinder(): void {
  state = IDLE;
}
