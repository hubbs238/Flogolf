"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GolferAvatar } from "./golfer-avatar";
import { displayName } from "@/lib/scoring";
import {
  addMatchPlayer, removeMatchPlayer, startRound,
} from "@/app/(app)/games/actions";
import type { Golfer, Match, MatchPlayer, MatchTeam } from "@/lib/types";

export function RosterFill({
  match, teams, players, golfers, isAdmin, myUserId,
}: {
  match: Match;
  teams: MatchTeam[];
  players: MatchPlayer[];
  golfers: Golfer[];
  isAdmin: boolean;
  myUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openTeam, setOpenTeam] = useState<string | null>(null);

  const byId = new Map(golfers.map((g) => [g.id, g]));
  const taken = new Set(players.map((p) => p.golfer_id));
  const available = golfers.filter((g) => !taken.has(g.id));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.error ?? "Something went wrong.");
    });
  }

  const filled = teams.filter(
    (t) => players.filter((p) => p.team_id === t.id).length >= match.roster_size,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Picking teams</h2>
          <p className="text-sm text-muted">
            {filled} of {teams.length} rosters full. Captains fill their own,
            {isAdmin ? " and you can fill any of them." : " an admin can help if you are stuck."}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => run(() => startRound(match.id))} disabled={pending}
            className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50">
            Start the round
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">{error}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {teams.map((team) => {
          const roster = players
            .filter((p) => p.team_id === team.id)
            .sort((a, b) => a.slot - b.slot);
          const mine = isAdmin || team.captain_user_id === myUserId;
          const open = match.roster_size - roster.length;

          return (
            <div key={team.id}
              className={`rounded-2xl border bg-raised p-4 shadow-sm ${
                mine ? "border-fairway-300" : "border-line"}`}>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h3 className="truncate font-semibold">{team.name}</h3>
                {mine && <span className="shrink-0 text-xs text-fairway-600 dark:text-fairway-300">yours</span>}
              </div>

              <ul className="space-y-2">
                {roster.map((p) => {
                  const g = byId.get(p.golfer_id);
                  return (
                    <li key={p.golfer_id}
                      className="flex items-center gap-2.5 rounded-lg bg-surface px-2.5 py-2">
                      <span className="w-4 shrink-0 text-xs font-semibold text-muted">{p.slot}</span>
                      <GolferAvatar name={g ? displayName(g) : "?"} url={null} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {g ? displayName(g) : "Unknown"}
                        {p.slot === 1 && (
                          <span className="ml-1.5 rounded bg-fairway-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100">C</span>
                        )}
                      </span>
                      {mine && p.slot !== 1 && (
                        <button onClick={() => run(() => removeMatchPlayer(match.id, p.golfer_id))}
                          disabled={pending}
                          className="shrink-0 text-xs text-muted transition hover:text-flag-500">×</button>
                      )}
                    </li>
                  );
                })}
                {Array.from({ length: Math.max(0, open) }, (_, i) => (
                  <li key={`o${i}`}
                    className="flex h-11 items-center rounded-lg border border-dashed border-line px-3 text-xs text-muted">
                    Open
                  </li>
                ))}
              </ul>

              {mine && open > 0 && (
                <div className="mt-3">
                  <button onClick={() => setOpenTeam(openTeam === team.id ? null : team.id)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm font-medium transition hover:border-fairway-300">
                    {openTeam === team.id ? "Close" : `Add player (${open} left)`}
                  </button>

                  {openTeam === team.id && (
                    <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-line p-1.5">
                      {available.length === 0 && (
                        <li className="p-2 text-center text-xs text-muted">Nobody left</li>
                      )}
                      {available.map((g) => (
                        <li key={g.id}>
                          <button
                            onClick={() => run(() => addMatchPlayer(match.id, team.id, g.id))}
                            disabled={pending}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-surface disabled:opacity-50">
                            <GolferAvatar name={displayName(g)} url={null} size="sm" />
                            <span className="min-w-0 flex-1 truncate">{displayName(g)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
