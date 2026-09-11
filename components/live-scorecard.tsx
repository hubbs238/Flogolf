"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 * One hole for one team.
 *
 * The cell owns what is typed in it. That is the whole point: a save round
 * trips to the server and comes back as new props, and if the input were
 * driven by those props the characters would be pulled out from under the
 * person typing. While a draft exists it wins; the moment the server agrees
 * with it, the draft dissolves and the server value takes over again.
 *
 * Nothing here waits on the network. The save is fired and forgotten, so
 * moving to the next hole is instant even on a slow connection.
 */
function ScoreCell({
  hole, teamName, value, onSave,
}: {
  hole: number;
  teamName: string;
  value: number | null | undefined;
  onSave: (hole: number, value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [seen, setSeen] = useState(value);

  // Adjusting state during render, which is the pattern React documents for
  // "a prop changed, so some state should reset". It costs less than an
  // effect: React re-runs this one component before it paints, rather than
  // committing a frame and then a second one.
  //
  // A changed value means either our own save landing - in which case it
  // matches what was typed and nothing moves on screen - or someone else
  // correcting the hole, which should win. Either way the draft is done.
  if (seen !== value) {
    setSeen(value);
    setDraft(null);
  }

  const parse = (text: string): number | null => {
    const raw = text.trim();
    return raw === "" ? null : Number(raw);
  };

  return (
    <input
      // Stable. Keying on the value remounted the input every time a save
      // came back, which threw away focus in the middle of entering a card.
      key={hole}
      type="number"
      step={1}
      value={draft ?? (value ?? "")}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const next = parse(draft);
        const unusable = next !== null && !Number.isInteger(next);
        if (unusable || next === (value ?? null)) {
          // Nothing to send. Drop the draft rather than leaving a half typed
          // number sitting there looking saved.
          setDraft(null);
          return;
        }
        onSave(hole, next);
      }}
      aria-label={`Hole ${hole}, ${teamName}`}
      className={`w-13 rounded-lg border border-line bg-surface px-1 py-1.5 text-center tabular-nums outline-none transition focus:border-fairway-400 ${
        value !== undefined && value !== null && value < 0
          ? "font-semibold text-fairway-600 dark:text-fairway-300"
          : ""}`}
    />
  );
}

/**
 * Defined at module scope on purpose. Nested inside the parent it would be a
 * fresh component type on every render, so React would remount the whole grid
 * on each entry and drop focus mid round.
 */
function Nine({
  holes, label, teams, captainNames, scores, canEdit, onSave,
}: {
  holes: readonly number[];
  label: string;
  teams: MatchTeam[];
  captainNames: Record<string, string>;
  scores: HoleScores;
  canEdit: (team: MatchTeam) => boolean;
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
                      */}
                      <ScoreCell
                        hole={h}
                        teamName={team.name}
                        value={v}
                        onSave={(hole, next) => onSave(team.id, hole, next)}
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
  const [error, setError] = useState<string | null>(null);

  /*
    Entering a nine fires nine saves, and each one comes back twice: once from
    the action and once as the channel echoes our own write. Refreshing for
    every one of those re-runs the whole round on the server and re-renders
    the page under the person's fingers. They coalesce into one instead.

    Nothing on screen waits for this. Each cell already shows what was typed,
    so the refresh only catches the totals and the results below up.
  */
  const queued = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSoon = useCallback(() => {
    if (queued.current) clearTimeout(queued.current);
    queued.current = setTimeout(() => {
      queued.current = null;
      router.refresh();
    }, 500);
  }, [router]);

  useEffect(() => () => {
    if (queued.current) clearTimeout(queued.current);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`match-${match.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "hole_scores", filter: `match_id=eq.${match.id}` },
        refreshSoon)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${match.id}` },
        refreshSoon)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "tie_decisions", filter: `match_id=eq.${match.id}` },
        refreshSoon)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [match.id, refreshSoon]);

  /*
    Fired and forgotten. Deliberately not a transition: a transition marks the
    whole grid busy, and the old code disabled every input while one was in
    flight, so the click that moved to the next hole landed on a disabled
    element and was swallowed. That is what made a score seem not to count
    until you clicked back into the box.
  */
  function save(teamId: string, hole: number, value: number | null) {
    setError(null);
    void setHoleScore(match.id, teamId, hole, value).then((r) => {
      if (r.ok) refreshSoon();
      else setError(r.error);
    });
  }

  // A captain posts for their own team only, and only while the round is
  // running. Admins can post for anyone at any time, which is what makes
  // reopening a finished round to fix a hole work. Mirrors the database
  // rule exactly, so a cell is never editable when the write would be
  // refused.
  const canEdit = (team: MatchTeam) =>
    isAdmin || (match.status === "in_progress" && team.captain_user_id === myUserId);

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
        {match.status === "complete"
          ? isAdmin
            ? " This round is final. You can still correct any hole."
            : " This round is final. Ask an admin to correct a hole."
          : mine.length > 0
            ? ` You post for ${mine.map((t) => t.name).join(" and ")}.`
            : isAdmin
              ? " As an admin you can post for any team."
              : " Only team captains post scores."}
      </p>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Front nine</h3>
        <Nine holes={FRONT_NINE} label="F9" teams={teams} captainNames={captainNames}
          scores={scores} canEdit={canEdit} onSave={save} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Back nine</h3>
        <Nine holes={BACK_NINE} label="B9" teams={teams} captainNames={captainNames}
          scores={scores} canEdit={canEdit} onSave={save} />
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
