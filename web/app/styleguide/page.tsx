import type { Metadata } from "next";

import { Section } from "@/components/Section";
import { Sparkline } from "@/components/home/Sparkline";
import { StatusBadge } from "@/components/home/StatusBadge";
import { Glossed } from "@/components/terms/Glossed";
import { api, settle } from "@/lib/api/client";
import { formatAsOf } from "@/lib/dates";
import { latestCompleteWeek, usualLevels } from "@/lib/edCompare";
import { rankableCodes } from "@/lib/hospitals";
import { divergingScale, mapScale, TOKEN_VARS } from "@/lib/palette";
import { type Level, LEVELS, hospitalStatus, SPARK_WEEKS, usualBand } from "@/lib/status";

// The sample chart is real data, read per request (the API response is cached for an hour), so a build made while the API was down cannot freeze an error into the page.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Style guide",
  description: "The design tokens, type scale and components behind this site, in light and dark.",
  robots: { index: false, follow: false },
};

const THEMES = ["light", "dark"] as const;
const GROUPS: [string, (k: string) => boolean][] = [
  ["Surfaces", (k) => /^(page|band|surface|sunken)$/.test(k)],
  ["Lines", (k) => /^(line|control)$/.test(k)],
  ["Text", (k) => /^(ink|muted|tertiary)$/.test(k)],
  ["Interface accent (ink blue: links, selection, focus only)", (k) => /^accent/.test(k)],
  ["Status (longer waits: orange and brown; shorter: violet)", (k) => /^(status|danger)/.test(k)],
  ["Data scales (the same in both themes)", (k) => /^(map|div|on-data)/.test(k)],
];
const LEVEL_ORDER: Level[] = ["much_higher", "higher", "usual", "lower", "unknown"];
const TYPE_SCALE = [
  ["text-h1", "text-h1 · page title"], ["text-h2", "text-h2 · section question"], ["text-kpi", "text-kpi · key figure"],
  ["text-h3", "text-h3 · sub-heading"], ["text-body", "text-body · body, 16 px (17 px from 1280 px)"], ["text-small", "text-small · secondary"], ["text-meta", "text-meta · metadata only"],
] as const;

/** Real figures for the sample chart: the same call and status function the home page uses. Never invented. */
async function sample() {
  const [hospitals, weekly] = await Promise.all([settle(api.hospitals()), settle(api.edWeekly({ weeks: SPARK_WEEKS + 1 }))]);
  if (!hospitals.ok || !weekly.ok) return null;
  const codes = rankableCodes(hospitals.value.data);
  const first = hospitals.value.data.find((h) => codes.includes(h.hospital_code));
  if (!first) return null;
  const latest = latestCompleteWeek(weekly.value.data);
  const usual = usualLevels(weekly.value.data, codes, latest);
  return { hospital: first, status: hospitalStatus(first.hospital_code, usual[first.hospital_code], weekly.value.data, latest), asOf: weekly.value.meta.as_of };
}

function Specimen({ theme, chart }: { theme: (typeof THEMES)[number]; chart: Awaited<ReturnType<typeof sample>> }) {
  return (
    <div data-theme={theme} data-testid={`specimen-${theme}`} className="space-y-8 rounded-lg border border-line bg-page p-4 text-ink sm:p-6">
      <h3 className="font-semibold text-h3">{theme === "light" ? "Light" : "Dark"}</h3>

      {GROUPS.map(([title, test]) => (
        <div key={title}>
          <h4 className="mb-2 text-small font-semibold text-muted">{title}</h4>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Object.entries(TOKEN_VARS).filter(([k]) => test(k)).map(([k, v]) => (
              <li key={k} className="flex items-center gap-2 text-meta text-muted">
                <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-sm border border-control" style={{ background: `var(${v})` }} />
                <span className="min-w-0 break-words"><span className="font-semibold text-ink">{k}</span><br />{v}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div>
        <h4 className="mb-2 text-small font-semibold text-muted">Type scale (system fonts; prose at most 68 characters wide)</h4>
        {TYPE_SCALE.map(([cls, label]) => <p key={cls} className={`${cls} text-ink`}>{label}</p>)}
        <p className="mt-2 max-w-prose text-body text-muted">
          Body copy is set in ink on paper at 16 px with generous leading, so a long read stays easy on the eyes.
        </p>
      </div>

      <div>
        <h4 className="mb-2 text-small font-semibold text-muted">Status badges: symbol, words and colour</h4>
        <ul className="flex flex-wrap gap-2">
          {LEVEL_ORDER.map((l) => <li key={l}><StatusBadge level={l} /></li>)}
        </ul>
      </div>

      <div>
        <h4 className="mb-2 text-small font-semibold text-muted">Buttons and controls</h4>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-small font-semibold text-page hover:bg-accent-strong">Primary action</button>
          <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-control bg-surface px-4 text-small font-semibold text-ink hover:border-accent">Secondary</button>
          <button type="button" aria-pressed="true" className="inline-flex min-h-11 items-center rounded-md border border-accent bg-accent-soft px-4 text-small font-semibold text-accent">Selected</button>
          <a href="#main" className="inline-flex min-h-11 min-w-11 items-center justify-center text-small">A link</a>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-small font-semibold text-muted">Card: a border, no shadow</h4>
        <div className="max-w-sm rounded-lg border border-line bg-surface card">
          <p className="text-small text-muted">Bed wait, latest complete week{chart ? ` (${chart.hospital.short_name ?? chart.hospital.hospital_name})` : ""}</p>
          <p className="text-kpi font-semibold tabular-nums">{chart?.status.latest != null ? `${chart.status.latest.toFixed(1)} h` : "–"}</p>
          <p className="mt-1 text-meta text-tertiary">{chart ? <Glossed text={`MOH, data as of ${formatAsOf(chart.asOf)}.`} standalone /> : "The data service isn't reachable right now."}</p>
        </div>
        <p className="mt-3 max-w-sm rounded-lg border border-control bg-surface p-3 text-small shadow-popover">Floating layer (drawer, popover): the one soft shadow.</p>
      </div>

      <div>
        <h4 className="mb-2 text-small font-semibold text-muted">Sample chart: recent weekly bed waits, with the usual range shaded</h4>
        {chart ? (
          <div className="inline-block rounded-lg border border-line bg-surface p-3" data-testid="sample-chart">
            <p className="mb-1 text-small font-semibold">{chart.hospital.short_name ?? chart.hospital.hospital_name}</p>
            <Sparkline values={chart.status.spark} tone={LEVELS[chart.status.level].tone} band={usualBand(chart.status.usual)} />
            <p className="mt-1 text-meta text-tertiary"><Glossed text={`MOH, weekly average of daily medians. Data as of ${formatAsOf(chart.asOf)}.`} standalone /></p>
          </div>
        ) : <p className="text-small text-muted">The sample chart needs the data service, which isn&apos;t reachable right now.</p>}
      </div>

      <div>
        <h4 className="mb-2 text-small font-semibold text-muted">Weekday heatmap ramp: violet = shorter than the hospital&apos;s own average, orange = longer</h4>
        <div className="flex max-w-md overflow-hidden rounded-sm border border-control" data-testid="ramp-diverging">
          {divergingScale.map((c) => <span key={c} className="h-8 flex-1" style={{ background: c }} />)}
        </div>
        <div className="mt-1 flex max-w-md justify-between text-meta text-muted"><span>Shorter</span><span>Own average</span><span>Longer</span></div>
        <h4 className="mb-2 mt-4 text-small font-semibold text-muted">Map ramp (access maps): darker = worse access</h4>
        <div className="flex max-w-md overflow-hidden rounded-sm border border-control" data-testid="ramp-map">
          {mapScale.map((c) => <span key={c} className="h-8 flex-1" style={{ background: c }} />)}
        </div>
      </div>
    </div>
  );
}

export default async function StyleguidePage() {
  const chart = await sample();
  return (
    <div data-testid="styleguide">
      <header className="max-w-prose pb-6 pt-2 sm:pt-6">
        <h1 className="font-semibold tracking-tight text-ink text-h1">Style guide</h1>
        <p className="mt-2 text-muted">
          The tokens, type and components of &ldquo;Paper &amp; Ink&rdquo;, in light and dark. Every colour, size, radius and
          shadow on the site comes from <code>styles/tokens.css</code>; a test checks their contrast.
        </p>
      </header>
      <Section tone="band" heading="Which colours and components does the site use?" lede="Every colour, size and gap below comes from the design tokens, in light and dark.">
        <div className="grid gap-6 lg:grid-cols-2">
          {THEMES.map((t) => <Specimen key={t} theme={t} chart={chart} />)}
        </div>
      </Section>
    </div>
  );
}
