import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DraftList } from "@/components/draft-list";
import type { Draft } from "@/lib/types";

export default async function DraftsPage() {
  const session = await requireUser();
  const supabase = await createClient();

  const [draftsResult, picksResult] = await Promise.all([
    supabase.from("drafts").select("*").order("created_at", { ascending: false }),
    supabase.from("draft_picks").select("draft_id"),
  ]);

  // Counted here so the delete confirm can say what is actually being lost.
  const pickCounts: Record<string, number> = {};
  for (const row of (picksResult.data ?? []) as { draft_id: string }[]) {
    pickCounts[row.draft_id] = (pickCounts[row.draft_id] ?? 0) + 1;
  }

  return (
    <DraftList
      drafts={(draftsResult.data ?? []) as Draft[]}
      pickCounts={pickCounts}
      isAdmin={session.profile?.is_admin ?? false}
    />
  );
}
