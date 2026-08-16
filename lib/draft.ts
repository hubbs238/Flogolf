import type { Characteristic, DraftStrategy, ScoredGolfer } from "./types";

export type TeamState = {
  slot: number;
  name: string;
  captain: ScoredGolfer | null;
  picks: ScoredGolfer[];
};

/**
 * Snake order. Round 1 runs slot 1 through N, round 2 runs N back to 1.
 * Mirrors public.pick_slot() in the database, which is the authority
 * during a live draft.
 */
export function pickSlot(pickNumber: number, teamCount: number): number {
  const round = Math.floor((pickNumber - 1) / teamCount);
  const index = (pickNumber - 1) % teamCount;
  return round % 2 === 0 ? index + 1 : teamCount - index;
}

export function pickRound(pickNumber: number, teamCount: number): number {
  return Math.floor((pickNumber - 1) / teamCount) + 1;
}

export function totalPicks(teamCount: number, rosterSize: number): number {
  // Captains already fill one roster spot each.
  return teamCount * (rosterSize - 1);
}

export function teamMembers(team: TeamState): ScoredGolfer[] {
  return team.captain ? [team.captain, ...team.picks] : [...team.picks];
}

/**
 * The best score a team currently holds in each category.
 *
 * Max rather than average on purpose: a scramble plays the best ball, so
 * what matters is whether anyone on the team can hit the shot, not what
 * the roster averages.
 */
export function teamBestByCategory(
  team: TeamState,
  characteristics: Characteristic[],
): Record<string, number> {
  const best: Record<string, number> = {};
  const members = teamMembers(team);

  for (const c of characteristics) {
    let max = 0;
    for (const member of members) {
      const score = member.scores[c.id];
      if (score !== null && score !== undefined && score > max) max = score;
    }
    best[c.id] = max;
  }
  return best;
}

/**
 * How much this golfer would raise the team's best ball, weighted by the
 * admin's category weights.
 *
 * This is what makes Balanced behave the way you described. If the team
 * already has a 95 Distance player, the next 92 Distance player contributes
 * nothing to that term, so their gain collapses and the pick swings to
 * whoever is strongest in a category the team is still missing.
 */
export function balancedGain(
  golfer: ScoredGolfer,
  team: TeamState,
  characteristics: Characteristic[],
): number {
  const best = teamBestByCategory(team, characteristics);
  let gain = 0;

  for (const c of characteristics) {
    if (!c.active) continue;
    const score = golfer.scores[c.id];
    if (score === null || score === undefined) continue;
    gain += Number(c.weight) * Math.max(0, score - (best[c.id] ?? 0));
  }
  return gain;
}

export type Suggestion = {
  golfer: ScoredGolfer;
  gain: number;
  /** Category this pick most improves, for the "why" label in the UI. */
  fills: string | null;
};

/** Ranks the available pool for a team, best pick first. */
export function rankAvailable(
  available: ScoredGolfer[],
  team: TeamState,
  strategy: DraftStrategy,
  characteristics: Characteristic[],
): Suggestion[] {
  const best = teamBestByCategory(team, characteristics);

  const scored = available.map((golfer) => {
    let fills: string | null = null;

    if (strategy === "balanced") {
      let topContribution = 0;
      for (const c of characteristics) {
        if (!c.active) continue;
        const score = golfer.scores[c.id];
        if (score === null || score === undefined) continue;
        const contribution = Number(c.weight) * Math.max(0, score - (best[c.id] ?? 0));
        if (contribution > topContribution) {
          topContribution = contribution;
          fills = c.label;
        }
      }
    }

    return {
      golfer,
      gain:
        strategy === "balanced"
          ? balancedGain(golfer, team, characteristics)
          : (golfer.overall ?? -1),
      fills,
    };
  });

  return scored.sort((a, b) => {
    if (b.gain !== a.gain) return b.gain - a.gain;
    // Balanced ties happen once a team has a category maxed out.
    // Fall back to raw talent so the tiebreak is never arbitrary.
    const aOverall = a.golfer.overall ?? -1;
    const bOverall = b.golfer.overall ?? -1;
    if (bOverall !== aOverall) return bOverall - aOverall;
    return a.golfer.name.localeCompare(b.golfer.name);
  });
}

export type AutoDraftInput = {
  pool: ScoredGolfer[];
  captains: (ScoredGolfer | null)[];
  teamNames: string[];
  rosterSize: number;
  strategy: DraftStrategy;
  characteristics: Characteristic[];
};

/**
 * Runs a complete draft and returns the finished rosters.
 * Used for the mock draft, and for the "auto pick" button in a live draft.
 */
export function autoDraft({
  pool,
  captains,
  teamNames,
  rosterSize,
  strategy,
  characteristics,
}: AutoDraftInput): TeamState[] {
  const teamCount = captains.length;

  const teams: TeamState[] = captains.map((captain, index) => ({
    slot: index + 1,
    name: teamNames[index] ?? `Team ${index + 1}`,
    captain,
    picks: [],
  }));

  const captainIds = new Set(
    captains.filter(Boolean).map((c) => (c as ScoredGolfer).id),
  );
  const available = pool.filter((g) => !captainIds.has(g.id));

  const picks = totalPicks(teamCount, rosterSize);

  for (let pick = 1; pick <= picks; pick++) {
    if (available.length === 0) break;

    const slot = pickSlot(pick, teamCount);
    const team = teams[slot - 1];
    const ranked = rankAvailable(available, team, strategy, characteristics);
    if (ranked.length === 0) break;

    const chosen = ranked[0].golfer;
    team.picks.push(chosen);
    available.splice(
      available.findIndex((g) => g.id === chosen.id),
      1,
    );
  }

  return teams;
}

/** Weighted best ball estimate for a finished roster, for the summary row. */
export function teamStrength(
  team: TeamState,
  characteristics: Characteristic[],
): number | null {
  const best = teamBestByCategory(team, characteristics);
  let weighted = 0;
  let weightSum = 0;

  for (const c of characteristics) {
    if (!c.active) continue;
    weighted += (best[c.id] ?? 0) * Number(c.weight);
    weightSum += Number(c.weight);
  }
  if (weightSum === 0) return null;
  return Math.round((weighted / weightSum) * 10) / 10;
}
