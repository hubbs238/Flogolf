"use client";

import { formatDollars } from "@/lib/currency";
import { useState } from "react";
import { MatchStakes } from "./match-stakes";
import { SECOND_EIGHTEEN_RATE_SHARE, wholeDollars } from "@/lib/game";
import type { Fb18Segment, PayoutTable } from "@/lib/game";
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
  fb18Payouts: Partial<Record<Fb18Segment, PayoutTable>>;
}) {
  const [open, setOpen] = useState(false);

  const eighteenRate = wholeDollars(Number(match.fb18_total_dollars_per_unit ?? match.fb18_dollars_per_unit ?? match.dollars_per_unit));
  const secondRate = match.fb18_second_dollars_per_unit ?? wholeDollars(eighteenRate * SECOND_EIGHTEEN_RATE_SHARE);

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Stakes and payouts</h3>
          <p className="text-sm text-muted">
            {formatDollars(Number(match.dollars_per_unit))} a unit per share. Each bay splits four shares. FB18 at{" "}
            {[
              ["F9", match.fb18_front_dollars_per_unit],
              ["B9", match.fb18_back_dollars_per_unit],
              ["18", match.fb18_total_dollars_per_unit],
              ["2nd 18", secondRate],
            ]
              .map(([label, v]) =>
                `${label} ${formatDollars(Number(v ?? match.fb18_dollars_per_unit ?? match.dollars_per_unit))}`)
              .join(", ")}
            {Number(match.dues_per_player) > 0
              ? `. Rake ${formatDollars(Number(match.dues_per_player))} a player`
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
