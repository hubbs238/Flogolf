"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setHoleScore } from "@/app/(app)/games/actions";
import { BACK_NINE, FRONT_NINE, formatRelative, type HoleScores } from "@/lib/game";
import type { Match, MatchTeam } from "@/lib/types";

function sumOver(
  scores: HoleScores, teamId: string, holes: readonly number[],
): number | null {
  let total = 0;
  let any = false;
  for (const h of holes) {
    const v = scores[teamId]?.[h];
    if (v !== undefined && v !== null) { total += v; any = true; }
  }
  return any ? total : null;
}

/**
 * Defined at module scope on purpose. Nested inside the parent it would be a
 * fresh component type on every render, so React would remount the whole grid
 * on each entry and drop focus mid round.
 */
function Nine({
  holes, label, teams, captainNames, scores, canEdit, pending, onSave,
}: {
  holes: readonly number[];
  label: string;
  teams: MatchTeam[];
  captainNames: Record<string, string>;
  scores: HoleScores;
  canEdit: (team: MatchTeam) => boolean;
  pending: boolean;
  onSave: (teamId: string, hole: number, value: number | null) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th className="sticky left-0 z-10 bg-raised p-3 text-left font-medium">Team</th>
            {holes.map((h) => (
              <th key={h} className="w-14 p-2 text-center font-medium">{h}</th>
            ))}
            <th className="w-14 p-2 text-center font-semibold text-ink">{label}</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => {
            const editable = canEdit(team);
            const total = sumOver(scores, team.id, holes);
            return (
              <tr key={team.id} className="border-b border-line last:border-0">
                <td className="sticky left-0 z-10 bg-raised p-3">
                  <div className="flex flex-col">
                    <span className="truncate font-medium">{team.name}</span>
                    <span className="truncate text-xs text-muted">
                      {captainNames[team.id] ?? "no captain"}
                      {editable && (
                        <span className="ml-1.5 font-semibold uppercase text-fairway-600 dark:text-fairway-300">
                          you
                        </span>
                      )}
                    </span>
                  </div>
                </td>

                {holes.map((h) => {
                  const v = scores[team.id]?.[h];
                  if (!editable) {
                    return (
                      <td key={h} className="p-1 text-center tabular-nums text-muted">
                        {formatRelative(v)}
                      </td>
                    );
                  }
                  return (
                    <td key={h} className="p-1 text-center">
                      {/*
                        A plain number input rather than a picker, because
                        scores are unbounded and a list cannot be. type="number"
                        without inputMode is deliberate: iOS shows a keypad that
                        includes the minus sign, which inputMode="numeric" hides.

                        Keyed on the saved value so a score arriving over
                        realtime replaces what is displayed; defaultValue alone
                        would be ignored after the first render.
                      */}
                      <input
                        key={`${h}:${v ?? ""}`}
                        type="number"
                        step={1}
                        defaultValue={v ?? ""}
                        disabled={pending}
                        aria-label={`Hole ${h}, ${team.name}`}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const next = raw === "" ? null : Number(raw);
                          if (next !== null && !Number.isInteger(next)) return;
                          if ((v ?? null) === next) return;
                          onSave(team.id, h, next);
                        }}
                        className={`w-13 rounded-lg border border-line bg-surface px-1 py-1.5 text-center tabular-nums outline-none transition focus:border-fairway-400 ${
                          v !== undefined && v !== null && v < 0
                            ? "font-semibold text-fairway-600 dark:text-fairway-300"
                            : ""}`}
                      />
                    </td>
                  );
                })}

                <td className="p-2 text-center font-semibold tabular-nums">
                  {formatRelative(total)}
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
  match, teams, captainNames, scores, isAdmin, myUserId,
}: {
  match: Match;
  teams: MatchTeam[];
  captainNames: Record<string, string>;
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

  function save(teamId: string, hole: number, value: number | null) {
    setError(null);
    startTransition(async () => {
      const r = await setHoleScore(match.id, teamId, hole, value);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  // A captain posts for their own team only. Admins can post for anyone,
  // which covers a dead phone or someone who never signed in.
  const canEdit = (team: MatchTeam) => isAdmin || team.captain_user_id === myUserId;

  const mine = teams.filter((t) => t.captain_user_id === myUserId);

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">{error}</p>
      )}

      <p className="text-sm text-muted">
        Scores are against par: <span className="font-medium text-ink">0</span> is par,
        {" "}<span className="font-medium text-ink">-1</span> a birdie,
        {" "}<span className="font-medium text-ink">2</span> a double bogey. Any whole
        number works, high or low. Lowest wins.
        {mine.length > 0
          ? ` You post for ${mine.map((t) => t.name).join(" and ")}.`
          : isAdmin
            ? " As an admin you can post for any team."
            : " Only team captains post scores."}
      </p>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Front nine</h3>
        <Nine holes={FRONT_NINE} label="F9" teams={teams} captainNames={captainNames}
          scores={scores} canEdit={canEdit} pending={pending} onSave={save} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Back nine</h3>
        <Nine holes={BACK_NINE} label="B9" teams={teams} captainNames={captainNames}
          scores={scores} canEdit={canEdit} pending={pending} onSave={save} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <th className="p-3 text-left font-medium">Team</th>
              <th className="w-20 p-2 text-center font-medium">F9</th>
              <th className="w-20 p-2 text-center font-medium">B9</th>
              <th className="w-20 p-2 text-center font-semibold text-ink">Total</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id} className="border-b border-line last:border-0">
                <td className="p-3">
                  <span className="font-medium">{team.name}</span>
                  <span className="ml-2 text-xs text-muted">{captainNames[team.id] ?? ""}</span>
                  {team.in_fb18 && (
                    <span className="ml-2 rounded bg-fairway-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100">
                      FB18
                    </span>
                  )}
                </td>
                <td className="p-2 text-center tabular-nums">
                  {formatRelative(sumOver(scores, team.id, FRONT_NINE))}
                </td>
                <td className="p-2 text-center tabular-nums">
                  {formatRelative(sumOver(scores, team.id, BACK_NINE))}
                </td>
                <td className="p-2 text-center font-semibold tabular-nums">
                  {formatRelative(sumOver(scores, team.id, [...FRONT_NINE, ...BACK_NINE]))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
