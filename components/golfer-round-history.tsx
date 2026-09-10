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
      dollars: acc.dollars + r.dollars,
      fromMoney: acc.fromMoney + r.pointsFromMoney,
      bonus: acc.bonus + r.pointsBonus,
      points: acc.points + r.points,
    }),
    { dollars: 0, fromMoney: 0, bonus: 0, points: 0 },
  );

  return (
    <section>
      <h2 className="mb-1 font-semibold">Rounds played</h2>
      <p className="mb-3 text-sm text-muted">
        Points split into what came from money and what came from the best
        eighteen bonus. FB18 winnings pay cash but earn no points, so the two
        columns will not always agree.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <th className="p-3 text-left font-medium">Round</th>
              <th className="w-28 p-3 text-right font-medium">Money</th>
              <th className="w-28 p-3 text-right font-medium">From money</th>
              <th className="w-24 p-3 text-right font-medium">Bonus</th>
              <th className="w-28 p-3 text-right font-medium text-ink">Points</th>
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
                <td className={`p-3 text-right font-semibold tabular-nums ${tone(r.dollars)}`}>
                  {money(r.dollars)}
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
              <td className={`p-3 text-right font-semibold tabular-nums ${tone(totals.dollars)}`}>
                {money(totals.dollars)}
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
