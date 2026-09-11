import { requireUser } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import { createClient } from "@/lib/supabase/server";
import { GamesList } from "@/components/games-list";
import { ViewAsToggle } from "@/components/view-as-toggle";
import type { Match } from "@/lib/types";

export default async function GamesPage() {
  const session = await requireUser();
  const supabase = await createClient();

  const matches = await supabase
    .from("matches").select("*").order("match_date", { ascending: false });
  const view = await getViewMode(session.profile?.is_admin ?? false);

  return (
    <>
      {view.isAdmin && <ViewAsToggle asPlayer={view.asPlayer} />}
      <GamesList
        matches={(matches.data ?? []) as Match[]}
        isAdmin={session.profile?.is_admin ?? false}
        showMoney={view.showMoney}
      />
    </>
  );
}
