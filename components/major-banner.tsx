import { formatMajorDate } from "@/lib/scoring";
import type { Major } from "@/lib/types";

/**
 * A major announcement.
 *
 * Deliberately dark in both themes, the way the Degent Cup card is: this is
 * the loudest thing on the page and a card that changes ground with the theme
 * would be two different designs to keep working.
 *
 * Copy only. The points figure is what an admin typed, not anything the
 * scoring engine knows about, so nothing here reads a golfer or a round.
 */
function MajorCard({ major, size }: { major: Major; size: "banner" | "tile" }) {
  const big = size === "tile";

  return (
    <section
      className={`relative isolate overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-br from-fairway-900 via-fairway-800 to-fairway-900 text-white shadow-sm ${
        big ? "mb-8 px-6 py-7 sm:px-10 sm:py-9" : "mb-6 px-5 py-5 sm:px-7 sm:py-6"
      }`}
      aria-label={`Major: ${major.name}`}
    >
      {/* The flash: a wide gold light crossing the card, behind the words. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="major-sweep absolute -inset-y-8 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-amber-200/25 to-transparent blur-md" />
      </div>

      {/* A gold rule along the top edge, glowing on the same beat. */}
      <div
        aria-hidden="true"
        className="major-glow pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300 to-transparent"
      />

      <div className={`flex flex-wrap items-center gap-x-6 gap-y-4 ${big ? "sm:gap-x-8" : ""}`}>
        <StarBadge className={big ? "h-14 w-14 sm:h-16 sm:w-16" : "h-11 w-11 sm:h-12 sm:w-12"} />

        {/*
          No min-w-0 here. The name wraps rather than truncates, so letting
          this column shrink past its longest word makes the heading overflow
          and paint across the chips instead of pushing them onto a new line.
        */}
        <div className="flex-1 basis-56">
          {/*
            The date rides the eyebrow rather than sitting in a labelled chip.
            It needs no caption up here, and it leaves the name as the only
            thing on its own line.
          */}
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`font-semibold uppercase tracking-[0.22em] text-amber-300 ${
                big ? "text-xs" : "text-[11px]"
              }`}
            >
              Major
            </span>
            <span aria-hidden="true" className="text-amber-300/40">
              &middot;
            </span>
            <span
              className={`font-medium text-amber-100/90 ${big ? "text-sm" : "text-xs"}`}
            >
              {formatMajorDate(major.major_date)}
            </span>
          </p>

          <h2
            className={`mt-1 font-semibold leading-tight tracking-tight text-balance ${
              big ? "text-3xl sm:text-5xl" : "text-2xl sm:text-3xl"
            }`}
          >
            {major.name}
          </h2>
        </div>

        {/*
          Zero points is a real choice, for an event played for the title
          alone. A chip reading "0 pts" would read as a bug rather than as the
          point, so the whole list stands down with nothing left to show.
        */}
        {major.points > 0 && (
          <dl className="flex shrink-0 flex-wrap items-stretch gap-2">
            <Fact
              label="Lowest 18"
              value={`${major.points.toLocaleString()} pts`}
              big={big}
            />
          </dl>
        )}
      </div>
    </section>
  );
}

function Fact({ label, value, big }: { label: string; value: string; big: boolean }) {
  return (
    <div className="rounded-xl bg-amber-300/15 px-3.5 py-2.5 ring-1 ring-amber-300/40">
      <dd
        className={`font-semibold leading-none tabular-nums text-amber-200 ${
          big ? "text-xl sm:text-2xl" : "text-lg sm:text-xl"
        }`}
      >
        {value}
      </dd>
      <dt className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/70">
        {label}
      </dt>
    </div>
  );
}

/** A gold star, the same vocabulary as the medals without borrowing a place. */
function StarBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-hidden="true" className={`shrink-0 drop-shadow ${className}`}>
      <defs>
        <linearGradient id="majorGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffeeb4" />
          <stop offset="45%" stopColor="#f2c14e" />
          <stop offset="100%" stopColor="#b8801a" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="23" fill="#ffffff" fillOpacity="0.08" />
      <circle cx="24" cy="24" r="23" fill="none" stroke="url(#majorGold)" strokeWidth="1.5" strokeOpacity="0.7" />
      <path
        fill="url(#majorGold)"
        d="M24 11.5l3.7 7.9 8.3 1.1-6.1 5.9 1.5 8.5-7.4-4.1-7.4 4.1 1.5-8.5-6.1-5.9 8.3-1.1z"
      />
    </svg>
  );
}

/** Top of the Golfers page. */
export function MajorBanner({ major }: { major: Major | null }) {
  if (!major) return null;
  return <MajorCard major={major} size="banner" />;
}

/** Full width, under the trophy and the podium on FLO Cup Standings. */
export function MajorTile({ major }: { major: Major | null }) {
  if (!major) return null;
  return <MajorCard major={major} size="tile" />;
}
