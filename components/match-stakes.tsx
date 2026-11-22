"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePayouts, setFb18, updateMatchSettings } from "@/app/(app)/games/actions";
import { SECOND_EIGHTEEN_RATE_SHARE } from "@/lib/game";
import type { Fb18Segment, PayoutTable } from "@/lib/game";
import type { Match, MatchTeam } from "@/lib/types";

type Tables = {
  main: PayoutTable;
  front: PayoutTable;
  back: PayoutTable;
  /** The lowest eighteen. */
  total: PayoutTable;
  /** The second lowest eighteen, a pot of its own that the lowest pays into. */
  second: PayoutTable;
};

/**
 * Stakes and payout table for a round.
 *
 * Shared by the setup screen and the after-the-fact editor, because a
 * correction to a finished round has to use the identical controls or the
 * two drift and one of them starts lying.
 *
 * Team count is deliberately absent: changing it after rosters exist would
 * orphan scores. The action refuses it too.
 */
export function MatchStakes({
  match, teams, payouts, fb18Payouts, onSaved,
}: {
  match: Match;
  teams: MatchTeam[];
  payouts: PayoutTable;
  fb18Payouts: Partial<Record<Fb18Segment, PayoutTable>>;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tables, setTables] = useState<Tables>({
    main: { ...payouts }, front: { ...fb18Payouts.front },
    back: { ...fb18Payouts.back }, total: { ...fb18Payouts.total },
    // Empty on a round made before this pot existed, which is how such a
    // round keeps settling exactly as it did.
    second: { ...(fb18Payouts.second ?? {}) },
  });

  const positions = Array.from({ length: match.team_count }, (_, i) => i + 1);
  const mainRate = Number(match.dollars_per_unit);
  const fb18Rate = Number(match.fb18_dollars_per_unit ?? match.dollars_per_unit);
  // Each FB18 segment can be worth its own money; null inherits the row above.
  const rateFor: Record<keyof Tables, number> = {
    main: mainRate,
    front: Number(match.fb18_front_dollars_per_unit ?? fb18Rate),
    back: Number(match.fb18_back_dollars_per_unit ?? fb18Rate),
    total: Number(match.fb18_total_dollars_per_unit ?? fb18Rate),
    // Falls back to HALF the eighteen's rate, not to the side game rate,
    // because that is what the league pays it. Same chain as the server's.
    second: Number(
      match.fb18_second_dollars_per_unit ??
      Number(match.fb18_total_dollars_per_unit ?? fb18Rate) * SECOND_EIGHTEEN_RATE_SHARE,
    ),
  };
  const mainSum = positions.reduce((n, p) => n + (tables.main[p] ?? 0), 0);
  const rake = Number(match.dues_per_player ?? 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) { router.refresh(); onSaved?.(); }
      else setError(r.error ?? "Something went wrong.");
    });
  }

  function edit(table: keyof Tables, position: number, value: number) {
    setTables((prev) => ({ ...prev, [table]: { ...prev[table], [position]: value } }));
    setSaved(false);
  }

  return (
    <div className="space-y-6">
      {/*
        Two separate choices. The type is only what the points are worth, so it
        changes whenever. The length decides which holes make a match, and it
        locks once rosters open - the control below swaps to a read-only line
        at that point rather than offering something the action would refuse.
      */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="mb-1.5 block text-sm font-medium">Round type</span>
          <select
            defaultValue={match.round_type === "major" ? "major" : "season"}
            onChange={(e) =>
              run(() => updateMatchSettings(match.id, {
                roundType: e.target.value as "season" | "major",
              }))
            }
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400"
          >
            <option value="season">Season round</option>
            <option value="major">Major — double points</option>
          </select>
          <span className="mt-1 block text-xs text-muted">
            Majors award two points per dollar won before rake in each category. A loss in the matches or FB18 earns zero points for that category.
          </span>
        </label>

        {/*
          Open at every stage, so a round entered with the wrong match length
          can be put right after the fact. On a round past setup the matches
          re-score from the same holes, and any tie rulings are cleared, since
          they are keyed by match number and "match 2" means different holes
          once the length changes. That is asked about before it happens.
        */}
        <label>
          <span className="mb-1.5 block text-sm font-medium">Match length</span>
          <select
            defaultValue={Number(match.set_holes) === 6 ? 6 : 3}
            onChange={(e) => {
              const next = Number(e.target.value) === 6 ? 6 : 3;
              const was = Number(match.set_holes) === 6 ? 6 : 3;
              if (match.status !== "setup") {
                const ok = window.confirm(
                  "Re-score this round as " +
                    (next === 6 ? "three six-hole matches" : "six three-hole matches") +
                    "? The holes stay as entered; the matches, money and points are " +
                    "worked out again from them. Any tie rulings made on this round's " +
                    "matches are cleared, and its ties go back to the default rule.",
                );
                if (!ok) {
                  e.target.value = String(was);
                  return;
                }
              }
              run(() => updateMatchSettings(match.id, { setHoles: next }));
            }}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400"
          >
            <option value={3}>Six three-hole matches</option>
            <option value={6}>Three six-hole matches</option>
          </select>
          <span className="mt-1 block text-xs text-muted">
            {match.status === "setup"
              ? "The same eighteen holes either way."
              : "Can be changed after the fact. The round re-scores from the holes already entered."}
          </span>
          {match.round_type === "major" && Number(match.set_holes) === 6 && (
            <span className="mt-2 block rounded-lg bg-amber-300/15 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-400/40 dark:text-amber-200">
              Six-hole sets pay out three matches per round.
            </span>
          )}
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label>
          <span className="mb-1.5 block text-sm font-medium">$ per unit</span>
          <input type="number" min={0} step="0.5" defaultValue={mainRate}
            onBlur={(e) => run(() => updateMatchSettings(match.id, { dollarsPerUnit: Number(e.target.value) }))}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400" />
          <span className="mt-1 block text-xs text-muted">Per share. Each bay splits four shares among its players.</span>
        </label>

        <label>
          <span className="mb-1.5 block text-sm font-medium">Rake</span>
          <input type="number" min={0} step="1" defaultValue={rake}
            onBlur={(e) => run(() => updateMatchSettings(match.id, { rakePerPlayer: Number(e.target.value) }))}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400" />
          <span className="mt-1 block text-xs text-muted">
            Charged to every player, taken off settlement. Never touches points.
          </span>
        </label>

        <label>
          <span className="mb-1.5 block text-sm font-medium">Tie default</span>
          <select defaultValue={match.tie_default}
            onChange={(e) => run(() => updateMatchSettings(match.id, { tieDefault: e.target.value as "hole" | "set" }))}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400">
            <option value="hole">Next hole</option>
            <option value="set">Next set</option>
          </select>
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium">FB18 rates</span>
        <p className="mb-2 text-xs text-muted">
          Each of the four pots can be worth different money. Set one to 1 and
          its payout numbers below become dollars. The second lowest eighteen
          starts at half the lowest, which is how the league pays it.
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          {([
            ["front", "F9", "fb18FrontDollarsPerUnit"],
            ["back", "B9", "fb18BackDollarsPerUnit"],
            ["total", "Lowest 18", "fb18TotalDollarsPerUnit"],
            ["second", "2nd lowest 18", "fb18SecondDollarsPerUnit"],
          ] as const).map(([seg, label, field]) => (
            <label key={seg}>
              <span className="mb-1.5 block text-xs font-medium text-muted">
                $ per unit, {label}
              </span>
              <input type="number" min={0} step="0.5" defaultValue={rateFor[seg]}
                onBlur={(e) =>
                  run(() => updateMatchSettings(match.id, { [field]: Number(e.target.value) }))
                }
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400" />
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">In the FB18 side game</span>
          <span className="text-xs text-muted">Dollar figures below are per share</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {teams.map((team) => (
            <button key={team.id} onClick={() => run(() => setFb18(match.id, team.id, !team.in_fb18))}
              disabled={pending}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                team.in_fb18
                  ? "border-fairway-400 bg-fairway-50 text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100"
                  : "border-line text-muted hover:border-fairway-300"}`}>
              {team.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">Units by finishing position</span>
          <span className={`text-sm ${mainSum === 0 ? "text-muted" : "text-flag-500"}`}>
            Main game total: {mainSum > 0 ? "+" : ""}{mainSum}
            {mainSum !== 0 && " (money is leaking in or out)"}
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th className="p-3 text-left font-medium">Game</th>
                {positions.map((p) => <th key={p} className="p-2 text-center font-medium">{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {([["main", Number(match.set_holes) === 6 ? "Each 6 hole match" : "Each 3 hole match"],
                 ["front", "FB18 front 9"],
                 ["back", "FB18 back 9"],
                 ["total", "FB18 lowest 18"],
                 ["second", "FB18 2nd lowest 18"]] as const).map(([key, label]) => (
                <tr key={key} className="border-b border-line last:border-0">
                  <td className="p-3 font-medium">{label}</td>
                  {positions.map((p) => {
                    const units = tables[key][p] ?? 0;
                    const dollars = units * rateFor[key];
                    return (
                      <td key={p} className="p-1.5 text-center align-top">
                        <input type="number" step="0.5" value={units}
                          onChange={(e) => edit(key, p, Number(e.target.value))}
                          className="w-14 rounded-lg border border-line bg-surface px-1 py-1.5 text-center tabular-nums outline-none focus:border-fairway-400" />
                        <span className={`mt-1 block text-[11px] tabular-nums ${
                          dollars > 0 ? "text-fairway-600 dark:text-fairway-300"
                            : dollars < 0 ? "text-flag-500" : "text-muted"}`}>
                          {dollars > 0 ? "+" : dollars < 0 ? "-" : ""}
                          ${Math.abs(dollars).toFixed(2)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => run(async () => {
            const r = await savePayouts(match.id, tables.main, {
              front: tables.front, back: tables.back,
              total: tables.total, second: tables.second,
            });
            if (r.ok) setSaved(true);
            return r;
          })}
          disabled={pending}
          className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50">
          {pending ? "Saving..." : "Save payouts"}
        </button>
        {saved && <span className="text-sm text-fairway-600 dark:text-fairway-300">Saved. Every figure recalculated.</span>}
      </div>
    </div>
  );
}
