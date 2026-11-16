import type { Metadata } from "next";
import Link from "next/link";

import { Callouts } from "@/components/edcharts/Callouts";
import { HospitalName } from "@/components/HospitalName";
import { MONTHLY_CAVEAT, MonthlyCharts } from "@/components/monthly/MonthlyCharts";
import { PageHeader } from "@/components/PageHeader";
import { Glossed } from "@/components/terms/Glossed";
import { ErrorState } from "@/components/States";
import { api, settle } from "@/lib/api/client";
import { plainError } from "@/lib/copy";
import { fromHospital, fromSystem, latestComplete, monthLede, MONTHS_LONG } from "@/lib/monthly";
import { rankableHospitals, urgentCareHospitals } from "@/lib/hospitals";
import { hours, signed } from "@/components/edcharts/format";

export const metadata: Metadata = { title: "Month by month" };
export const dynamic = "force-dynamic";

const INTRO = "The average bed wait and ED visits for each calendar month, for the full emergency departments together and for each hospital. Pick a hospital to see its months and years.";
const MONTHS_SHOWN = 48;

export default async function MonthlyPage() {
  const [systemRes, hospitalsRes, monthlyRes, insightsRes] = await Promise.all([
    settle(api.edSystemMonthly({ months: MONTHS_SHOWN })), settle(api.hospitals()), settle(api.edMonthly({ months: 24 })),
    settle(api.insights({ type: "monthly_yoy" })),
  ]);
  if (!systemRes.ok || !hospitalsRes.ok) {
    const err = !systemRes.ok ? systemRes.error : (hospitalsRes as { ok: false; error: Parameters<typeof plainError>[0] }).error;
    const notYet = !systemRes.ok && systemRes.error.code === "not_in_release";
    return (
      <>
        <PageHeader title="Month by month" intro={INTRO} />
        <ErrorState title={notYet ? "This data release has no monthly figures yet" : "The monthly figures can't be shown"}
                    error={notYet ? { message: "They appear with the next weekly data release." } : plainError(err)} />
      </>
    );
  }
  const points = systemRes.value.data.map(fromSystem);
  const hospitals = hospitalsRes.value.data;
  const lede = monthLede(`Across the ${systemRes.value.data.at(-1)?.n_hospitals ?? ""} full emergency departments`, points);
  const byHospital = new Map<string, ReturnType<typeof fromHospital>[]>();
  if (monthlyRes.ok) for (const r of monthlyRes.value.data) byHospital.set(r.hospital_code, [...(byHospital.get(r.hospital_code) ?? []), fromHospital(r)]);

  const row = (code: string) => {
    const h = hospitals.find((x) => x.hospital_code === code);
    const pts = byHospital.get(code) ?? [];
    const m = latestComplete(pts);
    if (!h) return null;
    return (
      <tr key={code} data-testid="hospital-row" data-hospital={code}>
        <th scope="row" className="border-t border-line py-2 pr-3 text-left font-normal">
          <Link href={`/hospital/${code}`} className="inline-flex min-h-11 items-center font-semibold"><HospitalName hospital={h} inControl /></Link>
        </th>
        <td className="border-t border-line px-2 text-right">{m?.wait != null ? `${hours(m.wait)} h` : <span className="text-muted">no complete month</span>}</td>
        <td className="border-t border-line px-2 text-right">{m?.waitYoy != null ? `${signed(m.waitYoy, 0)}%` : <span className="text-muted">none</span>}</td>
        <td className="border-t border-line px-2 text-right">{m?.visitsYoy != null ? `${signed(m.visitsYoy, 0)}%` : <span className="text-muted">none</span>}</td>
      </tr>
    );
  };
  const latest = latestComplete([...byHospital.values()].flat());
  const monthName = latest ? `${MONTHS_LONG[latest.month - 1]} ${latest.year}` : "the latest complete month";
  const full = rankableHospitals(hospitals);
  const ucc = urgentCareHospitals(hospitals);

  return (
    <>
      <PageHeader title="Month by month" intro={INTRO} />
      {lede ? <p className="mb-4 max-w-prose text-ink" data-testid="monthly-lede">{lede}</p> : null}
      <section aria-labelledby="hospital-list" className="mb-8">
        <h2 id="hospital-list" className="text-body font-semibold text-ink">Pick a hospital</h2>
        <p className="mt-1 text-small text-muted">{`Each hospital's latest complete month (${monthName}) and its change on the same month a year before. Select a name for its months and years.`}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-small tabular-nums" data-testid="hospital-list">
            <thead>
              <tr>
                <th scope="col" className="pr-3 text-left font-semibold text-muted">Hospital</th>
                <th scope="col" className="px-2 text-right font-semibold text-ink">Bed wait</th>
                <th scope="col" className="px-2 text-right font-semibold text-ink">Wait vs a year before</th>
                <th scope="col" className="px-2 text-right font-semibold text-ink">Visits vs a year before</th>
              </tr>
            </thead>
            <tbody>
              {full.map((h) => row(h.hospital_code))}
              {ucc.length ? <tr><th colSpan={4} scope="colgroup" className="border-t border-line pt-3 text-left text-meta font-semibold text-muted">Urgent care centre: not compared with full emergency departments</th></tr> : null}
              {ucc.map((h) => row(h.hospital_code))}
            </tbody>
          </table>
        </div>
        {!monthlyRes.ok ? <p className="mt-2 text-small text-muted">The hospital figures can&apos;t be shown right now.</p> : null}
        <p className="mt-2 text-small"><Link href="/ed-trends"><Glossed text="See daily figures on ED Trends" /></Link></p>
      </section>
      <MonthlyCharts points={points} meta={systemRes.value.meta} subject="Full emergency departments" csv="/export/ed-system-monthly.csv?months=48&context=1" caveat={MONTHLY_CAVEAT}
                     findings={insightsRes.ok ? <Callouts insights={insightsRes.value.data} types={["monthly_yoy"]} codes={[]} hospitals={hospitals} meta={insightsRes.value.meta} label="visits and bed waits, year on year" /> : null} />
    </>
  );
}
