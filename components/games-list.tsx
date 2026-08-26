"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createMatch } from "@/app/(app)/games/actions";
import type { Match } from "@/lib/types";

const STATUS: Record<Match["status"], { label: string; className: string }> = {
  setup: { label: "Setup", className: "bg-line text-muted" },
  filling: { label: "Picking teams", className: "bg-line text-muted" },
  in_progress: { label: "Live now", className: "bg-flag-500/15 text-flag-500" },
  complete: {
    label: "Final",
    className: "bg-fairway-100 text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100",
  },
};

export function GamesList({
  matches,
  isAdmin,
}: {
  matches: Match[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [teamCount, setTeamCount] = useState(7);
  const [dollars, setDollars] = useState(5);
  const [tieDefault, setTieDefault] = useState<"hole" | "set">("hole");

  function create() {
    setError(null);
    startTransition(async () => {
      const r = await createMatch({
        name, course, teamCount, rosterSize: 4,
        dollarsPerUnit: dollars, tieDefault,
      });
      if (r && !r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-10">
      <div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Rounds</h1>
            <p className="mt-1 text-sm text-muted">
              Live scoring, unit payouts, and who owes who.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700"
            >
              {open ? "Cancel" : "New round"}
            </button>
          )}
        </div>

        {open && isAdmin && (
          <div className="mb-6 rounded-2xl border border-line bg-raised p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="mb-1.5 block text-sm font-medium">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Saturday scramble"
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400" />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium">Course</span>
                <input value={course} onChange={(e) => setCourse(e.target.value)}
                  placeholder="Pebble Beach"
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400" />
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium">Teams</span>
                <input type="number" min={2} max={12} value={teamCount}
                  onChange={(e) => setTeamCount(Number(e.target.value))}
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400" />
                <span className="mt-1 block text-xs text-muted">4 players each, captain included</span>
              </label>
              <label>
                <span className="mb-1.5 block text-sm font-medium">Dollars per unit</span>
                <input type="number" min={0} step="0.5" value={dollars}
                  onChange={(e) => setDollars(Number(e.target.value))}
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400" />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-sm font-medium">Default tie ruling</span>
                <select value={tieDefault} onChange={(e) => setTieDefault(e.target.value as "hole" | "set")}
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400">
                  <option value="hole">Sudden death on the next hole</option>
                  <option value="set">Roll the units into the next 3 hole match</option>
                </select>
                <span className="mt-1 block text-xs text-muted">
                  You can override any individual tie while the round is running.
                </span>
              </label>
            </div>
            {error && <p className="mt-3 text-sm text-flag-500">{error}</p>}
            <button onClick={create} disabled={pending}
              className="mt-4 rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50">
              {pending ? "Creating..." : "Create round"}
            </button>
          </div>
        )}

        {matches.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">
            No rounds yet.{isAdmin ? " Create one above." : " An admin sets these up."}
          </p>
        ) : (
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.id}>
                <Link href={`/games/${m.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-4 transition hover:border-fairway-300">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="text-xs text-muted">
                      {new Date(m.match_date).toLocaleDateString()}
                      {m.course ? ` · ${m.course}` : ""} · {m.team_count} teams
                      {Number(m.dollars_per_unit) > 0 ? ` · $${m.dollars_per_unit}/unit` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS[m.status].className}`}>
                    {STATUS[m.status].label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-raised p-5">
        <h2 className="font-semibold">Season standings</h2>
        <p className="mt-1 text-sm text-muted">
          Points, money, and rounds played, per player across every finished round.
        </p>
        <Link
          href="/standings"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-fairway-600 dark:text-fairway-300"
        >
          Open FLO Cup Standings <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
