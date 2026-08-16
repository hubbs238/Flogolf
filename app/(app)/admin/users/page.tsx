import { requireAdmin } from "@/lib/auth";
import { getProfiles } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { PeopleAdmin } from "@/components/people-admin";
import type { Golfer } from "@/lib/types";

export default async function PeopleAdminPage() {
  const session = await requireAdmin();
  const supabase = await createClient();

  const [profiles, golfersResult] = await Promise.all([
    getProfiles(),
    supabase.from("golfers").select("*").order("name"),
  ]);

  return (
    <PeopleAdmin
      profiles={profiles}
      golfers={(golfersResult.data ?? []) as Golfer[]}
      currentUserId={session.userId}
    />
  );
}
