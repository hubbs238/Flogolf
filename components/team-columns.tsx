"use client";

import { GolferAvatar } from "./golfer-avatar";
import { displayName } from "@/lib/scoring";
import { teamBestByCategory, teamStrength, type TeamState } from "@/lib/draft";
import type { Characteristic } from "@/lib/types";

export function TeamColumns({
  teams,
  characteristics,
  activeSlot,
  rosterSize,
}: {
  teams: TeamState[];
  characteristics: Characteristic[];
  activeSlot?: number;
  rosterSize: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {teams.map((team) => {
        const best = teamBestByCategory(team, characteristics);
        const strength = teamStrength(team, characteristics);
        const onTheClock = team.slot === activeSlot;
        const openSpots = rosterSize - 1 - team.picks.length;
        // The captain holds roster spot 1, so drafted players start at 2.
        const firstPickPosition = team.captain ? 2 : 1;

        return (
          <div
            key={team.slot}
            className={`rounded-2xl border bg-raised p-4 shadow-sm transition ${
              onTheClock
                ? "border-flag-500 ring-2 ring-flag-500/20"
                : "border-line"
            }`}
          >
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="truncate font-semibold">{team.name}</h3>
              <span className="shrink-0 text-sm tabular-nums text-muted">
                {strength ?? "—"}
              </span>
            </div>

            {onTheClock && (
              <p className="mb-3 rounded-lg bg-flag-500/10 px-2.5 py-1.5 text-xs font-medium text-flag-500">
                On the clock
              </p>
            )}

            <ul className="space-y-2">
              {team.captain && (
                <MemberRow
                  golfer={team.captain}
                  position={1}
                  isCaptain
                  photo={(team.captain as { photo?: string | null }).photo ?? null}
                />
              )}
              {team.picks.map((pick, index) => (
                <MemberRow
                  key={pick.id}
                  golfer={pick}
                  position={index + firstPickPosition}
                  photo={(pick as { photo?: string | null }).photo ?? null}
                />
              ))}
              {Array.from({ length: Math.max(0, openSpots) }, (_, index) => (
                <li
                  key={`empty-${index}`}
                  className="flex h-11 items-center gap-2.5 rounded-lg border border-dashed border-line px-2.5 text-xs text-muted"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center font-semibold">
                    {team.picks.length + index + firstPickPosition}
                  </span>
                  Open
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-1 border-t border-line pt-3">
              {characteristics.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <dt className="w-20 shrink-0 truncate text-muted">{c.label}</dt>
                  <dd className="flex flex-1 items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-fairway-500"
                        style={{ width: `${best[c.id] ?? 0}%` }}
                      />
                    </div>
                    <span className="w-6 text-right tabular-nums text-muted">
                      {best[c.id] ? Math.round(best[c.id]) : "—"}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}

function MemberRow({
  golfer,
  position,
  isCaptain = false,
  photo,
}: {
  golfer: { name: string; nickname?: string | null; overall: number | null };
  position: number;
  isCaptain?: boolean;
  photo: string | null;
}) {
  const shown = displayName(golfer);

  return (
    <li className="flex items-center gap-2.5 rounded-lg bg-surface px-2.5 py-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-xs font-semibold text-muted">
        {position}
      </span>
      <GolferAvatar name={shown} url={photo} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {shown}
        {isCaptain && (
          <span className="ml-1.5 rounded bg-fairway-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100">
            C
          </span>
        )}
      </span>
      <span className="shrink-0 text-sm tabular-nums text-muted">
        {golfer.overall ?? "—"}
      </span>
    </li>
  );
}
