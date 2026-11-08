import { api, settle } from "@/lib/api/client";
import type { SnapshotInfo } from "@/lib/api/types";
import { formatAsOf } from "@/lib/dates";

export type StatusInput = { ok: true; info: Pick<SnapshotInfo, "snapshot_id" | "release_url">; asOf: string } | { ok: false };

/** The footer's status line: which weekly data release the site is serving, when it was made, and a link to it. */
export function DataStatusLine({ status }: { status: StatusInput }) {
  if (!status.ok) {
    return <p className="mt-1" data-testid="data-status">Data release: not available right now.</p>;
  }
  const { snapshot_id, release_url } = status.info;
  return (
    <p className="mt-1" data-testid="data-status">
      Data release <span className="font-mono text-ink">{snapshot_id}</span>, as of{" "}
      <time dateTime={status.asOf}>{formatAsOf(status.asOf)}</time>
      {release_url ? <>{" · "}<a href={release_url}>View the release</a></> : null}
    </p>
  );
}

/** Fetches /meta (cached like every API call) for the status line. Never throws: the footer always renders. */
export async function DataStatus() {
  const res = await settle(api.meta());
  return <DataStatusLine status={res.ok ? { ok: true, info: res.value.data, asOf: res.value.meta.as_of } : { ok: false }} />;
}
