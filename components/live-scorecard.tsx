"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setHoleScore } from "@/app/(app)/games/actions";
import { FRONT_NINE, BACK_NINE, type HoleScores } from "@/lib/game";
import type { Match, MatchTeam } from "@/lib/types";

/**
 * Live scoring grid. Front nine and back nine are separate blocks, each with
 * its own total, plus a combined eighteen.
 *
 * Every hole write goes straight to the database and everyone watching sees
 * it land, which is what "see everyone's score in real time" needs.
 */

/**
 * Defined at module scope on purpose. Nested inside the parent it would be a
 * fresh component type on every render, so React would unmount and remount
 * the whole grid on each keystroke and the input would lose focus mid entry.
 */
function Nine({
  holes, label, teams, scores, canEdit, pending, onSave,
}: {
  holes: readonly number[];
  label: string;
  teams: MatchTeam[];
  scores: HoleScores;
  canEdit: (team: MatchTeam) => boolean;
  pending: boolean;
  onSave: (teamId: string, hole: number, raw: string) => void;
}) {
  const sum = (teamId: string) => {
    let t = 0; let any = false;
    for (const h of holes) {
      const v = scores[teamId]?.[h];
      if (v !== undefined) { t += v; any = true; }
    }
    return any ? t : null;
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th className="sticky left-0 z-10 bg-raised p-3 text-left font-medium">Team</th>
            {holes.map((h) => (
              <th key={h} className="w-12 p-2 text-center font-medium">{h}</th>
            ))}
            <th className="w-14 p-2 text-center font-semibold text-ink">{label}</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => {
            const editable = canEdit(team);
            return (
              <tr key={team.id} className="border-b border-line last:border-0">
                <td className="sticky left-0 z-10 max-w-36 truncate bg-raised p-3 font-medium">
                  {team.name}
                  {editable && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-fairway-600 dark:text-fairway-300">
                      you
                    </span>
                  )}
                </td>
                {holes.map((h) => (
                  <td key={h} className="p-1 text-center">
                    <input
                      type="number" min={1} max={30} inputMode="numeric"
                      defaultValue={scores[team.id]?.[h] ?? ""}
                      disabled={!editable || pending}
                      onBlur={(e) => {
                        const cur = scores[team.id]?.[h];
                        const next = e.target.value.trim();
                        if (String(cur ?? "") === next) return;
                        onSave(team.id, h, next);
                      }}
                      className={`w-11 rounded-lg border px-1 py-1.5 text-center tabular-nums outline-none transition ${
                        editable
                          ? "border-line bg-surface focus:border-fairway-400"
                          : "border-transparent bg-transparent text-muted"}`}
                    />
                  </td>
                ))}
                <td className="p-2 text-center font-semibold tabular-nums">
                  {sum(team.id) ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LiveScorecard({
  match, teams, scores, isAdmin, myUserId,
}: {
  match: Match;
  teams: MatchTeam[];
  scores: HoleScores;
  isAdmin: boolean;
  myUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`match-${match.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "hole_scores", filter: `match_id=eq.${match.id}` },
        () => router.refresh())
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${match.id}` },
        () => router.refresh())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "tie_decisions", filter: `match_id=eq.${match.id}` },
        () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [match.id, router]);

  function save(teamId: string, hole: number, raw: string) {
    const trimmed = raw.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 30)) {
      setError("Scores run 1 to 30.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await setHoleScore(match.id, teamId, hole, value);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  const canEdit = (team: MatchTeam) => isAdmin || team.captain_user_id === myUserId;

  const sum = (teamId: string, holes: readonly number[]) => {
    let t = 0; let any = false;
    for (const h of holes) {
      const v = scores[teamId]?.[h];
      if (v !== undefined) { t += v; any = true; }
    }
    return any ? t : null;
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">{error}</p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Front nine</h3>
        <Nine holes={FRONT_NINE} label="Out" teams={teams} scores={scores}
          canEdit={canEdit} pending={pending} onSave={save} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Back nine</h3>
        <Nine holes={BACK_NINE} label="In" teams={teams} scores={scores}
          canEdit={canEdit} pending={pending} onSave={save} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <th className="p-3 text-left font-medium">Team</th>
              <th className="w-20 p-2 text-center font-medium">Out</th>
              <th className="w-20 p-2 text-center font-medium">In</th>
              <th className="w-20 p-2 text-center font-semibold text-ink">Total</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id} className="border-b border-line last:border-0">
                <td className="p-3 font-medium">
                  {team.name}
                  {team.in_fb18 && (
                    <span className="ml-2 rounded bg-fairway-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100">
                      FB18
                    </span>
                  )}
                </td>
                <td className="p-2 text-center tabular-nums">{sum(team.id, FRONT_NINE) ?? "—"}</td>
                <td className="p-2 text-center tabular-nums">{sum(team.id, BACK_NINE) ?? "—"}</td>
                <td className="p-2 text-center font-semibold tabular-nums">
                  {sum(team.id, [...FRONT_NINE, ...BACK_NINE]) ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
