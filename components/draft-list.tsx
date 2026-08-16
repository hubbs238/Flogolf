"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createDraft } from "@/app/(app)/draft/actions";
import { DeleteDraftButton } from "./delete-draft-button";
import type { Draft, DraftStrategy } from "@/lib/types";

const STATUS_LABEL: Record<Draft["status"], string> = {
  setup: "Setup",
  in_progress: "Live now",
  complete: "Complete",
};

export function DraftList({
  drafts,
  pickCounts,
  isAdmin,
}: {
  drafts: Draft[];
  pickCounts: Record<string, number>;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [teamCount, setTeamCount] = useState(4);
  const [rosterSize, setRosterSize] = useState(4);
  const [strategy, setStrategy] = useState<DraftStrategy>("balanced");

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createDraft({ name, teamCount, rosterSize, strategy });
      // A success redirects, so anything returned here is a failure.
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Drafts</h1>
          <p className="mt-1 text-sm text-muted">
            Run a mock to see how the teams shake out, then start it live when
            everyone is ready.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700"
          >
            {open ? "Cancel" : "New draft"}
          </button>
        )}
      </div>

      {open && isAdmin && (
        <div className="mb-6 rounded-2xl border border-line bg-raised p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium">Name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Saturday scramble"
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-medium">Teams</span>
              <input
                type="number"
                min={2}
                max={12}
                value={teamCount}
                onChange={(event) => setTeamCount(Number(event.target.value))}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-sm font-medium">
                Players per team
              </span>
              <input
                type="number"
                min={2}
                max={20}
                value={rosterSize}
                onChange={(event) => setRosterSize(Number(event.target.value))}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400"
              />
              <span className="mt-1 block text-xs text-muted">
                Counting the captain
              </span>
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium">
                Auto draft strategy
              </span>
              <select
                value={strategy}
                onChange={(event) =>
                  setStrategy(event.target.value as DraftStrategy)
                }
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400"
              >
                <option value="balanced">
                  Balanced, fills the gaps in each roster
                </option>
                <option value="overall">Overall, best player available</option>
              </select>
            </label>
          </div>

          {error && <p className="mt-3 text-sm text-flag-500">{error}</p>}

          <button
            onClick={create}
            disabled={pending}
            className="mt-4 rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
          >
            {pending ? "Creating..." : "Create draft"}
          </button>
        </div>
      )}

      {drafts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-12 text-center text-sm text-muted">
          No drafts yet.
          {isAdmin
            ? " Create one above to get started."
            : " An admin sets these up."}
        </p>
      ) : (
        <ul className="space-y-2">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-4 transition hover:border-fairway-300"
            >
              <Link href={`/draft/${draft.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium">{draft.name}</p>
                <p className="text-xs text-muted">
                  {new Date(draft.draft_date).toLocaleDateString()} ·{" "}
                  {draft.team_count} teams of {draft.roster_size} ·{" "}
                  {draft.strategy === "balanced" ? "Balanced" : "Overall"}
                </p>
              </Link>

              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  draft.status === "in_progress"
                    ? "bg-flag-500/15 text-flag-500"
                    : draft.status === "complete"
                      ? "bg-fairway-100 text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100"
                      : "bg-line text-muted"
                }`}
              >
                {STATUS_LABEL[draft.status]}
              </span>

              {isAdmin && (
                <DeleteDraftButton
                  draftId={draft.id}
                  draftName={draft.name}
                  pickCount={pickCounts[draft.id] ?? 0}
                  size="small"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
