/**
 * Whether the site may link to a source page. MOH, NUHS and SingStat ask for written permission
 * before anyone links to their pages, and OneMap allows links to its home page only, so those are
 * cited by name instead, with the address as a tooltip (docs/methodology.md, "Licences and attribution").
 */
const NO_LINK = /(^|\.)(moh\.gov\.sg|isomer-user-content\.by\.gov\.sg|nuhs\.edu\.sg|singstat\.gov\.sg)$/;

export function linkable(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;                                     // a relative link: one of the site's own pages
  }
  if (NO_LINK.test(u.hostname)) return null;
  if (/(^|\.)onemap\.gov\.sg$/.test(u.hostname) && u.pathname !== "/") return null;
  return url;
}
