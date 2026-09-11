"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createMajor,
  deleteMajor,
  setMajorLive,
  updateMajor,
} from "@/app/(app)/admin/actions";
import { formatMajorDate } from "@/lib/scoring";
import type { Major } from "@/lib/types";

const field =
  "w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none transition focus:border-fairway-400";
const label = "mb-1.5 block text-sm font-medium";

export function MajorsAdmin({ majors }: { majors: Major[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [points, setPoints] = useState("");

  function run(action: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        after?.();
        router.refresh();
      } else {
        setError(result.error ?? "Something went wrong.");
      }
    });
  }

  const live = majors.find((m) => m.is_live) ?? null;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Majors</h2>
        <p className="mt-1 text-sm text-muted">
          The season&apos;s marquee events. Switch one on and it takes over the top
          of the Golfers page and sits under the trophy on FLO Cup Standings.
          Only one shows at a time, so turning a major on stands the last one
          down. The points figure is what the banner announces for the lowest
          eighteen; it is copy, not scoring, so nobody&apos;s standings move until
          you award it yourself.
        </p>
      </div>

      <section className="rounded-2xl border border-line bg-raised p-5 shadow-sm">
        <h3 className="font-semibold">Add a major</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <label>
            <span className={label}>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Hubbs Invitational"
              maxLength={80}
              className={field}
            />
          </label>
          <label>
            <span className={label}>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label>
            <span className={label}>Points</span>
            <input
              type="number"
              min={0}
              step={1}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="150"
              className={field}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          Points go to whoever posts the lowest eighteen on the day.
        </p>

        <button
          onClick={() =>
            run(
              () => createMajor({ name, date, points: Number(points || 0) }),
              () => {
                setName("");
                setDate("");
                setPoints("");
              },
            )
          }
          disabled={pending}
          className="mt-4 rounded-xl bg-fairway-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Add major"}
        </button>
      </section>

      {error && (
        <p className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">{error}</p>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">
            {majors.length} {majors.length === 1 ? "major" : "majors"}
          </h3>
          <span className="text-sm text-muted">
            {live ? `Showing: ${live.name}` : "Nothing is showing right now"}
          </span>
        </div>

        {majors.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
            No majors yet. Add one above, then switch it on when you want the
            league to see it.
          </p>
        ) : (
          <ul className="space-y-3">
            {majors.map((major) => (
              <MajorRow key={major.id} major={major} pending={pending} run={run} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MajorRow({
  major, pending, run,
}: {
  major: Major;
  pending: boolean;
  run: (a: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(major.name);
  const [date, setDate] = useState(major.major_date.slice(0, 10));
  const [points, setPoints] = useState(String(major.points));
  const [confirming, setConfirming] = useState(false);

  return (
    <li
      className={`rounded-2xl border bg-raised p-4 shadow-sm transition ${
        major.is_live ? "border-fairway-400 ring-1 ring-fairway-300 dark:ring-fairway-700" : "border-line"
      }`}
    >
      {editing ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={field} />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            <input type="number" min={0} step={1} value={points} onChange={(e) => setPoints(e.target.value)} className={field} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                run(
                  () => updateMajor(major.id, { name, date, points: Number(points || 0) }),
                  () => setEditing(false),
                )
              }
              disabled={pending}
              className="rounded-lg bg-fairway-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setName(major.name);
                setDate(major.major_date.slice(0, 10));
                setPoints(String(major.points));
                setEditing(false);
              }}
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition hover:border-fairway-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              <span className="truncate">{major.name}</span>
              {major.is_live && (
                <span className="shrink-0 rounded-full bg-fairway-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Showing
                </span>
              )}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {formatMajorDate(major.major_date)} · {major.points} pts for the lowest eighteen
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={() => run(() => setMajorLive(major.id, !major.is_live))}
              disabled={pending}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                major.is_live
                  ? "border border-line hover:border-fairway-300"
                  : "bg-fairway-600 text-white hover:bg-fairway-700"
              }`}
            >
              {major.is_live ? "Stand down" : "Show this one"}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition hover:border-fairway-300"
            >
              Edit
            </button>
            {confirming ? (
              <>
                <button
                  onClick={() => run(() => deleteMajor(major.id))}
                  disabled={pending}
                  className="rounded-lg bg-flag-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-flag-600 disabled:opacity-50"
                >
                  Really delete
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium transition hover:border-fairway-300"
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-flag-500 hover:text-flag-500"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
