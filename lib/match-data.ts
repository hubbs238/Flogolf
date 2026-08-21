import { createClient } from "@/lib/supabase/server";
import {
  scoreFb18,
  scoreMainGame,
  splitMoney,
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
    rosters,
    money: splitMoney({
      unitsByTeam,
      rosters,
      dollarsPerUnit: Number(b.match.dollars_per_unit),
    }),
  };
}

export type SeasonRow = {
  golferId: string;
  rounds: number;
  units: number;
  dollars: number;
};

/**
 * Season money, per player, across every finished round.
 *
 * Recomputed from hole scores rather than stored, so correcting an old
 * scorecard corrects the season table too.
 */
export async function getSeasonMoney(): Promise<SeasonRow[]> {
  const supabase = await createClient();
  const { data: matches } = await supabase
    .from("matches").select("id").eq("status", "complete");

  const totals = new Map<string, SeasonRow>();

  for (const m of (matches ?? []) as { id: string }[]) {
    const bundle = await getMatchBundle(m.id);
    if (!bundle) continue;
    const { money } = computeMatch(bundle);

    for (const row of money) {
      const cur = totals.get(row.golferId) ?? {
        golferId: row.golferId, rounds: 0, units: 0, dollars: 0,
      };
      cur.rounds += 1;
      cur.units += row.units;
      cur.dollars += row.dollars;
      totals.set(row.golferId, cur);
    }
  }

  return [...totals.values()]
    .map((r) => ({
      ...r,
      units: Math.round(r.units * 100) / 100,
      dollars: Math.round(r.dollars * 100) / 100,
    }))
    .sort((a, b) => b.dollars - a.dollars);
}

export async function getPoolGolfers(): Promise<Golfer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("golfers").select("*").eq("in_pool", true).order("name");
  return (data ?? []) as Golfer[];
}
