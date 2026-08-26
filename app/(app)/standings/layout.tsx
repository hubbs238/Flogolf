import { requireUser } from "@/lib/auth";

export default async function StandingsLayout({ children }: LayoutProps<"/standings">) {
  await requireUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        FLO Cup Standings
      </h1>
      <p className="mt-1 mb-8 text-sm text-muted">
        Points, money, and rounds played across every finished round.
      </p>
      {children}
    </div>
  );
}
