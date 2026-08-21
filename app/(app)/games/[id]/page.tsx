import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeMatch, getMatchBundle, getPoolGolfers } from "@/lib/match-data";
import { MatchSetup } from "@/components/match-setup";
import { RosterFill } from "@/components/roster-fill";
import { LiveScorecard } from "@/components/live-scorecard";
import { MatchResults } from "@/components/match-results";
import { MatchAdminBar } from "@/components/match-admin-bar";
import type { Draft } from "@/lib/types";

export default async function MatchPage({ params }: PageProps<"/games/[id]">) {
  const { id } = await params;
  const session = await requireUser();

  const bundle = await getMatchBundle(id);
  if (!bundle) notFound();

  const isAdmin = session.profile?.is_admin ?? false;
  const golfers = await getPoolGolfers();
  const computed = computeMatch(bundle);
  const { match, teams, players, scores } = bundle;

  let drafts: Draft[] = [];
  if (match.status === "setup" && isAdmin) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("drafts").select("*").eq("status", "complete")
      .order("draft_date", { ascending: false }).limit(20);
    drafts = (data ?? []) as Draft[];
  }

  return (
    <div>
      <Link href="/games" className="mb-6 inline-block text-sm text-muted transition hover:text-ink">
        ← All rounds
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{match.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {new Date(match.match_date).toLocaleDateString()}
            {match.course ? ` · ${match.course}` : ""} · {match.team_count} teams of{" "}
            {match.roster_size}
            {Number(match.dollars_per_unit) > 0 ? ` · $${match.dollars_per_unit} a unit` : ""}
          </p>
        </div>
        {isAdmin && match.status !== "setup" && <MatchAdminBar match={match} />}
      </div>

      {match.status === "setup" &&
        (isAdmin ? (
          <MatchSetup
            match={match} teams={teams} golfers={golfers} drafts={drafts}
            payouts={bundle.payouts} fb18Payouts={bundle.fb18Payouts}
          />
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">
            An admin is still setting this round up.
          </p>
        ))}

      {match.status === "filling" && (
        <RosterFill
          match={match} teams={teams} players={players} golfers={golfers}
          isAdmin={isAdmin} myUserId={session.userId}
        />
      )}

      {(match.status === "in_progress" || match.status === "complete") && (
        <div className="space-y-10">
          <LiveScorecard
            match={match} teams={teams} scores={scores}
            isAdmin={isAdmin} myUserId={session.userId}
          />
          <MatchResults
            match={match} teams={teams}
            segments={computed.main.segments} fb18={computed.fb18.results}
            unitsByTeam={computed.unitsByTeam} money={computed.money}
            golfers={golfers} isAdmin={isAdmin}
          />
        </div>
      )}
    </div>
  );
}
