import type { BeforeSendEvent } from "@vercel/analytics";

/**
 * What a page view sends to Vercel Web Analytics: the path only. The query string is dropped, so a
 * postcode or area typed into the clinic search (kept in the fragment, #near=...) never leaves the
 * browser, as the search box promises. The fragment goes too, as a precaution. No cookies are used.
 */
export function withoutQuery(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  return { ...event, url: url.toString() };
}
