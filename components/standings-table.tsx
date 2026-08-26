import Link from "next/link";
import { GolferAvatar } from "./golfer-avatar";
import { TrophyIcon } from "./trophy-icon";
import { displayName } from "@/lib/scoring";
import { photoUrl } from "@/lib/data";
import type { Golfer } from "@/lib/types";
import type { SeasonRow } from "@/lib/match-data";

export type StandingsMetric = "points" | "dollars";

function tone(n: number) {
  return n > 0
    ? "text-fairway-600 dark:text-fairway-300"
    : n < 0
      ? "text-flag-500"
      : "text-muted";
}

function Points({ n, strong }: { n: number; strong: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-end gap-1.5 tabular-nums ${
        strong ? "font-semibold" : ""
      } ${tone(n)}`}
    >
      <TrophyIcon className="h-4 w-4 shrink-0" />
      {n.toFixed(1)}
    </span>
  );
}

function Money({ n, strong }: { n: number; strong: boolean }) {
  return (
    <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${tone(n)}`}>
      {n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(2)}
    </span>
  );
}

export function StandingsTable({
  rows, golfers, metric, emptyMessage,
}: {
  rows: SeasonRow[];
  golfers: Golfer[];
  metric: StandingsMetric;
  emptyMessage: string;
}) {
  const byId = new Map(golfers.map((g) => [g.id, g]));

  const sorted = [...rows].sort((a, b) => {
    const diff = b[metric] - a[metric];
    if (diff !== 0) return diff;
    // Then whoever did it in fewer rounds, then alphabetically.
    if (a.rounds !== b.rounds) return a.rounds - b.rounds;
    const an = byId.get(a.golferId);
    const bn = byId.get(b.golferId);
    return (an ? displayName(an) : "").localeCompare(bn ? displayName(bn) : "");
  });

  if (sorted.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">
        {emptyMessage}
      </p>
    );
  }

  const pointsFirst = metric === "points";

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-raised">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th className="w-12 p-3 text-center font-medium">#</th>
            <th className="p-3 text-left font-medium">Golfer</th>
            <th className="w-24 p-3 text-right font-medium">Rounds</th>
            <th className="w-28 p-3 text-right font-medium">
              {pointsFirst ? "Money" : "Points"}
            </th>
            <th className="w-28 p-3 text-right font-medium text-ink">
              {pointsFirst ? "Points" : "Money"}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const golfer = byId.get(row.golferId);
            const name = golfer ? displayName(golfer) : "Unknown golfer";
            return (
              <tr key={row.golferId} className="border-b border-line last:border-0">
                <td className="p-3 text-center font-semibold tabular-nums text-muted">
                  {i + 1}
                </td>

                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <GolferAvatar
                      name={name}
                      url={golfer ? photoUrl(golfer.image_path) : null}
                      size="sm"
                    />
                    {golfer ? (
                      <Link
                        href={`/golfer/${golfer.id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className="truncate font-medium">{name}</span>
                    )}
                  </div>
                </td>

                <td className="p-3 text-right tabular-nums text-muted">
                  {row.rounds}
                </td>

                <td className="p-3 text-right">
                  {pointsFirst
                    ? <Money n={row.dollars} strong={false} />
                    : <Points n={row.points} strong={false} />}
                </td>

                <td className="p-3 text-right">
                  {pointsFirst
                    ? <Points n={row.points} strong />
                    : <Money n={row.dollars} strong />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
