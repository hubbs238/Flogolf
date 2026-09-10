/**
 * Competition placing with ties, shared by the FLO Cup podium and the medal
 * badges on the golfer tiles so the two can never disagree.
 *
 * Ties consume the places below them, the way a real podium works: two
 * players sharing gold means there is no silver, and the next player takes
 * bronze.
 */
export type Place = {
  rank: number;
  points: number;
  golferIds: string[];
};

export function rankPlaces(
  entries: { golferId: string; points: number }[],
  topN = 3,
): Map<number, Place> {
  const byPoints = new Map<number, string[]>();
  for (const e of entries) {
    if (!byPoints.has(e.points)) byPoints.set(e.points, []);
    byPoints.get(e.points)!.push(e.golferId);
  }

  const places = new Map<number, Place>();
  let rank = 1;

  for (const points of [...byPoints.keys()].sort((a, b) => b - a)) {
    const golferIds = byPoints.get(points)!;
    if (rank <= topN) places.set(rank, { rank, points, golferIds });
    rank += golferIds.length;
    if (rank > topN) break;
  }
  return places;
}

/** golferId -> 1, 2 or 3. Absent means no medal. */
export function medalByGolfer(
  entries: { golferId: string; points: number }[],
): Record<string, 1 | 2 | 3> {
  const out: Record<string, 1 | 2 | 3> = {};
  for (const [rank, place] of rankPlaces(entries)) {
    for (const id of place.golferIds) out[id] = rank as 1 | 2 | 3;
  }
  return out;
}

export const MEDAL = {
  1: { label: "1st", ring: "ring-amber-400", chip: "bg-amber-400 text-amber-950" },
  2: { label: "2nd", ring: "ring-slate-300", chip: "bg-slate-300 text-slate-800" },
  3: { label: "3rd", ring: "ring-orange-400", chip: "bg-orange-400 text-orange-950" },
} as const;
