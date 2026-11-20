"use client";

import { useState } from "react";
import { exportRoundJson } from "@/app/(app)/games/actions";

/**
 * Hands an admin the whole round as one file.
 *
 * The point is being able to show somebody the round without giving them
 * access to the database. Everything the engine saw and everything it worked
 * out goes in one JSON file: the settings, the four payout tables, the
 * rosters, every hole, and the settlement and points that follow from them.
 *
 * Admin only, like every other money surface, and it goes through the same
 * requireAdmin as the rest.
 */
export function RoundExport({ matchId, name }: { matchId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const r = await exportRoundJson(matchId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const blob = new Blob([r.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      setSaved(r.filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the export.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-raised p-5">
      <h3 className="font-semibold">Export this round</h3>
      <p className="mt-1 text-sm text-muted">
        One file with everything: the settings, all four payout tables, the
        rosters, every hole, and the settlement and points worked out from
        them. Useful for checking a round against the sheet, or for handing it
        to somebody who has no business having database access.
      </p>
      <button
        onClick={download}
        disabled={busy}
        className="mt-4 rounded-xl border border-line px-5 py-2.5 font-medium transition hover:border-fairway-300 disabled:opacity-50"
      >
        {busy ? "Building..." : "Download round JSON"}
      </button>
      {error && (
        <p className="mt-3 rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">{error}</p>
      )}
      {saved && (
        <p className="mt-3 text-sm text-muted">
          Saved <span className="font-medium text-ink">{saved}</span> to your
          downloads. {name ? `That is ${name}.` : ""}
        </p>
      )}
    </div>
  );
}
