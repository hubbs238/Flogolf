"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { displayName } from "@/lib/scoring";
import {
  importFromDraft, openRosters, savePayouts, setFb18,
  setMatchCaptain, updateMatchSettings,
} from "@/app/(app)/games/actions";
import type { PayoutTable } from "@/lib/game";
import type { Draft, Golfer, Match, MatchTeam } from "@/lib/types";

type Tables = {
  main: PayoutTable;
  front: PayoutTable;
  back: PayoutTable;
  total: PayoutTable;
};

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
  const [saved, setSaved] = useState(false);
  const [tables, setTables] = useState<Tables>({
    main: { ...payouts }, front: { ...fb18Payouts.front },
    back: { ...fb18Payouts.back }, total: { ...fb18Payouts.total },
  });

  const positions = Array.from({ length: match.team_count }, (_, i) => i + 1);
  const mainRate = Number(match.dollars_per_unit);
  const fb18Rate = Number(match.fb18_dollars_per_unit ?? match.dollars_per_unit);
  const captainIds = new Set(teams.map((t) => t.captain_golfer_id).filter(Boolean) as string[]);
  const mainSum = positions.reduce((n, p) => n + (tables.main[p] ?? 0), 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else setError(r.error ?? "Something went wrong.");
    });
  }

  function edit(table: keyof Tables, position: number, value: number) {
    setTables((prev) => ({ ...prev, [table]: { ...prev[table], [position]: value } }));
    setSaved(false);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-raised p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Round settings</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium">$ per unit</span>
            <input type="number" min={0} step="0.5" defaultValue={match.dollars_per_unit}
              onBlur={(e) => run(() => updateMatchSettings(match.id, { dollarsPerUnit: Number(e.target.value) }))}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400" />
          </label>
          <label>
            <span className="mb-1.5 block text-sm font-medium">$ per unit, FB18</span>
            <input type="number" min={0} step="0.5"
              defaultValue={match.fb18_dollars_per_unit ?? match.dollars_per_unit}
              onBlur={(e) => run(() => updateMatchSettings(match.id, { fb18DollarsPerUnit: Number(e.target.value) }))}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 outline-none focus:border-fairway-400" />
            <span className="mt-1 block text-xs text-muted">
              Set this to 1 and the FB18 numbers below are dollars
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
        <h2 className="mb-3 font-semibold">Captains and FB18</h2>
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
              <button onClick={() => run(() => setFb18(match.id, team.id, !team.in_fb18))}
                disabled={pending}
                className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                  team.in_fb18
                    ? "border-fairway-400 bg-fairway-50 text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100"
                    : "border-line text-muted hover:border-fairway-300"}`}>
                FB18
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Units by finishing position</h2>
          <span className="w-full text-xs text-muted">
            Dollar figures below are what each player on that team earns.
          </span>
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
                    const rate = key === "main" ? mainRate : fb18Rate;
                    const dollars = units * rate;
                    return (
                      <td key={p} className="p-1.5 text-center align-top">
                        <input type="number" step="0.5" value={units}
                          onChange={(e) => edit(key, p, Number(e.target.value))}
                          className="w-14 rounded-lg border border-line bg-surface px-1 py-1.5 text-center tabular-nums outline-none focus:border-fairway-400" />
                        {/* What that unit figure is actually worth, so nobody
                            has to do the multiplication in their head. */}
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

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => run(async () => {
              const r = await savePayouts(match.id, tables.main,
                { front: tables.front, back: tables.back, total: tables.total });
              if (r.ok) setSaved(true);
              return r;
            })}
            disabled={pending}
            className="rounded-xl border border-line bg-raised px-5 py-2.5 font-medium transition hover:border-fairway-300 disabled:opacity-50">
            {pending ? "Saving..." : "Save payouts"}
          </button>
          {saved && <span className="text-sm text-fairway-600 dark:text-fairway-300">Saved</span>}
        </div>
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
