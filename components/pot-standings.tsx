"use client";

import { useState } from "react";
import { formatDollars } from "@/lib/currency";
import type { PotStanding } from "@/lib/pot-standings";
import { GolferProfileLink } from "./golfer-profile-link";

const numericCell = "whitespace-nowrap px-3 py-2.5 text-right tabular-nums";
const columnHeading = "whitespace-nowrap px-3 py-2.5 text-right font-semibold";
const points = new Intl.NumberFormat("en-US");
const signedPoints = new Intl.NumberFormat("en-US", { signDisplay: "exceptZero" });

function changeColor(change: number) {
  if (change > 0) return "text-fairway-700 dark:text-fairway-300";
  if (change < 0) return "text-flag-600 dark:text-red-300";
  return "text-muted";
}

export function PotStandings({ rows, roundCount, totalRoundCount = roundCount }: {
  rows: PotStanding[];
  roundCount: number;
  totalRoundCount?: number;
}) {
  const [showMoney, setShowMoney] = useState(false);
  const coverage = roundCount === totalRoundCount ? roundCount : `${roundCount} of ${totalRoundCount}`;

  return (
    <section aria-labelledby="pot-season-standings">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pot-season-standings" className="scroll-mt-6 text-lg font-semibold tracking-tight">Season standings</h2>
          <p className="mt-1 text-sm text-muted">
            {rows.length} {rows.length === 1 ? "golfer" : "golfers"} across {coverage} completed {totalRoundCount === 1 ? "round" : "rounds"}.
            {" "}Ties in points are ordered by fewer rounds played, then by name.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 py-1 text-sm font-medium">
          <input type="checkbox" checked={showMoney} onChange={event => setShowMoney(event.target.checked)}
            className="size-4 accent-fairway-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairway-400" />
          Show money
        </label>
      </div>
      <div role="region" aria-label="Season standings comparison" tabIndex={0}
        className="mt-3 overflow-x-auto rounded-2xl border border-line bg-raised focus-visible:outline-2 focus-visible:outline-fairway-400">
        <table className="w-full min-w-max border-collapse text-sm" aria-labelledby="pot-season-standings">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 bg-raised px-3 py-2.5 text-left font-semibold">Golfer</th>
              <th scope="col" aria-sort="ascending" className={columnHeading}>Proposed rank</th>
              <th scope="col" className={columnHeading}>Official rank</th>
              <th scope="col" className={columnHeading}>Rank change</th>
              <th scope="col" className={columnHeading}>Proposed points</th>
              <th scope="col" className={columnHeading}>Official points</th>
              <th scope="col" className={columnHeading}>Point change</th>
              <th scope="col" className={columnHeading}>Rounds</th>
              {showMoney && <>
                <th scope="col" className={columnHeading}>Official net</th>
                <th scope="col" className={columnHeading}>Proposed net</th>
                <th scope="col" className={columnHeading}>Pot payout</th>
              </>}
            </tr>
          </thead>
          <tbody>{rows.map(row => (
            <tr key={row.id} className="border-b border-line last:border-0">
              <th scope="row" className="sticky left-0 z-10 bg-raised px-3 py-2.5 text-left font-medium">
                <GolferProfileLink golferId={row.id}>{row.name}</GolferProfileLink>
              </th>
              <td className={`${numericCell} font-semibold`}>{row.proposedRank}</td>
              <td className={numericCell}>{row.currentRank}</td>
              <td className={`${numericCell} ${changeColor(row.rankChange)}`}>
                {row.rankChange === 0 ? "Same" : `${row.rankChange > 0 ? "Up" : "Down"} ${Math.abs(row.rankChange)}`}
              </td>
              <td className={`${numericCell} font-semibold`}>{points.format(row.proposedPoints)}</td>
              <td className={numericCell}>{points.format(row.currentPoints)}</td>
              <td className={`${numericCell} font-semibold ${changeColor(row.pointChange)}`}>{signedPoints.format(row.pointChange)}</td>
              <td className={`${numericCell} text-muted`}>{row.rounds}</td>
              {showMoney && <>
                <td className={numericCell}>{formatDollars(row.currentNet, true)}</td>
                <td className={numericCell}>{formatDollars(row.proposedNet, true)}</td>
                <td className={numericCell}>{formatDollars(row.payout)}</td>
              </>}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}
