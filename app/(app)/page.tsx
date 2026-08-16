import { requireUser } from "@/lib/auth";
import { getMyRatedGolferIds, getScoredGolfers, photoUrl } from "@/lib/data";
import { RankingsBoard } from "@/components/rankings-board";

export default async function RankingsPage() {
  const session = await requireUser();
  const { golfers, characteristics } = await getScoredGolfers({ poolOnly: true });
  const rated = await getMyRatedGolferIds(session.userId);

  return (
    <RankingsBoard
      golfers={golfers.map((g) => ({ ...g, photo: photoUrl(g.image_path) }))}
      characteristics={characteristics}
      ratedGolferIds={[...rated]}
      myGolferId={session.profile?.golfer_id ?? null}
    />
  );
}
