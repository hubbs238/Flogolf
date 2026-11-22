"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveScores } from "@/app/(app)/games/actions";
import { formatRelative } from "@/lib/game";

export type CardRow = {
  id: string;
  name: string;
  /** Roster in slot order, captain first. */
  players: string[];
  /** Holes with a score posted. */
  played: number;
  /** Total against par over the holes posted, or null before any. */
  total: number | null;
};

/**
 * Moves a card that was typed against the wrong team.
 *
 * The teams stay exactly where they are: players, captain, name and place.
 * Only the scores move. Drag one team's card onto another and the two trade;
 * on a phone, where browsers send no drag events for touch, pick the team to
 * trade with from the list on the row.
 *
 * Nothing is written until Save, and the money and points follow the scores,
 * so whichever team ends up holding the winning card is the one that wins.
 */
export function ScoreSwap({ matchId, teams }: { matchId: string; teams: CardRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // cardOf[i] is the team whose ORIGINAL card currently sits on row i.
  const [cardOf, setCardOf] = useState(() => teams.map((t) => t.id));
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byId = new Map(teams.map((t) => [t.id, t]));
  const changed = cardOf.some((id, i) => id !== teams[i].id);

  function swap(a: number, b: number) {
    if (a === b || a < 0 || b < 0) return;
    setCardOf((prev) => {
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
    setError(null);
  }

  function save() {
    setError(null);
    const moves = cardOf
      .map((from, i) => ({ from, to: teams[i].id }))
      .filter((m) => m.from !== m.to);
    startTransition(async () => {
      const r = await moveScores(matchId, moves);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <h3 className="font-semibold">Move a card to the right team</h3>
      <p className="mt-1 text-sm text-muted">
        For scores typed against the wrong team. Drag a card onto the team it
        belongs to and the two cards trade places. The players, captains and
        team names stay exactly where they are; only the scores move, and the
        money and points follow them.
      </p>

      <ol className="mt-4 space-y-2">
        {teams.map((team, index) => {
          const card = byId.get(cardOf[index])!;
          const moved = card.id !== team.id;
          return (
            <li
              key={team.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== index) setOver(index);
              }}
              onDragLeave={() => setOver((o) => (o === index ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) swap(dragging, index);
                setDragging(null);
                setOver(null);
              }}
              className={`flex flex-wrap items-center gap-3 rounded-xl border bg-surface p-3 text-sm transition ${
                over === index && dragging !== index
                  ? "border-fairway-400 ring-2 ring-fairway-300/50"
                  : "border-line"
              }`}
            >
              {/* The team: fixed. */}
              <div className="min-w-0 flex-1 basis-48">
                <div className="font-medium">{team.name}</div>
                <div className="truncate text-xs text-muted">
                  {team.players.length ? team.players.join(", ") : "No players yet"}
                </div>
              </div>

              {/* The card: the only thing that moves. */}
              <div
                draggable={!pending}
                onDragStart={(e) => {
                  setDragging(index);
                  e.dataTransfer.effectAllowed = "move";
                  // Firefox will not start a drag without some data set.
                  e.dataTransfer.setData("text/plain", card.id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                className={`flex cursor-grab items-center gap-2 rounded-lg border px-3 py-2 active:cursor-grabbing ${
                  moved
                    ? "border-amber-400/60 bg-amber-300/10"
                    : "border-line bg-raised"
                } ${dragging === index ? "opacity-40" : ""}`}
              >
                <span aria-hidden className="select-none text-muted">⠿</span>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">
                    {card.total === null ? "—" : formatRelative(card.total)}
                  </div>
                  <div className="text-xs text-muted">
                    {card.played}/18
                    {moved && <> · was {card.name}&apos;s</>}
                  </div>
                </div>
              </div>

              <select
                value=""
                onChange={(e) => {
                  const other = Number(e.target.value);
                  if (!Number.isNaN(other)) swap(index, other);
                }}
                disabled={pending}
                aria-label={`Trade ${team.name}'s card with another team`}
                className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-fairway-400"
              >
                <option value="">Trade card with…</option>
                {teams.map((other, j) =>
                  j === index ? null : (
                    <option key={other.id} value={j}>{other.name}</option>
                  ),
                )}
              </select>
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="mt-3 rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">{error}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!changed || pending}
          className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
        >
          {pending ? "Moving..." : "Move the cards"}
        </button>
        {changed && !pending && (
          <button
            type="button"
            onClick={() => { setCardOf(teams.map((t) => t.id)); setError(null); }}
            className="text-sm text-muted transition hover:text-ink"
          >
            Put them back
          </button>
        )}
      </div>
    </section>
  );
}
