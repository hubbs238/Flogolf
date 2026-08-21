"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { defaultPayouts } from "@/lib/game";
import type { TieChoice } from "@/lib/game";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateMatch(matchId: string) {
  revalidatePath("/games");
  revalidatePath(`/games/${matchId}`);
}

export async function createMatch(input: {
  name: string;
  course: string;
  teamCount: number;
  rosterSize: number;
  dollarsPerUnit: number;
  tieDefault: TieChoice;
}): Promise<ActionResult> {
  const session = await requireAdmin();
  const supabase = await createClient();

  if (input.teamCount < 2 || input.teamCount > 12) {
    return { ok: false, error: "Pick between 2 and 12 teams." };
  }

  const { data: match, error } = await supabase
    .from("matches")
    .insert({
      name: input.name.trim() || `Round ${new Date().toLocaleDateString()}`,
      course: input.course.trim(),
      team_count: input.teamCount,
      roster_size: input.rosterSize,
      dollars_per_unit: input.dollarsPerUnit,
      tie_default: input.tieDefault,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !match) {
    return { ok: false, error: error?.message ?? "Could not create the round." };
  }

  const teams = Array.from({ length: input.teamCount }, (_, i) => ({
    match_id: match.id,
    slot: i + 1,
    name: `Team ${i + 1}`,
  }));
  await supabase.from("match_teams").insert(teams);

  const table = defaultPayouts(input.teamCount);
  await supabase.from("match_payouts").insert(
    Object.entries(table).map(([position, units]) => ({
      match_id: match.id,
      position: Number(position),
      units,
    })),
  );

  // FB18 pays the same shape by default across all three segments.
  const fb = defaultPayouts(input.teamCount);
  await supabase.from("fb18_payouts").insert(
    (["front", "back", "total"] as const).flatMap((segment) =>
      Object.entries(fb).map(([position, units]) => ({
        match_id: match.id,
        segment,
        position: Number(position),
        units,
      })),
    ),
  );

  revalidatePath("/games");
  redirect(`/games/${match.id}`);
}

export async function updateMatchSettings(
  matchId: string,
  fields: {
    name?: string;
    course?: string;
    dollarsPerUnit?: number;
    tieDefault?: TieChoice;
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
  if (fields.tieDefault !== undefined) update.tie_default = fields.tieDefault;

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
  fb18: { front: Record<number, number>; back: Record<number, number>; total: Record<number, number> },
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
    (["front", "back", "total"] as const).flatMap((segment) =>
      Object.entries(fb18[segment]).map(([position, units]) => ({
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
  if (slot > match.roster_size) {
    return { ok: false, error: `That team already has ${match.roster_size} players.` };
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

export async function removeMatchPlayer(
  matchId: string, golferId: string,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("match_players").delete().eq("match_id", matchId).eq("golfer_id", golferId);
  if (error) return { ok: false, error: error.message };
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

  const short = (teams ?? []).filter((t) => (counts.get(t.id) ?? 0) < match.roster_size);
  if (short.length) {
    return {
      ok: false,
      error: `Still short: ${short.map((t) => t.name).join(", ")}. Each team needs ${match.roster_size}.`,
    };
  }
  return setStatus(matchId, "in_progress");
}

/** Passing null clears the hole. */
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
    if (!Number.isInteger(strokes) || strokes < 1 || strokes > 30) {
      return { ok: false, error: "That score looks wrong. Use 1 to 30." };
    }
    const { error } = await supabase.from("hole_scores").upsert(
      { match_id: matchId, team_id: teamId, hole, strokes },
      { onConflict: "match_id,team_id,hole" },
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidateMatch(matchId);
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
  revalidatePath("/games");
  redirect("/games");
}
