"use client";

import { ErrorState } from "@/components/States";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="Something went wrong"
      error={{ message: "This page couldn't be shown.", code: error.digest }}
      action={
        <button type="button" onClick={reset} className="rounded-md bg-primary px-3 py-2 text-small font-semibold text-on-primary">
          Try again
        </button>
      }
    />
  );
}
