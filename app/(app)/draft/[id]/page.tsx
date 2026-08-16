import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getScoredGolfers, photoUrl } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { DraftSetup } from "@/components/draft-setup";
import { DraftBoard } from "@/components/draft-board";
import { DeleteDraftButton } from "@/components/delete-draft-button";
import type { Draft, DraftPick, DraftTeam } from "@/lib/types";

export default async function DraftPage({ params }: PageProps<"/draft/[id]">) {
  const { id } = await params;
  const session = await requireUser();
  const supabase = await createClient();

  const { data: draft } = await supabase
    .from("drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!draft) notFound();

  const [{ golfers, characteristics }, teamsResult, picksResult, poolResult] =
    await Promise.all([
      getScoredGolfers({ poolOnly: true }),
      supabase.from("draft_teams").select("*").eq("draft_id", id),
      supabase.from("draft_picks").select("*").eq("draft_id", id),
      supabase.from("draft_pool").select("golfer_id, available").eq("draft_id", id),
    ]);

  const availability = Object.fromEntries(
    (poolResult.data ?? []).map(
      (row: { golfer_id: string; available: boolean }) => [
        row.golfer_id,
        row.available,
      ],
    ),
  );

  const withPhotos = golfers.map((g) => ({ ...g, photo: photoUrl(g.image_path) }));
  const isAdmin = session.profile?.is_admin ?? false;
  const typedDraft = draft as Draft;

  return (
    <div>
      <Link
        href="/draft"
        className="mb-6 inline-block text-sm text-muted transition hover:text-ink"
      >
        ← All drafts
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {typedDraft.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {new Date(typedDraft.draft_date).toLocaleDateString()} ·{" "}
            {typedDraft.team_count} teams of {typedDraft.roster_size}
          </p>
        </div>

        {isAdmin && (
          <DeleteDraftButton
            draftId={typedDraft.id}
            draftName={typedDraft.name}
            pickCount={(picksResult.data ?? []).length}
          />
        )}
      </div>

      {typedDraft.status === "setup" ? (
        <DraftSetup
          draft={typedDraft}
          teams={(teamsResult.data ?? []) as DraftTeam[]}
          golfers={withPhotos}
          availability={availability}
          characteristics={characteristics}
          isAdmin={isAdmin}
        />
      ) : (
        <DraftBoard
          draft={typedDraft}
          teams={(teamsResult.data ?? []) as DraftTeam[]}
          picks={(picksResult.data ?? []) as DraftPick[]}
          golfers={withPhotos}
          availability={availability}
          characteristics={characteristics}
          isAdmin={isAdmin}
          myUserId={session.userId}
        />
      )}
    </div>
  );
}
