import { getAllGolfers, getSeasonStandings } from "@/lib/match-data";
import { StandingsTable } from "@/components/standings-table";

export default async function FloCupPage() {
  const [rows, golfers] = await Promise.all([getSeasonStandings(), getAllGolfers()]);

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        A dollar won is a point. A dollar lost is half a point off. Counted
        each round and added up, so a good week is not wiped out by a bad one.
        FB18 winnings are money only and do not move the Cup, since the best
        eighteen bonus already covers that. Best eighteen hole score in a round
        adds 50 points to every player on that team, second best adds 25.
        Rounds counts every finished round a golfer was rostered in.
      </p>
      <StandingsTable
        rows={rows}
        golfers={golfers}
        metric="points"
        emptyMessage="No finished rounds yet. Standings show up once a round is marked final."
      />
    </div>
  );
}
