/**
 * Who built the site, and where to reach them. Public contact details, so they live in code, in one
 * place: the footer byline, the case study and the project page all read this file.
 * The CV link is the share link without the owner id (`ouid`) that Google adds to it.
 */
export interface AuthorLink {
  id: "cv" | "linkedin" | "github" | "email";
  label: string;
  href: string;
  /** Opens in a new tab (everything except the email link). */
  external: boolean;
}

export const AUTHOR = {
  name: "Gabriel Neo",
  role: "Final-year Information Systems student, SMU",
  seeking: "Open to business and data analyst roles, healthcare included.",
} as const;

export const AUTHOR_LINKS: readonly AuthorLink[] = [
  { id: "cv", label: "CV", href: "https://docs.google.com/document/d/1nSYTwqPM1rMyk9VSeb2mpCQR8JmbjXfo/edit?usp=sharing", external: true },
  { id: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/in/neo-yi-kai/", external: true },
  { id: "github", label: "GitHub", href: "https://github.com/gabrielneo/sg-care-capacity", external: true },
  { id: "email", label: "Email", href: "mailto:neoyikai3@gmail.com", external: false },
];

/**
 * Facts about how the site is built, from the README. They describe the engineering, not the health data,
 * so no API call backs them. Update them when the README changes; lib/author.test.ts checks the README still says them.
 */
export const BUILD_FACTS = {
  tests: "1,000+",
  cadence: "Weekly",
  auditSampled: 20,
} as const;
