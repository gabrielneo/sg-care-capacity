/**
 * Whether the site may link to a source page. Singapore government, university and public-healthcare
 * sites (MOH, NUHS, SingStat and others) ask for written permission before anyone links to their pages,
 * so they are cited by name and date instead, with the address as a tooltip. The only links kept are
 * the ones their licences ask for (docs/methodology.md, "Licences and attribution").
 */
const CITE_ONLY = /(^|\.)(gov\.sg|edu\.sg|aic\.sg|mohh\.com\.sg)$/;
const REQUIRED = new Set([
  "https://data.gov.sg/open-data-licence",          // the Open Data Licence asks for a link to itself
  "https://www.onemap.gov.sg/",                     // OneMap's map credit, as OneMap words it
  "https://www.sla.gov.sg/",
]);

export function linkable(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return url;                                     // a relative link: one of the site's own pages
  }
  return CITE_ONLY.test(host) && !REQUIRED.has(url) ? null : url;
}
