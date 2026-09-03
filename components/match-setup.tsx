"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MatchStakes } from "./match-stakes";
import { displayName } from "@/lib/scoring";
import {
  importFromDraft, openRosters, setMatchCaptain, updateMatchSettings,
} from "@/app/(app)/games/actions";
import type { PayoutTable } from "@/lib/game";
import type { Draft, Golfer, Match, MatchTeam } from "@/lib/types";

export function MatchSetup({
  match, teams, golfers, drafts, payouts, fb18Payouts,
}: {
  match: Match;
  teams: MatchTeam[];
  golfers: Golfer[];
  drafts: Draft[];
  payouts: PayoutTable;
  fb18Payouts: { front: PayoutTable; back: PayoutTable; total: PayoutTable };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const captainIds = new Set(teams.map((t) => t.captain_golfer_id).filter(Boolean) as string[]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-raised p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Round settings</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-sm font-medium">Course</span>
            <input defaultValue={match.course}
              onBlur={(e) => run(() => updateMatchSettings(match.id, { course: e.target.value }))}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400" />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium">Teams</span>
            <input type="number" min={2} max={12} defaultValue={match.team_count}
              onBlur={(e) => run(() => updateMatchSettings(match.id, { teamCount: Number(e.target.value) }))}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400" />
            <span className="mt-1 block text-xs text-muted">Locks once rosters open</span>
          </label>
        </div>

        {drafts.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <span className="mb-1.5 block text-sm font-medium">Import teams from a draft</span>
            <div className="flex flex-wrap gap-2">
              <select id="draft-pick" defaultValue=""
                className="min-w-48 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-fairway-400">
                <option value="">Choose a completed draft</option>
                {drafts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {new Date(d.draft_date).toLocaleDateString()}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const el = document.getElementById("draft-pick") as HTMLSelectElement;
                  if (el?.value) run(() => importFromDraft(match.id, el.value));
                }}
                disabled={pending}
                className="rounded-xl border border-line px-4 py-2 text-sm font-medium transition hover:border-fairway-300 disabled:opacity-50">
                Import
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              Pulls captains and full rosters. Replaces anything already picked here.
            </p>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Captains</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {teams.map((team) => (
            <div key={team.id} className="flex items-center gap-3 rounded-xl border border-line bg-raised p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fairway-100 text-xs font-semibold text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100">
                {team.slot}
              </span>
              <select value={team.captain_golfer_id ?? ""} disabled={pending}
                onChange={(e) => run(() => setMatchCaptain(match.id, team.id, e.target.value || null))}
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-fairway-400">
                <option value="">Choose a captain</option>
                {golfers.filter((g) => !captainIds.has(g.id) || g.id === team.captain_golfer_id)
                  .map((g) => <option key={g.id} value={g.id}>{displayName(g)}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Stakes and payouts</h2>
        <MatchStakes
          match={match} teams={teams}
          payouts={payouts} fb18Payouts={fb18Payouts}
        />
      </section>

      {error && (
        <p className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">{error}</p>
      )}

      <section className="border-t border-line pt-6">
        <button onClick={() => run(() => openRosters(match.id))} disabled={pending}
          className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50">
          Open rosters to captains
        </button>
        <p className="mt-2 text-sm text-muted">
          Captains then pick their own three teammates. You can fill any roster yourself too.
        </p>
      </section>
    </div>
  );
}
