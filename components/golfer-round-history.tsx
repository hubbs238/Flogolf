import Link from "next/link";
import { TrophyIcon } from "./trophy-icon";
import type { GolferRoundRow } from "@/lib/match-data";

function tone(n: number) {
  return n > 0
    ? "text-fairway-600 dark:text-fairway-300"
    : n < 0
      ? "text-flag-500"
      : "text-muted";
}

function money(n: number) {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
}

export function GolferRoundHistory({ rounds }: { rounds: GolferRoundRow[] }) {
  if (rounds.length === 0) {
    return (
      <section>
        <h2 className="mb-3 font-semibold">Rounds played</h2>
        <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
          No finished rounds yet. A round appears here once it is marked final.
        </p>
      </section>
    );
  }

  const totals = rounds.reduce(
    (acc, r) => ({
      matchMoney: acc.matchMoney + r.matchMoney,
      bonusMoney: acc.bonusMoney + r.bonusMoney,
      fromMoney: acc.fromMoney + r.pointsFromMoney,
      bonus: acc.bonus + r.pointsBonus,
      points: acc.points + r.points,
    }),
    { matchMoney: 0, bonusMoney: 0, fromMoney: 0, bonus: 0, points: 0 },
  );

  return (
    <section>
      <h2 className="mb-1 font-semibold">Rounds played</h2>
      <p className="mb-3 text-sm text-muted">
        Match Money is the six three-hole matches; Bonus Money is F9, B9 and
        all eighteen. Only Match Money earns points, and a losing round scores
        0 rather than going negative, so the money and points columns will
        often disagree.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <th className="p-3 text-left font-medium">Round</th>
              <th className="w-32 p-3 text-right font-medium">Match Money</th>
              <th className="w-32 p-3 text-right font-medium">Bonus Money</th>
              <th className="w-32 p-3 text-right font-medium">Match Points</th>
              <th className="w-32 p-3 text-right font-medium">Bonus Points</th>
              <th className="w-32 p-3 text-right font-medium text-ink">Total Points</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.matchId} className="border-b border-line last:border-0">
                <td className="p-3">
                  <Link
                    href={`/games/${r.matchId}`}
                    className="font-medium hover:underline"
                  >
                    {r.matchName}
                  </Link>
                  <span className="block text-xs text-muted">
                    {new Date(r.matchDate).toLocaleDateString()}
                    {r.course ? ` · ${r.course}` : ""}
                    {r.teamName ? ` · ${r.teamName}` : ""}
                  </span>
                </td>
                <td className={`p-3 text-right tabular-nums ${tone(r.matchMoney)}`}>
                  {money(r.matchMoney)}
                </td>
                <td className={`p-3 text-right tabular-nums ${tone(r.bonusMoney)}`}>
                  {money(r.bonusMoney)}
                </td>
                <td className={`p-3 text-right tabular-nums ${tone(r.pointsFromMoney)}`}>
                  {r.pointsFromMoney > 0 ? "+" : ""}
                  {r.pointsFromMoney.toFixed(1)}
                </td>
                <td className="p-3 text-right tabular-nums text-muted">
                  {r.pointsBonus > 0 ? `+${r.pointsBonus}` : "—"}
                </td>
                <td className="p-3 text-right">
                  <span className={`inline-flex items-center justify-end gap-1.5 font-semibold tabular-nums ${tone(r.points)}`}>
                    <TrophyIcon className="h-4 w-4 shrink-0" />
                    {r.points.toFixed(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-line bg-surface/60 text-sm">
              <td className="p-3 font-semibold">
                {rounds.length} {rounds.length === 1 ? "round" : "rounds"}
              </td>
              <td className={`p-3 text-right tabular-nums ${tone(totals.matchMoney)}`}>
                {money(totals.matchMoney)}
              </td>
              <td className={`p-3 text-right tabular-nums ${tone(totals.bonusMoney)}`}>
                {money(totals.bonusMoney)}
              </td>
              <td className={`p-3 text-right tabular-nums ${tone(totals.fromMoney)}`}>
                {totals.fromMoney > 0 ? "+" : ""}
                {totals.fromMoney.toFixed(1)}
              </td>
              <td className="p-3 text-right tabular-nums text-muted">
                {totals.bonus > 0 ? `+${totals.bonus}` : "—"}
              </td>
              <td className="p-3 text-right">
                <span className={`inline-flex items-center justify-end gap-1.5 font-semibold tabular-nums ${tone(totals.points)}`}>
                  <TrophyIcon className="h-4 w-4 shrink-0" />
                  {totals.points.toFixed(1)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
