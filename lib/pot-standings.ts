import type { PotResult, PotRound } from "./pot-scoring";

type SeasonTotal = {
  id: string;
  name: string;
  rounds: number;
  currentPoints: number;
  proposedPoints: number;
  currentNet: number;
  proposedNet: number;
  payout: number;
};

export type PotStanding = SeasonTotal & {
  currentRank: number;
  proposedRank: number;
  rankChange: number;
  pointChange: number;
};

/** Match the FLO Cup standings table's tiebreaks for each model independently. */
function byPoints(metric: "currentPoints" | "proposedPoints") {
  return (a: SeasonTotal, b: SeasonTotal) =>
    b[metric] - a[metric] || a.rounds - b.rounds || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export function getPotStandings(
  scored: readonly { round: PotRound; result: PotResult | null }[],
): PotStanding[] {
  const totals = new Map<string, SeasonTotal>();
  const includedRounds = new Set<string>();
  for (const { round, result } of scored) {
    if (!result || includedRounds.has(round.id)) continue;
    includedRounds.add(round.id);
    const payouts = new Map(result.players.map(player => [player.golferId, player]));
    for (const team of round.teams) {
      for (const player of team.players) {
        const proposed = payouts.get(player.id)!;
        const total = totals.get(player.id) ?? {
          id: player.id, name: player.name, rounds: 0, currentPoints: 0, proposedPoints: 0,
          currentNet: 0, proposedNet: 0, payout: 0,
        };
        total.rounds++;
        total.currentPoints += player.currentPoints;
        total.proposedPoints += proposed.points;
        total.currentNet += player.currentNet;
        total.proposedNet += proposed.net;
        total.payout += proposed.payout;
        totals.set(player.id, total);
      }
    }
  }

  const rows = [...totals.values()];
  rows.sort(byPoints("currentPoints"));
  const officialRanks = new Map(rows.map((row, i) => [row.id, i + 1]));
  return rows.sort(byPoints("proposedPoints")).map((row, i) => {
    const currentRank = officialRanks.get(row.id)!;
    const proposedRank = i + 1;
    return {
      ...row, currentRank, proposedRank,
      rankChange: currentRank - proposedRank,
      pointChange: row.proposedPoints - row.currentPoints,
    };
  });
}
