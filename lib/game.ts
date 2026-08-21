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
          // Never separated by hole 18. Those positions are a push.
          for (const id of tier) {
            awards.push({ teamId: id, position: p, units: 0 });
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
  /** Positions nobody collected because a tie never broke. */
  pushed: number[];
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
 * back nine scores among the tied teams. The back nine and the eighteen have
 * nothing left to play, so a tie there is a push.
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
    return { segment, status: "pending", totals, awards: [], pushed: [] };
  }

  const blocks = blocksByScore(totals as Record<string, number>, teamIds);
  const awards: TeamAward[] = [];
  const pushed: number[] = [];
  let position = 1;

  for (const block of blocks) {
    if (block.length === 1) {
      awards.push({ teamId: block[0], position, units: payouts[position] ?? 0 });
      position += 1;
      continue;
    }

    const tiers = tiebreak ? tiebreak(block) : null;

    if (!tiers) {
      // No way to separate them, so those positions go unpaid.
      for (const id of block) {
        awards.push({ teamId: id, position, units: 0 });
      }
      for (let i = 0; i < block.length; i++) pushed.push(position + i);
      position += block.length;
      continue;
    }

    for (const tier of tiers) {
      if (tier.length === 1) {
        awards.push({ teamId: tier[0], position, units: payouts[position] ?? 0 });
        position += 1;
      } else {
        for (const id of tier) awards.push({ teamId: id, position, units: 0 });
        for (let i = 0; i < tier.length; i++) pushed.push(position + i);
        position += tier.length;
      }
    }
  }

  return { segment, status: "complete", totals, awards, pushed };
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

// ------------------------------------------------------------
//  Money
// ------------------------------------------------------------

export type PlayerMoney = {
  golferId: string;
  teamId: string;
  units: number;
  dollars: number;
};

/**
 * Splits each team's units evenly across the people actually on its roster.
 *
 * Divides by the real roster length rather than a hardcoded four, so a team
 * that plays a man short splits three ways instead of quietly losing a share.
 */
export function splitMoney(opts: {
  unitsByTeam: Record<string, number>;
  rosters: Record<string, string[]>;
  dollarsPerUnit: number;
}): PlayerMoney[] {
  const { unitsByTeam, rosters, dollarsPerUnit } = opts;
  const out: PlayerMoney[] = [];

  for (const [teamId, golferIds] of Object.entries(rosters)) {
    if (golferIds.length === 0) continue;
    const teamUnits = unitsByTeam[teamId] ?? 0;
    const share = teamUnits / golferIds.length;

    for (const golferId of golferIds) {
      out.push({
        golferId,
        teamId,
        units: Math.round(share * 1000) / 1000,
        dollars: Math.round(share * dollarsPerUnit * 100) / 100,
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

export const MIN_HOLE_SCORE = -3;
export const MAX_HOLE_SCORE = 5;
