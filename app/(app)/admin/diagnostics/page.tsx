import { readEnvReport, readSchemaReport } from "@/app/(app)/admin/actions";
import { DiagnosticsPanel } from "@/components/diagnostics-panel";

export default async function DiagnosticsPage() {
  const [report, schema] = await Promise.all([readEnvReport(), readSchemaReport()]);
  return <DiagnosticsPanel report={report} schema={schema} />;
}
