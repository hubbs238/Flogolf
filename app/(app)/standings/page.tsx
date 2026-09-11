import { requireUser } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import { getAllGolfers, getCupPot, getSeasonStandings } from "@/lib/match-data";
import { CupPot } from "@/components/cup-pot";
import { CupPodium } from "@/components/cup-podium";
import { StandingsTable } from "@/components/standings-table";

export default async function FloCupPage() {
  const session = await requireUser();
  const [rows, golfers, pot] = await Promise.all([
    getSeasonStandings(),
    getAllGolfers(),
    getCupPot(),
  ]);
  const view = await getViewMode(session.profile?.is_admin ?? false);

  return (
    <div>
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <CupPot pot={pot} />
        <CupPodium rows={rows} golfers={golfers} />
      </div>

      <p className="mb-4 text-sm text-muted">
        {view.showMoney
          ? "A dollar won is a point. A losing round is worth nothing rather than going negative, so a bad week costs you nothing and cannot wipe out a good one. Counted each round and added up. FB18 winnings are money only and do not move the Cup, since the bonus points already cover that."
          : "Winning a three-hole match earns Match Points. A losing round is worth nothing rather than going negative, so a bad week costs you nothing and cannot wipe out a good one. Counted each round and added up. The FB18 side game does not move the Cup, since the bonus points already cover it."}
        {" "}Bonus Points go to the lowest front nine
        (10), the lowest back nine (10) and the lowest eighteen (15), and every
        player on the winning team collects them. One winner each: a front nine
        tie carries to the back nine, and a tie after eighteen splits the
        points. Rounds counts every finished round a golfer was rostered in.
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
