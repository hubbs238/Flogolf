"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMatch, finishRound, reopenRound } from "@/app/(app)/games/actions";
import type { Match } from "@/lib/types";

export function MatchAdminBar({ match }: { match: Match }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string } | void>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r && !r.ok) setError(r.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {match.status === "in_progress" && (
        <button onClick={() => run(() => finishRound(match.id))} disabled={pending}
          className="rounded-lg bg-fairway-600 px-3 py-1.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50">
          Finish round
        </button>
      )}
      {match.status === "complete" && (
        <button onClick={() => run(() => reopenRound(match.id))} disabled={pending}
          className="rounded-lg border border-line px-3 py-1.5 font-medium transition hover:border-fairway-300 disabled:opacity-50">
          Reopen to fix scores
        </button>
      )}
      {confirming ? (
        <>
          <span className="text-xs">Delete this round and every score in it?</span>
          <button onClick={() => run(() => deleteMatch(match.id))} disabled={pending}
            className="rounded-lg bg-flag-500 px-3 py-1.5 text-xs font-medium text-white">
            Yes, delete
          </button>
          <button onClick={() => setConfirming(false)} className="text-xs text-muted">Cancel</button>
        </>
      ) : (
        <button onClick={() => setConfirming(true)}
          className="px-2 text-xs text-muted transition hover:text-flag-500">
          Delete
        </button>
      )}
      {error && <span className="text-xs text-flag-500">{error}</span>}
    </div>
  );
}
