"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GolferAvatar } from "./golfer-avatar";
import { displayName, sortGolfers } from "@/lib/scoring";
import type { Characteristic, ScoredGolfer } from "@/lib/types";

type BoardGolfer = ScoredGolfer & { photo: string | null };

export function RankingsBoard({
  golfers,
  characteristics,
  ratedGolferIds,
  myGolferId,
}: {
  golfers: BoardGolfer[];
  characteristics: Characteristic[];
  ratedGolferIds: string[];
  myGolferId: string | null;
}) {
  const [sortBy, setSortBy] = useState("overall");
  const rated = useMemo(() => new Set(ratedGolferIds), [ratedGolferIds]);

  const sorted = useMemo(
    () => sortGolfers(golfers, sortBy) as BoardGolfer[],
    [golfers, sortBy],
  );

  const sortLabel =
    sortBy === "overall"
      ? "Overall"
      : (characteristics.find((c) => c.id === sortBy)?.label ?? "Overall");

  const unrated = sorted.filter(
    (g) => !rated.has(g.id) && g.id !== myGolferId,
  ).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rankings</h1>
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
            <option value="overall">Overall</option>
            {characteristics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((golfer, index) => (
            <GolferCard
              key={golfer.id}
              rank={index + 1}
              golfer={golfer}
              characteristics={characteristics}
              sortBy={sortBy}
              sortLabel={sortLabel}
              hasRated={rated.has(golfer.id)}
              isSelf={golfer.id === myGolferId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function GolferCard({
  rank,
  golfer,
  characteristics,
  sortBy,
  sortLabel,
  hasRated,
  isSelf,
}: {
  rank: number;
  golfer: BoardGolfer;
  characteristics: Characteristic[];
  sortBy: string;
  sortLabel: string;
  hasRated: boolean;
  isSelf: boolean;
}) {
  const headline =
    sortBy === "overall" ? golfer.overall : golfer.scores[sortBy];

  return (
    <li className="flex flex-col rounded-2xl border border-line bg-raised p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="relative">
          <GolferAvatar
            name={displayName(golfer)}
            url={golfer.photo}
            size="md"
          />
          <span className="absolute -left-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-fairway-600 text-xs font-semibold text-white ring-2 ring-raised">
            {rank}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <Link
            href={`/golfer/${golfer.id}`}
            className="block truncate font-semibold hover:underline"
          >
            {displayName(golfer)}
          </Link>
          <p className="mt-0.5 text-xs text-muted">
            {golfer.ratingCount === 0
              ? "No ratings yet"
              : `${golfer.ratingCount} ${golfer.ratingCount === 1 ? "rating" : "ratings"}`}
          </p>
        </div>

        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">
            {headline === null || headline === undefined ? "—" : headline}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-muted">
            {sortLabel}
          </div>
        </div>
      </div>

      <dl className="mt-4 space-y-1.5">
        {characteristics.map((c) => {
          const score = golfer.scores[c.id];
          const highlighted = c.id === sortBy;
          return (
            <div key={c.id} className="flex items-center gap-3 text-sm">
              <dt
                className={`w-24 shrink-0 truncate text-xs ${
                  highlighted ? "font-semibold text-ink" : "text-muted"
                }`}
              >
                {c.label}
              </dt>
              <dd className="flex flex-1 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full ${
                      highlighted ? "bg-fairway-600" : "bg-fairway-400"
                    }`}
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
              golfer.photo
                ? "text-muted hover:text-ink"
                : "text-fairway-600 dark:text-fairway-300"
            }`}
          >
            {golfer.photo ? "This is you" : "This is you. Add your photo"}
            <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <Link
            href={`/golfer/${golfer.id}`}
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${
              hasRated
                ? "text-muted hover:text-ink"
                : "text-fairway-600 dark:text-fairway-300"
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
