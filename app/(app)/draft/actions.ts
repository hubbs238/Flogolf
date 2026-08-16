"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { totalPicks } from "@/lib/draft";
import type { DraftStrategy } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateDraft(draftId: string) {
  revalidatePath("/draft");
  revalidatePath(`/draft/${draftId}`);
}

export async function createDraft(input: {
  name: string;
  teamCount: number;
  rosterSize: number;
  strategy: DraftStrategy;
}): Promise<ActionResult> {
  const session = await requireAdmin();
  const supabase = await createClient();

  const name = input.name.trim() || `Draft ${new Date().toLocaleDateString()}`;
  if (input.teamCount < 2 || input.teamCount > 12) {
    return { ok: false, error: "Pick between 2 and 12 teams." };
  }
  if (input.rosterSize < 2 || input.rosterSize > 20) {
    return { ok: false, error: "Roster size must be between 2 and 20." };
  }

  const { data: draft, error } = await supabase
    .from("drafts")
    .insert({
      name,
      team_count: input.teamCount,
      roster_size: input.rosterSize,
      strategy: input.strategy,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !draft) {
    return { ok: false, error: error?.message ?? "Could not create the draft." };
  }

  const teams = Array.from({ length: input.teamCount }, (_, index) => ({
    draft_id: draft.id,
    name: `Team ${index + 1}`,
    slot: index + 1,
  }));
  const { error: teamsError } = await supabase.from("draft_teams").insert(teams);
  if (teamsError) return { ok: false, error: teamsError.message };

  // Seed the week's pool with everyone currently in the player pool.
  const { data: golfers } = await supabase
    .from("golfers")
    .select("id")
    .eq("in_pool", true);

  if (golfers && golfers.length > 0) {
    await supabase.from("draft_pool").insert(
      golfers.map((g: { id: string }) => ({
        draft_id: draft.id,
        golfer_id: g.id,
        available: true,
      })),
    );
  }

  revalidatePath("/draft");
  redirect(`/draft/${draft.id}`);
}

export async function updateDraftSettings(
  draftId: string,
  fields: {
    name?: string;
    teamCount?: number;
    rosterSize?: number;
    strategy?: DraftStrategy;
  },
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: draft } = await supabase
    .from("drafts")
    .select("*")
    .eq("id", draftId)
    .single();

  if (!draft) return { ok: false, error: "Draft not found." };
  if (draft.status !== "setup") {
    return { ok: false, error: "Settings lock once the draft starts." };
  }

  const update: Record<string, unknown> = {};
  if (fields.name !== undefined) update.name = fields.name.trim() || draft.name;
  if (fields.strategy !== undefined) update.strategy = fields.strategy;
  if (fields.rosterSize !== undefined) {
    if (fields.rosterSize < 2 || fields.rosterSize > 20) {
      return { ok: false, error: "Roster size must be between 2 and 20." };
    }
    update.roster_size = fields.rosterSize;
  }

  if (fields.teamCount !== undefined && fields.teamCount !== draft.team_count) {
    if (fields.teamCount < 2 || fields.teamCount > 12) {
      return { ok: false, error: "Pick between 2 and 12 teams." };
    }
    update.team_count = fields.teamCount;

    if (fields.teamCount > draft.team_count) {
      const added = Array.from(
        { length: fields.teamCount - draft.team_count },
        (_, index) => ({
          draft_id: draftId,
          name: `Team ${draft.team_count + index + 1}`,
          slot: draft.team_count + index + 1,
        }),
      );
      await supabase.from("draft_teams").insert(added);
    } else {
      await supabase
        .from("draft_teams")
        .delete()
        .eq("draft_id", draftId)
        .gt("slot", fields.teamCount);
    }
  }

  const { error } = await supabase.from("drafts").update(update).eq("id", draftId);
  if (error) return { ok: false, error: error.message };

  revalidateDraft(draftId);
  return { ok: true };
}

export async function setTeamCaptain(
  draftId: string,
  teamId: string,
  golferId: string | null,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  // A captain who has a login gets to make their own picks in a live draft.
  let captainUserId: string | null = null;
  if (golferId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("golfer_id", golferId)
      .maybeSingle();
    captainUserId = profile?.id ?? null;
  }

  const { error } = await supabase
    .from("draft_teams")
    .update({ captain_golfer_id: golferId, captain_user_id: captainUserId })
    .eq("id", teamId);

  if (error) return { ok: false, error: error.message };

  revalidateDraft(draftId);
  return { ok: true };
}

export async function renameTeam(
  draftId: string,
  teamId: string,
  name: string,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("draft_teams")
    .update({ name: name.trim() || "Team" })
    .eq("id", teamId);

  if (error) return { ok: false, error: error.message };

  revalidateDraft(draftId);
  return { ok: true };
}

export async function setAvailability(
  draftId: string,
  golferId: string,
  available: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("draft_pool")
    .upsert(
      { draft_id: draftId, golfer_id: golferId, available },
      { onConflict: "draft_id,golfer_id" },
    );

  if (error) return { ok: false, error: error.message };

  revalidateDraft(draftId);
  return { ok: true };
}

export async function setAllAvailability(
  draftId: string,
  available: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("draft_pool")
    .update({ available })
    .eq("draft_id", draftId);

  if (error) return { ok: false, error: error.message };

  revalidateDraft(draftId);
  return { ok: true };
}

export async function startLiveDraft(draftId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: draft }, { data: teams }, { data: pool }] = await Promise.all([
    supabase.from("drafts").select("*").eq("id", draftId).single(),
    supabase.from("draft_teams").select("*").eq("draft_id", draftId),
    supabase
      .from("draft_pool")
      .select("golfer_id")
      .eq("draft_id", draftId)
      .eq("available", true),
  ]);

  if (!draft) return { ok: false, error: "Draft not found." };

  const missingCaptain = (teams ?? []).some((t) => !t.captain_golfer_id);
  if (missingCaptain) {
    return { ok: false, error: "Every team needs a captain before you start." };
  }

  const captainIds = new Set(
    (teams ?? []).map((t) => t.captain_golfer_id).filter(Boolean),
  );
  const draftable = (pool ?? []).filter(
    (row: { golfer_id: string }) => !captainIds.has(row.golfer_id),
  ).length;
  const needed = totalPicks(draft.team_count, draft.roster_size);

  if (draftable < needed) {
    return {
      ok: false,
      error: `This draft needs ${needed} available golfers beyond the captains, and only ${draftable} are marked available.`,
    };
  }

  const { error } = await supabase
    .from("drafts")
    .update({ mode: "live", status: "in_progress", current_pick: 1 })
    .eq("id", draftId);

  if (error) return { ok: false, error: error.message };

  revalidateDraft(draftId);
  return { ok: true };
}

export async function makePick(
  draftId: string,
  golferId: string,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  // Turn order, authorization, and availability all live in this function
  // so the browser is never the thing deciding whose pick it is.
  const { error } = await supabase.rpc("make_pick", {
    p_draft_id: draftId,
    p_golfer_id: golferId,
  });

  if (error) return { ok: false, error: error.message };

  revalidateDraft(draftId);
  return { ok: true };
}

export async function undoLastPick(draftId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.rpc("undo_last_pick", {
    p_draft_id: draftId,
  });

  if (error) return { ok: false, error: error.message };

  revalidateDraft(draftId);
  return { ok: true };
}

export async function resetDraft(draftId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  await supabase.from("draft_picks").delete().eq("draft_id", draftId);

  const { error } = await supabase
    .from("drafts")
    .update({ status: "setup", mode: "mock", current_pick: 1 })
    .eq("id", draftId);

  if (error) return { ok: false, error: error.message };

  revalidateDraft(draftId);
  return { ok: true };
}

export async function deleteDraft(draftId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("drafts").delete().eq("id", draftId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/draft");
  redirect("/draft");
}
