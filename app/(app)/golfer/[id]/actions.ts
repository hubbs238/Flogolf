"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type RatingResult = { ok: true } | { ok: false; error: string };

/**
 * Sets the photo on the caller's own golfer card.
 *
 * Goes through the set_my_photo() database function rather than a table
 * update, so a signed in user gets write access to exactly one column on
 * exactly one row and nothing else.
 */
export async function setMyPhoto(
  imagePath: string | null,
): Promise<RatingResult> {
  const session = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_my_photo", {
    p_image_path: imagePath,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  if (session.profile?.golfer_id) {
    revalidatePath(`/golfer/${session.profile.golfer_id}`);
  }
  return { ok: true };
}

export async function submitRating(
  golferId: string,
  scores: Record<string, number>,
): Promise<RatingResult> {
  const session = await requireUser();
  const supabase = await createClient();

  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return { ok: false, error: "No scores were submitted." };
  }
  for (const [, value] of entries) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { ok: false, error: "Scores must land between 0 and 100." };
    }
  }

  // Upserting on the unique (golfer_id, rater_id) pair is what enforces one
  // submission per person while still letting them revise it.
  const { data: rating, error: ratingError } = await supabase
    .from("ratings")
    .upsert(
      { golfer_id: golferId, rater_id: session.userId },
      { onConflict: "golfer_id,rater_id" },
    )
    .select("id")
    .single();

  if (ratingError || !rating) {
    return {
      ok: false,
      error: ratingError?.message ?? "Could not save that rating.",
    };
  }

  const { error: scoresError } = await supabase.from("rating_scores").upsert(
    entries.map(([characteristicId, score]) => ({
      rating_id: rating.id,
      characteristic_id: characteristicId,
      score: Math.round(score),
    })),
    { onConflict: "rating_id,characteristic_id" },
  );

  if (scoresError) {
    return { ok: false, error: scoresError.message };
  }

  revalidatePath("/");
  revalidatePath(`/golfer/${golferId}`);
  return { ok: true };
}
