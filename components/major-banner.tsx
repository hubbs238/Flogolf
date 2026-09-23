import { formatMajorDate } from "@/lib/scoring";
import { TrophyIcon } from "./trophy-icon";
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
      aria-label={`Major Event: ${major.name}`}
    >
      {/* Mowing stripes, so the card has a surface rather than a flat fill. */}
      <div aria-hidden="true" className="major-turf pointer-events-none absolute inset-0 -z-10" />

      {/*
        A star the size of the card, bled off the right edge at almost no
        opacity. It fills the space the words leave and gives the whole thing
        some depth, without ever competing to be read.
      */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 -z-10 hidden sm:block">
        <StarMark className={big ? "h-[26rem] w-[26rem]" : "h-64 w-64"} />
      </div>

      {/* The flash: a wide gold light crossing the card, behind the words. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="major-sweep absolute -inset-y-8 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-amber-200/25 to-transparent blur-md" />
      </div>

      {/* A gold rule along the top edge, glowing on the same beat. */}
      <div
        aria-hidden="true"
        className="major-glow pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300 to-transparent"
      />

      {/*
        The name takes the whole width and the facts spread across it
        underneath, edge to edge. Three columns side by side starved the name
        - "The Claret Mug" came out over three lines with "Mug" on its own -
        because the sentence on the right would take whatever it wanted.
      */}
      <div className={`flex items-center ${big ? "gap-5" : "gap-4"}`}>
        <StarBadge className={big ? "h-14 w-14 sm:h-16 sm:w-16" : "h-11 w-11 sm:h-12 sm:w-12"} />

        <div className="min-w-0">
          <p
            className={`font-semibold uppercase tracking-[0.22em] text-amber-300 ${
              big ? "text-xs" : "text-[11px]"
            }`}
          >
            Major Event
          </p>
          {/*
            Gold on the name, the way it is engraved on a trophy. This is the
            one bold thing on the card; everything around it stays quiet so
            this is what the eye lands on.
          */}
          <h2
            className={`major-name mt-1 bg-gradient-to-b from-amber-50 via-amber-200 to-amber-400 bg-clip-text font-semibold leading-tight tracking-tight text-transparent text-balance ${
              big ? "text-3xl sm:text-5xl" : "text-2xl sm:text-3xl"
            }`}
          >
            {major.name}
          </h2>
        </div>
      </div>

      <div
        aria-hidden="true"
        className={`h-px rounded-full bg-gradient-to-r from-amber-400/70 via-amber-300/25 to-transparent ${
          big ? "mt-6" : "mt-5"
        }`}
      />

      {/*
        Everything else on one line, pushed apart so it reaches both edges of
        the card rather than huddling at the left.
      */}
      <div
        className={`flex flex-wrap items-center justify-between gap-y-4 ${
          big ? "mt-6 gap-x-8" : "mt-5 gap-x-6"
        }`}
      >
        <Fact
          icon={<CalendarIcon className={big ? "h-6 w-6" : "h-5 w-5"} />}
          value={formatMajorDate(major.major_date)}
          big={big}
        />

        {major.course && (
          <Fact
            icon={<FlagIcon className={big ? "h-6 w-6" : "h-5 w-5"} />}
            value={major.course}
            big={big}
          />
        )}

        {major.points && (
          <p
            className={`flex max-w-full items-start gap-2.5 rounded-xl bg-amber-300/15 px-4 py-3 font-medium text-amber-100 ring-1 ring-amber-300/40 ${
              big ? "text-base sm:text-lg" : "text-sm sm:text-base"
            }`}
          >
            <TrophyIcon
              className={`mt-0.5 shrink-0 text-amber-300 ${big ? "h-5 w-5" : "h-4 w-4"}`}
            />
            <span className="min-w-0">{major.points}</span>
          </p>
        )}
      </div>
    </section>
  );
}

function Fact({
  icon, value, big,
}: {
  icon: React.ReactNode;
  value: string;
  big: boolean;
}) {
  return (
    <span
      className={`flex items-center gap-2.5 font-semibold tracking-tight ${
        big ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"
      }`}
    >
      <span className="shrink-0 text-amber-300">{icon}</span>
      <span className="min-w-0">{value}</span>
    </span>
  );
}


/** A calendar, so the date reads at a glance rather than as a caption. */
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

/** A pin on a green, so the course reads as a place rather than a subtitle. */
function FlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 21V4" />
      <path d="M6 4h11l-2.5 3.5L17 11H6" fill="currentColor" fillOpacity="0.35" />
      <path d="M3.5 21h6" />
    </svg>
  );
}

/** The star alone, as a watermark. No ring: at this size the ring was the
 *  thing you noticed, which is the opposite of what a watermark is for. */
function StarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path
        fill="#f2c14e"
        fillOpacity="0.055"
        d="M24 11.5l3.7 7.9 8.3 1.1-6.1 5.9 1.5 8.5-7.4-4.1-7.4 4.1 1.5-8.5-6.1-5.9 8.3-1.1z"
      />
    </svg>
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
