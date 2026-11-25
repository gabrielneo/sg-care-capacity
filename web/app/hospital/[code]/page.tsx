import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MONTHLY_CAVEAT, MonthlyCharts } from "@/components/monthly/MonthlyCharts";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/States";
import { Glossed } from "@/components/terms/Glossed";
import { api, settle } from "@/lib/api/client";
import { plainError } from "@/lib/copy";
import { fullName, isUrgentCare, URGENT_CARE_NOTE } from "@/lib/hospitals";
import { fromHospital, monthLede } from "@/lib/monthly";

export const dynamic = "force-dynamic";

type Params = Promise<{ code: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: `${(await params).code.toUpperCase()}: month by month` };
}

const MONTHS_SHOWN = 48;

/**
 * One hospital, month by month and year on year (reached from a hospital card or the month-by-month list). Every figure is the
 * API's (marts.fct_ed_monthly); this page only lays them out.
 */
export default async function HospitalPage({ params }: { params: Params }) {
  const code = (await params).code.toUpperCase();
  const hospitalsRes = await settle(api.hospitals());
  if (!hospitalsRes.ok) {
    return (
      <>
        <PageHeader title={code} />
        <ErrorState error={plainError(hospitalsRes.error)} />
      </>
    );
  }
  const hospital = hospitalsRes.value.data.find((h) => h.hospital_code === code);
  if (!hospital) notFound();
  const name = fullName(hospital);
  const monthlyRes = await settle(api.edMonthly({ hospital: code, months: MONTHS_SHOWN }));
  const back = (
    <p className="mt-2 flex flex-wrap gap-x-4 text-small">
      <Link href={`/ed-trends?hospital=${code}`}><Glossed text="Daily figures on ED Trends" /></Link>
      <Link href="/ed-trends/monthly">All hospitals, month by month</Link>
    </p>
  );
  if (!monthlyRes.ok) {
    const notYet = monthlyRes.error.code === "not_in_release";
    return (
      <>
        <PageHeader title={name} />
        <ErrorState title={notYet ? "This data release has no monthly figures yet" : "The monthly figures can't be shown"}
                    error={notYet ? { message: "They appear with the next weekly data release." } : plainError(monthlyRes.error)} />
        {back}
      </>
    );
  }
  const points = monthlyRes.value.data.map(fromHospital);
  const lede = monthLede(name, points);
  const note = hospital.coverage_note;
  return (
    <>
      <PageHeader title={name} intro="Bed wait and emergency department visits by month, and this month against the same month a year before." />
      {isUrgentCare(hospital) ? <p className="mb-2 text-small text-muted" data-testid="ucc-note">{URGENT_CARE_NOTE}.</p> : null}
      {note && !isUrgentCare(hospital) ? <p className="mb-2 text-small text-muted" data-testid="coverage-note">{note}</p> : null}
      {lede ? <p className="max-w-prose text-ink" data-testid="monthly-lede">{lede}</p> : null}
      {back}
      <div className="mt-6">
        <MonthlyCharts points={points} meta={monthlyRes.value.meta} subject={name}
                       csv={`/export/ed-monthly.csv?hospital=${code}&months=${MONTHS_SHOWN}&context=1`} caveat={MONTHLY_CAVEAT} />
      </div>
    </>
  );
}
