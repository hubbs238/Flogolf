import { createClient } from "@/lib/supabase/server";
import { photoUrl } from "@/lib/data";
import { GolfersAdmin } from "@/components/golfers-admin";
import type { Golfer } from "@/lib/types";

export default async function GolfersAdminPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("golfers").select("*").order("name");

  const golfers = ((data ?? []) as Golfer[]).map((g) => ({
    ...g,
    photo: photoUrl(g.image_path),
  }));

  return <GolfersAdmin golfers={golfers} />;
}
