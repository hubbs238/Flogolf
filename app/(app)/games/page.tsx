import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GamesList } from "@/components/games-list";
import type { Match } from "@/lib/types";

export default async function GamesPage() {
  const session = await requireUser();
  const supabase = await createClient();

  const matches = await supabase
    .from("matches").select("*").order("match_date", { ascending: false });

  return (
    <GamesList
      matches={(matches.data ?? []) as Match[]}
      isAdmin={session.profile?.is_admin ?? false}
    />
  );
}
