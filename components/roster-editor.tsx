"use client";

import { useState } from "react";
import { RosterFill } from "./roster-fill";
import { displayName } from "@/lib/scoring";
import type { Golfer, Match, MatchPlayer, MatchTeam } from "@/lib/types";

/**
 * Rosters on a round that has already started or finished.
 *
 * Collapsed by default, the same way the stakes editor is: this is a
 * correction tool, not part of the normal flow, and an open roster grid above
 * a live scorecard invites fiddling mid round.
 *
 * The database already allowed this. match_players_guard refuses a roster
 * change after the filling window for everyone except an admin, which is
 * exactly what reopening a round relies on, so the only thing in the way was
 * that nothing ever rendered the controls.
 */
export function RosterEditor({
  match, teams, players, golfers, myUserId,
}: {
  match: Match;
  teams: MatchTeam[];
  players: MatchPlayer[];
  golfers: Golfer[];
  myUserId: string;
}) {
  const [open, setOpen] = useState(false);

  const byId = new Map(golfers.map((g) => [g.id, g]));
  const short = teams
    .map((t) => {
      const names = players
        .filter((p) => p.team_id === t.id)
        .sort((a, b) => a.slot - b.slot)
        .map((p) => {
          const g = byId.get(p.golfer_id);
          return g ? displayName(g) : "?";
        });
      return `${t.name}: ${names.length ? names.join(", ") : "empty"}`;
    })
    .join(" · ");

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">Rosters</h3>
          <p className="text-sm text-muted">
            {open
              ? "Swap keeps the slot and the captain, which is what you want when a sub played under a placeholder and you have their name now, or the wrong person went down on a team. Everything on this round is worked out from who was on which team, so a change here recalculates the round and the season table."
              : short}
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:border-fairway-300"
        >
          {open ? "Done" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-5 border-t border-line pt-5">
          <RosterFill
            match={match}
            teams={teams}
            players={players}
            golfers={golfers}
            isAdmin
            myUserId={myUserId}
            mode="edit"
          />
        </div>
      )}
    </section>
  );
}
