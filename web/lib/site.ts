/**
 * The site's one name and tagline (audit G3). Every title, header, share card and heading reads them
 * from here; a test fails on the name typed anywhere else (lib/site.test.ts).
 */
export const SITE = {
  name: "Care-pacity",
  tagline: "in a super-aged Singapore",
} as const;

/** The page title search engines show: under 60 characters, and what the site is about. */
export const SEO_TITLE = `${SITE.name}: Singapore ED bed waits, senior clinic access`;

/** "Care-pacity: hospital bed waits and clinic access in a super-aged Singapore": the full title (renamed 17 Nov 2026; "emergency waits" reworded 25 Nov 2026, as the data is bed waits for admitted patients). */
export const SITE_TITLE = `${SITE.name}: hospital bed waits and clinic access ${SITE.tagline}`;
