"use client";

import { useEffect, useState } from "react";

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

/** /status.json's body (app/status.json/route.ts). */
interface StatusBody { ok: boolean; snapshot_id?: string; release_url?: string | null; as_of?: string }

export function toStatus(body: StatusBody): StatusInput {
  return body.ok && body.snapshot_id && body.as_of
    ? { ok: true, info: { snapshot_id: body.snapshot_id, release_url: body.release_url ?? null }, asOf: body.as_of }
    : { ok: false };
}

/**
 * Loads the status line in the browser from /status.json, so building a static page never waits on
 * the API. The line's height is reserved, so it appears without moving anything.
 */
export function DataStatus() {
  const [status, setStatus] = useState<StatusInput | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/status.json")
      .then((r) => r.json() as Promise<StatusBody>)
      .then((b) => live && setStatus(toStatus(b)))
      .catch(() => live && setStatus({ ok: false }));
    return () => { live = false; };
  }, []);
  return <div className="min-h-5">{status ? <DataStatusLine status={status} /> : null}</div>;
}
