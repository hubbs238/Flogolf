import type {
  CategoryAverage,
  Characteristic,
  Golfer,
  ScoredGolfer,
} from "./types";

/**
 * Weights are stored as free numbers so the admin can drag one up without
 * having to rob points from another. Everything downstream normalizes,
 * so 25/25/20/20/10 and 50/50/40/40/20 behave identically.
 */
export function weightPercents(
  characteristics: Characteristic[],
): Map<string, number> {
  const active = characteristics.filter((c) => c.active);
  const total = active.reduce((sum, c) => sum + Number(c.weight), 0);
  return new Map(
    characteristics.map((c) => [
      c.id,
      total > 0 && c.active ? (Number(c.weight) / total) * 100 : 0,
    ]),
  );
}

/**
 * Weighted average out of 100.
 *
 * Categories nobody has rated are skipped rather than counted as zero, and
 * the remaining weights renormalize. A golfer rated only on Putting scores
 * their Putting average, not a number dragged toward zero by four blanks.
 */
export function overallScore(
  scores: Record<string, number | null>,
  characteristics: Characteristic[],
): number | null {
  let weighted = 0;
  let weightSum = 0;

  for (const c of characteristics) {
    if (!c.active) continue;
    const score = scores[c.id];
    if (score === null || score === undefined) continue;
    weighted += score * Number(c.weight);
    weightSum += Number(c.weight);
  }

  if (weightSum === 0) return null;
  return Math.round((weighted / weightSum) * 10) / 10;
}

/** Joins golfers, their category averages, and rating counts into one shape. */
export function buildScoredGolfers(
  golfers: Golfer[],
  averages: CategoryAverage[],
  ratingCounts: Map<string, number>,
  characteristics: Characteristic[],
): ScoredGolfer[] {
  const byGolfer = new Map<string, Record<string, number | null>>();

  for (const golfer of golfers) {
    byGolfer.set(golfer.id, {});
  }
  for (const avg of averages) {
    const bucket = byGolfer.get(avg.golfer_id);
    if (!bucket) continue;
    bucket[avg.characteristic_id] =
      avg.score_count > 0 && avg.avg_score !== null ? Number(avg.avg_score) : null;
  }

  return golfers.map((golfer) => {
    const scores = byGolfer.get(golfer.id) ?? {};
    return {
      ...golfer,
      scores,
      overall: overallScore(scores, characteristics),
      ratingCount: ratingCounts.get(golfer.id) ?? 0,
    };
  });
}

/**
 * Sorts by overall, or by a single characteristic when the board is filtered.
 * Unrated golfers always sink to the bottom rather than sorting as zero.
 */
export function sortGolfers(
  golfers: ScoredGolfer[],
  sortBy: string,
): ScoredGolfer[] {
  return [...golfers].sort((a, b) => {
    const aScore = sortBy === "overall" ? a.overall : a.scores[sortBy];
    const bScore = sortBy === "overall" ? b.overall : b.scores[sortBy];

    if (aScore === null || aScore === undefined) {
      return bScore === null || bScore === undefined
        ? displayName(a).localeCompare(displayName(b))
        : 1;
    }
    if (bScore === null || bScore === undefined) return -1;
    if (bScore !== aScore) return bScore - aScore;
    return displayName(a).localeCompare(displayName(b));
  });
}

/**
 * What everyone sees. A nickname always wins on public surfaces; the real
 * name only surfaces in the admin screens so you can tell who is who.
 */
export function displayName(golfer: {
  name: string;
  nickname?: string | null;
}): string {
  return golfer.nickname?.trim() || golfer.name;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
