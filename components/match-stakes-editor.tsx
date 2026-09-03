"use client";

import { useState } from "react";
import { MatchStakes } from "./match-stakes";
import type { PayoutTable } from "@/lib/game";
import type { Match, MatchTeam } from "@/lib/types";

/**
 * Stakes and payouts on a round that has already started or finished.
 *
 * Collapsed by default: this is a correction tool, not part of the normal
 * flow, and an open payout grid above a live scorecard invites fiddling
 * mid-round.
 */
export function MatchStakesEditor({
  match, teams, payouts, fb18Payouts,
}: {
  match: Match;
  teams: MatchTeam[];
  payouts: PayoutTable;
  fb18Payouts: { front: PayoutTable; back: PayoutTable; total: PayoutTable };
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Stakes and payouts</h3>
          <p className="text-sm text-muted">
            ${match.dollars_per_unit} a unit to each player
            {match.fb18_dollars_per_unit !== null &&
             Number(match.fb18_dollars_per_unit) !== Number(match.dollars_per_unit)
              ? `, $${match.fb18_dollars_per_unit} on FB18`
              : ""}
            . Changing anything here recalculates this round and the season table.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:border-fairway-300"
        >
          {open ? "Done" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-5 border-t border-line pt-5">
          <MatchStakes
            match={match} teams={teams}
            payouts={payouts} fb18Payouts={fb18Payouts}
          />
        </div>
      )}
    </section>
  );
}
