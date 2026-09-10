import Link from "next/link";
import { GolferAvatar } from "./golfer-avatar";
import { TrophyIcon } from "./trophy-icon";
import { displayName } from "@/lib/scoring";
import { photoUrl } from "@/lib/data";
import type { Golfer } from "@/lib/types";
import { rankPlaces } from "@/lib/podium";
import type { SeasonRow } from "@/lib/match-data";

/** Visual order, not rank order: the winner sits centre on the tallest block. */
const BLOCKS = [
  { rank: 2, height: "h-20", tint: "from-slate-300/80 to-slate-400/60", label: "2nd" },
  { rank: 1, height: "h-32", tint: "from-amber-200/90 to-amber-400/70", label: "1st" },
  { rank: 3, height: "h-14", tint: "from-orange-300/70 to-orange-500/50", label: "3rd" },
] as const;

export function CupPodium({
  rows, golfers,
}: {
  rows: SeasonRow[];
  golfers: Golfer[];
}) {
  const byId = new Map(golfers.map((g) => [g.id, g]));
  const places = rankPlaces(rows);

  if (places.size === 0) {
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
    <section className="overflow-x-auto rounded-2xl border border-line bg-raised p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
        Podium
      </p>

      <div className="mt-6 flex min-w-max items-end justify-center gap-4 sm:gap-6">
        {BLOCKS.map((block) => {
          const place = places.get(block.rank);
          const first = block.rank === 1;
          const width = first ? "w-36 sm:w-40" : "w-28 sm:w-32";

          // A place a tie has consumed. Keep the block so the shape holds.
          if (!place) {
            return (
              <div key={block.rank} className={`flex ${width} flex-col items-center`}>
                <div className={`${first ? "h-32 w-32" : "h-24 w-24"} rounded-full border border-dashed border-line`} />
                <p className="mt-3 text-center text-sm text-muted">No {block.label}</p>
                <p className="mt-0.5 text-xs text-muted">taken by a tie above</p>
                <div className={`podium-block mt-3 w-full rounded-t-lg bg-line/40 ${block.height} flex items-start justify-center pt-2`}>
                  <span className="text-sm font-bold text-muted">{block.label}</span>
                </div>
              </div>
            );
          }

          const tied = place.golferIds.length > 1;
          const golfer = tied ? null : byId.get(place.golferIds[0]);
          const name = tied
            ? `${place.golferIds.length} way tie`
            : golfer
              ? displayName(golfer)
              : "Unknown";

          return (
            <div key={block.rank} className={`flex ${width} flex-col items-center`}>
              {tied ? (
                // The count stands in for a face there is no single owner of,
                // so it is not a link. The names below it are.
                <div
                  className={`flex items-center justify-center rounded-full bg-fairway-100 font-semibold text-fairway-700 ring-1 ring-line dark:bg-fairway-800 dark:text-fairway-100 ${
                    first ? "h-32 w-32 text-5xl" : "h-24 w-24 text-4xl"
                  }`}
                >
                  {place.golferIds.length}
                </div>
              ) : golfer ? (
                <Link
                  href={`/golfer/${golfer.id}`}
                  aria-label={`${name}, ${block.label} in the FLO Cup`}
                  className="rounded-full transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairway-400"
                >
                  <GolferAvatar
                    name={name}
                    url={photoUrl(golfer.image_path)}
                    size={first ? "xl" : "lg"}
                  />
                </Link>
              ) : (
                <GolferAvatar name={name} url={null} size={first ? "xl" : "lg"} />
              )}

              {tied ? (
                <>
                  <p className={`mt-3 w-full truncate text-center font-medium ${first ? "text-base" : "text-sm"}`}>
                    {name}
                  </p>
                  {/* Every tied player still gets their own way through. */}
                  <p className="mt-0.5 w-full text-center text-xs leading-snug text-muted">
                    {place.golferIds.map((id, i) => {
                      const g = byId.get(id);
                      return (
                        <span key={id}>
                          {i > 0 && ", "}
                          {g ? (
                            <Link href={`/golfer/${g.id}`} className="hover:text-ink hover:underline">
                              {displayName(g)}
                            </Link>
                          ) : (
                            "Unknown"
                          )}
                        </span>
                      );
                    })}
                  </p>
                </>
              ) : golfer ? (
                <Link
                  href={`/golfer/${golfer.id}`}
                  className={`mt-3 w-full truncate text-center font-medium hover:underline ${first ? "text-base" : "text-sm"}`}
                >
                  {name}
                </Link>
              ) : (
                <p className={`mt-3 w-full truncate text-center font-medium ${first ? "text-base" : "text-sm"}`}>
                  {name}
                </p>
              )}

              <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums text-fairway-600 dark:text-fairway-300">
                <TrophyIcon className={first ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"} />
                {place.points.toFixed(1)}
              </span>

              <div
                className={`podium-block mt-3 w-full rounded-t-lg bg-gradient-to-b ${block.tint} ${block.height} flex items-start justify-center pt-2`}
                style={{ animationDelay: `${(3 - block.rank) * 120}ms` }}
              >
                <span className="text-sm font-bold text-fairway-900/70">
                  {block.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
