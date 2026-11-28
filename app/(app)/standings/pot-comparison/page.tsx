import { notFound, redirect } from "next/navigation";
import { PotComparison } from "@/components/pot-comparison";
import { requireAdmin } from "@/lib/auth";
import { getPotComparisonRounds } from "@/lib/pot-comparison-data";
import { getViewMode } from "@/lib/view-mode";

export default async function PotComparisonPage({ searchParams }: PageProps<"/standings/pot-comparison">) {
  if (process.env.FLO_APP_ENV !== "staging") notFound();
  await requireAdmin();
  const view = await getViewMode(true);
  if (!view.showMoney) redirect("/standings");

  const [rounds, query] = await Promise.all([getPotComparisonRounds(), searchParams]);
  const initialRoundId = typeof query.round === "string" ? query.round : undefined;
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">Pot scoring comparison</h2>
      <p className="mt-1 mb-5 text-sm text-muted">
        Try a payout split on completed rounds and compare each golfer’s earnings and points with the official results.
      </p>
      <PotComparison key={initialRoundId ?? "season"} rounds={rounds} initialRoundId={initialRoundId} />
    </section>
  );
}
