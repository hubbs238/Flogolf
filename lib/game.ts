/**
 * Match play scoring.
 *
 * Pure functions over hole scores. Nothing here reads the database, which is
 * what lets a corrected hole recompute every downstream match, carryover and
 * payout for free, and what lets the whole thing be tested against a known
 * scenario without a server.
 */

/**
 * What kind of round this is. It decides what the points are worth and
 * nothing else; how the eighteen holes are cut up is a separate choice.
 */
export type RoundType = "season" | "major";

/**
 * How many players a bay can hold.
 *
 * Teams are not all the same size on a given night. The league's own book
 * has weeks of five, four and four, and someone always drops out late. So a
 * round carries a cap rather than a quota: every bay needs at least two to be
 * a team at all, and no bay takes more than six.
 *
 * Each bay divides four shares among its roster before settling per player.
 */
export const MIN_TEAM_SIZE = 2;
export const MAX_TEAM_SIZE = 6;

/**
 * Folds a name down to something two spellings of the same person share.
 *
 * Case, extra spaces and trailing punctuation all vary between weeks on a
 * hand-kept sheet, and none of them mean a different player. Anything beyond
 * that is left alone on purpose: "Tb" and "TB" are the same man, "Dan" and
 * "Cali Dan" are not, and guessing otherwise would quietly merge two
 * people's money.
 */
export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,]+$/, "");
}


/** How many holes a match runs over. Any round can use either. */
export type SetLength = 3 | 6;

/** Six three-hole matches. */
export const THREE_HOLE_SETS: readonly (readonly number[])[] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  [10, 11, 12],
  [13, 14, 15],
  [16, 17, 18],
];

/** Three six-hole matches. The same eighteen holes carved into fewer, longer
 *  matches, so a single match is worth more and a carry runs further. */
export const SIX_HOLE_SETS: readonly (readonly number[])[] = [
  [1, 2, 3, 4, 5, 6],
  [7, 8, 9, 10, 11, 12],
  [13, 14, 15, 16, 17, 18],
];

export function segmentsFor(setHoles: SetLength): readonly (readonly number[])[] {
  return setHoles === 6 ? SIX_HOLE_SETS : THREE_HOLE_SETS;
}

/** 3 unless the stored value says otherwise. Anything else is not a shape we
 *  can cut eighteen holes into evenly, so it falls back rather than throwing. */
export function setLengthOf(value: unknown): SetLength {
  return Number(value) === 6 ? 6 : 3;
}

/**
 * What a round's points are multiplied by.
 *
 * Money is untouched: a major pays the same dollars as any other round. It is
 * only the FLO Cup that treats it as bigger, so a hundred dollars won becomes
 * two hundred points and every bonus is worth twice what it usually is.
 */
export const POINT_MULTIPLIER: Record<RoundType, number> = {
  season: 1,
  major: 2,
};

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


/** Three decimals, which is the precision every split in here settles to. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Split the signed units of the occupied places equally among teams still tied. */
function shareByPosition(
  groups: { teamIds: string[]; from: number; held?: boolean }[],
  table: PayoutTable,
): Record<string, number> {
  const units: Record<string, number> = {};
  for (const { teamIds, from, held } of groups) {
    const sum = teamIds.reduce((n, _, i) => n + (table[from + i] ?? 0), 0);
    const each = held ? 0 : round3(sum / teamIds.length);
    for (const id of teamIds) units[id] = each;
  }
  return units;
}

function addInto(target: PayoutTable, positions: number[], from: PayoutTable) {
  for (const p of positions) {
    target[p] = (target[p] ?? 0) + (from[p] ?? 0);
  }
}

/**
 * Scores every match in the round, threading carryover through them.
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
  /** Six threes or three sixes. Independent of the round type. */
  segments?: readonly (readonly number[])[];
}): { segments: SegmentResult[]; unitsByTeam: Record<string, number> } {
  const { teamIds, scores, payouts, decisions, tieDefault } = opts;
  const SEGMENTS = opts.segments ?? THREE_HOLE_SETS;

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
    const groups: { teamIds: string[]; from: number; held?: boolean }[] = [];

    let position = 1;
    for (const block of blocks) {
      const positions = block.map((_, i) => position + i);

      if (block.length === 1) {
        awards.push({ teamId: block[0], position, units: 0 });
        groups.push({ teamIds: block, from: position });
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
          awards.push({ teamId: block[i], position: positions[i], units: 0 });
        }
        groups.push({ teamIds: block, from: position });
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
        for (let i = 0; i < block.length; i++) {
          awards.push({
            teamId: block[i], position: positions[i], units: 0, splitShare: true,
          });
        }
        groups.push({ teamIds: block, from: position });
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
        groups.push({ teamIds: block, from: position, held: true });
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
          awards.push({ teamId: tier[0], position: p, units: 0 });
          groups.push({ teamIds: tier, from: p });
          p += 1;
        } else {
          // The remaining teams share the signed payouts for these places.
          for (const id of tier) {
            awards.push({ teamId: id, position: p, units: 0, splitShare: true });
          }
          groups.push({ teamIds: tier, from: p });
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

    const settled = shareByPosition(groups, effective);
    for (const a of awards) a.units = settled[a.teamId] ?? 0;

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

/**
 * The four side pots, all scored off the same card.
 *
 * "total" is the lowest eighteen and "second" the second lowest. They are two
 * pots rather than one table because that is how the league plays them: each
 * has its own rate and its own set of payers, and the lowest round pays into
 * the second lowest's pot. Folding them together could reproduce a given
 * night's money but changed what happens on a tie.
 */
export type Fb18Segment = "front" | "back" | "total" | "second";

/**
 * Every pot, in the order a settlement sheet reads them. One list, so adding
 * a fifth never means hunting for the loops that forgot it.
 */
export const FB18_SEGMENTS = ["front", "back", "total", "second"] as const;

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
  // Same eighteen holes, same ranking. What differs is which position the
  // table pays, which is the whole point of it being a separate pot.
  second: [...FRONT_NINE, ...BACK_NINE],
};

/**
 * Ranks and pays one FB18 segment.
 *
 * `tiebreak` returns an ordering for a tied block, or null when it cannot
 * separate them. Only the Cup bonus uses one, on the front nine, where a tie
 * is settled on back nine scores among the tied teams. Money does not: the
 * league's book splits a front nine tie, so the money pots leave it to share.
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
  recordedTiers?: string[][],
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
  // Apply a card ruling only while exactly those teams are still tied.
  const ruledIds = recordedTiers?.flat() ?? [];
  const ruledBlock = recordedTiers?.every(tier => tier.length > 0)
    ? blocks.find(block => block.length > 1 && block.length === ruledIds.length
        && block.every(id => ruledIds.includes(id)))
    : undefined;
  const awards: TeamAward[] = [];
  const split: number[] = [];
  const groups: { teamIds: string[]; from: number }[] = [];
  let position = 1;

  /** Records a tied group and marks its positions as shared. */
  const shareOut = (tied: string[], from: number) => {
    const positions = tied.map((_, i) => from + i);
    for (const id of tied) {
      awards.push({ teamId: id, position: from, units: 0, splitShare: true });
    }
    groups.push({ teamIds: tied, from });
    split.push(...positions);
  };

  for (const block of blocks) {
    if (block.length === 1) {
      awards.push({ teamId: block[0], position, units: 0 });
      groups.push({ teamIds: block, from: position });
      position += 1;
      continue;
    }

    const tiers = block === ruledBlock ? recordedTiers : tiebreak?.(block);

    if (!tiers) {
      shareOut(block, position);
      position += block.length;
      continue;
    }

    for (const tier of tiers) {
      if (tier.length === 1) {
        awards.push({ teamId: tier[0], position, units: 0 });
        groups.push({ teamIds: tier, from: position });
        position += 1;
      } else {
        shareOut(tier, position);
        position += tier.length;
      }
    }
  }

  const units = shareByPosition(groups, payouts);
  for (const a of awards) a.units = units[a.teamId] ?? 0;

  return { segment, status: "complete", totals, awards, split };
}

export function scoreFb18(opts: {
  teamIds: string[];
  scores: HoleScores;
  /**
   * Partial on purpose. A pot with no table pays nothing, which is what every
   * round created before the second eighteen existed has to keep doing.
   */
  payouts: Partial<Record<Fb18Segment, PayoutTable>>;
  overallMoneyOrder?: readonly string[];
  frontMoneyTiers?: string[][];
  /**
   * How a front nine tie nobody has ruled on is settled.
   *
   * "split", the default, is the money rule and the league's own: bays level
   * on the front nine share the pot. On 10/28 Bay 1 and Bay 7 both went -5
   * and the sheet paid them $15 each.
   *
   * "back-nine" settles it on back nine scores among the tied bays, which is
   * the rule set for the Cup bonus from the start. Only scoreBonusPoints asks
   * for it. Settling money that way handed Bay 1 the whole $40.
   *
   * A recorded ruling (frontMoneyTiers) beats either.
   */
  frontTiebreak?: "split" | "back-nine";
}): { results: Fb18Result[]; unitsByTeam: Record<string, number> } {
  const { teamIds, scores, payouts } = opts;

  // For the Cup bonus only: a front nine tie decided on back nine scores
  // among the tied teams.
  const byBackNine = (block: string[]): string[][] | null => {
    const backTotals: Record<string, number> = {};
    for (const id of block) {
      const t = sumHoles(scores[id], BACK_NINE);
      if (t === null) return null; // back nine not finished, cannot settle yet
      backTotals[id] = t;
    }
    return blocksByScore(backTotals, block);
  };

  // A recorded ruling applies only to a complete tied group in the two
  // eighteen-hole money pots. Unruled groups continue to share.
  const order = opts.overallMoneyOrder ?? [];
  const overallRuling = (block: string[]) =>
    block.every((id) => order.includes(id))
      ? order.filter((id) => block.includes(id)).map((id) => [id])
      : null;

  const results = [
    scoreFb18Segment(
      "front", teamIds, scores, payouts.front ?? {},
      opts.frontTiebreak === "back-nine" ? byBackNine : undefined,
      opts.frontMoneyTiers,
    ),
    scoreFb18Segment("back", teamIds, scores, payouts.back ?? {}),
    scoreFb18Segment("total", teamIds, scores, payouts.total ?? {}, overallRuling),
    scoreFb18Segment("second", teamIds, scores, payouts.second ?? {}, overallRuling),
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
  rates: Partial<Record<Fb18Segment, number>>,
): Record<string, Record<Fb18Segment, number>> {
  const out: Record<string, Record<Fb18Segment, number>> = {};
  for (const result of results) {
    const rate = rates[result.segment] ?? 0;
    for (const award of result.awards) {
      out[award.teamId] ??= { front: 0, back: 0, total: 0, second: 0 };
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
  /** The matches themselves, whatever the round is cut into. */
  main: number;
  front: number;
  back: number;
  /** The FB18 all-eighteen result, not the grand total. */
  eighteen: number;
};

export type CupEligible = "gross" | "main" | "all";

/** Exact half dollars go to the higher integer, as in the league's cash settlements. */
export function wholeDollars(amount: number): number {
  const rounded = Math.round(amount);
  return rounded === 0 ? 0 : rounded;
}

/** Allocate a rounded total to its parts, giving leftover dollars to the largest remainders. */
function allocateWholeDollars(parts: number[], total: number): number[] {
  const dollars = parts.map(Math.floor);
  const remaining = total - dollars.reduce((sum, value) => sum + value, 0);
  const order = parts.map((value, index) => ({
    index,
    // Treat equivalent fractions from different roster divisions as ties.
    remainder: Math.round((value - dollars[index]) * 1e9),
  })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order.slice(0, remaining)) dollars[index] += 1;
  return dollars;
}

/** The front nine, back nine and both 18-hole money pots, netted together. */
export function bonusMoneyOf(b: MoneyBreakdown): number {
  return wholeDollars(b.front + b.back + b.eighteen);
}

export function cupDollarsOf(b: MoneyBreakdown, eligible: CupEligible): number {
  if (eligible === "main") return wholeDollars(b.main);
  if (eligible === "all") return wholeDollars(b.main + b.front + b.back + b.eighteen);
  return Math.max(0, wholeDollars(b.main)) + Math.max(0, bonusMoneyOf(b));
}

export type PlayerMoney = {
  golferId: string;
  teamId: string;
  /** What this player wins this round, before rake. Not a share of a pot. */
  winnings: number;
  /**
   * The flat charge for playing, the same for everyone on the card. It leaves
   * the group rather than changing hands, so it is held apart from winnings.
   */
  rake: number;
  /** What actually changes hands: winnings less rake. */
  dollars: number;
  /** Point-eligible pre-rake dollars, calculated from the player's category amounts. */
  cupDollars: number;
  breakdown: MoneyBreakdown;
};

/** Every bay settles four shares, divided equally among its roster. */
export const TEAM_SHARES = 4;

export function awardMoney(opts: {
  breakdownByTeam: Record<string, MoneyBreakdown>;
  rosters: Record<string, string[]>;
  /** Shares a bay's winnings are cut into. Defaults to TEAM_SHARES. */
  shares?: number;
  /** Flat charge per player. Zero on a round with no rake. */
  rakePerPlayer?: number;
  /**
   * Which winnings feed the Cup. Defaults to the matches alone, so a caller
   * that has not thought about it cannot accidentally pay the FB18 money
   * twice.
   */
  cupEligible?: CupEligible;
}): PlayerMoney[] {
  const { breakdownByTeam, rosters, cupEligible = "main" } = opts;
  const shares = opts.shares && opts.shares > 0 ? opts.shares : TEAM_SHARES;
  // Math.max(0, NaN) is NaN, so the clamp alone would let a bad figure
  // through and poison every settlement row on the round.
  const raw = opts.rakePerPlayer ?? 0;
  const rake = Number.isFinite(raw) ? Math.max(0, wholeDollars(raw)) : 0;
  const out: PlayerMoney[] = [];

  for (const [teamId, golferIds] of Object.entries(rosters)) {
    const b = breakdownByTeam[teamId] ?? { main: 0, front: 0, back: 0, eighteen: 0 };
    if (golferIds.length === 0) continue;
    const scale = shares / golferIds.length;
    const rawBonus = b.front + b.back + b.eighteen;
    const winnings = wholeDollars((b.main + rawBonus) * scale);
    const [main, bonus] = allocateWholeDollars([b.main * scale, rawBonus * scale], winnings);
    const [front, back, eighteen] = allocateWholeDollars(
      [b.front * scale, b.back * scale, b.eighteen * scale], bonus,
    );
    const breakdown = { main, front, back, eighteen };
    const dollars = winnings - rake;

    for (const golferId of golferIds) {
      out.push({
        golferId,
        teamId,
        winnings,
        rake,
        dollars,
        cupDollars: cupDollarsOf(breakdown, cupEligible),
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

export const FIVE_TEAM_STAKES = {
  dollarsPerUnit: 25,
  rakePerPlayer: 35,
  rates: { front: 10, back: 10, total: 10, second: 5 },
} as const;

/**
 * What a finishing position pays in a match, the way the league actually
 * plays it.
 *
 * Everyone from third down pays a unit, and that pot goes to the top two
 * roughly two to one. Read off the league's own book, which settles a three
 * bay night at 1st +1, 2nd 0, 3rd -1 and a five bay night at 1st +2, 2nd +1
 * and -1 each from third down.
 *
 * Third place paying is the part worth saying out loud: the earlier default
 * spared it and paid second nothing, which is a different game. On a five bay
 * card that handed first place the whole pot and left the runner up level
 * with the field.
 *
 * Two and three bay rounds have no "third down" to speak of, so the lowest
 * place pays and there is nothing left over for second.
 */
export function defaultPayouts(teamCount: number): PayoutTable {
  const table: PayoutTable = {};
  if (teamCount < 2) return table;

  // Third and below pay, except in a two or three bay round where that is
  // the last place and nothing below it exists.
  const firstPayer = teamCount <= 3 ? teamCount : 3;
  const pot = teamCount - firstPayer + 1;

  for (let p = 1; p <= teamCount; p++) table[p] = 0;
  for (let p = firstPayer; p <= teamCount; p++) table[p] = -1;

  const second = Math.floor(pot / 3);
  table[1] = pot - second;
  // Only pay a second place when position 2 is not itself a paying slot,
  // which it is in a two bay round.
  if (2 < firstPayer) table[2] = second;
  return table;
}

/**
 * What a finishing position pays in each FB18 side pot.
 *
 * These are NOT the match shape, which is where this went wrong before: the
 * side pots were handed the main game's table and paid second and third
 * places that the league pays nothing to.
 *
 * The nines are winner takes all. Everybody puts a unit in and the lowest
 * nine takes the lot, which is -1 each and +(n-1) to the winner. The book
 * settles a three bay front nine at -40, -40, +80 and a five bay one at -10
 * four times over against +40.
 *
 * The eighteen is two prizes in one pot, because a round stores one table per
 * segment. The lowest eighteen takes a full pot and the second lowest takes a
 * half one, which the league pays at half the rate. Counted in half units so
 * both come out whole:
 *
 *   lowest        +2(n-1) from the big pot, -1 into the small one
 *   second lowest -2 into the big pot,      +(n-1) from the small one
 *   everyone else -2 and -1
 *
 * A two bay round has no second lowest to pay, and the arithmetic says so on
 * its own: +1 and -1.
 */
export function defaultFb18Payouts(teamCount: number, segment: Fb18Segment): PayoutTable {
  const table: PayoutTable = {};
  if (teamCount < 2) return table;

  // Every pot is winner takes all. All that changes is which position wins:
  // the lowest nine, the lowest eighteen, or the SECOND lowest eighteen.
  // Everybody else pays a unit in, the lowest round included when it is the
  // second lowest's pot being filled.
  const wins = segment === "second" ? 2 : 1;
  for (let p = 1; p <= teamCount; p++) table[p] = -1;

  // Two bays have no second lowest worth paying: the pot would be one unit
  // from the winner to the loser, which is the first pot run backwards.
  if (segment === "second" && teamCount < 3) return {};

  table[wins] = teamCount - 1;
  return table;
}

/**
 * What the second lowest eighteen is worth against the lowest.
 *
 * The league pays it at half, so a night at $10 on the eighteen pays $20 to
 * the second lowest rather than $40. Kept here rather than written into a
 * form so the two places that set up a round cannot drift.
 */
export const SECOND_EIGHTEEN_RATE_SHARE = 0.5;

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
 *
 * Deliberately NOT keyed on Fb18Segment. The second lowest eighteen is a pot
 * of money and nothing else: adding a fourth bonus here would pay Cup points
 * for finishing second at a game the league already pays in dollars, and the
 * type is narrow so nobody can do it by accident.
 */
export const BONUS_POINTS: Record<"front" | "back" | "total", number> = {
  front: 10,
  back: 10,
  total: 15,
};

export type BonusSegment = {
  /** Three, not four. The second lowest eighteen pays money only. */
  segment: "front" | "back" | "total";
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
  /** 2 on a major. Applied here so the figures on screen are the real ones. */
  multiplier = 1,
  roundType: RoundType = "major",
): { segments: BonusSegment[]; pointsByTeam: Record<string, number> } {
  if (roundType === "season") return { segments: [], pointsByTeam: {} };
  const { results, unitsByTeam } = scoreFb18({
    // The bonus keeps the rule it was given: a front nine tie goes to the
    // back nine. Money splits instead.
    frontTiebreak: "back-nine",
    teamIds,
    scores,
    payouts: {
      front: { 1: BONUS_POINTS.front * multiplier },
      back: { 1: BONUS_POINTS.back * multiplier },
      total: { 1: BONUS_POINTS.total * multiplier },
    },
  });

  // The second lowest eighteen comes back from scoreFb18 like any other pot
  // and is dropped here. It was never given a table above, so it awards
  // nothing anyway; leaving it in would put a fourth row on the bonus list
  // reading "no winner" forever.
  const segments: BonusSegment[] = results
    .filter((r): r is typeof r & { segment: "front" | "back" | "total" } =>
      r.segment !== "second")
    .map((r) => {
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

/** Zero-floor calculation retained for the legacy fixed-bonus rules in roundPoints. */
export function pointsForRound(dollars: number, multiplier = 1): number {
  return dollars > 0 ? dollars * multiplier : 0;
}

export type PlayerRoundPoints = {
  golferId: string;
  teamId: string;
  /** Points from Cup-eligible money. */
  fromMoney: number;
  /** Front nine, back nine and eighteen hole bonuses, otherwise 0. */
  bonus: number;
  total: number;
};

/** Per player points for one round, broken into where they came from. */
export function roundPoints(opts: {
  money: PlayerMoney[];
  /**
   * Bonus points won by each team, spread to every player on its roster.
   * Already multiplied by scoreBonusPoints, so it is not doubled again here.
   */
  bonusByTeam: Record<string, number>;
  rosters: Record<string, string[]>;
  /** 2 on a major, which is what turns $100 won into 200 points. */
  multiplier?: number;
}): PlayerRoundPoints[] {
  const { money, bonusByTeam, rosters, multiplier = 1 } = opts;

  const bonusByGolfer = new Map<string, number>();
  for (const [teamId, points] of Object.entries(bonusByTeam)) {
    for (const golferId of rosters[teamId] ?? []) {
      bonusByGolfer.set(golferId, (bonusByGolfer.get(golferId) ?? 0) + points);
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return money.map((m) => {
    const fromMoney = round2(pointsForRound(m.cupDollars, multiplier));
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

/** Each category earns points on its positive whole-dollar amount before rake. */
export function cupPointsForPlayers(money: PlayerMoney[], roundType: RoundType): PlayerRoundPoints[] {
  const multiplier = POINT_MULTIPLIER[roundType];
  return money.map(({ golferId, teamId, breakdown }) => {
    const fromMoney = Math.max(0, breakdown.main) * multiplier;
    const bonus = Math.max(0, bonusMoneyOf(breakdown)) * multiplier;
    return { golferId, teamId, fromMoney, bonus, total: fromMoney + bonus };
  });
}
