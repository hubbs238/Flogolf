"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyScorecardPhoto, readScorecardPhoto } from "@/app/(app)/games/actions";
import { formatRelative } from "@/lib/game";
import type { MatchTeam } from "@/lib/types";

type Read = Awaited<ReturnType<typeof readScorecardPhoto>>;

/**
 * Decodes a picked file into something drawable.
 *
 * createImageBitmap is the fast path but throws on HEIC, which is what an
 * iPhone shoots by default. Safari can often still decode those through an
 * <img> element, so that is the fallback rather than an immediate failure.
 */
async function decode(file: File): Promise<{
  draw: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      draw: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("the browser could not decode it"));
        img.src = url;
      });
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
    return {
      draw: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  }
}

/**
 * Shrinks the photo before it leaves the phone. A modern camera shot is
 * 4MB+, which is slow on a course with one bar of signal and costs more to
 * read than it needs to. A 2000px long edge keeps handwritten digits legible.
 *
 * Capping the LONG edge, not the width: scaling on width alone left a tall
 * image tall, and the API rejects anything over 8000px on either side.
 */
const MAX_EDGE = 2000;

async function downscale(file: File): Promise<string> {
  const { draw, width, height, release } = await decode(file);
  try {
    if (!width || !height) throw new Error("the image had no dimensions");
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("this browser blocked canvas rendering");
    ctx.drawImage(draw, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    release();
  }
}

/** Says what actually went wrong instead of a catch-all. */
function describeDecodeFailure(file: File, error: unknown): string {
  const name = file.name.toLowerCase();
  if (/\.(heic|heif)$/.test(name) || /heic|heif/i.test(file.type)) {
    return (
      "That is a HEIC photo, which browsers cannot read. On iPhone either set " +
      "Settings > Camera > Formats > Most Compatible, or take a screenshot of " +
      "the photo and upload the screenshot."
    );
  }
  const detail = error instanceof Error ? error.message : "";
  return `Could not read that image file${detail ? `: ${detail}` : "."}`;
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

    // Decoding and reading are separate steps with separate failures. Sharing
    // one catch was hiding which of the two actually broke.
    let dataUrl: string;
    try {
      dataUrl = await downscale(file);
    } catch (e) {
      setBusy(false);
      setError(describeDecodeFailure(file, e));
      return;
    }

    setPreview(dataUrl);
    try {
      const result = await readScorecardPhoto(matchId, teamId, dataUrl);
      setRead(result);
      if (!result.ok) setError(result.error);
    } catch (e) {
      setError(
        e instanceof Error
          ? `The server could not read it: ${e.message}`
          : "The server could not be reached. Check your signal and try again.",
      );
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
          accept="image/jpeg,image/png,image/webp,image/*"
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
              Worth a second look before saving: {read.skipped.join("; ")}. These
              will save as read, they are just unusual enough to be worth
              checking against the card.
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
