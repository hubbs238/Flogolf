import "server-only";
import { scoreFb18 } from "@/lib/game";
import { computeMatch, matchBundleFromRows, type MatchRows } from "@/lib/match-data";
import type { PotRound } from "@/lib/pot-scoring";
import { displayName } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import type { Golfer, Match, MatchPlayer } from "@/lib/types";

type ComparisonRow = Match & Omit<MatchRows, "players"> & {
  players: (MatchPlayer & { golfer: Pick<Golfer, "name" | "nickname"> | null })[];
};

export function toPotRound(row: ComparisonRow): PotRound {
  const bundle = matchBundleFromRows(row, null, row);
  const official = computeMatch(bundle);
  const points = new Map(official.points.map((p) => [p.golferId, p.total]));
  const cash = new Map(official.money.map((p) => [p.golferId, p]));
  const teams = [...row.teams].sort((a, b) => a.slot - b.slot).map((team) => ({
    id: team.id, name: team.name, slot: team.slot,
    matchUnits: official.main.unitsByTeam[team.id], frontUnits: 0, backUnits: 0, total18Units: 0,
    players: row.players.filter((p) => p.team_id === team.id)
      .sort((a, b) => a.slot - b.slot)
      .map((p) => {
        const settlement = cash.get(p.golfer_id)!;
        return {
          id: p.golfer_id, name: p.golfer ? displayName(p.golfer) : "Unknown golfer", slot: p.slot,
          currentPoints: points.get(p.golfer_id)!, currentNet: settlement.dollars, currentPreRake: settlement.winnings,
        };
      }),
  }));
  const round: PotRound = { id: row.id, name: row.name, date: row.match_date, roundType: official.roundType, teams };
  if (teams.length !== row.team_count || teams.some((t) => !t.players.length)) {
    return { ...round, incompleteReason: "Every team needs a roster before its pot share can be calculated." };
  }
  if (official.main.segments.some((s) => s.status !== "complete" || s.ties.some((t) => !t.resolved))) {
    return { ...round, incompleteReason: "The scorecard has missing scores or an unresolved match." };
  }

  // Everyone pays into this pot, even teams that opted out of the original FB18 cash game.
  // Reuse recorded tiebreaks where the same teams are still tied. Each first-place tie shares one unit.
  const sideGame = scoreFb18({
    teamIds: teams.map((t) => t.id), scores: bundle.scores, payouts: {},
    frontMoneyTiers: row.front_money_tiers ?? undefined,
    overallMoneyOrder: row.overall_money_order ?? undefined,
  });
  for (const result of sideGame.results) {
    if (result.segment === "second") continue;
    const winners = new Set(result.awards.filter((a) => a.position === 1).map((a) => a.teamId));
    if (!winners.size) return { ...round, incompleteReason: "All 18 holes need scores to settle the three side units." };
    const column = { front: "frontUnits", back: "backUnits", total: "total18Units" } as const;
    for (const team of teams) {
      if (winners.has(team.id)) team[column[result.segment]] = 1 / winners.size;
    }
  }
  return round;
}

/** Embedded rows keep the scores and rosters for each round together in a single database read. */
export async function getPotComparisonRounds(): Promise<PotRound[]> {
  const supabase = await createClient();
  const rounds: PotRound[] = [];
  const pageSize = 50;
  let afterId: string | undefined;
  while (true) {
    let query = supabase.from("matches").select(`
      *,
      teams:match_teams!match_teams_match_id_fkey(*),
      players:match_players!match_players_match_id_fkey(*,golfer:golfers!match_players_golfer_id_fkey(name,nickname)),
      payouts:match_payouts!match_payouts_match_id_fkey(*),
      fb18:fb18_payouts!fb18_payouts_match_id_fkey(*),
      scores:hole_scores!hole_scores_match_id_fkey(*),
      decisions:tie_decisions!tie_decisions_match_id_fkey(*)
    `).eq("status", "complete").order("id").limit(pageSize);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) throw new Error("Unable to load completed rounds for the pot comparison.", { cause: error });
    const rows = data as unknown as ComparisonRow[];
    rounds.push(...rows.map(toPotRound));
    if (rows.length < pageSize) break;
    afterId = rows[rows.length - 1].id;
  }
  return rounds.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
