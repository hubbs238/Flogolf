"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reorderMatchTeams } from "@/app/(app)/games/actions";
import { formatRelative } from "@/lib/game";

export type TeamOrderRow = {
  id: string;
  slot: number;
  name: string;
  /** Roster in slot order, captain first. */
  players: string[];
  /** Holes with a score posted. */
  played: number;
  /** Total against par over the holes posted, or null before any. */
  total: number | null;
};

/**
 * Reorders a round's teams by dragging, or with the arrows on a phone.
 *
 * A team moves as a whole: its players, its card, its captain and its tie
 * rulings all belong to the team rather than to its place, so nothing has to
 * be re-entered. The card total is shown on every row so that is visible
 * before saving, and a team still on its default name shows the name it will
 * take in its new place.
 *
 * Nothing is written until Save. Dragging is the desktop gesture; mobile
 * browsers do not fire drag events for touch, which is what the arrows are for.
 */
export function TeamOrder({ matchId, teams }: { matchId: string; teams: TeamOrderRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [order, setOrder] = useState(() => teams.map((t) => t.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const byId = new Map(teams.map((t) => [t.id, t]));
  const original = teams.map((t) => t.id);
  const changed = order.some((id, i) => id !== original[i]);

  function move(from: number, to: number) {
    if (from === to || to < 0 || to >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      const [id] = next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
    setSaved(false);
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await reorderMatchTeams(matchId, order);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  /** The name a team will carry in a given place. Default names follow. */
  const nameAt = (team: TeamOrderRow, index: number) =>
    team.name.trim() === `Team ${team.slot}` ? `Team ${index + 1}` : team.name;

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <h3 className="font-semibold">Team order</h3>
      <p className="mt-1 text-sm text-muted">
        Drag a team to a new place, or use the arrows. Each team takes its
        players and its card with it, so if Bay 1 ended up as Team 2, move it
        up and nothing needs re-entering. The money and points do not depend
        on the order.
      </p>

      <ol className="mt-4 space-y-2">
        {order.map((id, index) => {
          const team = byId.get(id);
          if (!team) return null;
          const renamed = nameAt(team, index) !== team.name;
          const moved = original[index] !== id;
          return (
            <li
              key={id}
              draggable={!pending}
              onDragStart={(e) => {
                setDragging(id);
                e.dataTransfer.effectAllowed = "move";
                // Firefox will not start a drag without some data set.
                e.dataTransfer.setData("text/plain", id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== index) setOver(index);
              }}
              onDragLeave={() => setOver((o) => (o === index ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) move(order.indexOf(dragging), index);
                setDragging(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              className={`flex cursor-grab items-center gap-3 rounded-xl border bg-surface p-3 text-sm transition active:cursor-grabbing ${
                over === index && dragging !== id
                  ? "border-fairway-400 ring-2 ring-fairway-300/50"
                  : moved
                    ? "border-amber-400/60"
                    : "border-line"
              } ${dragging === id ? "opacity-40" : ""}`}
            >
              <span aria-hidden className="select-none text-muted">⠿</span>
              <span className="w-6 shrink-0 text-center font-semibold tabular-nums">{index + 1}</span>

              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {nameAt(team, index)}
                  {renamed && (
                    <span className="ml-2 text-xs font-normal text-muted">was {team.name}</span>
                  )}
                </div>
                <div className="truncate text-xs text-muted">
                  {team.players.length ? team.players.join(", ") : "No players yet"}
                </div>
              </div>

              <div className="shrink-0 text-right text-xs text-muted">
                <div className="text-sm font-semibold tabular-nums text-ink">
                  {team.total === null ? "—" : formatRelative(team.total)}
                </div>
                {team.played}/18 holes
              </div>

              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0 || pending}
                  aria-label={`Move ${team.name} up`}
                  className="rounded px-2 text-muted transition hover:text-ink disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => move(index, index + 1)}
                  disabled={index === order.length - 1 || pending}
                  aria-label={`Move ${team.name} down`}
                  className="rounded px-2 text-muted transition hover:text-ink disabled:opacity-30"
                >
                  ▼
                </button>
              </div>
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
          {pending ? "Saving..." : "Save order"}
        </button>
        {changed && !pending && (
          <button
            type="button"
            onClick={() => { setOrder(original); setError(null); }}
            className="text-sm text-muted transition hover:text-ink"
          >
            Put it back
          </button>
        )}
        {saved && !changed && <span className="text-sm text-muted">Saved.</span>}
      </div>
    </section>
  );
}
