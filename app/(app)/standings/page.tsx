import { requireUser } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import { getAllGolfers, getCupPot, getSeasonStandings } from "@/lib/match-data";
import { getLiveMajor } from "@/lib/majors";
import { CupPot } from "@/components/cup-pot";
import { CupPodium } from "@/components/cup-podium";
import { StandingsTable } from "@/components/standings-table";
import { MajorTile } from "@/components/major-banner";

export default async function FloCupPage() {
  const session = await requireUser();
  const [rows, golfers, pot, major] = await Promise.all([
    getSeasonStandings(),
    getAllGolfers(),
    getCupPot(),
    getLiveMajor(),
  ]);
  const view = await getViewMode(session.profile?.is_admin ?? false);

  return (
    <div>
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <CupPot pot={pot} />
        <CupPodium rows={rows} golfers={golfers} />
      </div>

      {major && <MajorTile major={major} />}

      <p className="mb-4 text-sm text-muted">
        Match Points and FB18 Bonus Points are scored separately for each player each round.
        Each category earns one point per dollar won before rake, or zero for a loss. Majors double both.
      </p>
      <StandingsTable
        rows={rows}
        golfers={golfers}
        metric="points"
        emptyMessage="No finished rounds yet. Standings show up once a round is marked final."
        showMoney={view.showMoney}
      />
    </div>
  );
}
