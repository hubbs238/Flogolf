import { readEnvReport } from "@/app/(app)/admin/actions";
import { DiagnosticsPanel } from "@/components/diagnostics-panel";

export default async function DiagnosticsPage() {
  const report = await readEnvReport();
  return <DiagnosticsPanel report={report} />;
}
