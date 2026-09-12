import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import { createClient } from "@/lib/supabase/server";
import { computeMatch, getMatchBundle, getPoolGolfers } from "@/lib/match-data";
import { MatchSetup } from "@/components/match-setup";
import { RosterFill } from "@/components/roster-fill";
import { LiveScorecard } from "@/components/live-scorecard";
import { MatchResults } from "@/components/match-results";
import { MatchAdminBar } from "@/components/match-admin-bar";
import { MatchStakesEditor } from "@/components/match-stakes-editor";
import { EditableTitle } from "@/components/editable-title";
import { ScorecardUpload } from "@/components/scorecard-upload";
import { ViewAsToggle } from "@/components/view-as-toggle";
import { displayName } from "@/lib/scoring";
import type { Draft } from "@/lib/types";

export default async function MatchPage({ params }: PageProps<"/games/[id]">) {
  const { id } = await params;
  const session = await requireUser();

  // In parallel. These were four awaits in a row, so every render of this page
  // - including the one a score save triggers on its way back - paid for each
  // round trip end to end before starting the next.
  const isAdmin = session.profile?.is_admin ?? false;
  const [bundle, golfers, view] = await Promise.all([
    getMatchBundle(id),
    getPoolGolfers(),
    getViewMode(isAdmin),
  ]);
  if (!bundle) notFound();

  const computed = computeMatch(bundle);
  const { match, teams, players, scores } = bundle;

  // Teams this person may post for: their own, or all of them for an admin.
  const scorableTeams = isAdmin
    ? teams
    : teams.filter((t) => t.captain_user_id === session.userId);

  // Captain shown beside the team name so nobody posts on the wrong row.
  const golferById = new Map(golfers.map((g) => [g.id, g]));
  const captainNames: Record<string, string> = {};
  for (const t of teams) {
    const g = t.captain_golfer_id ? golferById.get(t.captain_golfer_id) : null;
    if (g) captainNames[t.id] = displayName(g);
  }

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
      {isAdmin && <ViewAsToggle asPlayer={view.asPlayer} />}

      <Link href="/games" className="mb-6 inline-block text-sm text-muted transition hover:text-ink">
        ← All rounds
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <EditableTitle kind="match" id={match.id} name={match.name} canEdit={isAdmin} />
          <p className="mt-1 text-sm text-muted">
            {new Date(match.match_date).toLocaleDateString()}
            {match.course ? ` · ${match.course}` : ""} · {match.team_count} teams of{" "}
            {match.roster_size}
            {view.showMoney && Number(match.dollars_per_unit) > 0
              ? ` · $${match.dollars_per_unit} a unit`
              : ""}
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
          {view.showMoney && (
            <MatchStakesEditor
              match={match} teams={teams}
              payouts={bundle.payouts} fb18Payouts={bundle.fb18Payouts}
            />
          )}
          {match.status === "in_progress" && scorableTeams.length > 0 && (
            <ScorecardUpload matchId={match.id} teams={scorableTeams} />
          )}
          <LiveScorecard
            match={match} teams={teams} captainNames={captainNames} scores={scores}
            isAdmin={isAdmin} myUserId={session.userId}
          />
          {/*
            Every computed dollar figure is dropped here rather than hidden in
            the browser, so a player's page carries no settlement rows, no team
            winnings and no rates.

            It is not a lock, and nothing here pretends to be one. The round's
            own row still carries its stake, and any approved player can query
            the scores through PostgREST and do the arithmetic themselves. The
            point is to keep money away from the points tables, which is what
            was confusing people.
          */}
          <MatchResults
            match={match} teams={teams}
            segments={computed.main.segments} fb18={computed.fb18.results}
            unitsByTeam={computed.unitsByTeam}
            money={view.showMoney ? computed.money : []}
            teamMoney={view.showMoney ? computed.teamMoney : {}}
            duesPerPlayer={view.showMoney ? computed.duesPerPlayer : 0}
            bonus={computed.bonus} points={computed.points}
            segmentRates={
              view.showMoney
                ? computed.rates.segment
                : { front: 0, back: 0, total: 0 }
            }
            golfers={golfers} isAdmin={isAdmin} showMoney={view.showMoney}
          />
        </div>
      )}
    </div>
  );
}
