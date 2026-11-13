/**
 * The site's one name and tagline (audit G3). Every title, header, share card and heading reads them
 * from here; a test fails on the name typed anywhere else (lib/site.test.ts).
 */
export const SITE = {
  name: "Right-siting care",
  tagline: "in a super-aged Singapore",
} as const;

/** "Right-siting care in a super-aged Singapore": the full title. */
export const SITE_TITLE = `${SITE.name} ${SITE.tagline}`;
