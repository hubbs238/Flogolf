"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GolferAvatar } from "./golfer-avatar";
import { TrophyIcon } from "./trophy-icon";
import { displayName } from "@/lib/scoring";
import { MEDAL, medalByGolfer } from "@/lib/podium";
import type { Characteristic, ScoredGolfer } from "@/lib/types";

type BoardGolfer = ScoredGolfer & { photo: string | null };

export type SeasonByGolfer = Record<
  string,
  { rounds: number; points: number; dollars: number }
>;

/** The two season sorts sit alongside Overall and the rated categories. */
const POINTS = "points";
const MONEY = "money";

export function RankingsBoard({
  golfers, characteristics, ratedGolferIds, myGolferId, season,
}: {
  golfers: BoardGolfer[];
  characteristics: Characteristic[];
  ratedGolferIds: string[];
  myGolferId: string | null;
  season: SeasonByGolfer;
}) {
  const [sortBy, setSortBy] = useState<string>(POINTS);
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

  const sorted = useMemo(() => {
    const value = (g: BoardGolfer): number | null => {
      if (sortBy === POINTS) return season[g.id]?.rounds ? season[g.id].points : null;
      if (sortBy === MONEY) return season[g.id]?.rounds ? season[g.id].dollars : null;
      if (sortBy === "overall") return g.overall;
      return g.scores[sortBy] ?? null;
    };

    return [...golfers].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      // Anyone without a figure sinks to the bottom rather than sorting as 0.
      if (av === null) return bv === null ? displayName(a).localeCompare(displayName(b)) : 1;
      if (bv === null) return -1;
      if (bv !== av) return bv - av;
      return displayName(a).localeCompare(displayName(b));
    });
  }, [golfers, sortBy, season]);

  const sortLabel =
    sortBy === POINTS ? "FLO Cup points"
      : sortBy === MONEY ? "Money"
        : sortBy === "overall" ? "Overall"
          : (characteristics.find((c) => c.id === sortBy)?.label ?? "Overall");

  const unrated = sorted.filter((g) => !rated.has(g.id) && g.id !== myGolferId).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Golfers</h1>
          <p className="mt-1 text-sm text-muted">
            {unrated > 0
              ? `${unrated} ${unrated === 1 ? "golfer" : "golfers"} still waiting on your rating.`
              : "You have rated everyone in the pool."}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Sort by</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="rounded-lg border border-line bg-raised px-3 py-2 text-sm font-medium outline-none transition focus:border-fairway-400"
          >
            <option value={POINTS}>FLO Cup points</option>
            <option value={MONEY}>Money</option>
            <option value="overall">Overall rating</option>
            {characteristics.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((golfer) => (
            <GolferCard
              key={golfer.id}
              golfer={golfer}
              characteristics={characteristics}
              sortBy={sortBy}
              sortLabel={sortLabel}
              hasRated={rated.has(golfer.id)}
              isSelf={golfer.id === myGolferId}
              season={season[golfer.id]}
              medal={medals[golfer.id]}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function GolferCard({
  golfer, characteristics, sortBy, sortLabel, hasRated, isSelf, season, medal,
}: {
  golfer: BoardGolfer;
  characteristics: Characteristic[];
  sortBy: string;
  sortLabel: string;
  hasRated: boolean;
  isSelf: boolean;
  season?: { rounds: number; points: number; dollars: number };
  medal?: 1 | 2 | 3;
}) {
  const played = (season?.rounds ?? 0) > 0;
  const money = season?.dollars ?? 0;
  const points = season?.points ?? 0;

  // Points, money and overall all have their own chip below, so repeating
  // one of them large is just the same number twice. The headline is only
  // worth the space when the board is sorted by a rated category, which is
  // the one value the chips do not carry.
  const sortedByCategory =
    sortBy !== POINTS && sortBy !== MONEY && sortBy !== "overall";

  const tone = (n: number) =>
    n > 0 ? "text-fairway-600 dark:text-fairway-300"
      : n < 0 ? "text-flag-500" : "text-muted";

  return (
    <li className="group flex flex-col rounded-2xl border border-line bg-raised p-5 shadow-sm transition hover:shadow-md focus-within:shadow-md">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div className={medal ? `rounded-full ring-4 ${MEDAL[medal].ring}` : ""}>
            <GolferAvatar name={displayName(golfer)} url={golfer.photo} size="lg" />
          </div>
          {medal && (
            <span
              className={`medal-chip absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-raised ${MEDAL[medal].chip}`}
              title={`${MEDAL[medal].label} in the FLO Cup`}
            >
              {MEDAL[medal].label}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <Link
            href={`/golfer/${golfer.id}`}
            className="block truncate text-lg font-semibold hover:underline"
          >
            {displayName(golfer)}
          </Link>

          <p className="mt-0.5 text-xs text-muted">
            {golfer.ratingCount === 0
              ? "No ratings yet"
              : `${golfer.ratingCount} ${golfer.ratingCount === 1 ? "rating" : "ratings"}`}
            {played && ` · ${season!.rounds} ${season!.rounds === 1 ? "round" : "rounds"}`}
          </p>
        </div>

        {sortedByCategory && (
          <div className="text-right">
            <div className="text-3xl font-semibold tabular-nums">
              {golfer.scores[sortBy] ?? "—"}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted">
              {sortLabel}
            </div>
          </div>
        )}
      </div>

      {/*
        The three figures that matter, on their own row rather than squeezed
        beside the name. Overall is the one that would otherwise vanish
        whenever the board is sorted by anything else, so it gets the filled
        treatment.
      */}
      <div className="mt-4 flex flex-wrap items-stretch gap-2">
        <span className="inline-flex items-baseline gap-1.5 rounded-lg bg-fairway-100 px-2.5 py-1.5 dark:bg-fairway-800">
          <span className="text-lg font-semibold leading-none tabular-nums text-fairway-700 dark:text-fairway-100">
            {golfer.overall ?? "—"}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-fairway-700/70 dark:text-fairway-200/80">
            Overall
          </span>
        </span>

        <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-line px-2.5 py-1.5">
          <TrophyIcon className={`h-3.5 w-3.5 shrink-0 self-center ${tone(points)}`} />
          <span className={`text-sm font-semibold leading-none tabular-nums ${played ? tone(points) : "text-muted"}`}>
            {played ? points.toFixed(1) : "—"}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Pts
          </span>
        </span>

        <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-line px-2.5 py-1.5">
          <span className={`text-sm font-semibold leading-none tabular-nums ${played ? tone(money) : "text-muted"}`}>
            {played
              ? `${money > 0 ? "+" : money < 0 ? "-" : ""}$${Math.abs(money).toFixed(2)}`
              : "—"}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Money
          </span>
        </span>
      </div>

      {/*
        Category detail folds away until the tile is hovered or focused.
        Devices without hover keep it open, since tapping is not hovering and
        losing the ratings entirely on a phone would be worse than a taller
        card.
      */}
      <dl className="card-details mt-0 space-y-1.5 group-hover:mt-4 group-focus-within:mt-4">
        {characteristics.map((c) => {
          const score = golfer.scores[c.id];
          const highlighted = c.id === sortBy;
          return (
            <div key={c.id} className="flex items-center gap-3 text-sm">
              <dt className={`w-24 shrink-0 truncate text-xs ${highlighted ? "font-semibold text-ink" : "text-muted"}`}>
                {c.label}
              </dt>
              <dd className="flex flex-1 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full ${highlighted ? "bg-fairway-600" : "bg-fairway-400"}`}
                    style={{ width: `${score ?? 0}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">
                  {score ?? "—"}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>

      <div className="mt-4 border-t border-line pt-3">
        {isSelf ? (
          <Link
            href={`/golfer/${golfer.id}`}
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
              golfer.photo ? "text-muted hover:text-ink" : "text-fairway-600 dark:text-fairway-300"
            }`}
          >
            {golfer.photo ? "This is you" : "This is you. Add your photo"}
            <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <Link
            href={`/golfer/${golfer.id}`}
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
              hasRated ? "text-muted hover:text-ink" : "text-fairway-600 dark:text-fairway-300"
            }`}
          >
            {hasRated ? "Update your rating" : "Rate this golfer"}
            <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>
    </li>
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
