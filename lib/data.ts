import { createClient } from "@/lib/supabase/server";
import { buildScoredGolfers } from "./scoring";
import type {
  CategoryAverage,
  Characteristic,
  Golfer,
  Profile,
  ScoredGolfer,
} from "./types";

export async function getCharacteristics(): Promise<Characteristic[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("characteristics")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Could not load characteristics: ${error.message}`);
  return (data ?? []) as Characteristic[];
}

export async function getActiveCharacteristics(): Promise<Characteristic[]> {
  return (await getCharacteristics()).filter((c) => c.active);
}

/**
 * The board. Joins golfers, category averages, and rating counts, then
 * applies the current weights. Weights are applied on read, which is why
 * changing one reshuffles the rankings immediately without touching
 * a single stored rating.
 */
export async function getScoredGolfers(options?: {
  poolOnly?: boolean;
}): Promise<{ golfers: ScoredGolfer[]; characteristics: Characteristic[] }> {
  const supabase = await createClient();

  let golferQuery = supabase.from("golfers").select("*").order("name");
  if (options?.poolOnly) golferQuery = golferQuery.eq("in_pool", true);

  const [characteristics, golfersResult, averagesResult, countsResult] =
    await Promise.all([
      getActiveCharacteristics(),
      golferQuery,
      supabase.from("golfer_category_averages").select("*"),
      supabase.from("golfer_rating_counts").select("*"),
    ]);

  if (golfersResult.error) {
    throw new Error(`Could not load golfers: ${golfersResult.error.message}`);
  }
  if (averagesResult.error) {
    throw new Error(`Could not load scores: ${averagesResult.error.message}`);
  }

  const ratingCounts = new Map<string, number>(
    (countsResult.data ?? []).map((row: { golfer_id: string; rating_count: number }) => [
      row.golfer_id,
      Number(row.rating_count),
    ]),
  );

  return {
    golfers: buildScoredGolfers(
      (golfersResult.data ?? []) as Golfer[],
      (averagesResult.data ?? []) as CategoryAverage[],
      ratingCounts,
      characteristics,
    ),
    characteristics,
  };
}

/** Which golfers the signed in user has already rated, for the Rate prompts. */
export async function getMyRatedGolferIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ratings")
    .select("golfer_id")
    .eq("rater_id", userId);

  return new Set((data ?? []).map((row: { golfer_id: string }) => row.golfer_id));
}

/** The signed in user's own scores for one golfer, so the form loads for editing. */
export async function getMyRating(
  userId: string,
  golferId: string,
): Promise<{ ratingId: string; scores: Record<string, number> } | null> {
  const supabase = await createClient();

  const { data: rating } = await supabase
    .from("ratings")
    .select("id")
    .eq("rater_id", userId)
    .eq("golfer_id", golferId)
    .maybeSingle();

  if (!rating) return null;

  const { data: scores } = await supabase
    .from("rating_scores")
    .select("characteristic_id, score")
    .eq("rating_id", rating.id);

  return {
    ratingId: rating.id,
    scores: Object.fromEntries(
      (scores ?? []).map((row: { characteristic_id: string; score: number }) => [
        row.characteristic_id,
        row.score,
      ]),
    ),
  };
}

export async function getGolfer(id: string): Promise<Golfer | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("golfers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Golfer) ?? null;
}

export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("display_name");
  return (data ?? []) as Profile[];
}

/** Public URL for a stored golfer photo. */
export function photoUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/golfer-photos/${imagePath}`;
}
