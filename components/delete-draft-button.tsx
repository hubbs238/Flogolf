"use client";

import { useState, useTransition } from "react";
import { deleteDraft } from "@/app/(app)/draft/actions";

/**
 * Deleting a finished draft throws away that week's record, so the confirm
 * says how many picks are about to go rather than asking "are you sure" and
 * hoping the person reads it.
 */
export function DeleteDraftButton({
  draftId,
  draftName,
  pickCount,
  size = "normal",
}: {
  draftId: string;
  draftName: string;
  pickCount: number;
  size?: "normal" | "small";
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteDraft(draftId);
      // Success redirects, so anything returned here is a failure.
      if (result && !result.ok) {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  const small = size === "small";

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className={`text-muted transition hover:text-flag-500 ${
          small ? "px-2 text-xs" : "text-sm"
        }`}
      >
        Delete
        {error && <span className="ml-2 text-flag-500">{error}</span>}
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={small ? "text-xs" : "text-sm"}>
        {pickCount > 0
          ? `Delete “${draftName}” and its ${pickCount} ${pickCount === 1 ? "pick" : "picks"}?`
          : `Delete “${draftName}”?`}
      </span>
      <button
        onClick={remove}
        disabled={pending}
        className={`rounded-lg bg-flag-500 font-medium text-white transition hover:bg-flag-600 disabled:opacity-50 ${
          small ? "px-3 py-1.5 text-xs" : "px-3 py-1.5 text-sm"
        }`}
      >
        {pending ? "Deleting..." : "Yes, delete"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={pending}
        className={`text-muted transition hover:text-ink ${
          small ? "text-xs" : "text-sm"
        }`}
      >
        Cancel
      </button>
    </span>
  );
}
