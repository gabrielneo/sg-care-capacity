# Sitemap: before and after the audience decision (25 Nov 2026)

**Decision (Option A).** The site is a public tool for general readers and policy audiences. Portfolio and author material sits
under About, and developer pages are out of the public footer. Chosen on the recommendation in
`care-pacity-remediation-prompts.md` (Prompt 10); the project's own purpose (right-siting care for older residents) is public.

| Page | Before | After |
|---|---|---|
| `/` Home | nav, footer | unchanged |
| `/findings`, `/summary` (printable) | Findings; Summary reached from Findings | unchanged: one finds, one prints |
| `/explore`, `/find`, `/ed-trends`, `/hospital/[code]`, `/access-map`, `/live` | Explore | unchanged |
| `/methodology`, `/data-quality`, `/glossary`, `/docs/*` | Methods | unchanged; Methods now also links "How findings are tested" |
| `/how-its-built` | About, a hub of five links that Methods already had | **removed**: permanent redirect to `/methodology` |
| `/decisions`, `/decisions/[slug]` | footer "Decision records"; Methods | out of the footer; **noindex**; still under Methods |
| `/styleguide`, `/dev/components` | footer "Style guide" | out of the footer; already noindex |
| `/about`, `/project`, `/case-study` | About; footer lists project, case study, GitHub, CV | About lists the project and case study; footer lists project, case study, GitHub |
| CV link | About, project page, footer | About and project page only |

Pages merged: none beyond `/how-its-built`. `/project` (60 seconds), `/case-study` (full story), `/findings` (this release's
findings) and `/summary` (one printable page) each have one purpose and a different length, so merging them would lose a use.
