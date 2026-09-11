import { requireUser } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import { ViewAsToggle } from "@/components/view-as-toggle";

export default async function StandingsLayout({ children }: LayoutProps<"/standings">) {
  const session = await requireUser();
  const view = await getViewMode(session.profile?.is_admin ?? false);

  return (
    <div>
      {view.isAdmin && <ViewAsToggle asPlayer={view.asPlayer} />}
      <h1 className="text-2xl font-semibold tracking-tight">
        FLO Cup Standings
      </h1>
      <p className="mt-1 mb-8 text-sm text-muted">
        {view.showMoney
          ? "Points, money, and rounds played across every finished round."
          : "Points and rounds played across every finished round."}
      </p>
      {children}
    </div>
  );
}
