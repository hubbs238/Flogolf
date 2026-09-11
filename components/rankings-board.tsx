"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { GolferAvatar } from "./golfer-avatar";
import { TrophyIcon } from "./trophy-icon";
import { displayName } from "@/lib/scoring";
import { MEDAL, PODIUM_WASH, medalByGolfer } from "@/lib/podium";
import type { Characteristic, ScoredGolfer } from "@/lib/types";

type BoardGolfer = ScoredGolfer & { photo: string | null };

/** Match and bonus money together. Both absent means nothing to add up. */
const winningsOf = (s: { matchMoney?: number; bonusMoney?: number }) =>
  (s.matchMoney ?? 0) + (s.bonusMoney ?? 0);

/** Money fields are absent, not zero, when the viewer is not shown money. */
export type SeasonByGolfer = Record<
  string,
  { rounds: number; points: number; matchMoney?: number; bonusMoney?: number }
>;

type SeasonEntry = SeasonByGolfer[string];

/** Season sorts, sitting alongside Overall and the rated categories. */
const POINTS = "points";
const WINNINGS = "winnings";
const MATCH_MONEY = "matchMoney";
const BONUS_MONEY = "bonusMoney";
const OVERALL = "overall";
const MONEY_SORTS = [WINNINGS, MATCH_MONEY, BONUS_MONEY];

const ordinal = (n: number) => {
  const mod = n % 100;
  const suffix = mod > 10 && mod < 14 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

/** Whole dollars with a sign. Cents live on the standings and the profile. */
const cash = (n: number) => {
  // Sign from the rounded figure, not the raw one, or 40 cents renders as
  // "+$0" in winning green and a small loss as "-$0" in red.
  const rounded = Math.round(n);
  const whole = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${rounded > 0 ? "+" : rounded < 0 ? "-" : ""}$${whole}`;
};

const tone = (n: number) =>
  n > 0 ? "text-fairway-600 dark:text-fairway-300"
    : n < 0 ? "text-flag-500" : "text-muted";

export function RankingsBoard({
  golfers, characteristics, ratedGolferIds, myGolferId, season, showMoney,
}: {
  golfers: BoardGolfer[];
  characteristics: Characteristic[];
  ratedGolferIds: string[];
  myGolferId: string | null;
  season: SeasonByGolfer;
  /** False for players, and for an admin previewing the player view. */
  showMoney: boolean;
}) {
  const [sortBy, setSortBy] = useState<string>(POINTS);
  const [onlyUnrated, setOnlyUnrated] = useState(false);

  // An admin can flip to the player view while sorted by Winnings, which
  // would leave the board ordered by a column that no longer exists. Falling
  // back to points keeps the order honest, and the choice is remembered, so
  // flipping back restores it.
  const sort = !showMoney && MONEY_SORTS.includes(sortBy) ? POINTS : sortBy;
  const rated = useMemo(() => new Set(ratedGolferIds), [ratedGolferIds]);

  // Medals follow the FLO Cup standing, not whatever the board is sorted by.
  // A gold medal for Putting would mean nothing.
  const medals = useMemo(
    () =>
      medalByGolfer(
        Object.entries(season)
          .filter(([, s]) => s.rounds > 0)
          .map(([golferId, s]) => ({ golferId, points: s.points })),
      ),
    [season],
  );

  const valueOf = useMemo(() => {
    return (g: BoardGolfer): number | null => {
      const played = season[g.id]?.rounds ? season[g.id] : null;
      if (sort === POINTS) return played ? played.points : null;
      if (sort === WINNINGS) return played ? winningsOf(played) : null;
      if (sort === MATCH_MONEY) return played ? (played.matchMoney ?? 0) : null;
      if (sort === BONUS_MONEY) return played ? (played.bonusMoney ?? 0) : null;
      if (sort === OVERALL) return g.overall;
      return g.scores[sort] ?? null;
    };
  }, [sort, season]);

  const sorted = useMemo(() => {
    return [...golfers].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      // Anyone without a figure sinks to the bottom rather than sorting as 0.
      if (av === null) return bv === null ? displayName(a).localeCompare(displayName(b)) : 1;
      if (bv === null) return -1;
      if (bv !== av) return bv - av;
      return displayName(a).localeCompare(displayName(b));
    });
  }, [golfers, valueOf]);

  // Competition ranking on the sorted value: 1, 2, 2, 4. Under Points it
  // therefore always agrees with the medals. Nobody without a figure ranks.
  const ranks = useMemo(() => {
    const out: Record<string, number> = {};
    let rank = 0;
    let previous: number | null = null;
    sorted.forEach((g, i) => {
      const v = valueOf(g);
      if (v === null) return;
      if (v !== previous) rank = i + 1;
      out[g.id] = rank;
      previous = v;
    });
    return out;
  }, [sorted, valueOf]);

  const sortLabel =
    sort === POINTS ? "Total Points"
      : sort === WINNINGS ? "Winnings"
        : sort === MATCH_MONEY ? "Match Money"
          : sort === BONUS_MONEY ? "Bonus Money"
            : sort === OVERALL ? "Overall"
              : (characteristics.find((c) => c.id === sort)?.label ?? "Overall");

  const needsRating = (g: BoardGolfer) => !rated.has(g.id) && g.id !== myGolferId;
  const unrated = sorted.filter(needsRating);
  const shown = onlyUnrated ? unrated : sorted;
  const filterOn = onlyUnrated && unrated.length > 0;

  // The first golfer without a figure gets a heading above them, so the
  // dashes at the bottom read as a group rather than as broken tiles.
  const firstWithout = shown.find((g) => valueOf(g) === null)?.id;
  const withoutLabel =
    sort === POINTS || MONEY_SORTS.includes(sort) ? "Yet to play a round" : "Not rated yet";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Golfers</h1>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {unrated.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setOnlyUnrated((v) => !v)}
                  aria-pressed={filterOn}
                  className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 font-medium transition ${
                    filterOn
                      ? "border-fairway-600 bg-fairway-600 text-white"
                      : "border-fairway-300 bg-fairway-50 text-fairway-700 hover:border-fairway-400 dark:border-fairway-700 dark:bg-fairway-800 dark:text-fairway-100"
                  }`}
                >
                  Needs your rating
                  <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums ${
                    filterOn ? "bg-white text-fairway-700" : "bg-fairway-600 text-white"
                  }`}>
                    {unrated.length}
                  </span>
                </button>
                <Link
                  href={`/golfer/${unrated[0].id}#rate`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fairway-600 px-3.5 font-semibold text-white transition hover:bg-fairway-700 dark:bg-fairway-400 dark:text-fairway-900 dark:hover:bg-fairway-300"
                >
                  Rate next
                  <ArrowIcon className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-muted">
                <CheckIcon className="h-4 w-4 text-fairway-500" />
                You have rated everyone
              </span>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Sort by</span>
          <select
            value={sort}
            onChange={(event) => setSortBy(event.target.value)}
            className="rounded-lg border border-line bg-raised px-3 py-2 text-sm font-medium outline-none transition focus:border-fairway-400"
          >
            <option value={POINTS}>Total Points</option>
            {showMoney && (
              <>
                <option value={WINNINGS}>Winnings</option>
                <option value={MATCH_MONEY}>Match Money</option>
                <option value={BONUS_MONEY}>Bonus Money</option>
              </>
            )}
            <option value={OVERALL}>Overall rating</option>
            {characteristics.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <EmptyState />
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-12 text-center">
          <p className="text-lg font-medium">Nothing left to rate</p>
          <p className="mt-1 text-sm text-muted">You have rated everyone in the pool.</p>
          <button
            type="button"
            onClick={() => setOnlyUnrated(false)}
            className="mt-4 h-9 rounded-lg border border-line bg-raised px-4 text-sm font-medium transition hover:border-fairway-300"
          >
            Show everyone
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((golfer) => (
            <Fragment key={golfer.id}>
              {golfer.id === firstWithout && (
                <li className="col-span-full px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {withoutLabel}
                </li>
              )}
              <GolferCard
                golfer={golfer}
                characteristics={characteristics}
                sortBy={sort}
                sortLabel={sortLabel}
                value={valueOf(golfer)}
                rank={ranks[golfer.id]}
                showMoney={showMoney}
                hasRated={rated.has(golfer.id)}
                isSelf={golfer.id === myGolferId}
                season={season[golfer.id]}
                medal={medals[golfer.id]}
              />
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}

function GolferCard({
  golfer, characteristics, sortBy, sortLabel, value, rank, hasRated, isSelf,
  season, medal, showMoney,
}: {
  golfer: BoardGolfer;
  characteristics: Characteristic[];
  sortBy: string;
  sortLabel: string;
  /** The figure the board is sorted by. Null when this golfer has none. */
  value: number | null;
  rank?: number;
  hasRated: boolean;
  isSelf: boolean;
  season?: SeasonEntry;
  medal?: 1 | 2 | 3;
  showMoney: boolean;
}) {
  // Touch devices have no hover to reveal the ratings with, so they get a
  // toggle. Per tile, so opening one leaves the rest folded.
  const [open, setOpen] = useState(false);

  const played = (season?.rounds ?? 0) > 0;
  const points = season?.points ?? 0;
  const name = displayName(golfer);

  // The money cell follows a money sort so the sorted figure is on the tile
  // exactly once: Match Money under that sort, Bonus Money under that one,
  // the two together otherwise.
  const moneyValue =
    sortBy === MATCH_MONEY ? (season?.matchMoney ?? 0)
      : sortBy === BONUS_MONEY ? (season?.bonusMoney ?? 0)
        : winningsOf(season ?? {});
  const moneyLabel =
    sortBy === MATCH_MONEY ? "Match $" : sortBy === BONUS_MONEY ? "Bonus $" : "Winnings";

  // Under a category sort the sorted number is not in a cell, so it is
  // pinned above the fold on its own, and left out of the fold below.
  const pinned = characteristics.find((c) => c.id === sortBy) ?? null;
  const folded = pinned ? characteristics.filter((c) => c.id !== pinned.id) : characteristics;

  // The medal chip already says 1st, so a #1 beside it would say it twice.
  // Only when the two agree, though: a medallist who has left the pool shifts
  // everyone else's board rank, and then the numbering has to stay visible or
  // a bronze card ends up sitting above a card reading #3.
  const showRank =
    rank !== undefined && value !== null && !(medal && sortBy === POINTS && rank === medal);

  const cellNumber =
    "flex items-center font-semibold leading-none tabular-nums text-[22px] sm:text-[28px]";
  const cellLabel = "mt-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide";

  return (
    <li
      // min-w-0: a grid item defaults to min-width:auto, which lets an
      // unbreakable name set the card's width and push it off a phone screen.
      // Without this the truncate below never engages.
      className={`group relative flex min-w-0 flex-col rounded-2xl border border-line bg-raised p-5 shadow-sm transition motion-reduce:transition-none hover:shadow-md focus-within:shadow-md ${
        medal ? `bg-gradient-to-b to-raised to-45% ${PODIUM_WASH[medal]}` : ""
      } ${isSelf ? "ring-1 ring-fairway-300 dark:ring-fairway-700" : ""}`}
    >
      {showRank && (
        <span
          className="absolute right-4 top-4 text-sm font-semibold tabular-nums text-muted"
          title={`${ordinal(rank)} by ${sortLabel}`}
        >
          #{rank}
        </span>
      )}

      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className={medal ? `rounded-full ring-4 ${MEDAL[medal].ring}` : ""}>
            <Link href={`/golfer/${golfer.id}`} aria-label={name} className="block rounded-full">
              <GolferAvatar name={name} url={golfer.photo} size="card" />
            </Link>
          </div>
          {medal && (
            <span
              className={`medal-chip absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ring-2 ring-raised ${MEDAL[medal].chip}`}
              title={`${MEDAL[medal].label} in the FLO Cup`}
            >
              {MEDAL[medal].label}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 pr-10">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={`/golfer/${golfer.id}`}
              className="min-w-0 truncate text-lg font-semibold hover:underline sm:text-xl"
            >
              {name}
            </Link>
            {isSelf && (
              <span className="shrink-0 rounded bg-line/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                You
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {golfer.ratingCount === 0
              ? "No ratings yet"
              : `${golfer.ratingCount} ${golfer.ratingCount === 1 ? "rating" : "ratings"}`}
            {played
              ? ` · ${season!.rounds} ${season!.rounds === 1 ? "round" : "rounds"}`
              : " · No rounds yet"}
          </p>
        </div>
      </div>

      {/*
        The same three figures, same size, on every tile under every sort,
        which is what keeps photo, Overall, points and money prominent without
        anything being shown twice. A small marker names the sorted one.
      */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface px-3 py-2.5">
          <div className={`${cellNumber} ${played ? tone(points) : "text-muted"}`}>
            {played ? points.toFixed(1) : "—"}
          </div>
          {/* The trophy rides the label, not the number: beside a four figure
              total it was the difference between fitting the cell and not. */}
          <div className={`${cellLabel} ${sortBy === POINTS ? "text-ink" : "text-muted"}`}>
            {sortBy === POINTS && <SortMark />}
            <TrophyIcon className="h-3.5 w-3.5 shrink-0" />
            Points
          </div>
        </div>

        <div className="rounded-xl bg-fairway-100 px-3 py-2.5 dark:bg-fairway-800">
          <div className={`${cellNumber} text-fairway-700 dark:text-fairway-100`}>
            {golfer.overall ?? "—"}
          </div>
          <div className={`${cellLabel} ${
            sortBy === OVERALL
              ? "text-fairway-700 dark:text-fairway-100"
              : "text-fairway-700/70 dark:text-fairway-200/80"}`}>
            {sortBy === OVERALL && <SortMark />}
            Overall
          </div>
        </div>

        {/* Money takes the full width beneath. A currency string never fits a
            third of a card, and it is the one figure only admins see. */}
        {showMoney && (
          <div className="col-span-full rounded-xl bg-surface px-3 py-2.5">
            <div className={`${cellNumber} ${played ? tone(moneyValue) : "text-muted"}`}>
              {played ? cash(moneyValue) : "—"}
            </div>
            <div className={`${cellLabel} ${MONEY_SORTS.includes(sortBy) ? "text-ink" : "text-muted"}`}>
              {MONEY_SORTS.includes(sortBy) && <SortMark />}
              {moneyLabel}
            </div>
          </div>
        )}
      </div>

      {pinned && (
        <dl className="mt-3 flex items-center gap-3">
          <dt className="w-24 shrink-0 truncate text-xs font-semibold text-ink">{pinned.label}</dt>
          <dd className="flex flex-1 items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-fairway-600" style={{ width: `${golfer.scores[pinned.id] ?? 0}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums">
              {golfer.scores[pinned.id] ?? "—"}
            </span>
          </dd>
        </dl>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="touch-only mt-3 h-9 w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted"
      >
        Ratings
        <ChevronIcon className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>

      <dl className={`card-details mt-0 space-y-1.5 ${open ? "is-open" : ""}`}>
        {folded.map((c) => {
          const score = golfer.scores[c.id];
          return (
            <div key={c.id} className="flex items-center gap-3 text-sm">
              <dt className="w-24 shrink-0 truncate text-xs text-muted">{c.label}</dt>
              <dd className="flex flex-1 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-fairway-400" style={{ width: `${score ?? 0}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">
                  {score ?? "—"}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>

      {/* The action is the divider. Filled while there is something to do. */}
      {isSelf ? (
        <Link
          href={`/golfer/${golfer.id}`}
          className={`mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition sm:h-10 ${
            golfer.photo
              ? "border border-line bg-raised hover:border-fairway-300"
              : "bg-fairway-600 text-white hover:bg-fairway-700 dark:bg-fairway-400 dark:text-fairway-900 dark:hover:bg-fairway-300"
          }`}
        >
          {golfer.photo ? "This is you" : "Add your photo"}
        </Link>
      ) : hasRated ? (
        <Link
          href={`/golfer/${golfer.id}#rate`}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-raised text-sm font-semibold transition hover:border-fairway-300 sm:h-10"
        >
          <CheckIcon className="h-4 w-4 text-fairway-500" />
          Update rating
        </Link>
      ) : (
        <Link
          href={`/golfer/${golfer.id}#rate`}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-fairway-600 text-sm font-semibold text-white transition hover:bg-fairway-700 sm:h-10 dark:bg-fairway-400 dark:text-fairway-900 dark:hover:bg-fairway-300"
        >
          {name.length > 16 ? "Rate this golfer" : `Rate ${name}`}
        </Link>
      )}
    </li>
  );
}

/** A small down arrow before the label of the cell the board is sorted by. */
function SortMark() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-0 w-0 border-x-4 border-t-[5px] border-x-transparent border-t-current"
    />
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-line p-12 text-center">
      <p className="text-lg font-medium">No golfers in the pool yet</p>
      <p className="mt-1 text-sm text-muted">
        An admin adds players from the Admin area, then everyone starts rating.
      </p>
    </div>
  );
}
