"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GolferAvatar } from "./golfer-avatar";
import { TeamColumns } from "./team-columns";
import { createClient } from "@/lib/supabase/client";
import { displayName } from "@/lib/scoring";
import {
  makePick,
  resetDraft,
  undoLastPick,
} from "@/app/(app)/draft/actions";
import {
  pickRound,
  pickSlot,
  rankAvailable,
  totalPicks,
  type TeamState,
} from "@/lib/draft";
import type {
  Characteristic,
  Draft,
  DraftPick,
  DraftTeam,
  ScoredGolfer,
} from "@/lib/types";

type PoolGolfer = ScoredGolfer & { photo: string | null };

export function DraftBoard({
  draft,
  teams,
  picks,
  golfers,
  availability,
  characteristics,
  isAdmin,
  myUserId,
}: {
  draft: Draft;
  teams: DraftTeam[];
  picks: DraftPick[];
  golfers: PoolGolfer[];
  availability: Record<string, boolean>;
  characteristics: Characteristic[];
  isAdmin: boolean;
  myUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Everyone watching the same board sees the same picks land.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`draft-${draft.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "draft_picks",
          filter: `draft_id=eq.${draft.id}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "drafts",
          filter: `id=eq.${draft.id}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [draft.id, router]);

  const byId = useMemo(() => new Map(golfers.map((g) => [g.id, g])), [golfers]);
  const orderedTeams = useMemo(
    () => [...teams].sort((a, b) => a.slot - b.slot),
    [teams],
  );

  const teamStates: TeamState[] = useMemo(
    () =>
      orderedTeams.map((team) => ({
        slot: team.slot,
        name: team.name,
        captain: team.captain_golfer_id
          ? (byId.get(team.captain_golfer_id) ?? null)
          : null,
        picks: picks
          .filter((p) => p.team_id === team.id)
          .sort((a, b) => a.pick_number - b.pick_number)
          .map((p) => byId.get(p.golfer_id))
          .filter(Boolean) as ScoredGolfer[],
      })),
    [orderedTeams, picks, byId],
  );

  const total = totalPicks(draft.team_count, draft.roster_size);
  const isComplete = draft.status === "complete" || draft.current_pick > total;

  const currentSlot = isComplete
    ? undefined
    : pickSlot(draft.current_pick, draft.team_count);
  const currentRound = pickRound(draft.current_pick, draft.team_count);
  const currentTeam = orderedTeams.find((t) => t.slot === currentSlot);
  const currentState = teamStates.find((t) => t.slot === currentSlot);

  const isMyTurn = !!currentTeam && currentTeam.captain_user_id === myUserId;
  const canPick = !isComplete && (isMyTurn || isAdmin);

  const pickedIds = new Set(picks.map((p) => p.golfer_id));
  const captainIds = new Set(
    orderedTeams.map((t) => t.captain_golfer_id).filter(Boolean) as string[],
  );

  const available = golfers.filter(
    (g) =>
      availability[g.id] !== false &&
      !pickedIds.has(g.id) &&
      !captainIds.has(g.id),
  );

  const ranked = useMemo(
    () =>
      currentState
        ? rankAvailable(available, currentState, draft.strategy, characteristics)
        : available.map((golfer) => ({
            golfer,
            gain: golfer.overall ?? 0,
            fills: null,
          })),
    [available, currentState, draft.strategy, characteristics],
  );

  function pick(golferId: string) {
    setError(null);
    startTransition(async () => {
      const result = await makePick(draft.id, golferId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-raised p-5 shadow-sm">
        {isComplete ? (
          <div className="flex-1">
            <p className="text-lg font-semibold">Draft complete</p>
            <p className="text-sm text-muted">
              {draft.team_count} teams of {draft.roster_size}. Go play.
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1">
              <p className="text-xs uppercase tracking-wide text-muted">
                Round {currentRound} · Pick {draft.current_pick} of {total}
              </p>
              <p className="text-lg font-semibold">
                {currentTeam?.name ?? "—"} is on the clock
              </p>
              <p className="text-sm text-muted">
                {isMyTurn
                  ? "Your pick. Choose from the list below."
                  : currentState?.captain
                    ? `Captain ${displayName(currentState.captain)}`
                    : "Waiting"}
              </p>
            </div>
            {isMyTurn && (
              <span className="rounded-full bg-flag-500 px-3 py-1.5 text-sm font-medium text-white">
                Your turn
              </span>
            )}
          </>
        )}

        {isAdmin && (
          <div className="flex gap-2 text-sm">
            {picks.length > 0 && (
              <button
                onClick={() => run(() => undoLastPick(draft.id))}
                disabled={pending}
                className="rounded-lg border border-line px-3 py-1.5 transition hover:border-fairway-300 disabled:opacity-50"
              >
                Undo last pick
              </button>
            )}
            <button
              onClick={() => run(() => resetDraft(draft.id))}
              disabled={pending}
              className="rounded-lg border border-line px-3 py-1.5 text-muted transition hover:border-flag-500 hover:text-flag-500 disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">
          {error}
        </p>
      )}

      <TeamColumns
        teams={teamStates}
        characteristics={characteristics}
        activeSlot={currentSlot}
        rosterSize={draft.roster_size}
      />

      {!isComplete && (
        <section>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Available ({available.length})</h2>
            <p className="text-sm text-muted">
              Ranked for {currentTeam?.name ?? "this team"} using{" "}
              {draft.strategy === "balanced" ? "Balanced" : "Overall"}
            </p>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ranked.map(({ golfer, fills }, index) => (
              <li
                key={golfer.id}
                className={`flex items-center gap-3 rounded-xl border bg-raised p-3 ${
                  index === 0 && canPick
                    ? "border-fairway-400 ring-1 ring-fairway-400/30"
                    : "border-line"
                }`}
              >
                <GolferAvatar
                  name={displayName(golfer)}
                  url={(golfer as PoolGolfer).photo}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {displayName(golfer)}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {index === 0 && canPick ? "Suggested · " : ""}
                    {fills ? `fills ${fills}` : `overall ${golfer.overall ?? "—"}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted">
                  {golfer.overall ?? "—"}
                </span>
                {canPick && (
                  <button
                    onClick={() => pick(golfer.id)}
                    disabled={pending}
                    className="shrink-0 rounded-lg bg-fairway-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
                  >
                    Pick
                  </button>
                )}
              </li>
            ))}
          </ul>

          {available.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
              Nobody left in the pool.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
