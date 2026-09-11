import { requireUser } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import { getMyRatedGolferIds, getScoredGolfers, photoUrl } from "@/lib/data";
import { getSeasonStandings } from "@/lib/match-data";
import { getLiveMajor } from "@/lib/majors";
import { RankingsBoard } from "@/components/rankings-board";
import { ViewAsToggle } from "@/components/view-as-toggle";
import { MajorBanner } from "@/components/major-banner";

export default async function RankingsPage() {
  const session = await requireUser();
  const { golfers, characteristics } = await getScoredGolfers({ poolOnly: true });
  const [rated, standings, major] = await Promise.all([
    getMyRatedGolferIds(session.userId),
    getSeasonStandings(),
    getLiveMajor(),
  ]);

  const view = await getViewMode(session.profile?.is_admin ?? false);

  // Money is left out of the payload entirely rather than hidden in the
  // browser, so a player's page never carries a figure it will not show.
  const season = Object.fromEntries(
    standings.map((row) => [
      row.golferId,
      view.showMoney
        ? {
            rounds: row.rounds,
            points: row.points,
            matchMoney: row.matchMoney,
            bonusMoney: row.bonusMoney,
          }
        : { rounds: row.rounds, points: row.points },
    ]),
  );

  return (
    <>
      {view.isAdmin && <ViewAsToggle asPlayer={view.asPlayer} />}
      {major && <MajorBanner major={major} />}
      <RankingsBoard
        golfers={golfers.map((g) => ({ ...g, photo: photoUrl(g.image_path) }))}
        characteristics={characteristics}
        ratedGolferIds={[...rated]}
        myGolferId={session.profile?.golfer_id ?? null}
        season={season}
        showMoney={view.showMoney}
      />
    </>
  );
}
