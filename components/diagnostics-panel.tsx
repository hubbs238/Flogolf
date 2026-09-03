"use client";

import { useState, useTransition } from "react";
import { testAnthropicKey, type EnvReport, type KeyTest, type SchemaCheck } from "@/app/(app)/admin/actions";

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-3">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-fairway-500" : "bg-flag-500"}`} />
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      <span className="shrink-0 text-sm text-muted">{detail}</span>
    </li>
  );
}

export function DiagnosticsPanel({
  report, schema,
}: {
  report: EnvReport;
  schema: SchemaCheck[];
}) {
  const [pending, startTransition] = useTransition();
  const [test, setTest] = useState<KeyTest | null>(null);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">What the server can see</h2>
        <p className="mt-1 text-sm text-muted">
          Names and lengths only, never a value. A missing setting and a
          misspelled one look identical from outside, so this reports both.
        </p>
      </div>

      <ul className="space-y-2">
        <Row
          label="ANTHROPIC_API_KEY"
          ok={report.anthropicKeyPresent}
          detail={
            report.anthropicKeyPresent
              ? `${report.anthropicKeyLength} chars, starts ${report.anthropicKeyPrefix}`
              : "not visible to this deployment"
          }
        />
        <Row
          label="NEXT_PUBLIC_SUPABASE_URL"
          ok={report.supabaseUrlPresent}
          detail={report.supabaseUrlPresent ? "set" : "missing"}
        />
        <Row label="Environment" ok detail={`${report.vercelEnv} · ${report.nodeEnv}`} />
      </ul>

      {report.anthropicLikeNames.length > 0 && (
        <div className="rounded-xl border border-line bg-raised p-4">
          <p className="text-sm font-medium">Variables mentioning Anthropic or Claude</p>
          <ul className="mt-2 space-y-1">
            {report.anthropicLikeNames.map((n) => (
              <li key={n} className="font-mono text-xs text-muted">{n}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            If the name you expect is not exactly ANTHROPIC_API_KEY, that is the problem.
          </p>
        </div>
      )}

      <div className="border-t border-line pt-5">
        <h2 className="text-lg font-semibold">Migrations</h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          Deploying code and running a migration are separate steps. Anything
          red here means the database is behind the app, which shows up as
          &ldquo;cannot find&rdquo; errors that look unrelated.
        </p>
        <ul className="mb-8 space-y-2">
          {schema.map((c) => (
            <Row
              key={`${c.migration}-${c.what}`}
              label={`${c.migration} · ${c.what}`}
              ok={c.present}
              detail={c.present ? "applied" : "not applied"}
            />
          ))}
        </ul>
      </div>

      <div className="border-t border-line pt-5">
        <button
          onClick={() => startTransition(async () => setTest(await testAnthropicKey()))}
          disabled={pending}
          className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
        >
          {pending ? "Calling the API..." : "Test the key for real"}
        </button>
        <p className="mt-2 text-sm text-muted">
          Makes one tiny live call. Proves the key works end to end rather than
          just being present.
        </p>

        {test && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            test.ok
              ? "bg-fairway-50 text-fairway-700 dark:bg-fairway-900/40 dark:text-fairway-200"
              : "bg-flag-500/10 text-flag-500"}`}>
            {test.ok ? `Working. Answered by ${test.model}.` : test.error}
          </p>
        )}
      </div>
    </div>
  );
}
