"use client";

import { usePathname, useRouter } from "next/navigation";

const comparisonPage = "/standings/pot-comparison";

export function ScoringViewSelect({ roundId }: { roundId?: string }) {
  const path = usePathname();
  const router = useRouter();
  const official = roundId ? `/games/${encodeURIComponent(roundId)}` : "/standings";
  const comparison = roundId ? `${comparisonPage}?round=${encodeURIComponent(roundId)}` : comparisonPage;

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      Scoring view
      <select
        className="rounded-lg border border-line bg-raised px-3 py-2 font-medium text-ink focus-visible:outline-2 focus-visible:outline-fairway-400"
        value={path === comparisonPage ? comparison : official}
        onChange={(event) => router.push(event.target.value === comparison ? comparison : official)}
      >
        <option value={official}>{roundId ? "Official round" : "Official standings"}</option>
        <option value={comparison}>Pot scoring comparison</option>
      </select>
    </label>
  );
}
