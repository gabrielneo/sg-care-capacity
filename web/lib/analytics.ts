import type { BeforeSendEvent } from "@vercel/analytics";

/**
 * What a page view sends to Vercel Web Analytics: the path only. The query string is dropped, so a
 * postcode or area typed into the clinic search (/?near=...) never leaves the site, as the search
 * box promises. The fragment goes too. No cookies are used.
 */
export function withoutQuery(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  return { ...event, url: url.toString() };
}
