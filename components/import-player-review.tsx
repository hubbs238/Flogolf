"use client";

import { useState } from "react";
import { nameKey } from "@/lib/game";
import type { ResolvedName } from "@/app/(app)/games/actions";

type GolferOption = { id: string; name: string; nickname?: string | null };
type Selection = { choice: string; name: string };
const NEW = "new";

export function useImportPlayers() {
  const [edits, setEdits] = useState<Record<string, Selection>>({});
  function selection(bay: number, slot: number, player: ResolvedName): Selection {
    return edits[`${bay}:${slot}`] ?? {
      choice: player.golferId ?? (player.sharedBy ? "" : NEW),
      name: player.isNew ? player.read : "",
    };
  }
  function reviewed(bay: number, slot: number, player: ResolvedName) {
    const { choice, name } = selection(bay, slot, player);
    return choice === NEW
      ? { read: name.trim(), golferId: null }
      : { read: player.read, golferId: choice || null };
  }
  return {
    selection, reviewed,
    reset: () => setEdits({}),
    change: (bay: number, slot: number, value: Selection) =>
      setEdits(prev => ({ ...prev, [`${bay}:${slot}`]: value })),
  };
}

export type ImportPlayerReview = ReturnType<typeof useImportPlayers>;

export function playerReviewErrors(
  bays: { label: string; players: ResolvedName[]; index: number }[],
  review: ImportPlayerReview,
  pool: GolferOption[],
) {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  const existingNames = new Set(pool.flatMap(g => [nameKey(g.name), nameKey(g.nickname ?? "")]));
  for (const bay of bays) {
    for (const [slot, p] of bay.players.entries()) {
      const { choice, name } = review.selection(bay.index, slot, p);
      const where = `${bay.label}, player ${slot + 1}`;
      if (!choice) { errors.push(`Choose a golfer for ${where}.`); continue; }
      const folded = nameKey(name);
      if (choice === NEW && (!folded || existingNames.has(folded))) {
        errors.push(folded ? `Choose the existing golfer or enter a distinct new name for ${where}.` : `Enter the new golfer’s name for ${where}.`);
        continue;
      }
      const key = choice === NEW ? `name:${folded}` : choice;
      const previous = seen.get(key);
      if (previous) errors.push(`${previous} and ${where} have the same golfer.`);
      else seen.set(key, where);
    }
  }
  return errors;
}

export function ImportPlayerRow({ player, bay, slot, label, pool, review, disabled = false }: {
  player: ResolvedName; bay: number; slot: number; label: string;
  pool: GolferOption[]; review: ImportPlayerReview; disabled?: boolean;
}) {
  const current = review.selection(bay, slot, player);
  const rowLabel = `${label}, ${slot === 0 ? "captain" : `player ${slot + 1}`}`;
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-6 text-xs text-muted">{slot === 0 ? "C" : slot + 1}</span>
      <span className="font-medium">{player.read}</span>
      <select aria-label={`Golfer for ${rowLabel}`} value={current.choice} disabled={disabled}
        onChange={e => review.change(bay, slot, { ...current, choice: e.target.value })}
        className="rounded-lg border border-line bg-surface px-2 py-1 text-xs">
        {!current.choice && <option value="">Choose a golfer</option>}
        {pool.map(g => <option key={g.id} value={g.id}>
          {g.nickname && g.nickname !== g.name ? `${g.name} (${g.nickname})` : g.name}
        </option>)}
        <option value={NEW}>Add new golfer…</option>
      </select>
      {current.choice === NEW && <input aria-label={`New golfer name for ${rowLabel}`}
        placeholder="New golfer name" value={current.name} disabled={disabled}
        onChange={e => review.change(bay, slot, { ...current, name: e.target.value })}
        className="rounded-lg border border-line bg-surface px-2 py-1 text-xs" />}
    </li>
  );
}
