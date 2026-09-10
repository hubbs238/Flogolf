import { getAllGolfers, getCupPot, getSeasonStandings } from "@/lib/match-data";
import { CupPot } from "@/components/cup-pot";
import { CupPodium } from "@/components/cup-podium";
import { StandingsTable } from "@/components/standings-table";

export default async function FloCupPage() {
  const [rows, golfers, pot] = await Promise.all([
    getSeasonStandings(),
    getAllGolfers(),
    getCupPot(),
  ]);

  return (
    <div>
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <CupPot pot={pot} />
        <CupPodium rows={rows} golfers={golfers} />
      </div>

      <p className="mb-4 text-sm text-muted">
        A dollar won is a point. A losing round is worth nothing rather than
        going negative, so a bad week costs you nothing and cannot wipe out a
        good one. Counted each round and added up.
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
