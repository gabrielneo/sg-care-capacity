import Link from "next/link";

import { EmptyState } from "@/components/States";
import { api, settle } from "@/lib/api/client";

/** A hospital code the data doesn't have: list the ones it does, from the API, so the reader can pick the right page. */
export default async function HospitalNotFound() {
  const res = await settle(api.hospitals());
  const hospitals = res.ok ? [...res.value.data].sort((a, b) => a.hospital_name.localeCompare(b.hospital_name)) : [];
  return (
    <EmptyState title="Hospital not found" message="There is no hospital with that code in this data release."
                action={hospitals.length ? (
                  <ul className="mx-auto grid max-w-xl gap-x-6 sm:grid-cols-2" data-testid="hospital-not-found-list">
                    {hospitals.map((h) => (
                      <li key={h.hospital_code}>
                        <Link href={`/hospital/${h.hospital_code}`} className="inline-flex min-h-11 items-center">{h.hospital_name}</Link>
                      </li>
                    ))}
                  </ul>
                ) : <Link href="/ed-trends/monthly">All hospitals, month by month</Link>} />
  );
}
