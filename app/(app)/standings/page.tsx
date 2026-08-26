import { getAllGolfers, getSeasonStandings } from "@/lib/match-data";
import { StandingsTable } from "@/components/standings-table";

export default async function FloCupPage() {
  const [rows, golfers] = await Promise.all([getSeasonStandings(), getAllGolfers()]);

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        A dollar won is a point. A dollar lost is half a point off. Counted
        each round and added up, so a good week is not wiped out by a bad one.
      </p>
      <StandingsTable
        rows={rows}
        golfers={golfers}
        metric="points"
        emptyMessage="No finished rounds yet. Points show up once a round is marked final."
      />
    </div>
  );
}
