import { getAllGolfers, getSeasonStandings } from "@/lib/match-data";
import { StandingsTable } from "@/components/standings-table";

export default async function MoneyLeadersPage() {
  const [rows, golfers] = await Promise.all([getSeasonStandings(), getAllGolfers()]);

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Actual money across every finished round, up and down. Each team&rsquo;s
        winnings split evenly among whoever was on that roster.
        Rounds counts every finished round a golfer was rostered in.
      </p>
      <StandingsTable
        rows={rows}
        golfers={golfers}
        metric="dollars"
        emptyMessage="No finished rounds yet. Money shows up once a round is marked final."
      />
    </div>
  );
}
