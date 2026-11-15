/** For each hospital and day: did MOH publish the bed wait and the ED visits (?weeks=13|26|52). */
import { api, settle } from "@/lib/api/client";
import { CELL_LABELS, coverageGrid, parseWindow, windowStart } from "@/lib/coverage";
import { exportError, tableResponse } from "@/lib/exportRoutes";

export async function GET(request: Request) {
  const weeks = parseWindow(new URL(request.url).searchParams.get("weeks") ?? undefined);
  const base = await settle(Promise.all([api.meta(), api.hospitals()]));
  if (!base.ok) return exportError(base.error);
  const [snapshot, hospitals] = base.value;
  const to = snapshot.meta.sources.find((s) => s.id === "moh_bed_waits")?.as_of?.slice(0, 10) ?? null;
  if (!to) return new Response("This data release has no date for the MOH figures.\n", { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const from = windowStart(to, weeks);
  const daily = await settle(api.edDaily({ from, to }));
  if (!daily.ok) return exportError(daily.error);
  const grid = coverageGrid(daily.value.data, hospitals.data, from, to);
  const rows = grid.rows.flatMap((r) => grid.days.map((d, i) => [r.code, d, r.cells[i], CELL_LABELS[r.cells[i]!]]));
  return tableResponse(request, "ed-coverage", daily.value.meta.snapshot_id, ["hospital_code", "date", "state", "meaning"], rows, daily.value.meta,
    { title: "ED coverage, hospital by day", window: `${from} to ${to} (${weeks} weeks)`,
      definitions: ["Whether MOH published both figures (the bed wait and ED visits) for each hospital on each day. A day before a hospital's first reporting date is 'not_expected', not a gap."] });
}
