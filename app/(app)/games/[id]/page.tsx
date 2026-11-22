import { formatDollars } from "@/lib/currency";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import { createClient } from "@/lib/supabase/server";
import { computeMatch, getAllGolfers, getMatchBundle } from "@/lib/match-data";
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
  const [bundle, allGolfers, view] = await Promise.all([
    getMatchBundle(id),
    getAllGolfers(),
    getViewMode(isAdmin),
  ]);
  if (!bundle) notFound();

  const computed = computeMatch(bundle);
  const { match, teams, players, scores } = bundle;

  // Teams this person may post for: their own, or all of them for an admin.
  const scorableTeams = isAdmin
    ? teams
    : teams.filter((t) => t.captain_user_id === session.userId);

  // Historical participants keep their names and profiles after leaving the pool.
  const rosterIds = new Set(players.map(p => p.golfer_id));
  const captainIds = new Set(teams.map(t => t.captain_golfer_id));
  const roundGolfers = allGolfers.filter(g => rosterIds.has(g.id) || captainIds.has(g.id));
  const nameOf = new Map(roundGolfers.map(g => [g.id, displayName(g)]));
  const captainNames: Record<string, string> = {};
  for (const team of teams) {
    const name = team.captain_golfer_id && nameOf.get(team.captain_golfer_id);
    if (name) captainNames[team.id] = name;
  }

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
        .map((p) => ({ id: p.golfer_id, name: nameOf.get(p.golfer_id) ?? null })),
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
              ? ` · ${formatDollars(Number(match.dollars_per_unit))} a unit`
              : ""}
          </p>
        </div>
        {isAdmin && <MatchAdminBar match={match} />}
      </div>

      {match.status === "setup" &&
        (isAdmin ? (
          <MatchSetup
            match={match} teams={teams} golfers={allGolfers.filter(g => g.in_pool || captainIds.has(g.id))} drafts={drafts}
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
            match={match} teams={teams} players={players} golfers={allGolfers.filter(g => g.in_pool || rosterIds.has(g.id))}
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
            golfers={roundGolfers} isAdmin={isAdmin} showMoney={view.showMoney}
            roundType={computed.roundType}
          />
        </div>
      )}
    </div>
  );
}
