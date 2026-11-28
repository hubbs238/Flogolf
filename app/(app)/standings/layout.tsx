import { requireUser } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import { ViewAsToggle } from "@/components/view-as-toggle";
import { ScoringViewSelect } from "@/components/scoring-view-select";

export default async function StandingsLayout({ children }: LayoutProps<"/standings">) {
  const session = await requireUser();
  const view = await getViewMode(session.profile?.is_admin ?? false);

  return (
    <div>
      {view.isAdmin && <ViewAsToggle asPlayer={view.asPlayer} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">FLO Cup Standings</h1>
        {process.env.FLO_APP_ENV === "staging" && view.showMoney && <ScoringViewSelect />}
      </div>
      <p className="mt-1 mb-8 text-sm text-muted">
        {view.showMoney
          ? "Points, money, and rounds played across every finished round."
          : "Points and rounds played across every finished round."}
      </p>
      {children}
    </div>
  );
}
