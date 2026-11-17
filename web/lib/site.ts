/**
 * The site's one name and tagline (audit G3). Every title, header, share card and heading reads them
 * from here; a test fails on the name typed anywhere else (lib/site.test.ts).
 */
export const SITE = {
  name: "Care-pacity",
  tagline: "in a super-aged Singapore",
} as const;

/** "Care-pacity: emergency waits and clinic access in a super-aged Singapore": the full title (renamed 17 Nov 2026). */
export const SITE_TITLE = `${SITE.name}: emergency waits and clinic access ${SITE.tagline}`;
