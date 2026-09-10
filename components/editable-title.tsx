"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMatchSettings } from "@/app/(app)/games/actions";
import { updateDraftSettings } from "@/app/(app)/draft/actions";

/**
 * The page heading, renameable in place by an admin.
 *
 * Click it, type, click away. There is no edit mode and no save button,
 * because renaming "Round 9/6/2026" to "Labor Day scramble" three weeks
 * later should not be a workflow.
 */
export function EditableTitle({
  kind, id, name, canEdit,
}: {
  kind: "match" | "draft";
  id: string;
  name: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>;
  }

  function save(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === name) return;

    setError(null);
    startTransition(async () => {
      const result =
        kind === "match"
          ? await updateMatchSettings(id, { name: trimmed })
          : await updateDraftSettings(id, { name: trimmed });

      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div>
      <input
        defaultValue={name}
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.currentTarget.value = name;
            e.currentTarget.blur();
          }
        }}
        disabled={pending}
        aria-label="Round name"
        className="w-full max-w-lg rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight outline-none transition hover:border-line focus:border-fairway-400 focus:bg-surface disabled:opacity-60"
      />
      {error && <p className="px-2 text-sm text-flag-500">{error}</p>}
    </div>
  );
}
