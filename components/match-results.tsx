"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { displayName } from "@/lib/scoring";
import { BONUS_POINTS, formatRelative } from "@/lib/game";
import { setTieDecision } from "@/app/(app)/games/actions";
import { TrophyIcon } from "./trophy-icon";
import type {
  BonusSegment, Fb18Result, PlayerMoney, PlayerRoundPoints,
  SegmentResult, TieChoice,
} from "@/lib/game";
import type { Golfer, Match, MatchTeam } from "@/lib/types";

const BONUS_LABEL: Record<"front" | "back" | "total", string> = {
  front: "Front nine",
  back: "Back nine",
  total: "All eighteen",
};

function Cash({ n, strong = false }: { n: number; strong?: boolean }) {
  const cls = n > 0 ? "text-fairway-600 dark:text-fairway-300"
    : n < 0 ? "text-flag-500" : "text-muted";
  if (n === 0) return <span className="tabular-nums text-muted">—</span>;
  return (
    <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${cls}`}>
      {n > 0 ? "+" : "-"}${Math.abs(n).toFixed(2)}
    </span>
  );
}

function Units({ n }: { n: number }) {
  const cls = n > 0 ? "text-fairway-600 dark:text-fairway-300"
    : n < 0 ? "text-flag-500" : "text-muted";
  return <span className={`font-semibold tabular-nums ${cls}`}>{n > 0 ? "+" : ""}{n}</span>;
}

export function MatchResults({
  match, teams, segments, fb18, unitsByTeam, money, teamMoney, duesPerPlayer,
  bonus, points, segmentRates, golfers, isAdmin, showMoney,
}: {
  match: Match;
  teams: MatchTeam[];
  segments: SegmentResult[];
  fb18: Fb18Result[];
  unitsByTeam: Record<string, number>;
  /**
   * Settlement, a row per player. Empty for anyone but an admin: these rows
   * are the one thing on the page players are not shown, so the server drops
   * them rather than sending them down and hiding them.
   */
  money: PlayerMoney[];
  /** Team winnings, rolled up server side so every viewer can see them. */
  teamMoney: Record<string, { perPlayer: number; total: number }>;
  /** Flat charge each player paid to play. Zero on a round without dues. */
  duesPerPlayer: number;
  bonus: { segments: BonusSegment[]; pointsByTeam: Record<string, number> };
  points: PlayerRoundPoints[];
  /** Dollars per unit for each FB18 segment. They can differ. */
  segmentRates: Record<"front" | "back" | "total", number>;
  golfers: Golfer[];
  isAdmin: boolean;
  /** False for players, and for an admin previewing the player view. */
  showMoney: boolean;
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

  // Hide the three side game columns entirely when nobody played it, rather
  // than showing a wall of dashes.
  const anyFb18 = money.some(
    (m) => m.breakdown.front !== 0 || m.breakdown.back !== 0 || m.breakdown.eighteen !== 0,
  );
  const sumBy = (pick: (m: PlayerMoney) => number) =>
    Math.round(money.reduce((n, m) => n + pick(m), 0) * 100) / 100;

  // Dues are per round, so every settlement row carries the same figure.
  // Rounded the way awardMoney rounds it, so the prose below cannot disagree
  // with the column it describes. Nothing to show on a round that is free.
  const dues = Number.isFinite(duesPerPlayer)
    ? Math.max(0, Math.round(duesPerPlayer * 100) / 100)
    : 0;
  const anyDues = dues > 0;

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
            lowest eighteen. A tie nobody can break shares that prize evenly.
            {showMoney && " All three pay money."}
            {" None of it feeds FLO Cup points, since the bonus points already reward the same results."}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {fb18.map((r) => (
              <div key={r.segment} className="rounded-2xl border border-line bg-raised p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h4 className="font-semibold capitalize">
                    {r.segment === "total" ? "All 18" : `${r.segment} nine`}
                    {showMoney && (
                      <span className="ml-2 text-xs font-normal text-muted">
                        ${segmentRates[r.segment]}/unit
                      </span>
                    )}
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
                          {showMoney && (
                            <span className={`w-16 shrink-0 text-right text-xs tabular-nums ${
                              cash > 0 ? "text-fairway-600 dark:text-fairway-300"
                                : cash < 0 ? "text-flag-500" : "text-muted"}`}>
                              {award ? `${cash > 0 ? "+" : cash < 0 ? "-" : ""}$${Math.abs(cash).toFixed(2)}` : "—"}
                            </span>
                          )}
                        </li>
                      );
                    })}
                </ul>
                {r.split.length > 0 && (
                  <p className="mt-2 text-xs text-muted">Tied, prize shared evenly</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {bonus.segments.some((b) => b.winners.length > 0) && (
        <section>
          <h3 className="mb-1 font-semibold">Bonus points</h3>
          <p className="mb-3 text-sm text-muted">
            FLO Cup points, not money. One winner each, and every player on
            that roster collects the points toward the season standings.
          </p>
          <ul className="space-y-2">
            {bonus.segments.map((b) => (
              <li
                key={b.segment}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-3 text-sm"
              >
                <TrophyIcon className="h-4 w-4 shrink-0 text-fairway-600 dark:text-fairway-300" />
                <span className="w-24 shrink-0 font-medium">{BONUS_LABEL[b.segment]}</span>
                <span className="min-w-0 flex-1 text-muted">
                  {b.winners.length === 0 ? (
                    b.status === "pending" ? "Not finished yet" : "No winner"
                  ) : (
                    <>
                      <span className="font-medium text-ink">
                        {b.winners.map(teamName).join(" and ")}
                      </span>
                      {" at "}
                      {formatRelative(b.totals[b.winners[0]])}
                      {b.winners.length > 1 && " · tied, points split"}
                    </>
                  )}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-fairway-600 dark:text-fairway-300">
                  {b.winners.length === 0
                    ? `${BONUS_POINTS[b.segment]} pts`
                    : `+${b.each} pts each`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1 font-semibold">Where it stands</h3>
        <p className="mb-3 text-sm text-muted">
          {showMoney
            ? "A unit pays its dollar value to every player on the roster, so the team total is the per player figure multiplied by the roster."
            : "Units won and lost across the six three-hole matches and the side game."}
          {showMoney && anyDues &&
            ` These are winnings before dues: $${dues.toFixed(2)} a player` +
            " comes off what anyone actually collects."}
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th className="p-3 text-left font-medium">Team</th>
                <th className={`p-3 text-right font-medium ${showMoney ? "" : "text-ink"}`}>
                  Units
                </th>
                {showMoney && (
                  <>
                    <th className="p-3 text-right font-medium text-ink">Each player</th>
                    <th className="p-3 text-right font-medium">Team total</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {[...teams]
                .sort((a, b) => (unitsByTeam[b.id] ?? 0) - (unitsByTeam[a.id] ?? 0))
                .map((t) => {
                  const u = unitsByTeam[t.id] ?? 0;
                  const per = teamMoney[t.id]?.perPlayer ?? 0;
                  const teamTotal = teamMoney[t.id]?.total ?? 0;
                  return (
                    <tr key={t.id} className="border-b border-line last:border-0">
                      <td className="p-3 font-medium">{t.name}</td>
                      <td className="p-3 text-right"><Units n={u} /></td>
                      {showMoney && (
                        <>
                          <td className="p-3 text-right font-semibold tabular-nums">
                            {per >= 0 ? "+" : "-"}${Math.abs(per).toFixed(2)}
                          </td>
                          <td className="p-3 text-right tabular-nums text-muted">
                            {teamTotal >= 0 ? "+" : "-"}${Math.abs(teamTotal).toFixed(2)}
                          </td>
                        </>
                      )}
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
            {showMoney
              ? "Match Points come from Match Money, a dollar a point, with a losing round scoring 0 rather than going negative. Bonus Money earns nothing here."
              : "Match Points come from the six three-hole matches, with a losing round scoring 0 rather than going negative."}
            {" "}Bonus Points are 10 for the lowest front nine, 10 for the
            lowest back nine and 15 for the lowest eighteen.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th className="p-3 text-left font-medium">Player</th>
                  <th className="p-3 text-left font-medium">Team</th>
                  <th className="w-32 p-3 text-right font-medium">Match Points</th>
                  <th className="w-32 p-3 text-right font-medium">Bonus Points</th>
                  <th className="w-32 p-3 text-right font-medium text-ink">Total Points</th>
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

      {/*
        Admins only. Players get the points tables above, which say the same
        thing about who had a good round without a money column beside them to
        confuse the two.
      */}
      {showMoney && money.length > 0 && (
        <section>
          <h3 className="mb-1 font-semibold">Player settlement</h3>
          <p className="mb-3 text-sm text-muted">
            What each player owes or collects, and where it came from. Positive
            is money in, negative is money out.
            {anyDues && ` Dues of $${dues.toFixed(2)} a player come off the total.`}
            {" "}Only admins see this table.
          </p>

          <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
            <table className="w-full min-w-max text-sm">
              <thead>
                {anyFb18 && (
                  <tr className="text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 pt-3" colSpan={3} />
                    <th className="px-3 pt-3 text-center font-medium" colSpan={3}>
                      Bonus Money
                    </th>
                    <th className="px-3 pt-3" colSpan={anyDues ? 2 : 1} />
                  </tr>
                )}
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th className="p-3 text-left font-medium">Player</th>
                  <th className="p-3 text-left font-medium">Team</th>
                  <th className="w-32 p-3 text-right font-medium">Match Money</th>
                  {anyFb18 && (
                    <>
                      <th className="w-24 p-3 text-right font-medium">F9</th>
                      <th className="w-24 p-3 text-right font-medium">B9</th>
                      <th className="w-24 p-3 text-right font-medium">All 18</th>
                    </>
                  )}
                  {anyDues && <th className="w-24 p-3 text-right font-medium">Dues</th>}
                  <th className="w-28 p-3 text-right font-medium text-ink">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...money].sort((a, b) => b.dollars - a.dollars).map((m) => (
                  <tr key={m.golferId} className="border-b border-line last:border-0">
                    <td className="p-3 font-medium">{golferName(m.golferId)}</td>
                    <td className="p-3 text-muted">{teamName(m.teamId)}</td>
                    <td className="p-3 text-right"><Cash n={m.breakdown.main} /></td>
                    {anyFb18 && (
                      <>
                        <td className="p-3 text-right"><Cash n={m.breakdown.front} /></td>
                        <td className="p-3 text-right"><Cash n={m.breakdown.back} /></td>
                        <td className="p-3 text-right"><Cash n={m.breakdown.eighteen} /></td>
                      </>
                    )}
                    {anyDues && (
                      <td className="p-3 text-right"><Cash n={-m.dues} /></td>
                    )}
                    <td className="p-3 text-right"><Cash n={m.dollars} strong /></td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-line bg-surface/60">
                  <td className="p-3 font-semibold" colSpan={2}>
                    Round total
                  </td>
                  <td className="p-3 text-right"><Cash n={sumBy((m) => m.breakdown.main)} /></td>
                  {anyFb18 && (
                    <>
                      <td className="p-3 text-right"><Cash n={sumBy((m) => m.breakdown.front)} /></td>
                      <td className="p-3 text-right"><Cash n={sumBy((m) => m.breakdown.back)} /></td>
                      <td className="p-3 text-right"><Cash n={sumBy((m) => m.breakdown.eighteen)} /></td>
                    </>
                  )}
                  {anyDues && (
                    <td className="p-3 text-right"><Cash n={sumBy((m) => -m.dues)} /></td>
                  )}
                  <td className="p-3 text-right"><Cash n={sumBy((m) => m.dollars)} strong /></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-2 text-xs text-muted">
            The round total is what the group is up or down overall. The
            winnings part lands on zero when every team fields the same number
            of players, and drifts when one plays a man short, since a unit pays
            each player rather than being divided among them.
            {anyDues &&
              ` Dues take a further $${(dues * money.length).toFixed(2)} out of the group,` +
              " since they leave it rather than moving inside it."}
          </p>
        </section>
      )}
    </div>
  );
}
