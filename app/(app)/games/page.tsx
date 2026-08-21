import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPoolGolfers, getSeasonMoney } from "@/lib/match-data";
import { GamesList } from "@/components/games-list";
import type { Match } from "@/lib/types";

export default async function GamesPage() {
  const session = await requireUser();
  const supabase = await createClient();

  const [matches, season, golfers] = await Promise.all([
    supabase.from("matches").select("*").order("match_date", { ascending: false }),
    getSeasonMoney(),
    getPoolGolfers(),
  ]);

  return (
    <GamesList
      matches={(matches.data ?? []) as Match[]}
      season={season}
      golfers={golfers}
      isAdmin={session.profile?.is_admin ?? false}
    />
  );
}
