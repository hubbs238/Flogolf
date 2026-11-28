"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { GolferProfileLink } from "./golfer-profile-link";
import { TotalPoints } from "./total-points";
import { formatDollars } from "@/lib/currency";
import {
  DEFAULT_POT_SETTINGS, potRoundIssue, scorePotRound, validatePotSettings,
  type PotRound, type PotSettings, type PotResult,
} from "@/lib/pot-scoring";

const storageKey = "flo.staging.pot-comparison.v1";
const fields = [
  { key: "entry", label: "Entry per player", unit: "$" },
  { key: "rake", label: "Rake per player", unit: "$" },
  { key: "first", label: "1st place", unit: "%" },
  { key: "second", label: "2nd place", unit: "%" },
  { key: "third", label: "3rd place", unit: "%" },
] as const;
type Fields = Record<typeof fields[number]["key"], string>;

function toFields(settings: PotSettings): Fields {
  return {
    entry: String(settings.entryFee), rake: String(settings.rake), first: String(settings.weights[0]),
    second: String(settings.weights[1]), third: String(settings.weights[2]),
  };
}

function parseFields(fields: Fields): PotSettings {
  // An empty input is an unfinished edit. It should not silently simulate a zero-dollar round.
  const number = (value: string) => value.trim() === "" ? NaN : Number(value);
  return {
    entryFee: number(fields.entry), rake: number(fields.rake),
    weights: [number(fields.first), number(fields.second), number(fields.third)],
  };
}

function readSavedFields() {
  try { return window.localStorage.getItem(storageKey); }
  catch { return null; }
}

function subscribeToSettings(notify: () => void) {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
}

function initialFields(saved: string | null): Fields {
  if (saved) {
    try {
      const value: Fields = JSON.parse(saved);
      if (fields.every(({ key }) => typeof value?.[key] === "string") && !validatePotSettings(parseFields(value))) return value;
    } catch { /* A previous browser setting may be incomplete. */ }
  }
  return toFields(DEFAULT_POT_SETTINGS);
}

const inputStyle = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-fairway-400 focus:ring-1 focus:ring-fairway-400";
const tableStyle = "w-full min-w-max border-collapse text-sm";
const header = "whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-muted";
const cell = "whitespace-nowrap px-3 py-2.5 text-right tabular-nums";
const count = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const delta = (n: number) => n.toLocaleString("en-US", { signDisplay: "exceptZero" });
const deltaColor = (n: number) => n > 0 ? "text-fairway-600 dark:text-fairway-300" : n < 0 ? "text-flag-500" : "text-muted";

type PlayerLine = {
  id: string; name: string; team: string; rounds: number; currentPoints: number; proposedPoints: number;
  currentNet: number; proposedNet: number; payout: number; five: boolean;
};

function playerRows(round: PotRound, result: PotResult): PlayerLine[] {
  const paid = new Map(result.players.map(player => [player.golferId, player]));
  return round.teams.flatMap(team => team.players.map(player => {
    const proposed = paid.get(player.id)!;
    return {
      id: player.id, name: player.name, team: team.name, rounds: 1,
      currentPoints: player.currentPoints, proposedPoints: proposed.points,
      currentNet: player.currentNet, proposedNet: proposed.net, payout: proposed.payout,
      five: proposed.isFivePlayerTeam,
    };
  }));
}

function seasonRows(rows: PlayerLine[]): PlayerLine[] {
  const golfers = new Map<string, PlayerLine>();
  for (const row of rows) {
    const prior = golfers.get(row.id);
    if (!prior) {
      golfers.set(row.id, { ...row, five: false });
      continue;
    }
    prior.rounds++;
    prior.currentPoints += row.currentPoints;
    prior.proposedPoints += row.proposedPoints;
    prior.currentNet += row.currentNet;
    prior.proposedNet += row.proposedNet;
    prior.payout += row.payout;
  }
  return [...golfers.values()];
}

function PlayerTable({ rows, season }: { rows: PlayerLine[]; season: boolean }) {
  const sorted = [...rows].sort((a, b) =>
    b.proposedPoints - a.proposedPoints || b.currentPoints - a.currentPoints || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  );
  return (
    <section aria-labelledby="pot-player-points">
      <h2 id="pot-player-points" className="text-lg font-semibold tracking-tight">{season ? "Season player totals" : "Player results"}</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-raised" role="region" aria-label="Player comparison" tabIndex={0}>
        <table className={tableStyle} aria-labelledby="pot-player-points">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 bg-raised px-3 py-2.5 text-left text-xs font-semibold text-muted">Golfer</th>
              {[season ? "Rounds" : "Team", "Current points", "Proposed points", "Point change", "Current net", "Proposed net", "Pot payout"].map(label =>
                <th key={label} scope="col" className={header}>{label}</th>
              )}
            </tr>
          </thead>
          <tbody>{sorted.map(row => (
            <tr key={row.id} className="border-b border-line last:border-0">
              <th scope="row" className="sticky left-0 z-10 bg-raised px-3 py-2.5 text-left font-medium">
                <GolferProfileLink golferId={row.id}>{row.name}</GolferProfileLink>
              </th>
              <td className={cell + " text-muted"}>{season ? row.rounds : row.team}</td>
              <td className={cell}><TotalPoints value={row.currentPoints} fivePlayer={row.five} /></td>
              <td className={cell + " font-semibold"}><TotalPoints value={row.proposedPoints} fivePlayer={row.five} /></td>
              <td className={cell + " font-semibold " + deltaColor(row.proposedPoints - row.currentPoints)}>{delta(row.proposedPoints - row.currentPoints)}</td>
              <td className={cell}>{formatDollars(row.currentNet, true)}</td>
              <td className={cell}>{formatDollars(row.proposedNet, true)}</td>
              <td className={cell}>{formatDollars(row.payout)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {rows.some(row => row.five) && <p className="mt-2 text-xs text-muted">* Five-player team. Both round point totals include the 1.25× adjustment.</p>}
    </section>
  );
}

function UnitTable({ round, result }: { round: PotRound; result: PotResult }) {
  const byId = new Map(round.teams.map(team => [team.id, team]));
  return (
    <section aria-labelledby="pot-team-units">
      <h2 id="pot-team-units" className="text-lg font-semibold tracking-tight">Team units and payouts</h2>
      <p className="mt-1 text-sm text-muted">Match units include losses. The front 9, back 9 and lowest 18 are worth one unit each.</p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-line bg-raised" role="region" aria-label="Team units and payouts" tabIndex={0}>
        <table className={tableStyle} aria-labelledby="pot-team-units">
          <thead><tr className="border-b border-line">
            <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold text-muted">Team</th>
            {["Place", "Match units", "Front 9", "Back 9", "Lowest 18", "Total units", "Team payout"].map(label =>
              <th key={label} scope="col" className={header}>{label}</th>
            )}
          </tr></thead>
          <tbody>{result.teams.map(row => {
            const team = byId.get(row.teamId)!;
            return (
              <tr key={row.teamId} className="border-b border-line last:border-0">
                <th scope="row" className="px-3 py-2.5 text-left font-medium">{team.name}</th>
                <td className={cell}>{row.place}</td>
                {[team.matchUnits, team.frontUnits, team.backUnits, team.total18Units].map((unit, index) => <td key={index} className={cell}>{count(unit)}</td>)}
                <td className={cell + " font-semibold"}>{count(row.units)}</td>
                <td className={cell + " font-semibold"}>{formatDollars(row.payout)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

export function PotComparison({ rounds, initialRoundId }: { rounds: PotRound[]; initialRoundId?: string }) {
  const saved = useSyncExternalStore(subscribeToSettings, readSavedFields, () => null);
  const [edits, setEdits] = useState<Fields | null>(null);
  const [selection, setSelection] = useState(() => initialRoundId === "season" || rounds.some(r => r.id === initialRoundId) ? initialRoundId! : rounds[0]?.id ?? "season");
  const values = useMemo(() => edits ?? initialFields(saved), [edits, saved]);
  const settings = useMemo(() => parseFields(values), [values]);
  const issue = validatePotSettings(settings);
  const selectedRound = rounds.find(round => round.id === selection);
  const season = !selectedRound;
  const scored = useMemo(() => {
    if (issue) return [];
    const visibleRounds = selectedRound ? [selectedRound] : rounds;
    return visibleRounds.map(round => ({ round, result: scorePotRound(round, settings) }));
  }, [rounds, selectedRound, settings, issue]);

  function change(next: Fields) {
    setEdits(next);
    if (validatePotSettings(parseFields(next))) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { /* Settings still work for this visit when storage is unavailable. */ }
  }

  if (rounds.length === 0) return <p className="rounded-2xl border border-dashed border-line p-8 text-sm text-muted">Complete a round to compare its scoring.</p>;
  const included = scored.filter((item): item is { round: PotRound; result: PotResult } => item.result !== null);
  const skipped = scored.filter(item => item.result === null);
  const combined = included.flatMap(({ round, result }) => playerRows(round, result));
  const totals = included.reduce((sum, { result }) => ({
    entries: sum.entries + result.playerCount,
    gross: sum.gross + result.grossPot,
    rake: sum.rake + result.totalRake,
    prize: sum.prize + result.prizePot,
  }), { entries: 0, gross: 0, rake: 0, prize: 0 });

  return (
    <div className="space-y-7">
      <section aria-labelledby="pot-settings" className="rounded-2xl border border-line bg-raised p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pot-settings" className="text-lg font-semibold tracking-tight">Pot settings</h2>
          <button type="button" onClick={() => change(toFields(DEFAULT_POT_SETTINGS))} className="rounded-md px-2 py-1 text-sm font-medium text-fairway-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-fairway-400 dark:text-fairway-300">Reset to defaults</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          {fields.map(({ key, label, unit }) => (
            <label key={key} className="block text-sm font-medium">
              <span>{label} ({unit})</span>
              <input type="number" min={0} max={unit === "%" ? 100 : undefined} step={unit === "%" ? 0.01 : 1}
                value={values[key]} onChange={event => change({ ...values, [key]: event.target.value })}
                aria-describedby={issue ? "pot-settings-error" : undefined} className={inputStyle + " mt-1.5 tabular-nums"} />
            </label>
          ))}
        </div>
        {issue && <p id="pot-settings-error" role="status" className="mt-3 text-sm text-flag-600 dark:text-red-300">{issue}</p>}
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="w-full max-w-sm text-sm font-medium">Compare results for
          <select value={selection} onChange={event => setSelection(event.target.value)} className={inputStyle + " mt-1.5"}>
            <option value="season">Season · all completed rounds</option>
            <optgroup label="Completed rounds">
              {rounds.map(round => <option key={round.id} value={round.id}>{round.name}</option>)}
            </optgroup>
          </select>
        </label>
        {selectedRound && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {selectedRound.roundType === "major" && <span className="font-medium text-muted">Major · double points</span>}
            <Link href={`/games/${selectedRound.id}`} className="rounded-md py-2 font-medium text-fairway-700 underline underline-offset-2 dark:text-fairway-300">Open official round</Link>
          </div>
        )}
      </div>

      {skipped.length > 0 && <div className="rounded-xl border border-line bg-raised p-4 text-sm">
        <p className="font-medium">{season ? `Comparing ${included.length} of ${rounds.length} completed rounds` : "Comparison unavailable"}</p>
        <ul className="mt-1 list-inside list-disc text-muted">{skipped.map(({ round }) => <li key={round.id}>{round.name} — {potRoundIssue(round, settings)}</li>)}</ul>
      </div>}

      {included.length > 0 && <>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line lg:grid-cols-4">
          {[[season ? "Player entries" : "Players", totals.entries], ["Entry fees", formatDollars(totals.gross)], ["Total rake", formatDollars(totals.rake)], ["Prize pot", formatDollars(totals.prize)]].map(([label, value]) => (
            <div key={label} className="bg-raised p-4"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd></div>
          ))}
        </dl>
        {selectedRound && <UnitTable round={selectedRound} result={included[0].result} />}
        <PlayerTable rows={season ? seasonRows(combined) : combined} season={season} />
        <details className="rounded-xl border border-line bg-raised p-4 text-sm text-muted">
          <summary className="cursor-pointer font-medium text-ink">How proposed payouts and points work</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Teams rank by total units. Tied teams share the prize percentages for the places they occupy. In rounds with fewer than three teams, the pot is divided in proportion to the percentages for the available places.</li>
            <li>Each team splits its payout among its roster. Whole-dollar splits distribute any leftover dollars so the entire pot pays out.</li>
            <li>Net money is payout minus entry. Points count the positive difference between payout and the playing stake (entry less rake). A loss earns zero points.</li>
            <li>Majors award double points. Players on a five-person team then receive their usual 1.25× round adjustment.</li>
          </ul>
        </details>
      </>}
    </div>
  );
}
