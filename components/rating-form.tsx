"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitRating } from "@/app/(app)/golfer/[id]/actions";
import { weightPercents } from "@/lib/scoring";
import type { Characteristic } from "@/lib/types";

export function RatingForm({
  golferId,
  golferName,
  characteristics,
  existing,
}: {
  golferId: string;
  golferName: string;
  characteristics: Characteristic[];
  existing: Record<string, number> | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      characteristics.map((c) => [c.id, existing?.[c.id] ?? 50]),
    ),
  );

  const percents = weightPercents(characteristics);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await submitRating(golferId, scores);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">
          {existing ? "Your rating" : `Rate ${golferName.split(" ")[0]}`}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {existing
            ? "You already submitted. Changing a slider updates your rating."
            : "Score each area out of 100. Only the averages are shown publicly."}
        </p>
      </div>

      <div className="space-y-5">
        {characteristics.map((c) => (
          <div key={c.id}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <label htmlFor={c.id} className="font-medium">
                {c.label}
                <span className="ml-2 text-xs font-normal text-muted">
                  {percents.get(c.id)?.toFixed(0)}% of overall
                </span>
              </label>
              <span className="text-lg font-semibold tabular-nums">
                {scores[c.id]}
              </span>
            </div>

            <input
              id={c.id}
              type="range"
              min={0}
              max={100}
              step={1}
              value={scores[c.id]}
              onChange={(event) =>
                setScores((prev) => ({
                  ...prev,
                  [c.id]: Number(event.target.value),
                }))
              }
            />

            {c.description && (
              <p className="mt-1.5 text-xs text-muted">{c.description}</p>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : existing ? "Update rating" : "Submit rating"}
        </button>
        {saved && !pending && (
          <span className="text-sm text-fairway-600 dark:text-fairway-300">
            Saved
          </span>
        )}
      </div>
    </form>
  );
}
