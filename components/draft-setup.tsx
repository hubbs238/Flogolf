"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GolferAvatar } from "./golfer-avatar";
import { TeamColumns } from "./team-columns";
import { autoDraft, totalPicks, type TeamState } from "@/lib/draft";
import { displayName, sortGolfers } from "@/lib/scoring";
import {
  setAllAvailability,
  setAvailability,
  setTeamCaptain,
  startLiveDraft,
  updateDraftSettings,
} from "@/app/(app)/draft/actions";
import type {
  Characteristic,
  Draft,
  DraftStrategy,
  DraftTeam,
  ScoredGolfer,
} from "@/lib/types";

type PoolGolfer = ScoredGolfer & { photo: string | null };

export function DraftSetup({
  draft,
  teams,
  golfers,
  availability,
  characteristics,
  isAdmin,
}: {
  draft: Draft;
  teams: DraftTeam[];
  golfers: PoolGolfer[];
  availability: Record<string, boolean>;
  characteristics: Characteristic[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mock, setMock] = useState<TeamState[] | null>(null);
  const [strategy, setStrategy] = useState<DraftStrategy>(draft.strategy);

  const byId = useMemo(
    () => new Map(golfers.map((g) => [g.id, g])),
    [golfers],
  );

  const captainIds = new Set(
    teams.map((t) => t.captain_golfer_id).filter(Boolean) as string[],
  );

  const available = golfers.filter((g) => availability[g.id] !== false);
  const draftable = available.filter((g) => !captainIds.has(g.id));
  const needed = totalPicks(draft.team_count, draft.roster_size);
  const short = needed - draftable.length;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result.error ?? "Something went wrong.");
    });
  }

  function runMock() {
    setError(null);
    const missing = teams.some((t) => !t.captain_golfer_id);
    if (missing) {
      setError("Give every team a captain first.");
      return;
    }

    const ordered = [...teams].sort((a, b) => a.slot - b.slot);
    setMock(
      autoDraft({
        pool: draftable,
        captains: ordered.map((t) =>
          t.captain_golfer_id ? (byId.get(t.captain_golfer_id) ?? null) : null,
        ),
        teamNames: ordered.map((t) => t.name),
        rosterSize: draft.roster_size,
        strategy,
        characteristics,
      }),
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-12 text-center">
        <p className="text-lg font-medium">{draft.name} is still being set up</p>
        <p className="mt-1 text-sm text-muted">
          An admin is picking captains and confirming who is playing. This page
          updates when the draft goes live.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-raised p-5 shadow-sm">
        <h2 className="mb-4 font-semibold">Settings</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            <span className="mb-1.5 block text-sm font-medium">Teams</span>
            <input
              type="number"
              min={2}
              max={12}
              defaultValue={draft.team_count}
              onBlur={(event) =>
                run(() =>
                  updateDraftSettings(draft.id, {
                    teamCount: Number(event.target.value),
                  }),
                )
              }
              className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400"
            />
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium">
              Players per team
            </span>
            <input
              type="number"
              min={2}
              max={20}
              defaultValue={draft.roster_size}
              onBlur={(event) =>
                run(() =>
                  updateDraftSettings(draft.id, {
                    rosterSize: Number(event.target.value),
                  }),
                )
              }
              className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400"
            />
          </label>

          <label>
            <span className="mb-1.5 block text-sm font-medium">Strategy</span>
            <select
              value={strategy}
              onChange={(event) => {
                const next = event.target.value as DraftStrategy;
                setStrategy(next);
                setMock(null);
                run(() => updateDraftSettings(draft.id, { strategy: next }));
              }}
              className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400"
            >
              <option value="balanced">Balanced</option>
              <option value="overall">Overall</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-muted">
          {strategy === "balanced"
            ? "Balanced picks whoever raises the team's weakest area the most, so a roster does not stack four long hitters who cannot putt."
            : "Overall simply takes the best available player by weighted score."}
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Captains</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {[...teams]
            .sort((a, b) => a.slot - b.slot)
            .map((team) => (
              <div
                key={team.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-raised p-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-fairway-100 text-xs font-semibold text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100">
                  {team.slot}
                </span>
                <span className="w-20 shrink-0 truncate text-sm font-medium">
                  {team.name}
                </span>
                <select
                  value={team.captain_golfer_id ?? ""}
                  disabled={pending}
                  onChange={(event) => {
                    setMock(null);
                    run(() =>
                      setTeamCaptain(
                        draft.id,
                        team.id,
                        event.target.value || null,
                      ),
                    );
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-fairway-400"
                >
                  <option value="">Choose a captain</option>
                  {available
                    .filter(
                      (g) =>
                        !captainIds.has(g.id) || g.id === team.captain_golfer_id,
                    )
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {displayName(g)}{" "}
                        {g.overall !== null ? `(${g.overall})` : ""}
                      </option>
                    ))}
                </select>
              </div>
            ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Who is playing this week</h2>
            <p className="text-sm text-muted">
              {draftable.length} available to draft, {needed} spots to fill.
              {short > 0 && (
                <span className="text-flag-500">
                  {" "}
                  Short by {short}.
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <button
              onClick={() => run(() => setAllAvailability(draft.id, true))}
              disabled={pending}
              className="rounded-lg border border-line px-3 py-1.5 transition hover:border-fairway-300"
            >
              All in
            </button>
            <button
              onClick={() => run(() => setAllAvailability(draft.id, false))}
              disabled={pending}
              className="rounded-lg border border-line px-3 py-1.5 transition hover:border-fairway-300"
            >
              All out
            </button>
          </div>
        </div>

        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sortGolfers(golfers, "overall").map((golfer) => {
            const isAvailable = availability[golfer.id] !== false;
            const isCaptain = captainIds.has(golfer.id);
            return (
              <li key={golfer.id}>
                <button
                  onClick={() => {
                    setMock(null);
                    run(() =>
                      setAvailability(draft.id, golfer.id, !isAvailable),
                    );
                  }}
                  disabled={pending}
                  className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                    isAvailable
                      ? "border-fairway-300 bg-raised"
                      : "border-line bg-surface opacity-55"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${
                      isAvailable
                        ? "border-fairway-500 bg-fairway-500 text-white"
                        : "border-line"
                    }`}
                  >
                    {isAvailable ? "✓" : ""}
                  </span>
                  <GolferAvatar
                    name={displayName(golfer)}
                    url={(golfer as PoolGolfer).photo}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {displayName(golfer)}
                    {isCaptain && (
                      <span className="ml-1.5 text-xs text-muted">captain</span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted">
                    {golfer.overall ?? "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {error && (
        <p className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">
          {error}
        </p>
      )}

      <section className="flex flex-wrap gap-3 border-t border-line pt-6">
        <button
          onClick={runMock}
          disabled={pending}
          className="rounded-xl border border-line bg-raised px-5 py-2.5 font-medium transition hover:border-fairway-300 disabled:opacity-50"
        >
          Run mock draft
        </button>
        <button
          onClick={() => run(() => startLiveDraft(draft.id))}
          disabled={pending || short > 0}
          className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
        >
          Start live draft
        </button>
      </section>

      {mock && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">Mock result</h2>
            <button
              onClick={() => setMock(null)}
              className="text-sm text-muted transition hover:text-ink"
            >
              Clear
            </button>
          </div>
          <p className="mb-4 text-sm text-muted">
            Nothing here is saved. Change the strategy or the availability and
            run it again to compare.
          </p>
          <TeamColumns
            teams={mock}
            characteristics={characteristics}
            rosterSize={draft.roster_size}
          />
        </section>
      )}
    </div>
  );
}
