"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeMatch, getMatchBundle } from "@/lib/match-data";
import {
  defaultFb18Payouts,
  defaultPayouts,
  FB18_SEGMENTS,
  SECOND_EIGHTEEN_RATE_SHARE,
  MAX_TEAM_SIZE,
  MIN_TEAM_SIZE,
  nameKey,
} from "@/lib/game";
import { isoFromLooseDate } from "@/lib/dates";
import type { Fb18Segment, RoundType, SetLength, TieChoice } from "@/lib/game";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Clears every page that shows money or points.
 *
 * All of it is derived on read, so the arithmetic is never stale. The cache
 * is a different matter: a rate change on a finished round moves the season
 * standings and the figures on every golfer card, and clearing only the
 * round page leaves those serving a payload from before the change. The
 * numbers would be right on reload and wrong on navigation, which is the
 * worst kind of wrong.
 */
function revalidateMoney(matchId?: string) {
  revalidatePath("/games");
  if (matchId) revalidatePath(`/games/${matchId}`);
  revalidatePath("/standings");
  revalidatePath("/");
  revalidatePath("/golfer/[id]", "page");
}

const revalidateMatch = revalidateMoney;

/**
 * Just the round, for the one write that happens over and over.
 *
 * Entering a card fires this per hole. The season pages only count rounds
 * marked complete, so a hole posted mid round cannot move them, and clearing
 * them anyway made every score entry drop the cache on the four most
 * expensive pages in the app. Finishing, reopening, deleting or repricing a
 * round still uses the full sweep above, because those genuinely do move it.
 */
function revalidateScore(matchId: string) {
  revalidatePath(`/games/${matchId}`);
}

export type NewRound = {
  name: string;
  course: string;
  teamCount: number;
  rosterSize: number;
  dollarsPerUnit: number;
  tieDefault: TieChoice;
  roundType?: RoundType;
  setHoles?: SetLength;
  /** ISO date. Omitted means today, which is the column default. */
  matchDate?: string;
  /** Per player charge. Omitted leaves the column default. */
  rakePerPlayer?: number;
  /**
   * What a finishing position pays, when something better than the default
   * is known. Omitted falls back to defaultPayouts, which is the right
   * answer for a round nobody has told us anything about.
   */
  payouts?: Record<number, number>;
  fb18Payouts?: Partial<Record<Fb18Segment, Record<number, number>>>;
  /** Per segment dollar rates. Null or omitted means follow the main rate. */
  fb18Rates?: Partial<Record<Fb18Segment, number | null>>;
};

/**
 * Lays down a round and the scaffolding every round needs: its teams, its
 * payout table, and the same table again for each FB18 segment.
 *
 * Factored out because a round now gets created two ways, by hand and off an
 * uploaded image, and the two must produce identical scaffolding. A round
 * built by the importer that quietly lacked its FB18 payouts would score as
 * though the side game paid nothing.
 */
async function insertRound(
  input: NewRound,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await requireAdmin();
  const supabase = await createClient();

  if (input.teamCount < 2 || input.teamCount > 12) {
    return { ok: false, error: "Pick between 2 and 12 teams." };
  }
  // The size is a cap, not a quota. Bays can come in uneven and still
  // start, so this only has to be a number a bay could actually hold.
  if (input.rosterSize < MIN_TEAM_SIZE || input.rosterSize > MAX_TEAM_SIZE) {
    return {
      ok: false,
      error: `A team holds between ${MIN_TEAM_SIZE} and ${MAX_TEAM_SIZE} players.`,
    };
  }

  const row: Record<string, unknown> = {
    name: input.name.trim() || `Round ${new Date().toLocaleDateString()}`,
    course: input.course.trim(),
    team_count: input.teamCount,
    roster_size: input.rosterSize,
    dollars_per_unit: input.dollarsPerUnit,
    round_type: input.roundType ?? "season",
    set_holes: input.setHoles ?? (input.roundType === "major" ? 6 : 3),
    tie_default: input.tieDefault,
    created_by: session.userId,
  };
  if (input.matchDate) row.match_date = input.matchDate;
  if (input.rakePerPlayer !== undefined && input.rakePerPlayer >= 0) {
    row.dues_per_player = input.rakePerPlayer;
  }
  // A segment rate of null means "follow the side game rate", which itself
  // falls back to the main rate, so only a real number is worth writing.
  for (const [segment, column] of [
    ["front", "fb18_front_dollars_per_unit"],
    ["back", "fb18_back_dollars_per_unit"],
    ["total", "fb18_total_dollars_per_unit"],
    ["second", "fb18_second_dollars_per_unit"],
  ] as const) {
    const rate = input.fb18Rates?.[segment];
    if (typeof rate === "number" && rate > 0) row[column] = rate;
  }
  // The second lowest eighteen is paid at half, so unless a rate was given
  // it is written out explicitly rather than left to inherit. Inheriting
  // would pay the second lowest the same as the lowest, which is a different
  // game and the one that was wrong before.
  if (row.fb18_second_dollars_per_unit === undefined) {
    const eighteen =
      (typeof input.fb18Rates?.total === "number" ? input.fb18Rates.total : null) ??
      input.dollarsPerUnit;
    const half = Math.round(eighteen * SECOND_EIGHTEEN_RATE_SHARE * 100) / 100;
    if (half > 0) row.fb18_second_dollars_per_unit = half;
  }

  const { data: match, error } = await supabase
    .from("matches").insert(row).select("id").single();

  if (error || !match) {
    return { ok: false, error: error?.message ?? "Could not create the round." };
  }

  const teams = Array.from({ length: input.teamCount }, (_, i) => ({
    match_id: match.id,
    slot: i + 1,
    name: `Team ${i + 1}`,
  }));
  await supabase.from("match_teams").insert(teams);

  // Only positions this round actually has: a table read off a five bay
  // sheet must not leave a fourth and fifth place on a three team round.
  const trim = (t: Record<number, number>) =>
    Object.fromEntries(
      Object.entries(t).filter(([position]) => Number(position) <= input.teamCount),
    );

  const table = input.payouts ? trim(input.payouts) : defaultPayouts(input.teamCount);
  await supabase.from("match_payouts").insert(
    Object.entries(table).map(([position, units]) => ({
      match_id: match.id,
      position: Number(position),
      units,
    })),
  );

  // Each segment takes its own table where one is known, and otherwise the
  // default for THAT POT rather than the main game's.
  //
  // This is where the stakes were going wrong. The side pots were handed the
  // match shape, which pays a second and a third place; the league's nines
  // are winner takes all and its eighteen pays only the lowest two. A round
  // set up by hand, or imported off a sheet with no money block, came out
  // paying places the league does not pay.
  await supabase.from("fb18_payouts").insert(
    FB18_SEGMENTS.flatMap((segment) => {
      const given = input.fb18Payouts?.[segment];
      const fb = given ? trim(given) : defaultFb18Payouts(input.teamCount, segment);
      return Object.entries(fb).map(([position, units]) => ({
        match_id: match.id,
        segment,
        position: Number(position),
        units,
      }));
    }),
  );

  return { ok: true, id: match.id };
}

export async function createMatch(input: NewRound): Promise<ActionResult> {
  const made = await insertRound(input);
  if (!made.ok) return made;

  revalidateMoney();
  redirect(`/games/${made.id}`);
}

export async function updateMatchSettings(
  matchId: string,
  fields: {
    name?: string;
    course?: string;
    dollarsPerUnit?: number;
    /** Flat per player charge for the round. Deducted at settlement. */
    rakePerPlayer?: number;
    /** Null puts the side game back on the main rate. */
    fb18DollarsPerUnit?: number | null;
    /** Per segment. Null falls back to the side game rate. */
    fb18FrontDollarsPerUnit?: number | null;
    fb18BackDollarsPerUnit?: number | null;
    fb18TotalDollarsPerUnit?: number | null;
    tieDefault?: TieChoice;
    roundType?: RoundType;
    /** Re-segments the round. Locked once scoring opens, like team count. */
    setHoles?: SetLength;
    teamCount?: number;
  },
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const update: Record<string, unknown> = {};
  if (fields.name !== undefined) update.name = fields.name.trim();
  if (fields.course !== undefined) update.course = fields.course.trim();
  if (fields.dollarsPerUnit !== undefined) {
    if (fields.dollarsPerUnit < 0) return { ok: false, error: "Dollars per unit cannot be negative." };
    update.dollars_per_unit = fields.dollarsPerUnit;
  }
  if (fields.rakePerPlayer !== undefined) {
    // A cleared input sends NaN, which slips past a < 0 test and would come
    // back from the database as a raw constraint error nobody can read.
    if (!Number.isFinite(fields.rakePerPlayer) || fields.rakePerPlayer < 0) {
      return { ok: false, error: "Rake must be a number, zero or more." };
    }
    update.dues_per_player = fields.rakePerPlayer;
  }
  const rateFields = [
    ["fb18DollarsPerUnit", "fb18_dollars_per_unit"],
    ["fb18FrontDollarsPerUnit", "fb18_front_dollars_per_unit"],
    ["fb18BackDollarsPerUnit", "fb18_back_dollars_per_unit"],
    ["fb18TotalDollarsPerUnit", "fb18_total_dollars_per_unit"],
  ] as const;

  for (const [key, column] of rateFields) {
    const value = fields[key];
    if (value === undefined) continue;
    if (value !== null && value < 0) {
      return { ok: false, error: "A dollar rate cannot be negative." };
    }
    update[column] = value;
  }
  if (fields.tieDefault !== undefined) update.tie_default = fields.tieDefault;

  // The type is only what the points are worth, so it can change whenever.
  if (fields.roundType !== undefined) update.round_type = fields.roundType;

  if (fields.setHoles !== undefined) {
    // Tie decisions are keyed by match number, so re-cutting eighteen holes
    // into a different number of matches would leave rulings pointing at
    // matches that no longer exist. Same reason team count locks.
    const { data: m } = await supabase
      .from("matches").select("status").eq("id", matchId).single();
    if (!m) return { ok: false, error: "Round not found." };
    if (m.status !== "setup") {
      return { ok: false, error: "Set length locks once rosters open." };
    }
    update.set_holes = fields.setHoles;
  }

  if (fields.teamCount !== undefined) {
    const { data: m } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (!m) return { ok: false, error: "Round not found." };
    if (m.status !== "setup") return { ok: false, error: "Team count locks once rosters open." };
    if (fields.teamCount < 2 || fields.teamCount > 12) {
      return { ok: false, error: "Pick between 2 and 12 teams." };
    }
    update.team_count = fields.teamCount;

    if (fields.teamCount > m.team_count) {
      await supabase.from("match_teams").insert(
        Array.from({ length: fields.teamCount - m.team_count }, (_, i) => ({
          match_id: matchId,
          slot: m.team_count + i + 1,
          name: `Team ${m.team_count + i + 1}`,
        })),
      );
    } else {
      await supabase.from("match_teams").delete().eq("match_id", matchId).gt("slot", fields.teamCount);
    }
  }

  const { error } = await supabase.from("matches").update(update).eq("id", matchId);
  if (error) return { ok: false, error: error.message };

  revalidateMatch(matchId);
  return { ok: true };
}

export async function setMatchCaptain(
  matchId: string,
  teamId: string,
  golferId: string | null,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  // A captain with a login can fill their own roster and post their own scores.
  let captainUserId: string | null = null;
  if (golferId) {
    const { data: p } = await supabase
      .from("profiles").select("id").eq("golfer_id", golferId).maybeSingle();
    captainUserId = p?.id ?? null;
  }

  const { error } = await supabase
    .from("match_teams")
    .update({ captain_golfer_id: golferId, captain_user_id: captainUserId })
    .eq("id", teamId);
  if (error) return { ok: false, error: error.message };

  // Slot 1 of every roster is the captain, kept in sync automatically.
  await supabase.from("match_players").delete().eq("team_id", teamId).eq("slot", 1);
  if (golferId) {
    const { error: pe } = await supabase.from("match_players").insert({
      match_id: matchId, team_id: teamId, golfer_id: golferId, slot: 1,
    });
    if (pe) {
      return {
        ok: false,
        error: pe.code === "23505"
          ? "That golfer is already on another team in this round."
          : pe.message,
      };
    }
  }

  revalidateMatch(matchId);
  return { ok: true };
}

export async function renameMatchTeam(
  matchId: string, teamId: string, name: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("match_teams").update({ name: name.trim() || "Team" }).eq("id", teamId);
  if (error) return { ok: false, error: error.message };
  revalidateMatch(matchId);
  return { ok: true };
}

export async function setFb18(
  matchId: string, teamId: string, on: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("match_teams").update({ in_fb18: on }).eq("id", teamId);
  if (error) return { ok: false, error: error.message };
  revalidateMatch(matchId);
  return { ok: true };
}

export async function savePayouts(
  matchId: string,
  main: Record<number, number>,
  fb18: Partial<Record<Fb18Segment, Record<number, number>>>,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  await supabase.from("match_payouts").delete().eq("match_id", matchId);
  const { error } = await supabase.from("match_payouts").insert(
    Object.entries(main).map(([position, units]) => ({
      match_id: matchId, position: Number(position), units,
    })),
  );
  if (error) return { ok: false, error: error.message };

  await supabase.from("fb18_payouts").delete().eq("match_id", matchId);
  const { error: fe } = await supabase.from("fb18_payouts").insert(
    FB18_SEGMENTS.flatMap((segment) =>
      Object.entries(fb18[segment] ?? {}).map(([position, units]) => ({
        match_id: matchId, segment, position: Number(position), units,
      })),
    ),
  );
  if (fe) return { ok: false, error: fe.message };

  revalidateMatch(matchId);
  return { ok: true };
}

/** Pulls captains and rosters straight out of a finished draft. */
export async function importFromDraft(
  matchId: string, draftId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: match }, { data: draftTeams }, { data: picks }, { data: matchTeams }] =
    await Promise.all([
      supabase.from("matches").select("*").eq("id", matchId).single(),
      supabase.from("draft_teams").select("*").eq("draft_id", draftId).order("slot"),
      supabase.from("draft_picks").select("*").eq("draft_id", draftId).order("pick_number"),
      supabase.from("match_teams").select("*").eq("match_id", matchId).order("slot"),
    ]);

  if (!match) return { ok: false, error: "Round not found." };
  if (match.status !== "setup" && match.status !== "filling") {
    return { ok: false, error: "Cannot import once the round has started." };
  }
  if (!draftTeams?.length) return { ok: false, error: "That draft has no teams." };
  if ((matchTeams?.length ?? 0) < draftTeams.length) {
    return {
      ok: false,
      error: `This round has ${matchTeams?.length ?? 0} teams and that draft has ${draftTeams.length}. Match the team count first.`,
    };
  }

  await supabase.from("match_players").delete().eq("match_id", matchId);

  for (let i = 0; i < draftTeams.length; i++) {
    const dt = draftTeams[i];
    const mt = matchTeams![i];

    await supabase.from("match_teams").update({
      name: dt.name,
      captain_golfer_id: dt.captain_golfer_id,
      captain_user_id: dt.captain_user_id,
    }).eq("id", mt.id);

    const roster = [
      dt.captain_golfer_id,
      ...(picks ?? []).filter((p) => p.team_id === dt.id).map((p) => p.golfer_id),
    ].filter(Boolean) as string[];

    const rows = roster.slice(0, match.roster_size).map((golfer_id, idx) => ({
      match_id: matchId, team_id: mt.id, golfer_id, slot: idx + 1,
    }));
    if (rows.length) await supabase.from("match_players").insert(rows);
  }

  revalidateMatch(matchId);
  return { ok: true };
}

async function setStatus(matchId: string, status: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("matches").update({ status }).eq("id", matchId);
  if (error) return { ok: false, error: error.message };
  revalidateMatch(matchId);
  return { ok: true };
}

export async function openRosters(matchId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: teams } = await supabase
    .from("match_teams").select("captain_golfer_id").eq("match_id", matchId);
  if ((teams ?? []).some((t) => !t.captain_golfer_id)) {
    return { ok: false, error: "Every team needs a captain first." };
  }
  return setStatus(matchId, "filling");
}

export async function addMatchPlayer(
  matchId: string, teamId: string, golferId: string,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const [{ data: match }, { data: existing }] = await Promise.all([
    supabase.from("matches").select("roster_size").eq("id", matchId).single(),
    supabase.from("match_players").select("slot").eq("team_id", teamId).order("slot"),
  ]);
  if (!match) return { ok: false, error: "Round not found." };

  const taken = new Set((existing ?? []).map((r) => r.slot));
  let slot = 1;
  while (taken.has(slot)) slot++;
  const cap = Math.min(match.roster_size, MAX_TEAM_SIZE);
  if (slot > cap) {
    return { ok: false, error: `That team is full at ${cap} players.` };
  }

  const { error } = await supabase.from("match_players").insert({
    match_id: matchId, team_id: teamId, golfer_id: golferId, slot,
  });
  if (error) {
    return {
      ok: false,
      error: error.code === "23505"
        ? "That golfer is already on a team in this round."
        : error.message,
    };
  }

  revalidateMatch(matchId);
  return { ok: true };
}

/**
 * Swaps one golfer for another in place, keeping the slot.
 *
 * This is the correction the league actually needs: a sub plays under a
 * placeholder and gets a name a week later, or the wrong person was put on a
 * team. Taking one off and adding another would do it in two steps, drop the
 * pair into whatever slot happened to be free, and lose the captain on the
 * way. One update keeps the slot, keeps the order, and carries the captain
 * across if that is who moved.
 *
 * Admin only. The round is usually over by the time anyone notices.
 */
export async function replaceMatchPlayer(
  matchId: string, outGolferId: string, inGolferId: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  if (outGolferId === inGolferId) return { ok: true };

  // The primary key is (match_id, golfer_id), so swapping in someone who is
  // already playing would collide. Say so rather than hand back a constraint.
  const { data: already } = await supabase
    .from("match_players").select("team_id")
    .eq("match_id", matchId).eq("golfer_id", inGolferId).maybeSingle();
  if (already) {
    return { ok: false, error: "That golfer is already playing in this round." };
  }

  const { error } = await supabase
    .from("match_players").update({ golfer_id: inGolferId })
    .eq("match_id", matchId).eq("golfer_id", outGolferId);
  if (error) return { ok: false, error: error.message };

  // If the golfer who left was the team's captain, the replacement takes it
  // on rather than the team being left with nobody named.
  await supabase
    .from("match_teams").update({ captain_golfer_id: inGolferId })
    .eq("match_id", matchId).eq("captain_golfer_id", outGolferId);

  revalidateMatch(matchId);
  return { ok: true };
}

export async function removeMatchPlayer(
  matchId: string, golferId: string,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("match_players").delete().eq("match_id", matchId).eq("golfer_id", golferId);
  if (error) return { ok: false, error: error.message };

  // A team's captain is recorded separately from its roster, so taking the
  // captain off leaves that field naming someone who is no longer on the
  // team. The scorecard prints it beside the team, so it has to go too.
  // captain_user_id is left alone: that is who may post scores, which is a
  // different question from who played.
  await supabase
    .from("match_teams")
    .update({ captain_golfer_id: null })
    .eq("match_id", matchId)
    .eq("captain_golfer_id", golferId);

  revalidateMatch(matchId);
  return { ok: true };
}

export async function startRound(matchId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: match }, { data: teams }, { data: players }] = await Promise.all([
    supabase.from("matches").select("*").eq("id", matchId).single(),
    supabase.from("match_teams").select("id, name").eq("match_id", matchId),
    supabase.from("match_players").select("team_id").eq("match_id", matchId),
  ]);
  if (!match) return { ok: false, error: "Round not found." };

  const counts = new Map<string, number>();
  for (const p of players ?? []) counts.set(p.team_id, (counts.get(p.team_id) ?? 0) + 1);

  // A bay needs two to be a team. It does not need to be full: weeks come
  // in uneven and waiting for a fifth man who is not coming is how a round
  // never starts.
  const short = (teams ?? []).filter((t) => (counts.get(t.id) ?? 0) < MIN_TEAM_SIZE);
  if (short.length) {
    return {
      ok: false,
      error:
        `Still short: ${short.map((t) => t.name).join(", ")}. ` +
        `Every team needs at least ${MIN_TEAM_SIZE}.`,
    };
  }
  return setStatus(matchId, "in_progress");
}

/** Passing null clears the hole. */

/**
 * Turns a Postgres constraint violation into something actionable.
 *
 * The stale `1 to 30` stroke check rejects every birdie with a message that
 * names a constraint and nothing else. Anyone but the person who wrote the
 * migration will read that as gibberish.
 */
function describeScoreWriteError(message: string): string {
  if (/hole_scores_strokes_check|strokes_check/i.test(message)) {
    return (
      "The database still carries an old stroke-range rule, so this score was " +
      "rejected. An admin needs to run the latest migration in " +
      "supabase/migrations (0009_unbounded_scores.sql) in the Supabase SQL " +
      "editor. It removes the limit entirely."
    );
  }
  if (/violates check constraint/i.test(message)) {
    return `That score was rejected by the database: ${message}`;
  }
  return message;
}

export async function setHoleScore(
  matchId: string, teamId: string, hole: number, strokes: number | null,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  if (hole < 1 || hole > 18) return { ok: false, error: "Holes run 1 to 18." };

  if (strokes === null) {
    const { error } = await supabase
      .from("hole_scores").delete()
      .eq("match_id", matchId).eq("team_id", teamId).eq("hole", hole);
    if (error) return { ok: false, error: error.message };
  } else {
    if (!Number.isInteger(strokes)) {
      return { ok: false, error: "A score has to be a whole number." };
    }
    const { error } = await supabase.from("hole_scores").upsert(
      { match_id: matchId, team_id: teamId, hole, strokes },
      { onConflict: "match_id,team_id,hole" },
    );
    if (error) return { ok: false, error: describeScoreWriteError(error.message) };
  }

  revalidateScore(matchId);
  return { ok: true };
}

export async function setTieDecision(
  matchId: string, segment: number, blockKey: string, choice: TieChoice,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("tie_decisions").upsert(
    { match_id: matchId, segment, block_key: blockKey, choice },
    { onConflict: "match_id,segment,block_key" },
  );
  if (error) return { ok: false, error: error.message };
  revalidateMatch(matchId);
  return { ok: true };
}

export async function finishRound(matchId: string): Promise<ActionResult> {
  await requireAdmin();
  return setStatus(matchId, "complete");
}

export async function reopenRound(matchId: string): Promise<ActionResult> {
  await requireAdmin();
  return setStatus(matchId, "in_progress");
}

export async function deleteMatch(matchId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("matches").delete().eq("id", matchId);
  if (error) return { ok: false, error: error.message };
  revalidateMoney();
  redirect("/games");
}

/**
 * One click from a finished draft to a round that is ready to configure.
 *
 * Creates the round, mirrors the draft's teams and captains, copies every
 * roster across, and leaves it in setup so the admin can still set the
 * course, the stake, who is in FB18, and the payout table.
 */
export async function createRoundFromDraft(draftId: string): Promise<ActionResult> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const [{ data: draft }, { data: draftTeams }, { data: picks }] = await Promise.all([
    supabase.from("drafts").select("*").eq("id", draftId).single(),
    supabase.from("draft_teams").select("*").eq("draft_id", draftId).order("slot"),
    supabase.from("draft_picks").select("*").eq("draft_id", draftId).order("pick_number"),
  ]);

  if (!draft) return { ok: false, error: "Draft not found." };
  if (!draftTeams?.length) return { ok: false, error: "That draft has no teams." };

  const { data: match, error } = await supabase
    .from("matches")
    .insert({
      name: draft.name,
      team_count: draftTeams.length,
      // Drafts run 2 to 20 on their own rules; a round's teams hold 6. Clamped
      // rather than copied, or a draft of eight makes a round whose own cap is
      // a number its teams can never reach.
      roster_size: Math.min(
        Math.max(Number(draft.roster_size) || MIN_TEAM_SIZE, MIN_TEAM_SIZE),
        MAX_TEAM_SIZE,
      ),
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !match) {
    return { ok: false, error: error?.message ?? "Could not create the round." };
  }

  const table = defaultPayouts(draftTeams.length);
  await Promise.all([
    supabase.from("match_payouts").insert(
      Object.entries(table).map(([position, units]) => ({
        match_id: match.id, position: Number(position), units,
      })),
    ),
    supabase.from("fb18_payouts").insert(
      // Each pot takes its own default rather than the match table, the same
      // way a round made any other way does.
      FB18_SEGMENTS.flatMap((segment) =>
        Object.entries(defaultFb18Payouts(draftTeams.length, segment)).map(
          ([position, units]) => ({
            match_id: match.id, segment, position: Number(position), units,
          }),
        ),
      ),
    ),
  ]);

  for (const dt of draftTeams) {
    const { data: mt } = await supabase
      .from("match_teams")
      .insert({
        match_id: match.id,
        slot: dt.slot,
        name: dt.name,
        captain_golfer_id: dt.captain_golfer_id,
        captain_user_id: dt.captain_user_id,
      })
      .select("id")
      .single();
    if (!mt) continue;

    const roster = [
      dt.captain_golfer_id,
      ...(picks ?? []).filter((p) => p.team_id === dt.id).map((p) => p.golfer_id),
    ].filter(Boolean) as string[];

    const rows = roster.slice(0, draft.roster_size).map((golfer_id, idx) => ({
      match_id: match.id, team_id: mt.id, golfer_id, slot: idx + 1,
    }));
    if (rows.length) await supabase.from("match_players").insert(rows);
  }

  revalidateMoney();
  redirect(`/games/${match.id}`);
}

// ---------------------------------------------------------------- scorecard photos

export type ReadResult =
  | {
      ok: true;
      holes: { hole: number; strokes: number; par: number; relative: number }[];
      confidence: "high" | "medium" | "low";
      notes: string;
      skipped: string[];
      alreadyFilled: number[];
    }
  | { ok: false; error: string };

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * A sheet is uploaded at a bigger edge than a phone photo of one row, so this
 * is the path that actually meets the limit. Saying what to do beats handing
 * back whatever the API said about request size.
 */
const TOO_LARGE =
  "That image is too large to read. Crop it to just the grid, or screenshot " +
  "it rather than photographing the screen.";

async function assertCanScore(matchId: string, teamId: string) {
  const supabase = await createClient();
  const session = await requireUser();
  if (session.profile?.is_admin) return null;

  const { data: team } = await supabase
    .from("match_teams").select("captain_user_id").eq("id", teamId).single();

  if (!team || team.captain_user_id !== session.userId) {
    return "You can only post scores for your own team.";
  }
  return null;
}

/**
 * Reads a photographed card. Writes nothing.
 *
 * The result is shown for confirmation before anything is saved, because a
 * misread digit moves real money and is invisible once it is sitting in the
 * grid looking like every other number.
 */
export async function readScorecardPhoto(
  matchId: string,
  teamId: string,
  dataUrl: string,
): Promise<ReadResult> {
  const denied = await assertCanScore(matchId, teamId);
  if (denied) return { ok: false, error: denied };

  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return { ok: false, error: "That needs to be a JPEG, PNG, or WebP image." };
  }
  const [, mediaType, base64] = match;

  if (Math.ceil((base64.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return { ok: false, error: "That image is too large. Try again from the camera." };
  }

  const { extractScorecard } = await import("@/lib/scorecard");
  const result = await extractScorecard(
    base64,
    mediaType as "image/jpeg" | "image/png" | "image/webp",
  );
  if (!result.ok) return result;

  // Flag which of the read holes are already on the board, so the review
  // screen can show plainly that they will be left alone.
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("hole_scores").select("hole").eq("match_id", matchId).eq("team_id", teamId);
  const filled = new Set((existing ?? []).map((r: { hole: number }) => r.hole));

  return {
    ok: true,
    holes: result.holes,
    confidence: result.confidence,
    notes: result.notes,
    skipped: result.skipped,
    alreadyFilled: result.holes.map((h) => h.hole).filter((h) => filled.has(h)),
  };
}

/**
 * Writes only the holes that are currently blank.
 *
 * The blank check is re-read here rather than trusted from the review screen,
 * so a hole someone typed in while the photo was being read does not get
 * overwritten by a stale confirmation.
 */
export async function applyScorecardPhoto(
  matchId: string,
  teamId: string,
  holes: { hole: number; relative: number }[],
): Promise<{ ok: true; written: number[]; skipped: number[] } | { ok: false; error: string }> {
  const denied = await assertCanScore(matchId, teamId);
  if (denied) return { ok: false, error: denied };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("hole_scores").select("hole").eq("match_id", matchId).eq("team_id", teamId);
  const filled = new Set((existing ?? []).map((r: { hole: number }) => r.hole));

  const toWrite = holes.filter(
    (h) => !filled.has(h.hole) && h.hole >= 1 && h.hole <= 18 && Number.isInteger(h.relative),
  );
  const skipped = holes.map((h) => h.hole).filter((h) => filled.has(h));

  if (toWrite.length > 0) {
    const { error } = await supabase.from("hole_scores").insert(
      toWrite.map((h) => ({
        match_id: matchId, team_id: teamId, hole: h.hole, strokes: h.relative,
      })),
    );
    if (error) return { ok: false, error: describeScoreWriteError(error.message) };
  }

  revalidateMatch(matchId);
  return { ok: true, written: toWrite.map((h) => h.hole), skipped };
}


// ------------------------------------------------------------
//  Reading a whole round off one image
// ------------------------------------------------------------

export type ResolvedName = {
  /** Exactly as the image spelled it. */
  read: string;
  /** The golfer already in the pool this matches, if any. */
  golferId: string | null;
  /** That golfer's stored name, for showing what it matched. */
  matched: string | null;
  /** True when committing would create a golfer under the name as read. */
  isNew: boolean;
  /**
   * The other bay this same person was read on, when that happened. Null for
   * a repeat within one bay, which the commit path simply dedupes.
   */
  duplicateOf: string | null;
  /**
   * The golfers this spelling could mean, when more than one answers to it.
   * Set means nothing was resolved and the commit is blocked.
   */
  sharedBy: string[] | null;
};

export type RoundImportTeam = {
  label: string;
  number: number | null;
  /** The team this bay will be written to, decided here, editable on review. */
  teamId: string | null;
  teamName: string | null;
  players: ResolvedName[];
  holes: { hole: number; relative: number; raw: number }[];
};

export type RoundImportRead =
  | {
      ok: true;
      teams: RoundImportTeam[];
      scoreKind: "relative" | "gross";
      scoreKindAssumed: boolean;
      confidence: "high" | "medium" | "low";
      notes: string;
      /** Odd readings that will still be written. */
      flags: string[];
      /** Readings thrown away before they got here, and why. */
      dropped: string[];
      /** Every team's already-scored holes, keyed by team id. */
      filledByTeam: Record<string, number[]>;
      /**
       * The pool, so a name read as new can be swapped for somebody already
       * in it without leaving this screen.
       */
      pool: { id: string; name: string }[];
      /** Problems that would stop a commit, in the admin's words. */
      blockers: string[];
    }
  | { ok: false; error: string };

/**
 * Reads an image of a night's results and lines it up against this round.
 *
 * Nothing is written. The point of this step is to put the reading, the name
 * matching and every objection on one screen while it can still be corrected,
 * because committing it writes a whole round rather than a single hole.
 */
export async function readRoundPhoto(
  matchId: string,
  dataUrl: string,
  expect: "relative" | "gross" = "relative",
): Promise<RoundImportRead> {
  await requireAdmin();

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) {
    return { ok: false, error: "That file is not a JPEG, PNG or WebP image." };
  }
  const [, mediaType, base64] = match;

  if (Math.ceil((base64.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return { ok: false, error: TOO_LARGE };
  }

  const { extractRound } = await import("@/lib/round-import");
  const read = await extractRound(
    base64,
    mediaType as "image/jpeg" | "image/png" | "image/webp",
    expect,
  );
  if (!read.ok) return read;

  const supabase = await createClient();
  const [{ data: round }, { data: teams }, pool, { data: scores }] = await Promise.all([
    supabase.from("matches").select("roster_size").eq("id", matchId).maybeSingle(),
    supabase.from("match_teams").select("id, slot, name").eq("match_id", matchId).order("slot"),
    golferPool(),
    supabase.from("hole_scores").select("team_id, hole").eq("match_id", matchId),
  ]);
  if (!round) return { ok: false, error: "Round not found." };

  const filledByTeam = new Map<string, Set<number>>();
  for (const s of (scores ?? []) as { team_id: string; hole: number }[]) {
    if (!filledByTeam.has(s.team_id)) filledByTeam.set(s.team_id, new Set());
    filledByTeam.get(s.team_id)!.add(s.hole);
  }

  const roundTeams = (teams ?? []) as { id: string; slot: number; name: string }[];
  const bySlot = new Map(roundTeams.map((t) => [t.slot, t]));
  const taken = new Set<string>();
  const blockers: string[] = [];
  const cap = Math.min(Number(round.roster_size) || MAX_TEAM_SIZE, MAX_TEAM_SIZE);

  // One entry per person across the whole card, so the same man under two
  // spellings is caught rather than seated twice.
  const seenNames = new Map<string, string>();

  const out: RoundImportTeam[] = read.teams.map((t, index) => {
    // Bay 3 means team slot 3. Running order is the fallback ONLY for a row
    // the sheet gave no number for: a number that was read and does not
    // match a slot is the moment to stop and ask, not to guess. A night
    // labelled by simulator bay (11 to 15) sorted by score would otherwise
    // pre-point every row at the wrong team and look fine doing it.
    let team: { id: string; slot: number; name: string } | null =
      t.number === null
        ? roundTeams[index] ?? null
        : bySlot.get(t.number) ?? null;
    if (team && taken.has(team.id)) team = null;
    if (team) taken.add(team.id);

    const players = resolveNames(t.players, t.label, pool, seenNames);

    return {
      label: t.label,
      number: t.number,
      teamId: team?.id ?? null,
      teamName: team?.name ?? null,
      players,
      holes: t.holes,
    };
  });

  for (const t of out) {
    if (!t.teamId) {
      blockers.push(
        t.number === null
          ? `${t.label} does not line up with a team in this round.`
          : `${t.label} wants team ${t.number}, which this round does not have. Point it at one.`,
      );
    }
    if (t.players.length > cap) {
      blockers.push(
        `${t.label} read ${t.players.length} players, more than the ${cap} this round's teams hold.`,
      );
    }
    // One legible name on a bay means the name block was cut off, not that a
    // man played alone. Importing it would replace a full roster with one
    // player, who would then collect the whole bay's winnings.
    if (t.players.length === 1) {
      blockers.push(
        `${t.label} read only one player, so its name block was probably cut off. ` +
        `A team needs at least ${MIN_TEAM_SIZE}.`,
      );
    }
    for (const p of t.players) {
      if (p.duplicateOf) {
        blockers.push(`${p.read} was read on both ${p.duplicateOf} and ${t.label}.`);
      }
      if (p.sharedBy) {
        blockers.push(
          `${p.read} on ${t.label} could be ${p.sharedBy.join(" or ")}. ` +
          `Give one of them a nickname, or fix the sheet.`,
        );
      }
    }
  }
  if (out.length > roundTeams.length) {
    blockers.push(
      `The image has ${out.length} bays but this round has ${roundTeams.length} teams.`,
    );
  }

  return {
    ok: true,
    teams: out,
    /**
     * Every team's filled holes, not just the auto-assigned one's. The review
     * screen lets an admin re-point a bay, and the strike-through has to
     * follow the dropdown or it describes a team that is no longer the target.
     */
    filledByTeam: Object.fromEntries(
      roundTeams.map((t) => [t.id, [...(filledByTeam.get(t.id) ?? [])].sort((a, b) => a - b)]),
    ),
    pool: [...pool.byKey.values()]
      .filter((g, i, all) => all.findIndex((x) => x.id === g.id) === i)
      .sort((a, b) => a.name.localeCompare(b.name)),
    scoreKind: read.scoreKind,
    scoreKindAssumed: read.scoreKindAssumed,
    confidence: read.confidence,
    notes: read.notes,
    flags: read.flags,
    dropped: read.dropped,
    blockers,
  };
}

export type RoundImportApplied =
  | {
      ok: true;
      created: string[];
      rostered: number;
      holesWritten: number;
      holesLeft: number;
    }
  | { ok: false; error: string };

/**
 * Commits a reviewed reading: creates the golfers, seats them, writes the card.
 *
 * Order matters. Golfers come first because a roster row needs one, rosters
 * next, scores last, so a failure part way through leaves a round that is
 * short rather than one with scores against nobody.
 *
 * Names are created exactly as the sheet spelled them. Tidying them here
 * would mean the pool and the book of record disagree, and the sheet is the
 * book of record.
 */
export async function applyRoundImport(
  matchId: string,
  teams: {
    teamId: string;
    players: { read: string; golferId: string | null }[];
    holes: { hole: number; relative: number }[];
  }[],
  mode: "fill" | "replace" = "fill",
): Promise<RoundImportApplied> {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: match }, { data: ownTeams }] = await Promise.all([
    supabase.from("matches").select("id, roster_size, status").eq("id", matchId).single(),
    supabase.from("match_teams").select("id").eq("match_id", matchId),
  ]);
  if (!match) return { ok: false, error: "Round not found." };
  if (match.status === "complete") {
    return { ok: false, error: "That round is marked final. Reopen it before importing." };
  }

  // Every team id arrives from the review screen, so none of them is trusted.
  // A foreign id would delete nothing on the way in, since the delete is
  // scoped to this match, but the insert that follows would happily seat a
  // player against a team belonging to another round. Checking membership up
  // front is cheaper than reasoning about what that would do to the money.
  const allowed = new Set(((ownTeams ?? []) as { id: string }[]).map((t) => t.id));
  const cap = Math.min(Number(match.roster_size) || MAX_TEAM_SIZE, MAX_TEAM_SIZE);
  const seenTeams = new Set<string>();
  for (const t of teams) {
    if (!allowed.has(t.teamId)) {
      return { ok: false, error: "One of those bays points at a team from another round." };
    }
    if (seenTeams.has(t.teamId)) {
      return { ok: false, error: "Two bays point at the same team." };
    }
    seenTeams.add(t.teamId);
  }

  // --- resolve every name first, before anything is written --------------
  //
  // Nothing below touches a row until the whole card resolves, because the
  // writes are not transactional: PostgREST takes them a statement at a
  // time, so an objection discovered half way through leaves the round in
  // pieces. Everything that can be checked is checked here.
  const pool = await golferPool();

  const wanted = new Map<string, string>();
  for (const t of teams) {
    for (const p of t.players) {
      if (p.golferId) continue;
      const key = nameKey(p.read);
      if (!key) continue;
      if (pool.ambiguous.has(key)) {
        return {
          ok: false,
          error:
            `${p.read} could be ${pool.ambiguous.get(key)!.join(" or ")}. ` +
            `Give one of them a nickname before importing.`,
        };
      }
      if (!pool.byKey.has(key) && !wanted.has(key)) wanted.set(key, p.read.trim());
    }
  }

  const created: string[] = [];
  const idByKey = new Map(pool.byKey);

  if (wanted.size > 0) {
    const { data: inserted, error } = await supabase
      .from("golfers")
      .insert([...wanted.values()].map((name) => ({ name })))
      .select("id, name");
    if (error) {
      return { ok: false, error: `Could not add the new golfers: ${error.message}` };
    }
    for (const g of (inserted ?? []) as { id: string; name: string }[]) {
      idByKey.set(nameKey(g.name), { id: g.id, name: g.name });
      created.push(g.name);
    }
  }

  const resolve = (p: { read: string; golferId: string | null }) =>
    p.golferId ?? idByKey.get(nameKey(p.read))?.id ?? null;

  // Resolve every bay up front, and refuse a card that would seat one person
  // on two teams. match_players is keyed on (match_id, golfer_id), so that
  // card cannot be written at all; catching it here means the attempt never
  // starts rather than failing part way with a bay already emptied.
  const seating: { teamId: string; ids: string[] }[] = [];
  const owner = new Map<string, string>();

  for (const t of teams) {
    const ids: string[] = [];
    for (const p of t.players) {
      const id = resolve(p);
      if (!id) return { ok: false, error: `Could not resolve ${p.read} to a golfer.` };
      if (ids.includes(id)) continue;
      const elsewhere = owner.get(id);
      if (elsewhere && elsewhere !== t.teamId) {
        return {
          ok: false,
          error:
            `${p.read} was read on two different bays. One player cannot play ` +
            `for two teams, so fix the sheet and import again.`,
        };
      }
      owner.set(id, t.teamId);
      ids.push(id);
    }
    if (ids.length > cap) {
      return {
        ok: false,
        error: `A bay read ${ids.length} players, more than the ${cap} this round's teams hold.`,
      };
    }
    if (ids.length === 1) {
      return {
        ok: false,
        error:
          `A bay read only one player, so its name block was probably cut off. ` +
          `A team needs at least ${MIN_TEAM_SIZE}.`,
      };
    }
    seating.push({ teamId: t.teamId, ids });
  }

  // --- rosters -----------------------------------------------------------
  //
  // Every target bay is cleared before any of them is filled. One bay at a
  // time looked tidier and was wrong: moving a player from a later bay into
  // an earlier one collided with the row that had not been cleared yet,
  // which emptied the earlier bay and then failed the same way on every
  // retry, so the importer could never undo its own damage.
  const filling = seating.filter((s) => s.ids.length > 0);
  if (filling.length > 0) {
    const { error: cleared } = await supabase
      .from("match_players").delete()
      .eq("match_id", matchId)
      .in("team_id", filling.map((s) => s.teamId));
    if (cleared) {
      return { ok: false, error: `Could not clear the old rosters: ${cleared.message}` };
    }
  }

  let rostered = 0;
  for (const s of filling) {
    const { error } = await supabase.from("match_players").insert(
      s.ids.map((golfer_id, i) => ({
        match_id: matchId, team_id: s.teamId, golfer_id, slot: i + 1,
      })),
    );
    if (error) {
      return {
        ok: false,
        error: error.code === "23505"
          ? "One of those golfers is already on a team in this round that the " +
            "image did not mention. Take them off it and import again."
          : `Could not seat that bay: ${error.message}`,
      };
    }
    rostered += s.ids.length;

    // The sheet's roster block leads with the captain, so slot 1 is it. This
    // also keeps captain_golfer_id pointing at someone who is actually on the
    // bay: the live scorecard prints it beside the team, and replacing a
    // roster without it left teams labelled with a man who never played.
    await supabase
      .from("match_teams")
      .update({ captain_golfer_id: s.ids[0] })
      .eq("match_id", matchId)
      .eq("id", s.teamId);
  }

  // --- scores ------------------------------------------------------------
  //
  // hole_scores is keyed on (match_id, team_id, hole), so overwriting is an
  // upsert rather than a delete followed by an insert. That matters: the old
  // pair had a window where a rejected insert left holes that had been
  // correct simply blank, with every retry failing the same way.
  let holesWritten = 0;
  let holesLeft = 0;

  for (const t of teams) {
    const { data: existing } = await supabase
      .from("hole_scores").select("hole").eq("match_id", matchId).eq("team_id", t.teamId);
    const filled = new Set((existing ?? []).map((r: { hole: number }) => r.hole));

    // Last reading of a hole wins, and only one row per hole goes up: two
    // rows for one hole in a single upsert is an error, not a correction.
    const byHole = new Map<number, number>();
    for (const h of t.holes) {
      if (h.hole < 1 || h.hole > 18 || !Number.isInteger(h.relative)) continue;
      byHole.set(h.hole, h.relative);
    }

    const valid = [...byHole.entries()].map(([hole, relative]) => ({ hole, relative }));
    const toWrite = mode === "replace" ? valid : valid.filter((h) => !filled.has(h.hole));
    holesLeft += valid.length - toWrite.length;

    if (toWrite.length > 0) {
      const { error } = await supabase.from("hole_scores").upsert(
        toWrite.map((h) => ({
          match_id: matchId, team_id: t.teamId, hole: h.hole, strokes: h.relative,
        })),
        { onConflict: "match_id,team_id,hole" },
      );
      if (error) return { ok: false, error: describeScoreWriteError(error.message) };
      holesWritten += toWrite.length;
    }
  }

  revalidateMoney(matchId);
  return { ok: true, created, rostered, holesWritten, holesLeft };
}


// ------------------------------------------------------------
//  Creating a round from an image, before the round exists
// ------------------------------------------------------------

type Pool = {
  byKey: Map<string, { id: string; name: string }>;
  /** Folds that more than one golfer answers to, so none of them is picked. */
  ambiguous: Map<string, string[]>;
};

/**
 * The golfer pool, keyed by the fold two spellings of one person share.
 *
 * Nicknames are in here too, because the sheet writes whichever the room
 * actually calls someone. A real name beats a nickname on a collision, since
 * if one golfer's nickname is another golfer's name the name is the safer
 * match.
 *
 * A fold that two DIFFERENT golfers answer to is recorded and deliberately
 * left unresolved. golfers.name carries no unique constraint and the bulk
 * importer keys on name plus nickname precisely because two people really do
 * share a first name; picking whichever row came back last would seat the
 * wrong man and pay him the bay's money for the night.
 */
async function golferPool(): Promise<Pool> {
  const supabase = await createClient();
  const { data } = await supabase.from("golfers").select("id, name, nickname");
  const rows = (data ?? []) as { id: string; name: string; nickname: string | null }[];

  const byKey = new Map<string, { id: string; name: string }>();
  const claims = new Map<string, Map<string, string>>();

  const claim = (key: string, g: { id: string; name: string }) => {
    if (!claims.has(key)) claims.set(key, new Map());
    claims.get(key)!.set(g.id, g.name);
  };

  for (const g of rows) {
    const key = nameKey(g.name);
    if (!key) continue;
    byKey.set(key, { id: g.id, name: g.name });
    claim(key, g);
  }
  for (const g of rows) {
    if (!g.nickname) continue;
    const key = nameKey(g.nickname);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { id: g.id, name: g.name });
    claim(key, g);
  }

  const ambiguous = new Map<string, string[]>();
  for (const [key, who] of claims) {
    if (who.size > 1) {
      ambiguous.set(key, [...who.values()]);
      byKey.delete(key);
    }
  }
  return { byKey, ambiguous };
}

/**
 * Resolves one bay's names against the pool.
 *
 * `seen` is shared across every bay on the card and keyed by the RESOLVED
 * golfer, falling back to the fold for a name the pool does not know. Keying
 * it on the spelling alone missed the case that matters: a man written by his
 * real name on one bay and his nickname on another is two spellings, one
 * golfer, and one golfer cannot play for two teams.
 */
function resolveNames(
  names: string[],
  label: string,
  pool: Pool,
  seen: Map<string, string>,
): ResolvedName[] {
  return names.map((read) => {
    const key = nameKey(read);
    const shared = pool.ambiguous.get(key) ?? null;
    const hit = shared ? null : pool.byKey.get(key) ?? null;

    // One identity per person, so the same man under two spellings collides.
    const identity = hit ? `id:${hit.id}` : `name:${key}`;
    const already = seen.get(identity) ?? null;
    if (!already) seen.set(identity, label);

    return {
      read,
      golferId: hit?.id ?? null,
      matched: hit?.name ?? null,
      // An ambiguous name is not new. Creating another golfer under a name
      // two people already share would make it worse.
      isNew: !hit && !shared,
      duplicateOf: already === label ? null : already,
      sharedBy: shared,
    };
  });
}

export type ReadRoundDetails =
  | {
      ok: true;
      /** What the image says about the round itself. All of it editable. */
      details: {
        date: string | null;
        isoDate: string | null;
        title: string | null;
        course: string | null;
        setHoles: 3 | 6 | null;
        rakePerPlayer: number | null;
      };
      /** Bays in the order they appear. Position decides the team. */
      bays: {
        label: string;
        number: number | null;
        players: ResolvedName[];
        holes: { hole: number; relative: number; raw: number }[];
      }[];
      /**
       * Every setting the round would be created with, before any edit. The
       * form shows all of it: an admin should be reading the sheet back,
       * not filling a page in beside it.
       */
      suggested: {
        teamCount: number;
        rosterSize: number;
        name: string;
        course: string;
        isoDate: string | null;
        roundType: RoundType;
        setHoles: SetLength;
        dollarsPerUnit: number;
        rakePerPlayer: number;
        /** position -> units, for the main game and each side pot. */
        payouts: Record<number, number> | null;
        fb18Payouts: Partial<Record<Fb18Segment, Record<number, number>>>;
        fb18Rates: Partial<Record<Fb18Segment, number>>;
      };
      /** What the money block did and did not give up. */
      stakeNotes: string[];
      /**
       * The pool, so a name read as new can be swapped for somebody who is
       * already in it without leaving this screen.
       */
      pool: { id: string; name: string }[];
      scoreKind: "relative" | "gross";
      scoreKindAssumed: boolean;
      confidence: "high" | "medium" | "low";
      notes: string;
      flags: string[];
      dropped: string[];
      blockers: string[];
    }
  | { ok: false; error: string };

/**
 * Reads an image before any round exists, so the upload can drive setup.
 *
 * The in-round importer needs a round to pour into. This one is for the top
 * of the workflow: it reads the night, says how many bays it found and how
 * big the largest one is, and hands all of it back for the admin to confirm
 * or correct. Nothing is created.
 */
export async function readRoundDetails(
  dataUrl: string,
  expect: "relative" | "gross" = "relative",
): Promise<ReadRoundDetails> {
  await requireAdmin();

  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) {
    return { ok: false, error: "That file is not a JPEG, PNG or WebP image." };
  }
  const [, mediaType, base64] = match;

  if (Math.ceil((base64.length * 3) / 4) > MAX_IMAGE_BYTES) {
    return { ok: false, error: TOO_LARGE };
  }

  const { extractRound } = await import("@/lib/round-import");
  const read = await extractRound(
    base64,
    mediaType as "image/jpeg" | "image/png" | "image/webp",
    expect,
  );
  if (!read.ok) return read;

  const pool = await golferPool();
  const seen = new Map<string, string>();
  const bays = read.teams.map((t) => ({
    label: t.label,
    number: t.number,
    players: resolveNames(t.players, t.label, pool, seen),
    holes: t.holes,
  }));

  const blockers: string[] = [];
  if (bays.length < 2) {
    blockers.push(`Only ${bays.length} bay was legible, and a round needs at least two.`);
  }
  if (bays.length > 12) {
    blockers.push(`${bays.length} bays were read, more than the 12 a round holds.`);
  }
  for (const b of bays) {
    if (b.players.length > MAX_TEAM_SIZE) {
      blockers.push(
        `${b.label} read ${b.players.length} players, more than the ${MAX_TEAM_SIZE} a team holds.`,
      );
    }
    if (b.players.length === 1) {
      blockers.push(
        `${b.label} read only one player, so its name block was probably cut off. ` +
        `A team needs at least ${MIN_TEAM_SIZE}.`,
      );
    }
    for (const p of b.players) {
      if (p.duplicateOf) {
        blockers.push(`${p.read} was read on both ${p.duplicateOf} and ${b.label}.`);
      }
      if (p.sharedBy) {
        blockers.push(
          `${p.read} on ${b.label} could be ${p.sharedBy.join(" or ")}. ` +
          `Give one of them a nickname, or fix the sheet.`,
        );
      }
    }
  }

  const biggest = bays.reduce((n, b) => Math.max(n, b.players.length), 0);
  const teamCount = Math.min(Math.max(bays.length, 2), 12);

  // A sheet that calls the night a major is calling it a major. Nothing else
  // in the image says so, and reading it off the title beats making an admin
  // remember on a form they are otherwise just confirming.
  const title = read.details.title ?? "";
  const roundType: RoundType = /\bmajors?\b/i.test(title) ? "major" : "season";

  // The main rate is what the matches paid. Where the money block did not
  // give one up, the side pots are the next best witness, and failing that
  // the old default stands rather than a zero that silently pays nobody.
  const stakeRate =
    read.stakes.rates.main ??
    read.stakes.rates.front ??
    read.stakes.rates.back ??
    read.stakes.rates.total ??
    null;

  const fb18Rates: Partial<Record<Fb18Segment, number>> = {};
  for (const segment of FB18_SEGMENTS) {
    const rate = read.stakes.rates[segment];
    // Only worth recording where it differs from the main rate; otherwise it
    // inherits, which is what the column's null already means.
    if (rate && rate !== stakeRate) fb18Rates[segment] = rate;
  }

  const fb18Payouts: Partial<Record<Fb18Segment, Record<number, number>>> = {};
  for (const segment of FB18_SEGMENTS) {
    const table = read.stakes[segment];
    if (table) fb18Payouts[segment] = table;
  }

  return {
    ok: true,
    details: {
      date: read.details.date,
      isoDate: isoFromLooseDate(read.details.date),
      title: read.details.title,
      course: read.details.course,
      setHoles: read.details.setHoles,
      rakePerPlayer: read.details.rakePerPlayer,
    },
    bays,
    suggested: {
      teamCount,
      // The cap has to hold the fullest bay that was read, and never less
      // than the minimum a team can field.
      rosterSize: Math.min(Math.max(biggest, MIN_TEAM_SIZE), MAX_TEAM_SIZE),
      name: title || read.details.date || "",
      course: read.details.course ?? "",
      isoDate: isoFromLooseDate(read.details.date),
      roundType,
      setHoles: read.details.setHoles ?? (roundType === "major" ? 6 : 3),
      dollarsPerUnit: stakeRate ?? 5,
      rakePerPlayer: read.details.rakePerPlayer ?? 0,
      payouts: read.stakes.main,
      fb18Payouts,
      fb18Rates,
    },
    stakeNotes: read.stakes.notes,
    pool: [...pool.byKey.values()]
      .filter((g, i, all) => all.findIndex((x) => x.id === g.id) === i)
      .sort((a, b) => a.name.localeCompare(b.name)),
    scoreKind: read.scoreKind,
    scoreKindAssumed: read.scoreKindAssumed,
    confidence: read.confidence,
    notes: read.notes,
    flags: read.flags,
    dropped: read.dropped,
    blockers,
  };
}

export type CreatedFromImport =
  | {
      ok: true;
      matchId: string;
      created: string[];
      rostered: number;
      holesWritten: number;
      /** False when the round was built but could not be taken to scoring. */
      started: boolean;
      startError: string | null;
    }
  | { ok: false; error: string; matchId?: string };

/**
 * Creates the round and fills it from one reviewed image in a single step.
 *
 * Order is deliberate. The round and its scaffolding go down first, then the
 * bays are matched to the teams that scaffolding just made, then the existing
 * import path does the rest. That path already validates team membership,
 * creates missing golfers and refuses to double seat anyone, so none of that
 * is repeated here.
 *
 * If the fill fails the round is left standing and its id comes back with the
 * error, because a half built round an admin can finish by hand is worth more
 * than a deleted one and a wasted upload.
 */
export async function createRoundFromImport(input: {
  round: NewRound;
  bays: {
    players: { read: string; golferId: string | null }[];
    holes: { hole: number; relative: number }[];
  }[];
}): Promise<CreatedFromImport> {
  await requireAdmin();

  if (input.bays.length !== input.round.teamCount) {
    return {
      ok: false,
      error: `The image has ${input.bays.length} bays but the round is set to ${input.round.teamCount} teams.`,
    };
  }

  const made = await insertRound(input.round);
  if (!made.ok) return made;

  const supabase = await createClient();
  const { data: teams } = await supabase
    .from("match_teams").select("id, slot").eq("match_id", made.id).order("slot");

  const slots = (teams ?? []) as { id: string; slot: number }[];
  if (slots.length !== input.bays.length) {
    return {
      ok: false,
      error: "The round was created but its teams did not come back. Fill it in by hand.",
      matchId: made.id,
    };
  }

  // Bays go to teams in the order they were read, which is the order the
  // review screen showed them in. Bay numbers are not used here: a night
  // labelled Bay 1, Bay 2, Bay 4, Bay 7 would otherwise want a seven team
  // round to hold four bays.
  const applied = await applyRoundImport(
    made.id,
    input.bays.map((b, i) => ({
      teamId: slots[i].id,
      players: b.players,
      holes: b.holes,
    })),
    "fill",
  );

  if (!applied.ok) return { ok: false, error: applied.error, matchId: made.id };

  // A round built from a sheet is a night that already happened, so it is
  // taken straight to scoring. Left in setup it would sit behind the captain
  // picks and the roster stage, which an import has just done, and its card
  // would not count toward anything until someone clicked through all of it.
  //
  // startRound does the checking: it refuses a round where a bay came in
  // under the minimum, in which case this stays where it is and says so,
  // rather than advancing a round that cannot be scored.
  const started = await startRound(made.id);

  revalidateMoney(made.id);
  return {
    ok: true,
    matchId: made.id,
    created: applied.created,
    rostered: applied.rostered,
    holesWritten: applied.holesWritten,
    started: started.ok,
    startError: started.ok ? null : started.error,
  };
}


// ------------------------------------------------------------
//  Handing a whole round over as one file
// ------------------------------------------------------------

/**
 * The round, everything it was scored from, and everything that followed.
 *
 * Built so a round can be checked, or shown to somebody, without handing over
 * database access. The alternative was a service key, which bypasses every
 * policy in this project; this goes through requireAdmin like every other
 * money surface and shows exactly one round.
 *
 * Both halves are in here on purpose. The inputs alone would need re-scoring
 * to say anything, and the outputs alone could not be checked. Together they
 * are enough to reproduce the round or to catch the engine disagreeing with
 * the league's own book.
 */
export async function exportRoundJson(
  matchId: string,
): Promise<{ ok: true; filename: string; json: string } | { ok: false; error: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const bundle = await getMatchBundle(matchId);
  if (!bundle) return { ok: false, error: "Round not found." };

  const computed = computeMatch(bundle);

  const golferIds = [...new Set(bundle.players.map((p) => p.golfer_id))];
  const { data: golfers } = await supabase
    .from("golfers").select("id, name, nickname").in("id", golferIds.length ? golferIds : [""]);
  const nameOf = new Map(
    ((golfers ?? []) as { id: string; name: string }[]).map((g) => [g.id, g.name]),
  );

  const teamName = new Map(bundle.teams.map((t) => [t.id, t.name]));

  const payload = {
    exported: "round",
    round: {
      id: bundle.match.id,
      name: bundle.match.name,
      course: bundle.match.course,
      date: bundle.match.match_date,
      status: bundle.match.status,
      roundType: computed.roundType,
      setHoles: computed.setHoles,
      pointMultiplier: computed.multiplier,
      cupEligibleMoney: computed.cupEligible,
      isFirstMajor: bundle.firstMajorId === bundle.match.id,
      teamCount: bundle.match.team_count,
      rosterCap: bundle.match.roster_size,
      tieDefault: bundle.match.tie_default,
      rakePerPlayer: computed.rakePerPlayer,
      rates: computed.rates,
    },
    payouts: {
      main: bundle.payouts,
      front: bundle.fb18Payouts.front,
      back: bundle.fb18Payouts.back,
      total: bundle.fb18Payouts.total,
    },
    tieDecisions: bundle.decisions,
    teams: bundle.teams.map((t) => ({
      slot: t.slot,
      name: t.name,
      captain: t.captain_golfer_id ? nameOf.get(t.captain_golfer_id) ?? null : null,
      roster: bundle.players
        .filter((p) => p.team_id === t.id)
        .sort((a, b) => a.slot - b.slot)
        .map((p) => ({ slot: p.slot, name: nameOf.get(p.golfer_id) ?? p.golfer_id })),
      holes: bundle.scores[t.id] ?? {},
    })),
    // What the engine made of it, so the two can be compared.
    scored: {
      matches: computed.main.segments.map((s) => ({
        match: s.segment,
        holes: s.holes,
        status: s.status,
        totals: Object.fromEntries(
          Object.entries(s.totals).map(([id, v]) => [teamName.get(id) ?? id, v]),
        ),
        carriedIn: s.carriedIn,
        carriedOut: s.carriedOut,
        awards: s.awards.map((a) => ({ team: teamName.get(a.teamId) ?? a.teamId, units: a.units })),
        unresolvedTies: s.ties.filter((t) => t.needsDecision).length,
      })),
      fb18: computed.fb18.results.map((r) => ({
        segment: r.segment,
        status: r.status,
        totals: Object.fromEntries(
          Object.entries(r.totals).map(([id, v]) => [teamName.get(id) ?? id, v]),
        ),
        awards: r.awards.map((a) => ({ team: teamName.get(a.teamId) ?? a.teamId, units: a.units })),
      })),
      bonusPoints: computed.bonus.segments.map((b) => ({
        segment: b.segment,
        status: b.status,
        winners: b.winners.map((id) => teamName.get(id) ?? id),
        eachWins: b.each,
      })),
      settlement: computed.money.map((m) => ({
        player: nameOf.get(m.golferId) ?? m.golferId,
        team: teamName.get(m.teamId) ?? m.teamId,
        matchMoney: m.breakdown.main,
        front: m.breakdown.front,
        back: m.breakdown.back,
        eighteen: m.breakdown.eighteen,
        winnings: m.winnings,
        rake: m.rake,
        dollars: m.dollars,
        cupEligibleDollars: m.cupDollars,
      })),
      points: computed.points.map((p) => ({
        player: nameOf.get(p.golferId) ?? p.golferId,
        team: teamName.get(p.teamId) ?? p.teamId,
        fromMoney: p.fromMoney,
        bonus: p.bonus,
        total: p.total,
      })),
    },
  };

  const slug =
    (bundle.match.match_date || "round").replace(/[^0-9a-zA-Z-]/g, "-") +
    "-" +
    (bundle.match.name || "round").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return {
    ok: true,
    filename: `flo-round-${slug}.json`,
    json: JSON.stringify(payload, null, 2),
  };
}
