"use client";

import { useState } from "react";
import { MIN_TEAM_SIZE, nameKey } from "@/lib/game";
import type { ResolvedName } from "@/app/(app)/games/actions";

type GolferOption = { id: string; name: string; nickname?: string | null };
export type PlayerChoice = { read: string; choice: string; name: string };
const NEW = "new";

export function useImportPlayers() {
  const [edits, setEdits] = useState<Record<string, PlayerChoice[]>>({});
  return {
    rows(key: string, players: ResolvedName[]) {
      return edits[key] ?? players.map(player => ({
        read: player.read,
        choice: player.golferId ?? (player.isNew ? NEW : ""),
        name: player.isNew ? player.read : "",
      }));
    },
    edited: (key: string) => edits[key] !== undefined,
    change: (key: string, rows: PlayerChoice[]) =>
      setEdits(prev => ({ ...prev, [key]: rows })),
    reset: () => setEdits({}),
  };
}

export function reviewedPlayers(rows: PlayerChoice[], pool: GolferOption[]) {
  return rows.map(row => row.choice === NEW
    ? { read: row.name.trim(), golferId: null }
    : { read: pool.find(g => g.id === row.choice)?.name ?? row.read, golferId: row.choice });
}

export function playerReviewErrors(
  bays: { label: string; rows: PlayerChoice[] }[], pool: GolferOption[], cap: number,
) {
  const errors: string[] = [];
  const seen = new Map<string, string>();
  const existingNames = new Set(pool.flatMap(g => [nameKey(g.name), nameKey(g.nickname ?? "")]));
  for (const { label, rows } of bays) {
    if (rows.length > 0 && rows.length < MIN_TEAM_SIZE)
      errors.push(`${label} needs at least ${MIN_TEAM_SIZE} players to import a roster.`);
    if (rows.length > cap) errors.push(`${label} has ${rows.length} players and the round allows ${cap} per team.`);
    for (const [slot, { choice, name }] of rows.entries()) {
      const where = `${label}, player ${slot + 1}`;
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

export function ImportRoster({ rows, label, pool, onChange, cap, disabled, emptyText }: {
  rows: PlayerChoice[]; label: string; pool: GolferOption[];
  onChange: (rows: PlayerChoice[]) => void; cap: number; disabled: boolean; emptyText: string;
}) {
  function change(slot: number, patch: Partial<PlayerChoice>) {
    onChange(rows.map((row, i) => i === slot ? { ...row, ...patch } : row));
  }
  return (
    <div className="mb-3">
      {rows.length === 0 && <p className="text-sm text-muted">{emptyText}</p>}
      <ul className="space-y-2">
        {rows.map((row, slot) => {
          const role = slot === 0 ? "Captain" : `Player ${slot + 1}`;
          const rowLabel = `${label}, ${role}`;
          return (
            <li key={slot} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-muted">{role}</span>
              {row.read && <span className="font-medium">{row.read}</span>}
              <select aria-label={`Golfer for ${rowLabel}`} value={row.choice} disabled={disabled}
                onChange={e => change(slot, { choice: e.target.value })}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-sm">
                <option value="">Choose a golfer</option>
                {pool.map(g => <option key={g.id} value={g.id}>
                  {g.nickname && g.nickname !== g.name ? `${g.name} (${g.nickname})` : g.name}
                </option>)}
                <option value={NEW}>Add new golfer…</option>
              </select>
              {row.choice === NEW && <input aria-label={`New golfer name for ${rowLabel}`}
                placeholder="New golfer name" value={row.name} disabled={disabled}
                onChange={e => change(slot, { name: e.target.value })}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-sm" />}
              <button type="button" aria-label={`Remove ${rowLabel}`} disabled={disabled}
                className="text-xs text-muted hover:text-ink" onClick={() => onChange(rows.filter((_, i) => i !== slot))}>
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length < cap && <button type="button" aria-label={`Add player to ${label}`} disabled={disabled}
        onClick={() => onChange([...rows, { read: "", choice: "", name: "" }])}
        className="mt-2 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-fairway-300 disabled:opacity-50">
        Add player
      </button>}
    </div>
  );
}
