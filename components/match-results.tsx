"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { displayName } from "@/lib/scoring";
import { setTieDecision } from "@/app/(app)/games/actions";
import { TrophyIcon } from "./trophy-icon";
import type {
  EighteenTier, Fb18Result, PlayerMoney, PlayerRoundPoints,
  SegmentResult, TieChoice,
} from "@/lib/game";
import type { Golfer, Match, MatchTeam } from "@/lib/types";

function Units({ n }: { n: number }) {
  const cls = n > 0 ? "text-fairway-600 dark:text-fairway-300"
    : n < 0 ? "text-flag-500" : "text-muted";
  return <span className={`font-semibold tabular-nums ${cls}`}>{n > 0 ? "+" : ""}{n}</span>;
}

export function MatchResults({
  match, teams, segments, fb18, unitsByTeam, money, bonuses, points,
  segmentRates, golfers, isAdmin,
}: {
  match: Match;
  teams: MatchTeam[];
  segments: SegmentResult[];
  fb18: Fb18Result[];
  unitsByTeam: Record<string, number>;
  money: PlayerMoney[];
  bonuses: EighteenTier[];
  points: PlayerRoundPoints[];
  /** Dollars per unit for each FB18 segment. They can differ. */
  segmentRates: Record<"front" | "back" | "total", number>;
  golfers: Golfer[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "?";
  const golferName = (id: string) => {
    const g = golfers.find((x) => x.id === id);
    return g ? displayName(g) : "Unknown";
  };

  function rule(segment: number, blockKey: string, choice: TieChoice) {
    setError(null);
    startTransition(async () => {
      const r = await setTieDecision(match.id, segment, blockKey, choice);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  }

  const openTies = segments.flatMap((s) =>
    s.ties.filter((t) => t.needsDecision).map((t) => ({ ...t, segmentHoles: s.holes })),
  );

  const fb18Teams = teams.filter((t) => t.in_fb18);

  // A unit pays each player, so the team figure is the sum of the roster
  // rather than a pot being divided into it.
  const perPlayerMoney = new Map<string, number>();
  const teamTotalMoney = new Map<string, number>();
  for (const m of money) {
    perPlayerMoney.set(m.teamId, m.dollars);
    teamTotalMoney.set(m.teamId, (teamTotalMoney.get(m.teamId) ?? 0) + m.dollars);
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">{error}</p>
      )}

      {openTies.length > 0 && isAdmin && (
        <section className="rounded-2xl border border-flag-500/40 bg-raised p-5">
          <h3 className="font-semibold">Ties to rule on</h3>
          <p className="mt-1 mb-3 text-sm text-muted">
            Default for this round is{" "}
            <span className="font-medium text-ink">
              {match.tie_default === "hole" ? "next hole" : "next set"}
            </span>. Override any of these.
          </p>
          <ul className="space-y-2">
            {openTies.map((t) => (
              <li key={`${t.segment}:${t.blockKey}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">
                    Holes {t.segmentHoles[0]} to {t.segmentHoles[t.segmentHoles.length - 1]}
                  </span>
                  {": "}
                  {t.teamIds.map(teamName).join(" and ")} tied for{" "}
                  {t.positions.length === 1 ? `position ${t.positions[0]}`
                    : `positions ${t.positions[0]} to ${t.positions[t.positions.length - 1]}`}
                  {!t.resolved && (
                    <span className="ml-2 text-xs text-muted">waiting on the deciding hole</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {(["hole", "set"] as const).map((c) => (
                    <button key={c} onClick={() => rule(t.segment, t.blockKey, c)} disabled={pending}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                        t.choice === c
                          ? "border-fairway-400 bg-fairway-50 text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100"
                          : "border-line hover:border-fairway-300"}`}>
                      {c === "hole" ? "Next hole" : "Next set"}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-3 font-semibold">The six matches</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {segments.map((s) => {
            const carriedIn = Object.values(s.carriedIn).some((v) => v !== 0);
            const carriedOut = Object.values(s.carriedOut).some((v) => v !== 0);
            return (
              <div key={s.segment} className="rounded-2xl border border-line bg-raised p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h4 className="font-semibold">
                    Holes {s.holes[0]} to {s.holes[s.holes.length - 1]}
                  </h4>
                  {s.status === "pending" && (
                    <span className="text-xs text-muted">in progress</span>
                  )}
                </div>

                {carriedIn && (
                  <p className="mb-2 rounded-lg bg-fairway-50 px-2.5 py-1.5 text-xs text-fairway-700 dark:bg-fairway-900/40 dark:text-fairway-200">
                    Carried in:{" "}
                    {Object.entries(s.carriedIn).filter(([, v]) => v !== 0)
                      .map(([p, v]) => `${p}${p === "1" ? "st" : p === "2" ? "nd" : p === "3" ? "rd" : "th"} +${v}`)
                      .join(", ")}
                  </p>
                )}

                <ul className="space-y-1 text-sm">
                  {[...teams]
                    .map((t) => ({
                      team: t,
                      total: s.totals[t.id],
                      award: s.awards.find((a) => a.teamId === t.id),
                    }))
                    .sort((a, b) => (a.total ?? 99) - (b.total ?? 99))
                    .map(({ team, total, award }) => (
                      <li key={team.id} className="flex items-center gap-2">
                        <span className="w-5 shrink-0 text-xs text-muted">
                          {award?.position ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{team.name}</span>
                        <span className="shrink-0 tabular-nums text-muted">{total ?? "—"}</span>
                        <span className="w-9 shrink-0 text-right">
                          {award ? (award.carriedForward
                            ? <span className="text-xs text-muted">roll</span>
                            : <Units n={award.units} />) : "—"}
                        </span>
                      </li>
                    ))}
                </ul>

                {carriedOut && (
                  <p className="mt-2 rounded-lg bg-flag-500/10 px-2.5 py-1.5 text-xs text-flag-500">
                    Rolling forward to the next match
                  </p>
                )}

                {s.awards.some((a) => a.splitShare) && (
                  <p className="mt-2 rounded-lg bg-line/60 px-2.5 py-1.5 text-xs text-muted">
                    Still level after 18. Those units shared evenly.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {fb18Teams.length > 0 && (
        <section>
          <h3 className="mb-1 font-semibold">FB18</h3>
          <p className="mb-3 text-sm text-muted">
            Same scores, scored separately. Lowest front nine, lowest back nine,
            lowest eighteen. All three pay money. None of it feeds FLO Cup
            points, since the best eighteen bonus already rewards that.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {fb18.map((r) => (
              <div key={r.segment} className="rounded-2xl border border-line bg-raised p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h4 className="font-semibold capitalize">
                    {r.segment === "total" ? "All 18" : `${r.segment} nine`}
                    <span className="ml-2 text-xs font-normal text-muted">
                      ${segmentRates[r.segment]}/unit
                    </span>
                  </h4>
                  {r.status === "pending" && <span className="text-xs text-muted">in progress</span>}
                </div>
                <ul className="space-y-1 text-sm">
                  {fb18Teams
                    .map((t) => ({ team: t, total: r.totals[t.id], award: r.awards.find((a) => a.teamId === t.id) }))
                    .sort((a, b) => (a.total ?? 999) - (b.total ?? 999))
                    .map(({ team, total, award }) => {
                      const cash = (award?.units ?? 0) * segmentRates[r.segment];
                      return (
                        <li key={team.id} className="flex items-center gap-2">
                          <span className="w-5 shrink-0 text-xs text-muted">{award?.position ?? "—"}</span>
                          <span className="min-w-0 flex-1 truncate">{team.name}</span>
                          <span className="shrink-0 tabular-nums text-muted">{total ?? "—"}</span>
                          <span className="w-9 shrink-0 text-right">
                            {award ? <Units n={award.units} /> : "—"}
                          </span>
                          {/* The cash figure, so this panel reconciles against
                              the settlement table below it. */}
                          <span className={`w-16 shrink-0 text-right text-xs tabular-nums ${
                            cash > 0 ? "text-fairway-600 dark:text-fairway-300"
                              : cash < 0 ? "text-flag-500" : "text-muted"}`}>
                            {award ? `${cash > 0 ? "+" : cash < 0 ? "-" : ""}$${Math.abs(cash).toFixed(2)}` : "—"}
                          </span>
                        </li>
                      );
                    })}
                </ul>
                {r.pushed.length > 0 && (
                  <p className="mt-2 text-xs text-muted">Tie unbroken, push</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {bonuses.length > 0 && (
        <section>
          <h3 className="mb-1 font-semibold">Best eighteen</h3>
          <p className="mb-3 text-sm text-muted">
            FLO Cup points, not money. Every player on these rosters collects
            them toward the season standings.
          </p>
          <ul className="space-y-2">
            {bonuses.map((tier) => (
              <li
                key={tier.teamIds.join("+")}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-3 text-sm"
              >
                <TrophyIcon className="h-4 w-4 shrink-0 text-fairway-600 dark:text-fairway-300" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{tier.teamIds.map(teamName).join(" and ")}</span>
                  <span className="text-muted"> at {tier.total > 0 ? "+" : ""}{tier.total === 0 ? "E" : tier.total}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-fairway-600 dark:text-fairway-300">
                  +{tier.bonus} pts each
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1 font-semibold">Where it stands</h3>
        <p className="mb-3 text-sm text-muted">
          A unit pays its dollar value to every player on the roster, so the
          team total is the per player figure multiplied by the roster.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th className="p-3 text-left font-medium">Team</th>
                <th className="p-3 text-right font-medium">Units</th>
                <th className="p-3 text-right font-medium text-ink">Each player</th>
                <th className="p-3 text-right font-medium">Team total</th>
              </tr>
            </thead>
            <tbody>
              {[...teams]
                .sort((a, b) => (unitsByTeam[b.id] ?? 0) - (unitsByTeam[a.id] ?? 0))
                .map((t) => {
                  const u = unitsByTeam[t.id] ?? 0;
                  const per = perPlayerMoney.get(t.id) ?? 0;
                  const teamTotal = teamTotalMoney.get(t.id) ?? 0;
                  return (
                    <tr key={t.id} className="border-b border-line last:border-0">
                      <td className="p-3 font-medium">{t.name}</td>
                      <td className="p-3 text-right"><Units n={u} /></td>
                      <td className="p-3 text-right font-semibold tabular-nums">
                        {per >= 0 ? "+" : "-"}${Math.abs(per).toFixed(2)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted">
                        {teamTotal >= 0 ? "+" : "-"}${Math.abs(teamTotal).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {points.length > 0 && (
        <section>
          <h3 className="mb-1 font-semibold">FLO Cup points this round</h3>
          <p className="mb-3 text-sm text-muted">
            A dollar won is a point, a dollar lost is half a point off. FB18
            winnings are money only and do not appear here. The bonus is the
            best eighteen hole score, 50 for the lowest and 25 for the next.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th className="p-3 text-left font-medium">Player</th>
                  <th className="p-3 text-left font-medium">Team</th>
                  <th className="w-28 p-3 text-right font-medium">From money</th>
                  <th className="w-24 p-3 text-right font-medium">Bonus</th>
                  <th className="w-28 p-3 text-right font-medium text-ink">Points</th>
                </tr>
              </thead>
              <tbody>
                {[...points].sort((a, b) => b.total - a.total).map((p) => (
                  <tr key={p.golferId} className="border-b border-line last:border-0">
                    <td className="p-3 font-medium">{golferName(p.golferId)}</td>
                    <td className="p-3 text-muted">{teamName(p.teamId)}</td>
                    <td className={`p-3 text-right tabular-nums ${
                      p.fromMoney > 0 ? "text-fairway-600 dark:text-fairway-300"
                        : p.fromMoney < 0 ? "text-flag-500" : "text-muted"}`}>
                      {p.fromMoney > 0 ? "+" : ""}{p.fromMoney.toFixed(1)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted">
                      {p.bonus > 0 ? `+${p.bonus}` : "—"}
                    </td>
                    <td className="p-3 text-right">
                      <span className={`inline-flex items-center justify-end gap-1.5 font-semibold tabular-nums ${
                        p.total > 0 ? "text-fairway-600 dark:text-fairway-300"
                          : p.total < 0 ? "text-flag-500" : "text-muted"}`}>
                        <TrophyIcon className="h-4 w-4 shrink-0" />
                        {p.total.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {money.length > 0 && (
        <section>
          <h3 className="mb-1 font-semibold">Player settlement</h3>
          <p className="mb-3 text-sm text-muted">
            Everything each player takes home: the main game plus all three
            FB18 segments, at whatever rate each was set to.
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {[...money].sort((a, b) => b.dollars - a.dollars).map((m) => (
              <li key={m.golferId}
                className="flex items-center gap-3 rounded-xl border border-line bg-raised px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{golferName(m.golferId)}</span>
                <span className="shrink-0 text-xs text-muted">{teamName(m.teamId)}</span>
                <span className={`w-20 shrink-0 text-right font-semibold tabular-nums ${
                  m.dollars > 0 ? "text-fairway-600 dark:text-fairway-300"
                  : m.dollars < 0 ? "text-flag-500" : "text-muted"}`}>
                  {m.dollars > 0 ? "+" : ""}${m.dollars.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
