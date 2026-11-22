import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import { createClient } from "@/lib/supabase/server";
import { computeMatch, getAllGolfers, getMatchBundle, getPoolGolfers } from "@/lib/match-data";
import { MatchSetup } from "@/components/match-setup";
import { RosterFill } from "@/components/roster-fill";
import { RosterEditor } from "@/components/roster-editor";
import { RoundExport } from "@/components/round-export";
import { ScoreSwap, type CardRow } from "@/components/score-swap";
import { LiveScorecard } from "@/components/live-scorecard";
import { MatchResults } from "@/components/match-results";
import { MatchAdminBar } from "@/components/match-admin-bar";
import { MatchStakesEditor } from "@/components/match-stakes-editor";
import { EditableTitle } from "@/components/editable-title";
import { ScorecardUpload } from "@/components/scorecard-upload";
import { RoundImport } from "@/components/round-import";
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
  // Two lists. The pool is who can be picked for a round. Every golfer is
  // who can be swapped into one afterwards, because a one-off sub is often
  // taken back out of the rating pool once their round is over, and they
  // still have to stay correctable on the round they played.
  const [bundle, golfers, allGolfers, view] = await Promise.all([
    getMatchBundle(id),
    getPoolGolfers(),
    isAdmin ? getAllGolfers() : Promise.resolve([]),
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

  // What the card mover shows on each row: who is on the team, which stays
  // put, and what its card says so far, which is the part that moves.
  // Every golfer rather than the pool, because a one-off sub is often out of
  // the pool by the time a round is being corrected.
  const nameOf = new Map(allGolfers.map((g) => [g.id, displayName(g)]));
  const cardRows: CardRow[] = teams.map((t) => {
    const holes = Object.values(scores[t.id] ?? {}).filter(
      (v): v is number => typeof v === "number",
    );
    return {
      id: t.id,
      name: t.name,
      players: players
        .filter((p) => p.team_id === t.id)
        .sort((a, b) => a.slot - b.slot)
        .map((p) => nameOf.get(p.golfer_id) ?? "Unknown"),
      played: holes.length,
      total: holes.length ? holes.reduce((n, v) => n + v, 0) : null,
    };
  });
  // Remounts the control whenever a card changes underneath it, so it never
  // holds on to totals that no longer match the round.
  const cardKey = cardRows.map((r) => `${r.id}:${r.played}:${r.total}`).join(",");

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
            {match.course ? ` · ${match.course}` : ""} · {match.team_count} teams of up
            to {match.roster_size}
            {computed.roundType === "major" && (
              <span className="ml-2 rounded-full bg-amber-300/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 ring-1 ring-amber-400/40 dark:text-amber-200">
                Major · double points
              </span>
            )}
            {view.showMoney && Number(match.dollars_per_unit) > 0
              ? ` · $${match.dollars_per_unit} a unit`
              : ""}
          </p>
        </div>
        {isAdmin && <MatchAdminBar match={match} />}
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
        <div className="space-y-10">
          {/*
            Above the roster, because reading the sheet is the fast way to
            fill one and picking names by hand is the fallback. Admin only and
            outside the money gate, same as the roster itself: this is names
            and scores, not dollars.
          */}
          {isAdmin && (
            <RoundImport matchId={match.id} teams={teams} status={match.status} />
          )}
          <RosterFill
            match={match} teams={teams} players={players} golfers={golfers}
            isAdmin={isAdmin} myUserId={session.userId}
          />
          {isAdmin && <ScoreSwap key={cardKey} matchId={match.id} teams={cardRows} />}
        </div>
      )}

      {(match.status === "in_progress" || match.status === "complete") && (
        <div className="space-y-10">
          {/*
            Admin only, and not behind the money gate: a roster is names and
            teams, not dollars. Same reason round setup stays visible while an
            admin is previewing the player view.
          */}
          {isAdmin && (
            <RosterEditor
              match={match} teams={teams} players={players} golfers={allGolfers}
              myUserId={session.userId}
            />
          )}
          {isAdmin && <ScoreSwap key={cardKey} matchId={match.id} teams={cardRows} />}
          {view.showMoney && (
            <MatchStakesEditor
              match={match} teams={teams}
              payouts={bundle.payouts} fb18Payouts={bundle.fb18Payouts}
            />
          )}
          {isAdmin && match.status === "in_progress" && (
            <RoundImport matchId={match.id} teams={teams} status={match.status} />
          )}
          {match.status === "in_progress" && scorableTeams.length > 0 && (
            <ScorecardUpload matchId={match.id} teams={scorableTeams} />
          )}
          {/*
            Last on the page, because it is a tool rather than part of the
            round: it hands an admin the whole thing as one file so a round
            can be checked against the sheet without database access.
          */}
          {isAdmin && <RoundExport matchId={match.id} name={match.name} />}
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
            rakePerPlayer={view.showMoney ? computed.rakePerPlayer : 0}
            points={computed.points}
            segmentRates={
              view.showMoney
                ? computed.rates.segment
                : { front: 0, back: 0, total: 0, second: 0 }
            }
            golfers={golfers} isAdmin={isAdmin} showMoney={view.showMoney}
            roundType={computed.roundType}
          />
        </div>
      )}
    </div>
  );
}
