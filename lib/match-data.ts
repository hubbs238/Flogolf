import { createClient } from "@/lib/supabase/server";
import {
  eighteenHoleBonuses,
  fb18DollarsBySegment,
  roundPoints,
  scoreFb18,
  scoreMainGame,
  awardMoney,
  type Fb18Segment,
  type HoleScores,
  type PayoutTable,
  type TieDecisions,
} from "./game";
import type { MoneyBreakdown } from "./game";
import type {
  Fb18Payout,
  Golfer,
  HoleScore,
  Match,
  MatchPayout,
  MatchPlayer,
  MatchTeam,
  TieDecision,
} from "./types";

export type MatchBundle = {
  match: Match;
  teams: MatchTeam[];
  players: MatchPlayer[];
  payouts: PayoutTable;
  fb18Payouts: Record<Fb18Segment, PayoutTable>;
  scores: HoleScores;
  decisions: TieDecisions;
};

function toPayoutTable(rows: { position: number; units: number }[]): PayoutTable {
  const t: PayoutTable = {};
  for (const r of rows) t[r.position] = Number(r.units);
  return t;
}

function toHoleScores(rows: HoleScore[]): HoleScores {
  const s: HoleScores = {};
  for (const r of rows) {
    if (!s[r.team_id]) s[r.team_id] = {};
    s[r.team_id][r.hole] = r.strokes;
  }
  return s;
}

export async function getMatchBundle(id: string): Promise<MatchBundle | null> {
  const supabase = await createClient();

  const { data: match } = await supabase
    .from("matches").select("*").eq("id", id).maybeSingle();
  if (!match) return null;

  const [teams, players, payouts, fb18, scores, decisions] = await Promise.all([
    supabase.from("match_teams").select("*").eq("match_id", id).order("slot"),
    supabase.from("match_players").select("*").eq("match_id", id).order("slot"),
    supabase.from("match_payouts").select("*").eq("match_id", id),
    supabase.from("fb18_payouts").select("*").eq("match_id", id),
    supabase.from("hole_scores").select("*").eq("match_id", id),
    supabase.from("tie_decisions").select("*").eq("match_id", id),
  ]);

  const fbRows = (fb18.data ?? []) as Fb18Payout[];
  const bySegment = (segment: Fb18Segment) =>
    toPayoutTable(fbRows.filter((r) => r.segment === segment));

  const decisionMap: TieDecisions = {};
  for (const d of (decisions.data ?? []) as TieDecision[]) {
    decisionMap[`${d.segment}:${d.block_key}`] = d.choice;
  }

  return {
    match: match as Match,
    teams: (teams.data ?? []) as MatchTeam[],
    players: (players.data ?? []) as MatchPlayer[],
    payouts: toPayoutTable((payouts.data ?? []) as MatchPayout[]),
    fb18Payouts: {
      front: bySegment("front"),
      back: bySegment("back"),
      total: bySegment("total"),
    },
    scores: toHoleScores((scores.data ?? []) as HoleScore[]),
    decisions: decisionMap,
  };
}

/** Runs the engine over a bundle. Everything on screen comes from here. */
export function computeMatch(b: MatchBundle) {
  const teamIds = b.teams.map((t) => t.id);
  const fb18TeamIds = b.teams.filter((t) => t.in_fb18).map((t) => t.id);

  const main = scoreMainGame({
    teamIds,
    scores: b.scores,
    payouts: b.payouts,
    decisions: b.decisions,
    tieDefault: b.match.tie_default,
  });

  const fb18 = scoreFb18({
    teamIds: fb18TeamIds,
    scores: b.scores,
    payouts: b.fb18Payouts,
  });

  const unitsByTeam: Record<string, number> = {};
  for (const id of teamIds) {
    unitsByTeam[id] = (main.unitsByTeam[id] ?? 0) + (fb18.unitsByTeam[id] ?? 0);
  }

  // Rates fall back down a chain: a segment override, then the side game
  // rate, then the round's main rate. Null anywhere means "inherit".
  const mainRate = Number(b.match.dollars_per_unit);
  const pick = (v: number | null | undefined, fallback: number) =>
    v === null || v === undefined ? fallback : Number(v);

  const fb18Rate = pick(b.match.fb18_dollars_per_unit, mainRate);
  const segmentRate: Record<Fb18Segment, number> = {
    front: pick(b.match.fb18_front_dollars_per_unit, fb18Rate),
    back: pick(b.match.fb18_back_dollars_per_unit, fb18Rate),
    total: pick(b.match.fb18_total_dollars_per_unit, fb18Rate),
  };

  // Per player figures, a unit paying its rate to each team member, and kept
  // split by source so settlement can show where the money came from.
  //
  // Only the main game feeds the Cup. Every FB18 payout is money alone: the
  // eighteen hole result is already rewarded through the best-eighteen
  // bonus, so counting its money too would pay for the same thing twice.
  const fb18Dollars = fb18DollarsBySegment(fb18.results, segmentRate);

  const breakdownByTeam: Record<string, MoneyBreakdown> = {};
  const dollarsPerPlayerByTeam: Record<string, number> = {};
  const cupDollarsPerPlayerByTeam: Record<string, number> = {};

  for (const id of teamIds) {
    const fb = fb18Dollars[id] ?? { front: 0, back: 0, total: 0 };
    const b18: MoneyBreakdown = {
      main: (main.unitsByTeam[id] ?? 0) * mainRate,
      front: fb.front,
      back: fb.back,
      eighteen: fb.total,
    };
    breakdownByTeam[id] = b18;
    dollarsPerPlayerByTeam[id] = b18.main + b18.front + b18.back + b18.eighteen;
    cupDollarsPerPlayerByTeam[id] = b18.main;
  }

  const rosters: Record<string, string[]> = {};
  for (const t of b.teams) {
    rosters[t.id] = b.players
      .filter((p) => p.team_id === t.id)
      .sort((a, x) => a.slot - x.slot)
      .map((p) => p.golfer_id);
  }

  const money = awardMoney({ breakdownByTeam, rosters });
  const bonuses = eighteenHoleBonuses(teamIds, b.scores);

  return {
    main,
    fb18,
    unitsByTeam,
    dollarsPerPlayerByTeam,
    cupDollarsPerPlayerByTeam,
    rates: { main: mainRate, fb18: fb18Rate, segment: segmentRate },
    bonuses,
    rosters,
    money,
    points: roundPoints({ money, bonuses, rosters }),
  };
}

export type SeasonRow = {
  golferId: string;
  rounds: number;
  dollars: number;
  /** Points from Cup-eligible money. FB18 winnings never count. */
  pointsFromMoney: number;
  /** Best eighteen bonuses, 50 for the lowest and 25 for the next. */
  pointsBonus: number;
  points: number;
};

export type GolferRoundRow = {
  matchId: string;
  matchName: string;
  matchDate: string;
  course: string;
  teamName: string;
  dollars: number;
  pointsFromMoney: number;
  pointsBonus: number;
  points: number;
};

/**
 * Every finished round, scored, with a row per player.
 *
 * Computed once and shared by the season table and the per golfer history so
 * the two cannot disagree. Rounds still in progress are excluded: a half
 * played card would put a provisional figure into someone's record.
 */
async function scoreCompletedRounds(): Promise<
  { matchId: string; matchName: string; matchDate: string; course: string;
    rows: (GolferRoundRow & { golferId: string })[] }[]
> {
  const supabase = await createClient();
  const { data: matches } = await supabase
    .from("matches")
    .select("id, name, match_date, course")
    .eq("status", "complete")
    .order("match_date", { ascending: false });

  const out = [];

  for (const m of (matches ?? []) as {
    id: string; name: string; match_date: string; course: string;
  }[]) {
    const bundle = await getMatchBundle(m.id);
    if (!bundle) continue;

    const { money, points } = computeMatch(bundle);
    const teamName = new Map(bundle.teams.map((t) => [t.id, t.name]));
    const pointsByGolfer = new Map(points.map((p) => [p.golferId, p]));

    out.push({
      matchId: m.id,
      matchName: m.name,
      matchDate: m.match_date,
      course: m.course,
      rows: money.map((row) => {
        const p = pointsByGolfer.get(row.golferId);
        return {
          golferId: row.golferId,
          matchId: m.id,
          matchName: m.name,
          matchDate: m.match_date,
          course: m.course,
          teamName: teamName.get(row.teamId) ?? "",
          dollars: row.dollars,
          pointsFromMoney: p?.fromMoney ?? 0,
          pointsBonus: p?.bonus ?? 0,
          points: p?.total ?? 0,
        };
      }),
    });
  }

  return out;
}

/**
 * Season standings, per player, across every finished round.
 *
 * Recomputed from hole scores rather than stored, so correcting an old
 * scorecard corrects the standings too.
 */
export async function getSeasonStandings(): Promise<SeasonRow[]> {
  const rounds = await scoreCompletedRounds();
  const totals = new Map<string, SeasonRow>();

  for (const round of rounds) {
    for (const row of round.rows) {
      const cur = totals.get(row.golferId) ?? {
        golferId: row.golferId, rounds: 0, dollars: 0,
        pointsFromMoney: 0, pointsBonus: 0, points: 0,
      };
      cur.rounds += 1;
      cur.dollars += row.dollars;
      cur.pointsFromMoney += row.pointsFromMoney;
      cur.pointsBonus += row.pointsBonus;
      cur.points += row.points;
      totals.set(row.golferId, cur);
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return [...totals.values()].map((r) => ({
    ...r,
    dollars: round2(r.dollars),
    pointsFromMoney: round2(r.pointsFromMoney),
    pointsBonus: round2(r.pointsBonus),
    points: round2(r.points),
  }));
}

/**
 * What each player puts into the FLO Cup pot per round they play.
 * One place to change it if the buy in ever moves.
 */
export const CUP_BUY_IN = 35;

export type CupPot = {
  /** Player entries across every finished round, counting repeats. */
  entries: number;
  rounds: number;
  perEntry: number;
  total: number;
};

/**
 * The trophy pot: every player entry across every finished round, times the
 * buy in. Someone who played four rounds contributes four times.
 */
export async function getCupPot(): Promise<CupPot> {
  const rounds = await scoreCompletedRounds();
  const entries = rounds.reduce((n, r) => n + r.rows.length, 0);

  return {
    entries,
    rounds: rounds.length,
    perEntry: CUP_BUY_IN,
    total: entries * CUP_BUY_IN,
  };
}

/** One golfer's finished rounds, newest first. */
export async function getGolferRounds(golferId: string): Promise<GolferRoundRow[]> {
  const rounds = await scoreCompletedRounds();
  const mine: GolferRoundRow[] = [];

  for (const round of rounds) {
    const row = round.rows.find((r) => r.golferId === golferId);
    if (row) mine.push(row);
  }
  return mine;
}

/** Every golfer ever, not just the current pool, so past players still show. */
export async function getAllGolfers(): Promise<Golfer[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("golfers").select("*").order("name");
  return (data ?? []) as Golfer[];
}

export async function getPoolGolfers(): Promise<Golfer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("golfers").select("*").eq("in_pool", true).order("name");
  return (data ?? []) as Golfer[];
}
