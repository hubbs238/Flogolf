"use client";

import { useState, useTransition } from "react";
import { createRoundFromDraft } from "@/app/(app)/games/actions";

export function PlayRoundButton({ draftId }: { draftId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await createRoundFromDraft(draftId);
            if (r && !r.ok) setError(r.error);
          });
        }}
        disabled={pending}
        className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
      >
        {pending ? "Setting up..." : "Play Round"}
      </button>
      {error && <span className="text-sm text-flag-500">{error}</span>}
    </div>
  );
}
