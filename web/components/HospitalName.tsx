import type { Hospital } from "@/lib/api/types";
import { fullName, hospitalLabel } from "@/lib/hospitals";

import { Tip } from "./terms/TermView";

type Named = Pick<Hospital, "hospital_code" | "hospital_name"> & { short_name?: string | null };

/**
 * A hospital as cards and tables name it: "Sengkang General (SKH)", with the full name in a tooltip
 * that a keyboard can open (audit G4). Inside a link or a button, a second control can't be nested, so
 * `inControl` gives the full name as the element's title and to screen readers instead.
 */
export function HospitalName({ hospital, inControl = false }: { hospital: Named; inControl?: boolean }) {
  const label = hospitalLabel(hospital);
  const full = fullName(hospital);
  const data = { "data-testid": "hospital-name", "data-hospital": hospital.hospital_code };
  if (inControl) {
    return (
      <span title={full} {...data}>
        <span aria-hidden="true">{label}</span>
        <span className="sr-only">{full} ({hospital.hospital_code})</span>
      </span>
    );
  }
  return <Tip label={label} data={data}>{full}</Tip>;
}
