import { createClient } from "@/lib/supabase/server";
import type { Major } from "./types";

/**
 * The major currently being announced, or null when none is switched on.
 *
 * maybeSingle rather than single: no live major is the normal state for most
 * of the season, not an error. The database allows only one live row, so this
 * cannot quietly pick a winner between two.
 */
export async function getLiveMajor(): Promise<Major | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("majors")
    .select("*")
    .eq("is_live", true)
    .maybeSingle();

  return (data as Major) ?? null;
}

/** Every major, soonest first, for the admin screen. */
export async function getAllMajors(): Promise<Major[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("majors")
    .select("*")
    .order("major_date", { ascending: true });

  return (data ?? []) as Major[];
}
