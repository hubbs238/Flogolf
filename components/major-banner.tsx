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

        <div className="flex-1 basis-56">
          <p
            className={`font-semibold uppercase tracking-[0.22em] text-amber-300 ${
              big ? "text-xs" : "text-[11px]"
            }`}
          >
            Major Event
          </p>
          <h2
            className={`mt-1 font-semibold leading-tight tracking-tight text-balance ${
              big ? "text-3xl sm:text-5xl" : "text-2xl sm:text-3xl"
            }`}
          >
            {major.name}
          </h2>
        </div>
      </div>

      {/*
        When and where, given their own tier. They used to be a caption under
        the name and a chip in the corner; now they are the second thing the
        eye lands on, which is what someone glancing at the banner actually
        wants to know.
      */}
      <div
        className={`flex flex-wrap items-center gap-x-8 gap-y-3 ${
          big ? "mt-6 sm:mt-7" : "mt-5"
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
      </div>

      {/*
        What is on the line, in the admin's own words. A sentence rather than
        a number now, so it gets a line of its own to run along rather than a
        fixed chip to be squeezed into.
      */}
      {major.points && (
        <p
          // w-fit so it hugs a short line. A bar running the full width with
          // "150 pts" adrift at the left end reads as unfinished.
          className={`flex w-fit max-w-full items-start gap-2.5 rounded-xl bg-amber-300/15 px-4 py-3 font-medium text-amber-100 ring-1 ring-amber-300/40 ${
            big ? "mt-6 text-base sm:text-lg" : "mt-5 text-sm sm:text-base"
          }`}
        >
          <TrophyIcon className={big ? "mt-0.5 h-5 w-5 shrink-0 text-amber-300" : "mt-0.5 h-4 w-4 shrink-0 text-amber-300"} />
          <span className="min-w-0">{major.points}</span>
        </p>
      )}
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
