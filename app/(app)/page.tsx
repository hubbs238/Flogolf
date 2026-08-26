import { requireUser } from "@/lib/auth";
import { getMyRatedGolferIds, getScoredGolfers, photoUrl } from "@/lib/data";
import { getSeasonStandings } from "@/lib/match-data";
import { RankingsBoard } from "@/components/rankings-board";

export default async function RankingsPage() {
  const session = await requireUser();
  const { golfers, characteristics } = await getScoredGolfers({ poolOnly: true });
  const [rated, standings] = await Promise.all([
    getMyRatedGolferIds(session.userId),
    getSeasonStandings(),
  ]);

  const season = Object.fromEntries(
    standings.map((row) => [
      row.golferId,
      { rounds: row.rounds, points: row.points, dollars: row.dollars },
    ]),
  );

  return (
    <RankingsBoard
      golfers={golfers.map((g) => ({ ...g, photo: photoUrl(g.image_path) }))}
      characteristics={characteristics}
      ratedGolferIds={[...rated]}
      myGolferId={session.profile?.golfer_id ?? null}
      season={season}
    />
  );
}
