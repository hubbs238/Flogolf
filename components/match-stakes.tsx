"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePayouts, setFb18, updateMatchSettings } from "@/app/(app)/games/actions";
import type { PayoutTable } from "@/lib/game";
import type { Match, MatchTeam } from "@/lib/types";

type Tables = {
  main: PayoutTable;
  front: PayoutTable;
  back: PayoutTable;
  total: PayoutTable;
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
  fb18Payouts: { front: PayoutTable; back: PayoutTable; total: PayoutTable };
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tables, setTables] = useState<Tables>({
    main: { ...payouts }, front: { ...fb18Payouts.front },
    back: { ...fb18Payouts.back }, total: { ...fb18Payouts.total },
  });

  const positions = Array.from({ length: match.team_count }, (_, i) => i + 1);
  const mainRate = Number(match.dollars_per_unit);
  const fb18Rate = Number(match.fb18_dollars_per_unit ?? match.dollars_per_unit);
  const mainSum = positions.reduce((n, p) => n + (tables.main[p] ?? 0), 0);

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
      <div className="grid gap-4 sm:grid-cols-3">
        <label>
          <span className="mb-1.5 block text-sm font-medium">$ per unit</span>
          <input type="number" min={0} step="0.5" defaultValue={mainRate}
            onBlur={(e) => run(() => updateMatchSettings(match.id, { dollarsPerUnit: Number(e.target.value) }))}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400" />
          <span className="mt-1 block text-xs text-muted">Paid to each player</span>
        </label>

        <label>
          <span className="mb-1.5 block text-sm font-medium">$ per unit, FB18</span>
          <input type="number" min={0} step="0.5" defaultValue={fb18Rate}
            onBlur={(e) => run(() => updateMatchSettings(match.id, { fb18DollarsPerUnit: Number(e.target.value) }))}
            className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400" />
          <span className="mt-1 block text-xs text-muted">Set to 1 to enter dollars</span>
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
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium">In the FB18 side game</span>
          <span className="text-xs text-muted">Dollar figures below are per player</span>
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
              {([["main", "Each 3 hole match"], ["front", "FB18 front 9"],
                 ["back", "FB18 back 9"], ["total", "FB18 all 18"]] as const).map(([key, label]) => (
                <tr key={key} className="border-b border-line last:border-0">
                  <td className="p-3 font-medium">{label}</td>
                  {positions.map((p) => {
                    const units = tables[key][p] ?? 0;
                    const dollars = units * (key === "main" ? mainRate : fb18Rate);
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
            const r = await savePayouts(match.id, tables.main,
              { front: tables.front, back: tables.back, total: tables.total });
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
