import { GolferAvatar } from "./golfer-avatar";
import { TrophyIcon } from "./trophy-icon";
import { displayName } from "@/lib/scoring";
import { photoUrl } from "@/lib/data";
import type { Golfer } from "@/lib/types";
import type { SeasonRow } from "@/lib/match-data";

/**
 * Olympic podium for the top three.
 *
 * Rendered in visual order (2nd, 1st, 3rd) rather than rank order, which is
 * how a podium reads: the winner in the middle on the tallest block.
 */
const PLACES = [
  { rank: 2, height: "h-16", tint: "from-slate-300/80 to-slate-400/60", label: "2nd" },
  { rank: 1, height: "h-24", tint: "from-amber-200/90 to-amber-400/70", label: "1st" },
  { rank: 3, height: "h-11", tint: "from-orange-300/70 to-orange-500/50", label: "3rd" },
] as const;

export function CupPodium({
  rows, golfers,
}: {
  rows: SeasonRow[];
  golfers: Golfer[];
}) {
  const byId = new Map(golfers.map((g) => [g.id, g]));
  const ranked = [...rows].sort((a, b) => b.points - a.points).slice(0, 3);

  if (ranked.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-raised p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Podium
        </p>
        <p className="mt-3 text-sm text-muted">
          Nobody on the podium yet. It fills in once a round is marked final.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-raised p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Podium
      </p>

      <div className="mt-5 flex items-end justify-center gap-3 sm:gap-5">
        {PLACES.map((place) => {
          const row = ranked[place.rank - 1];
          if (!row) return <div key={place.rank} className="w-20" />;

          const golfer = byId.get(row.golferId);
          const name = golfer ? displayName(golfer) : "Unknown";

          return (
            <div key={place.rank} className="flex w-20 flex-col items-center sm:w-24">
              <GolferAvatar
                name={name}
                url={golfer ? photoUrl(golfer.image_path) : null}
                size={place.rank === 1 ? "md" : "sm"}
              />

              <p className="mt-2 w-full truncate text-center text-sm font-medium">
                {name}
              </p>

              <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold tabular-nums text-fairway-600 dark:text-fairway-300">
                <TrophyIcon className="h-3 w-3 shrink-0" />
                {row.points.toFixed(1)}
              </span>

              {/* The block. Grows from the base so the podium builds upward. */}
              <div
                className={`podium-block mt-2 w-full rounded-t-lg bg-gradient-to-b ${place.tint} ${place.height} flex items-start justify-center pt-1.5`}
                style={{ animationDelay: `${(3 - place.rank) * 120}ms` }}
              >
                <span className="text-xs font-bold text-fairway-900/70">
                  {place.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
