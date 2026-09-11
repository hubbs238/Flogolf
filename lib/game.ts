/**
 * Match play scoring.
 *
 * Pure functions over hole scores. Nothing here reads the database, which is
 * what lets a corrected hole recompute every downstream match, carryover and
 * payout for free, and what lets the whole thing be tested against a known
 * scenario without a server.
 */

/** Six three-hole matches. */
export const SEGMENTS: readonly (readonly number[])[] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12],
  [13, 14, 15],
  [16, 17, 18],
];

export const FRONT_NINE = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const BACK_NINE = [10, 11, 12, 13, 14, 15, 16, 17, 18] as const;
export const LAST_HOLE = 18;

export type TieChoice = "hole" | "set";

/** teamId -> hole number -> strokes. Missing means not played yet. */
export type HoleScores = Record<string, Record<number, number | undefined>>;

/** position (1-based) -> units */
export type PayoutTable = Record<number, number>;

/** `${segment}:${blockKey}` -> choice */
export type TieDecisions = Record<string, TieChoice>;

export type TeamAward = {
  teamId: string;
  /** Finishing position, or null when a tie never resolved. */
  position: number | null;
  units: number;
  /** Set when this team's units were pushed forward instead of paid. */
  carriedForward?: boolean;
  /** Set when a tie never separated and the units were shared out. */
  splitShare?: boolean;
};

export type TieInfo = {
  segment: number;
  blockKey: string;
  teamIds: string[];
  /** Positions the tied teams are contesting. */
  positions: number[];
  /** False when every contested position pays the same, so it settles itself. */
  needsDecision: boolean;
  choice: TieChoice | null;
  resolved: boolean;
};

export type SegmentResult = {
  segment: number;
  holes: readonly number[];
  status: "pending" | "complete";
  totals: Record<string, number | null>;
  awards: TeamAward[];
  ties: TieInfo[];
  /** Units rolled in from earlier segments, by position. */
  carriedIn: PayoutTable;
  /** Units rolling out to the next segment, by position. */
  carriedOut: PayoutTable;
};

function sumHoles(
  holes: Record<number, number | undefined> | undefined,
  which: readonly number[],
): number | null {
  if (!holes) return null;
  let total = 0;
  for (const h of which) {
    const v = holes[h];
    if (v === undefined || v === null) return null;
    total += v;
  }
  return total;
}

/** Groups teams by identical score, best (lowest) first. */
function blocksByScore(
  totals: Record<string, number>,
  teamIds: string[],
): string[][] {
  const byScore = new Map<number, string[]>();
  for (const id of teamIds) {
    const s = totals[id];
    if (!byScore.has(s)) byScore.set(s, []);
    byScore.get(s)!.push(id);
  }
  return [...byScore.keys()]
    .sort((a, b) => a - b)
    .map((s) => byScore.get(s)!.slice().sort());
}

/**
 * Sudden death. Each hole that separates a group splits it, and every
 * resulting subgroup keeps playing among itself from the following hole.
 *
 * Returns finishing tiers in order. A tier holding more than one team never
 * separated, which by hole 18 means a push for those positions.
 * Returns null while the needed holes have not been entered yet.
 */
export function resolveSuddenDeath(
  teamIds: string[],
  fromHole: number,
  scores: HoleScores,
): string[][] | null {
  if (teamIds.length <= 1) return [teamIds];
  if (fromHole > LAST_HOLE) return [teamIds];

  const atHole: Record<string, number> = {};
  for (const id of teamIds) {
    const v = scores[id]?.[fromHole];
    if (v === undefined || v === null) return null; // waiting on data
    atHole[id] = v;
  }

  const groups = blocksByScore(atHole, teamIds);

  // Nobody separated on this hole, so everyone moves on together.
  if (groups.length === 1) {
    return resolveSuddenDeath(teamIds, fromHole + 1, scores);
  }

  const tiers: string[][] = [];
  for (const g of groups) {
    const sub = resolveSuddenDeath(g, fromHole + 1, scores);
    if (sub === null) return null;
    tiers.push(...sub);
  }
  return tiers;
}

/** Even share of the units attached to a run of positions. */
function shareOf(
  positions: number[],
  table: PayoutTable,
  amongTeams: number,
): number {
  if (amongTeams === 0) return 0;
  const pot = positions.reduce((sum, p) => sum + (table[p] ?? 0), 0);
  // Three decimals keeps a three way split of an odd pot from drifting the
  // round off zero sum by more than a rounding hair.
  return Math.round((pot / amongTeams) * 1000) / 1000;
}

function addInto(target: PayoutTable, positions: number[], from: PayoutTable) {
  for (const p of positions) {
    target[p] = (target[p] ?? 0) + (from[p] ?? 0);
  }
}

/**
 * Scores all six three-hole matches, threading carryover through them.
 *
 * Segments are scored in order and stop at the first incomplete one, because
 * a carryover from segment N changes what segment N+1 is worth. Scoring a
 * later segment before an earlier one is settled would produce a number that
 * silently changes later.
 */
export function scoreMainGame(opts: {
  teamIds: string[];
  scores: HoleScores;
  payouts: PayoutTable;
  decisions: TieDecisions;
  tieDefault: TieChoice;
}): { segments: SegmentResult[]; unitsByTeam: Record<string, number> } {
  const { teamIds, scores, payouts, decisions, tieDefault } = opts;

  const unitsByTeam: Record<string, number> = {};
  for (const id of teamIds) unitsByTeam[id] = 0;

  const segments: SegmentResult[] = [];
  let carriedIn: PayoutTable = {};

  for (let s = 1; s <= SEGMENTS.length; s++) {
    const holes = SEGMENTS[s - 1];

    const totals: Record<string, number | null> = {};
    let complete = true;
    for (const id of teamIds) {
      const t = sumHoles(scores[id], holes);
      totals[id] = t;
      if (t === null) complete = false;
    }

    if (!complete) {
      segments.push({
        segment: s,
        holes,
        status: "pending",
        totals,
        awards: [],
        ties: [],
        carriedIn: { ...carriedIn },
        carriedOut: {},
      });
      // Everything after this is unknowable until these holes land.
      for (let rest = s + 1; rest <= SEGMENTS.length; rest++) {
        const rh = SEGMENTS[rest - 1];
        const rt: Record<string, number | null> = {};
        for (const id of teamIds) rt[id] = sumHoles(scores[id], rh);
        segments.push({
          segment: rest,
          holes: rh,
          status: "pending",
          totals: rt,
          awards: [],
          ties: [],
          carriedIn: {},
          carriedOut: {},
        });
      }
      break;
    }

    // What each position is worth here: the base table plus anything rolled in.
    const effective: PayoutTable = {};
    for (let p = 1; p <= teamIds.length; p++) {
      effective[p] = (payouts[p] ?? 0) + (carriedIn[p] ?? 0);
    }

    const blocks = blocksByScore(totals as Record<string, number>, teamIds);
    const awards: TeamAward[] = [];
    const ties: TieInfo[] = [];
    const carriedOut: PayoutTable = {};

    let position = 1;
    for (const block of blocks) {
      const positions = block.map((_, i) => position + i);

      if (block.length === 1) {
        awards.push({
          teamId: block[0],
          position,
          units: effective[position] ?? 0,
        });
        position += 1;
        continue;
      }

      // A tie whose contested positions all pay the same is worth no
      // ceremony: whoever "wins" it collects the identical number either
      // way, so settle it silently rather than asking for a ruling.
      const values = positions.map((p) => effective[p] ?? 0);
      const uniform = values.every((v) => v === values[0]);
      const blockKey = block.join("+");

      if (uniform) {
        for (let i = 0; i < block.length; i++) {
          awards.push({
            teamId: block[i],
            position: positions[i],
            units: values[0],
          });
        }
        ties.push({
          segment: s,
          blockKey,
          teamIds: block,
          positions,
          needsDecision: false,
          choice: null,
          resolved: true,
        });
        position += block.length;
        continue;
      }

      const choice: TieChoice = decisions[`${s}:${blockKey}`] ?? tieDefault;

      const lastSegment = s === SEGMENTS.length;

      if (choice === "set" && lastSegment) {
        // Nothing left to roll into. Share the block out rather than
        // vanishing units that were staked.
        const share = shareOf(positions, effective, block.length);
        for (let i = 0; i < block.length; i++) {
          awards.push({
            teamId: block[i], position: positions[i], units: share, splitShare: true,
          });
        }
        ties.push({
          segment: s, blockKey, teamIds: block, positions,
          needsDecision: true, choice, resolved: true,
        });
        position += block.length;
        continue;
      }

      if (choice === "set") {
        // Roll the contested positions forward, position for position.
        addInto(carriedOut, positions, effective);
        for (const id of block) {
          awards.push({ teamId: id, position: null, units: 0, carriedForward: true });
        }
        ties.push({
          segment: s,
          blockKey,
          teamIds: block,
          positions,
          needsDecision: true,
          choice,
          resolved: true,
        });
        position += block.length;
        continue;
      }

      // Sudden death from the hole after this segment.
      const tiers = resolveSuddenDeath(block, holes[holes.length - 1] + 1, scores);

      if (tiers === null) {
        // The deciding holes have not been played yet.
        for (const id of block) {
          awards.push({ teamId: id, position: null, units: 0 });
        }
        ties.push({
          segment: s,
          blockKey,
          teamIds: block,
          positions,
          needsDecision: true,
          choice,
          resolved: false,
        });
        position += block.length;
        continue;
      }

      let p = position;
      for (const tier of tiers) {
        if (tier.length === 1) {
          awards.push({ teamId: tier[0], position: p, units: effective[p] ?? 0 });
          p += 1;
        } else {
          // Ran out of holes without separating. The positions these teams
          // were contesting are pooled and shared evenly, which keeps the
          // round zero sum: the units stay inside the block either way.
          const tierPositions = tier.map((_, i) => p + i);
          const share = shareOf(tierPositions, effective, tier.length);
          for (const id of tier) {
            awards.push({ teamId: id, position: p, units: share, splitShare: true });
          }
          p += tier.length;
        }
      }
      ties.push({
        segment: s,
        blockKey,
        teamIds: block,
        positions,
        needsDecision: true,
        choice,
        resolved: true,
      });
      position += block.length;
    }

    for (const a of awards) unitsByTeam[a.teamId] += a.units;

    segments.push({
      segment: s,
      holes,
      status: "complete",
      totals,
      awards,
      ties,
      carriedIn: { ...carriedIn },
      carriedOut,
    });

    // Anything still carrying after the last segment has nowhere to go.
    carriedIn = s === SEGMENTS.length ? {} : carriedOut;
  }

  return { segments, unitsByTeam };
}

// ------------------------------------------------------------
//  FB18 side game
//
//  Reads the same hole scores as the main game, scored separately:
//  lowest front nine, lowest back nine, lowest eighteen.
// ------------------------------------------------------------

export type Fb18Segment = "front" | "back" | "total";

export type Fb18Result = {
  segment: Fb18Segment;
  status: "pending" | "complete";
  totals: Record<string, number | null>;
  awards: TeamAward[];
  /** Positions whose units were shared out because a tie never broke. */
  split: number[];
};

const FB18_HOLES: Record<Fb18Segment, readonly number[]> = {
  front: FRONT_NINE,
  back: BACK_NINE,
  total: [...FRONT_NINE, ...BACK_NINE],
};

/**
 * Ranks and pays one FB18 segment.
 *
 * `tiebreak` returns an ordering for a tied block, or null when it cannot
 * separate them. Only the front nine has one: a front nine tie is settled on
 * back nine scores among the tied teams.
 *
 * A tie that cannot be separated shares the contested prize evenly among the
 * teams in it, matching the main game. Two teams level over eighteen split
 * the money rather than both walking away with nothing.
 */
function scoreFb18Segment(
  segment: Fb18Segment,
  teamIds: string[],
  scores: HoleScores,
  payouts: PayoutTable,
  tiebreak?: (block: string[]) => string[][] | null,
): Fb18Result {
  const holes = FB18_HOLES[segment];
  const totals: Record<string, number | null> = {};
  let complete = true;

  for (const id of teamIds) {
    const t = sumHoles(scores[id], holes);
    totals[id] = t;
    if (t === null) complete = false;
  }

  if (!complete || teamIds.length === 0) {
    return { segment, status: "pending", totals, awards: [], split: [] };
  }

  const blocks = blocksByScore(totals as Record<string, number>, teamIds);
  const awards: TeamAward[] = [];
  const split: number[] = [];
  let position = 1;

  /** Pools the contested positions and hands each tied team an equal share. */
  const shareOut = (tied: string[], from: number) => {
    const positions = tied.map((_, i) => from + i);
    const share = shareOf(positions, payouts, tied.length);
    for (const id of tied) {
      awards.push({ teamId: id, position: from, units: share, splitShare: true });
    }
    split.push(...positions);
  };

  for (const block of blocks) {
    if (block.length === 1) {
      awards.push({ teamId: block[0], position, units: payouts[position] ?? 0 });
      position += 1;
      continue;
    }

    const tiers = tiebreak ? tiebreak(block) : null;

    if (!tiers) {
      shareOut(block, position);
      position += block.length;
      continue;
    }

    for (const tier of tiers) {
      if (tier.length === 1) {
        awards.push({ teamId: tier[0], position, units: payouts[position] ?? 0 });
        position += 1;
      } else {
        shareOut(tier, position);
        position += tier.length;
      }
    }
  }

  return { segment, status: "complete", totals, awards, split };
}

export function scoreFb18(opts: {
  teamIds: string[];
  scores: HoleScores;
  payouts: Record<Fb18Segment, PayoutTable>;
}): { results: Fb18Result[]; unitsByTeam: Record<string, number> } {
  const { teamIds, scores, payouts } = opts;

  // A front nine tie is decided on back nine scores among the tied teams.
  const byBackNine = (block: string[]): string[][] | null => {
    const backTotals: Record<string, number> = {};
    for (const id of block) {
      const t = sumHoles(scores[id], BACK_NINE);
      if (t === null) return null; // back nine not finished, cannot settle yet
      backTotals[id] = t;
    }
    return blocksByScore(backTotals, block);
  };

  const results = [
    scoreFb18Segment("front", teamIds, scores, payouts.front ?? {}, byBackNine),
    scoreFb18Segment("back", teamIds, scores, payouts.back ?? {}),
    scoreFb18Segment("total", teamIds, scores, payouts.total ?? {}),
  ];

  const unitsByTeam: Record<string, number> = {};
  for (const id of teamIds) unitsByTeam[id] = 0;
  for (const r of results) {
    for (const a of r.awards) unitsByTeam[a.teamId] += a.units;
  }

  return { results, unitsByTeam };
}

/**
 * Converts FB18 results to dollars per segment, each at its own rate.
 *
 * Kept separate rather than summed so settlement can show where the money
 * came from. Front nine, back nine, and the eighteen can be worth different
 * money, so the units cannot be added before conversion anyway.
 */
export function fb18DollarsBySegment(
  results: Fb18Result[],
  rates: Record<Fb18Segment, number>,
): Record<string, Record<Fb18Segment, number>> {
  const out: Record<string, Record<Fb18Segment, number>> = {};
  for (const result of results) {
    const rate = rates[result.segment] ?? 0;
    for (const award of result.awards) {
      out[award.teamId] ??= { front: 0, back: 0, total: 0 };
      out[award.teamId][result.segment] += award.units * rate;
    }
  }
  return out;
}

// ------------------------------------------------------------
//  Money
// ------------------------------------------------------------

/** Where a player's money came from. Each figure is per player. */
export type MoneyBreakdown = {
  /** The six three-hole matches. */
  main: number;
  front: number;
  back: number;
  /** The FB18 all-eighteen result, not the grand total. */
  eighteen: number;
};

export type PlayerMoney = {
  golferId: string;
  teamId: string;
  /** What this player earns this round. Not a share of a team pot. */
  dollars: number;
  /**
   * The portion that counts toward FLO Cup points: the main game alone.
   * Every FB18 payout is money only.
   */
  cupDollars: number;
  breakdown: MoneyBreakdown;
};

/**
 * Gives every player on a roster the team's full figure.
 *
 * A unit is worth its dollar value to each person, not divided among them.
 * Three units at $100 is $300 each, so a four man team collects $1,200
 * between them.
 *
 * One consequence worth knowing: units balance across a round, dollars only
 * balance when rosters are the same size. Four players beating three means
 * the winners collect more than the losers hand over.
 *
 * Takes dollars rather than units because the main game and FB18 can carry
 * different rates, which makes a single combined unit figure meaningless.
 * The conversion happens upstream where both rates are known.
 */
export function awardMoney(opts: {
  breakdownByTeam: Record<string, MoneyBreakdown>;
  rosters: Record<string, string[]>;
}): PlayerMoney[] {
  const { breakdownByTeam, rosters } = opts;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const out: PlayerMoney[] = [];

  for (const [teamId, golferIds] of Object.entries(rosters)) {
    const b = breakdownByTeam[teamId] ?? { main: 0, front: 0, back: 0, eighteen: 0 };
    const breakdown: MoneyBreakdown = {
      main: round2(b.main),
      front: round2(b.front),
      back: round2(b.back),
      eighteen: round2(b.eighteen),
    };
    const dollars = round2(
      breakdown.main + breakdown.front + breakdown.back + breakdown.eighteen,
    );

    for (const golferId of golferIds) {
      out.push({
        golferId,
        teamId,
        dollars,
        cupDollars: breakdown.main,
        breakdown,
      });
    }
  }
  return out;
}

/** Front nine, back nine, and eighteen totals for the scorecard header. */
export function nineTotals(holes: Record<number, number | undefined> | undefined) {
  const front = sumHoles(holes, FRONT_NINE);
  const back = sumHoles(holes, BACK_NINE);
  return {
    front,
    back,
    total: front !== null && back !== null ? front + back : null,
  };
}

/**
 * A starting payout table that sums to zero, shaped like the seven team
 * example: 1st +3, 2nd +1, 3rd 0, everyone from 4th down -1 each. Admins
 * edit it anyway, this just avoids starting from a blank grid.
 */
export function defaultPayouts(teamCount: number): PayoutTable {
  const table: PayoutTable = {};
  const firstLoser = teamCount <= 3 ? teamCount : 4;
  const pot = teamCount - firstLoser + 1;

  for (let p = 1; p <= teamCount; p++) table[p] = 0;
  for (let p = firstLoser; p <= teamCount; p++) table[p] = -1;

  const first = Math.ceil(pot * 0.75);
  table[1] = first;
  // Only pay a second place when position 2 is not itself a losing slot,
  // which it is in a two team round.
  if (teamCount >= 2 && 2 < firstLoser) table[2] = pot - first;
  return table;
}

/** Golf convention for a relative score: E at par, explicit sign otherwise. */
export function formatRelative(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Scores are unbounded. These describe the range worth showing as quick
 * options and outside which a photo reading deserves a second look. They are
 * NOT limits: anything outside them still saves.
 */
export const TYPICAL_MIN_SCORE = -5;
export const TYPICAL_MAX_SCORE = 9;

/** True for a value unusual enough to be worth eyeballing on an OCR result. */
export function isUnusualScore(relative: number): boolean {
  return relative < TYPICAL_MIN_SCORE || relative > TYPICAL_MAX_SCORE;
}

// ------------------------------------------------------------
//  Bonus points (FLO Cup points, not money)
// ------------------------------------------------------------

/**
 * FLO Cup points for the three nine-and-eighteen results. One winner each.
 */
export const BONUS_POINTS: Record<Fb18Segment, number> = {
  front: 10,
  back: 10,
  total: 15,
};

export type BonusSegment = {
  segment: Fb18Segment;
  status: "pending" | "complete";
  /** Each team's total for this segment, null while unfinished. */
  totals: Record<string, number | null>;
  /** The winning team, or several when a tie could not be broken. */
  winners: string[];
  /** Points each player on a winning roster receives. */
  each: number;
};

/**
 * Awards the front nine, back nine and eighteen hole bonuses.
 *
 * Same ranking rules as the FB18 side game, so this reuses that engine with a
 * first-place-only payout table rather than repeating the tie handling: a
 * front nine tie is settled on back nine scores among the tied teams, and a
 * tie that never breaks splits the points evenly between them.
 *
 * Only first place pays. Nobody finishing second earns anything here.
 */
export function scoreBonusPoints(
  teamIds: string[],
  scores: HoleScores,
): { segments: BonusSegment[]; pointsByTeam: Record<string, number> } {
  const { results, unitsByTeam } = scoreFb18({
    teamIds,
    scores,
    payouts: {
      front: { 1: BONUS_POINTS.front },
      back: { 1: BONUS_POINTS.back },
      total: { 1: BONUS_POINTS.total },
    },
  });

  const segments: BonusSegment[] = results.map((r) => {
    const winners = r.awards.filter((a) => a.units > 0);
    return {
      segment: r.segment,
      status: r.status,
      totals: r.totals,
      winners: winners.map((a) => a.teamId),
      each: winners[0]?.units ?? 0,
    };
  });

  return { segments, pointsByTeam: unitsByTeam };
}

/**
 * FLO Cup points from a round's Cup-eligible winnings: a dollar won is a
 * point, and a losing round is worth nothing rather than going negative.
 *
 * Floored per round, not on the season total. A bad week costs you nothing,
 * it simply does not help, so it cannot wipe out weeks of good results. It
 * also keeps every figure on screen consistent: a round showing -200 beside
 * a season total of 0 reads as a bug.
 *
 * The old half-a-point-per-dollar-lost rule is deliberately gone. With every
 * losing round flooring to zero it never fired, so keeping it would have
 * been arithmetic nobody could ever observe.
 */
export function pointsForRound(dollars: number): number {
  return dollars > 0 ? dollars : 0;
}

export type PlayerRoundPoints = {
  golferId: string;
  teamId: string;
  /** Points from Cup-eligible money. FB18 winnings are excluded. */
  fromMoney: number;
  /** Front nine, back nine and eighteen hole bonuses, otherwise 0. */
  bonus: number;
  total: number;
};

/** Per player points for one round, broken into where they came from. */
export function roundPoints(opts: {
  money: PlayerMoney[];
  /** Bonus points won by each team, spread to every player on its roster. */
  bonusByTeam: Record<string, number>;
  rosters: Record<string, string[]>;
}): PlayerRoundPoints[] {
  const { money, bonusByTeam, rosters } = opts;

  const bonusByGolfer = new Map<string, number>();
  for (const [teamId, points] of Object.entries(bonusByTeam)) {
    for (const golferId of rosters[teamId] ?? []) {
      bonusByGolfer.set(golferId, (bonusByGolfer.get(golferId) ?? 0) + points);
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return money.map((m) => {
    const fromMoney = round2(pointsForRound(m.cupDollars));
    // A split bonus can land on a half point, so this rounds too.
    const bonus = round2(bonusByGolfer.get(m.golferId) ?? 0);
    return {
      golferId: m.golferId,
      teamId: m.teamId,
      fromMoney,
      bonus,
      // Both parts are already zero or above, so the guard is belt and
      // braces against a future negative bonus sneaking in.
      total: Math.max(0, round2(fromMoney + bonus)),
    };
  });
}
