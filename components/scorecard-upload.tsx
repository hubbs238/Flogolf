"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyScorecardPhoto, readScorecardPhoto } from "@/app/(app)/games/actions";
import { formatRelative } from "@/lib/game";
import type { MatchTeam } from "@/lib/types";

type Read = Awaited<ReturnType<typeof readScorecardPhoto>>;

/**
 * Shrinks the photo before it leaves the phone. A modern camera shot is
 * 4MB+, which is slow on a course with one bar of signal and costs more to
 * read than it needs to. 1600px wide keeps handwritten digits legible.
 */
async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that image.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function ScorecardUpload({
  matchId, teams,
}: {
  matchId: string;
  teams: MatchTeam[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (teams.length === 0) return null;

  async function onFile(file: File) {
    setError(null);
    setRead(null);
    setSummary(null);
    setBusy(true);
    try {
      const dataUrl = await downscale(file);
      setPreview(dataUrl);
      const result = await readScorecardPhoto(matchId, teamId, dataUrl);
      setRead(result);
      if (!result.ok) setError(result.error);
    } catch {
      setError("Could not process that image.");
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!read?.ok) return;
    setError(null);
    startTransition(async () => {
      const r = await applyScorecardPhoto(
        matchId, teamId,
        read.holes.map((h) => ({ hole: h.hole, relative: h.relative })),
      );
      if (!r.ok) { setError(r.error); return; }
      setSummary(
        r.written.length === 0
          ? "Nothing to add. Every hole on that card was already filled in."
          : `Filled ${r.written.length} hole${r.written.length === 1 ? "" : "s"}: ${r.written.join(", ")}.` +
            (r.skipped.length ? ` Left ${r.skipped.length} already on the board alone.` : ""),
      );
      setRead(null);
      setPreview(null);
      router.refresh();
    });
  }

  const fresh = read?.ok ? read.holes.filter((h) => !read.alreadyFilled.includes(h.hole)) : [];

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <h3 className="font-semibold">Read a scorecard photo</h3>
      <p className="mt-1 text-sm text-muted">
        Photograph your row with the printed par row in shot. Only holes still
        blank get filled in, so you can do this after the front nine and again
        at the end.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {teams.length > 1 && (
          <select
            value={teamId}
            onChange={(e) => { setTeamId(e.target.value); setRead(null); setPreview(null); }}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-fairway-400"
          >
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={busy || pending}
          className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
        >
          {busy ? "Reading the card..." : "Take or choose a photo"}
        </button>

        {preview && !busy && (
          <button
            onClick={() => { setPreview(null); setRead(null); setError(null); }}
            className="text-sm text-muted transition hover:text-ink"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">{error}</p>
      )}
      {summary && (
        <p className="mt-3 rounded-lg bg-fairway-50 px-3 py-2 text-sm text-fairway-700 dark:bg-fairway-900/40 dark:text-fairway-200">
          {summary}
        </p>
      )}

      {read?.ok && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">Check this before it saves</span>
            <span className={`text-xs ${
              read.confidence === "high" ? "text-muted"
                : read.confidence === "medium" ? "text-muted"
                : "text-flag-500"}`}>
              {read.confidence} confidence
            </span>
            {read.notes && <span className="text-xs text-muted">{read.notes}</span>}
          </div>

          {read.holes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-4 text-sm text-muted">
              Nothing legible on that photo. Try a straighter, closer shot with
              the par row visible.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="p-2 text-left font-medium">Hole</th>
                    {read.holes.map((h) => <th key={h.hole} className="w-12 p-2 text-center">{h.hole}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line">
                    <td className="p-2 text-muted">Strokes</td>
                    {read.holes.map((h) => <td key={h.hole} className="p-2 text-center tabular-nums">{h.strokes}</td>)}
                  </tr>
                  <tr className="border-b border-line">
                    <td className="p-2 text-muted">Par</td>
                    {read.holes.map((h) => <td key={h.hole} className="p-2 text-center tabular-nums text-muted">{h.par}</td>)}
                  </tr>
                  <tr>
                    <td className="p-2 font-medium">Saves as</td>
                    {read.holes.map((h) => {
                      const taken = read.alreadyFilled.includes(h.hole);
                      return (
                        <td key={h.hole} className={`p-2 text-center font-semibold tabular-nums ${
                          taken ? "text-muted line-through" : ""}`}>
                          {formatRelative(h.relative)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {read.alreadyFilled.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Struck through holes are already on the board and will be left alone.
            </p>
          )}
          {read.skipped.length > 0 && (
            <p className="mt-2 text-xs text-flag-500">
              Ignored as out of range: {read.skipped.join("; ")}. Enter those by hand.
            </p>
          )}

          {fresh.length > 0 && (
            <button
              onClick={apply}
              disabled={pending}
              className="mt-3 rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
            >
              {pending ? "Saving..." : `Fill ${fresh.length} blank hole${fresh.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
