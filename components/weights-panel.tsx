"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addCharacteristic,
  setCharacteristicActive,
  updateCharacteristic,
  updateWeights,
} from "@/app/(app)/admin/actions";
import type { Characteristic } from "@/lib/types";

export function WeightsPanel({
  characteristics,
}: {
  characteristics: Characteristic[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [weights, setWeights] = useState<Record<string, number>>(() =>
    Object.fromEntries(characteristics.map((c) => [c.id, Number(c.weight)])),
  );

  const [newLabel, setNewLabel] = useState("");

  const active = characteristics.filter((c) => c.active);
  const total = useMemo(
    () => active.reduce((sum, c) => sum + (weights[c.id] ?? 0), 0),
    [active, weights],
  );

  const dirty = characteristics.some(
    (c) => Number(c.weight) !== (weights[c.id] ?? 0),
  );

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateWeights(weights);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function addCategory() {
    setError(null);
    startTransition(async () => {
      const result = await addCharacteristic(newLabel, 10);
      if (result.ok) {
        setNewLabel("");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  function toggleActive(id: string, next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setCharacteristicActive(id, next);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  /** Saves on blur, and only when the text actually changed. */
  function saveText(
    id: string,
    field: "label" | "description",
    value: string,
    current: string | null,
  ) {
    if (value.trim() === (current ?? "").trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await updateCharacteristic(id, { [field]: value });
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Categories</h2>
        <p className="mt-1 text-sm text-muted">
          Click a name to rename it, and the line underneath to reword the hint
          people see while rating. Weights do not have to add up to anything;
          drag one up and the percentages resettle on their own.
        </p>
        <p className="mt-2 text-sm text-muted">
          Renaming keeps every score intact. Calling Accuracy something else
          changes the word, not the number anyone submitted.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-line bg-raised p-6 shadow-sm">
        {characteristics.map((c) => {
          const value = weights[c.id] ?? 0;
          const percent = c.active && total > 0 ? (value / total) * 100 : 0;

          return (
            <div
              key={c.id}
              className={`rounded-xl border border-line/60 p-3 ${
                c.active ? "" : "opacity-50"
              }`}
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  <input
                    defaultValue={c.label}
                    onBlur={(event) =>
                      saveText(c.id, "label", event.target.value, c.label)
                    }
                    aria-label="Category name"
                    className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 font-medium outline-none transition hover:border-line focus:border-fairway-400 focus:bg-surface"
                  />
                  {!c.active && (
                    <span className="shrink-0 text-xs font-normal text-muted">
                      hidden
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-muted">
                    {c.active ? `${percent.toFixed(1)}%` : "—"}
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={value}
                    disabled={!c.active}
                    onChange={(event) =>
                      setWeights((prev) => ({
                        ...prev,
                        [c.id]: Number(event.target.value),
                      }))
                    }
                    className="w-16 rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-fairway-400"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id={`w-${c.id}`}
                  type="range"
                  min={0}
                  max={50}
                  step={1}
                  value={value}
                  disabled={!c.active}
                  onChange={(event) =>
                    setWeights((prev) => ({
                      ...prev,
                      [c.id]: Number(event.target.value),
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={() => toggleActive(c.id, !c.active)}
                  disabled={pending}
                  className="shrink-0 text-xs text-muted transition hover:text-ink"
                >
                  {c.active ? "Hide" : "Show"}
                </button>
              </div>

              <input
                defaultValue={c.description ?? ""}
                onBlur={(event) =>
                  saveText(c.id, "description", event.target.value, c.description)
                }
                placeholder="Helper text shown under this slider when people rate"
                aria-label="Helper text"
                className="mt-2 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs text-muted outline-none transition placeholder:text-muted/60 hover:border-line focus:border-fairway-400 focus:bg-surface focus:text-ink"
              />
            </div>
          );
        })}

        {error && (
          <p className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <button
            onClick={save}
            disabled={pending || !dirty}
            className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save weights"}
          </button>
          {saved && !pending && !dirty && (
            <span className="text-sm text-fairway-600 dark:text-fairway-300">
              Saved. Rankings updated.
            </span>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h3 className="font-semibold">Add a category</h3>
        <p className="mt-1 text-sm text-muted">
          Anything you add starts unrated. Existing submissions stay valid and
          simply carry no score for the new category.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            placeholder="Course Management"
            className="flex-1 rounded-xl border border-line bg-raised px-4 py-2.5 outline-none focus:border-fairway-400"
          />
          <button
            onClick={addCategory}
            disabled={pending || !newLabel.trim()}
            className="rounded-xl border border-line bg-raised px-5 py-2.5 font-medium transition hover:border-fairway-300 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
