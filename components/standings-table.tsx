import Link from "next/link";
import { GolferAvatar } from "./golfer-avatar";
import { TrophyIcon } from "./trophy-icon";
import { displayName } from "@/lib/scoring";
import { photoUrl } from "@/lib/data";
import type { Golfer } from "@/lib/types";
import type { SeasonRow } from "@/lib/match-data";

export type StandingsMetric = "points" | "dollars";

function Value({ n, metric }: { n: number; metric: StandingsMetric }) {
  const tone =
    n > 0 ? "text-fairway-600 dark:text-fairway-300"
      : n < 0 ? "text-flag-500"
        : "text-muted";
  if (metric === "points") {
    return (
      <span className={`inline-flex items-center justify-end gap-1.5 font-semibold tabular-nums ${tone}`}>
        <TrophyIcon className="h-4 w-4 shrink-0" />
        {n.toFixed(1)}
      </span>
    );
  }
  return (
    <span className={`font-semibold tabular-nums ${tone}`}>
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

  return (
    <ul className="space-y-1.5">
      {sorted.map((row, i) => {
        const golfer = byId.get(row.golferId);
        const name = golfer ? displayName(golfer) : "Unknown golfer";
        return (
          <li
            key={row.golferId}
            className="flex items-center gap-3 rounded-xl border border-line bg-raised p-3"
          >
            <span className="w-6 shrink-0 text-center text-sm font-semibold text-muted tabular-nums">
              {i + 1}
            </span>

            <GolferAvatar
              name={name}
              url={golfer ? photoUrl(golfer.image_path) : null}
              size="sm"
            />

            <div className="min-w-0 flex-1">
              {golfer ? (
                <Link href={`/golfer/${golfer.id}`} className="block truncate font-medium hover:underline">
                  {name}
                </Link>
              ) : (
                <span className="block truncate font-medium">{name}</span>
              )}
              <span className="text-xs text-muted">
                {row.rounds} {row.rounds === 1 ? "round" : "rounds"}
                {metric === "points" && (
                  <> · {row.dollars >= 0 ? "+" : "-"}${Math.abs(row.dollars).toFixed(2)}</>
                )}
              </span>
            </div>

            <span className="w-24 shrink-0 text-right">
              <Value n={row[metric]} metric={metric} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
