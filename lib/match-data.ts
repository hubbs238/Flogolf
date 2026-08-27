import { createClient } from "@/lib/supabase/server";
import {
  eighteenHoleBonuses,
  scoreFb18,
  scoreMainGame,
  awardMoney,
  type Fb18Segment,
  type HoleScores,
  type PayoutTable,
  type TieDecisions,
} from "./game";
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

  // The side game can carry its own stake. Null means it follows the main one.
  const mainRate = Number(b.match.dollars_per_unit);
  const fb18Rate =
    b.match.fb18_dollars_per_unit === null || b.match.fb18_dollars_per_unit === undefined
      ? mainRate
      : Number(b.match.fb18_dollars_per_unit);

  // The FB18 eighteen hole result counts toward the Cup. Its front nine and
  // back nine payouts are money only.
  const eighteenUnits: Record<string, number> = {};
  const totalSegment = fb18.results.find((r) => r.segment === "total");
  for (const award of totalSegment?.awards ?? []) {
    eighteenUnits[award.teamId] = (eighteenUnits[award.teamId] ?? 0) + award.units;
  }

  // These are per player figures: a unit pays its rate to each team member.
  const dollarsPerPlayerByTeam: Record<string, number> = {};
  const cupDollarsPerPlayerByTeam: Record<string, number> = {};
  for (const id of teamIds) {
    const mainDollars = (main.unitsByTeam[id] ?? 0) * mainRate;
    dollarsPerPlayerByTeam[id] = mainDollars + (fb18.unitsByTeam[id] ?? 0) * fb18Rate;
    cupDollarsPerPlayerByTeam[id] = mainDollars + (eighteenUnits[id] ?? 0) * fb18Rate;
  }

  const rosters: Record<string, string[]> = {};
  for (const t of b.teams) {
    rosters[t.id] = b.players
      .filter((p) => p.team_id === t.id)
      .sort((a, x) => a.slot - x.slot)
      .map((p) => p.golfer_id);
  }

  return {
    main,
    fb18,
    unitsByTeam,
    dollarsPerPlayerByTeam,
    cupDollarsPerPlayerByTeam,
    rates: { main: mainRate, fb18: fb18Rate },
    bonuses: eighteenHoleBonuses(teamIds, b.scores),
    rosters,
    money: awardMoney({ dollarsPerPlayerByTeam, cupDollarsPerPlayerByTeam, rosters }),
  };
}

export type SeasonRow = {
  golferId: string;
  rounds: number;
  dollars: number;
  points: number;
};

/**
 * FLO Cup points: a dollar won is a point, a dollar lost is half a point off.
 *
 * Applied per round, then summed. That asymmetry is the whole design: win
 * $100 one week and lose $100 the next and you finish +50 points, not zero.
 * Netting the season first would collapse the 1-to-0.5 ratio into a sign
 * test and throw away the reason for having it.
 */
export function pointsForRound(dollars: number): number {
  return dollars >= 0 ? dollars : dollars * 0.5;
}

/**
 * Season standings, per player, across every finished round.
 *
 * Recomputed from hole scores rather than stored, so correcting an old
 * scorecard corrects the standings too.
 */
export async function getSeasonStandings(): Promise<SeasonRow[]> {
  const supabase = await createClient();
  const { data: matches } = await supabase
    .from("matches").select("id").eq("status", "complete");

  const totals = new Map<string, SeasonRow>();

  for (const m of (matches ?? []) as { id: string }[]) {
    const bundle = await getMatchBundle(m.id);
    if (!bundle) continue;
    const { money, bonuses, rosters } = computeMatch(bundle);

    // Best eighteen bonus: points only, never money.
    const bonusByGolfer = new Map<string, number>();
    for (const tier of bonuses) {
      for (const teamId of tier.teamIds) {
        for (const golferId of rosters[teamId] ?? []) {
          bonusByGolfer.set(golferId, (bonusByGolfer.get(golferId) ?? 0) + tier.bonus);
        }
      }
    }

    for (const row of money) {
      const cur = totals.get(row.golferId) ?? {
        golferId: row.golferId, rounds: 0, dollars: 0, points: 0,
      };
      cur.rounds += 1;
      cur.dollars += row.dollars;
      cur.points += pointsForRound(row.cupDollars) + (bonusByGolfer.get(row.golferId) ?? 0);
      totals.set(row.golferId, cur);
    }
  }

  return [...totals.values()].map((r) => ({
    ...r,
    dollars: Math.round(r.dollars * 100) / 100,
    points: Math.round(r.points * 100) / 100,
  }));
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
