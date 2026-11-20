"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRoundFromImport, readRoundDetails } from "@/app/(app)/games/actions";
import type { ReadRoundDetails } from "@/app/(app)/games/actions";
import { formatRelative, MAX_TEAM_SIZE, MIN_TEAM_SIZE } from "@/lib/game";
import { describeDecodeFailure, downscale } from "@/lib/image-file";

/**
 * A grid of eighteen columns across several bays needs more pixels than one
 * handwritten row does, so this reads at a larger edge than the phone photo
 * path and accepts the slower upload.
 */
const SHEET_EDGE = 3000;
const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

type Read = Extract<ReadRoundDetails, { ok: true }>;

/**
 * Builds a whole round out of one uploaded image.
 *
 * The in-round importer pours into a round that already exists. This is the
 * other end of the workflow: upload first, and let what the image says decide
 * how many teams there are, how big they are, when it was played and what it
 * cost, with every one of those still editable before anything is written.
 */
export function RoundCreateImport() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expect, setExpect] = useState<"relative" | "gross">("relative");
  const [read, setRead] = useState<Read | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The round's own settings, seeded from the image and then the admin's.
  const [name, setName] = useState("");
  const [course, setCourse] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [rosterSize, setRosterSize] = useState(4);
  const [dollars, setDollars] = useState(5);
  const [rake, setRake] = useState(0);
  const [roundType, setRoundType] = useState<"season" | "major">("season");
  const [setHoles, setSetHoles] = useState<3 | 6>(3);
  const [tieDefault, setTieDefault] = useState<"hole" | "set">("hole");

  function reset() {
    setRead(null);
    setError(null);
  }

  async function onFile(file: File) {
    setError(null);
    setRead(null);
    setBusy(true);

    let dataUrl: string;
    try {
      dataUrl = await downscale(file, SHEET_EDGE);
    } catch (e) {
      setBusy(false);
      setError(describeDecodeFailure(file, e));
      return;
    }

    try {
      const result = await readRoundDetails(dataUrl, expect);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRead(result);

      // Seed the form from the image. Anything it could not find keeps the
      // sensible default rather than going blank.
      setName(result.details.title ?? result.details.date ?? "");
      setCourse(result.details.course ?? "");
      setMatchDate(result.details.isoDate ?? "");
      setRosterSize(result.suggested.rosterSize);
      if (result.details.setHoles) setSetHoles(result.details.setHoles);
      if (result.details.rakePerPlayer !== null) setRake(result.details.rakePerPlayer);
    } catch (e) {
      setError(
        e instanceof Error
          ? `The server could not read it: ${e.message}`
          : "The server could not be reached. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const newNames = read
    ? [...new Set(read.bays.flatMap((b) => b.players.filter((p) => p.isNew).map((p) => p.read)))]
    : [];
  const overCap = read ? read.bays.some((b) => b.players.length > rosterSize) : false;
  const blockers = read
    ? [
        ...read.blockers,
        ...(overCap
          ? [
              `Players per team is set to ${rosterSize}, but a bay on this card has more.`,
            ]
          : []),
      ]
    : [];

  function create() {
    if (!read || blockers.length > 0) return;
    setError(null);
    startTransition(async () => {
      const r = await createRoundFromImport({
        round: {
          name, course,
          teamCount: read.bays.length,
          rosterSize,
          dollarsPerUnit: dollars,
          tieDefault,
          roundType,
          setHoles,
          matchDate: matchDate || undefined,
          rakePerPlayer: rake,
        },
        bays: read.bays.map((b) => ({
          players: b.players.map((p) => ({ read: p.read, golferId: p.golferId })),
          holes: b.holes.map((h) => ({ hole: h.hole, relative: h.relative })),
        })),
      });

      if (!r.ok) {
        setError(
          r.matchId
            ? `${r.error} The round was created anyway, so finish it by hand rather than uploading again.`
            : r.error,
        );
        if (r.matchId) router.push(`/games/${r.matchId}`);
        return;
      }
      // A round built from a sheet is taken straight to scoring. When it
      // cannot be, the round still exists and the reason belongs on its own
      // page rather than on a form that is about to be navigated away from.
      if (!r.started && r.startError) {
        setError(`The round was built but is not scoring yet: ${r.startError}`);
      }
      router.push(`/games/${r.matchId}`);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl border border-line px-5 py-2.5 font-medium transition hover:border-fairway-300"
      >
        Upload round details
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Upload round details</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Upload the sheet and this builds the whole round from it: how many
            bays played, who was in each one, what they shot, and the date,
            course, rake and match length if the image shows them. Everything
            it reads is editable below before anything is created, and any name
            the pool has not seen gets added exactly as the sheet spells it.
          </p>
        </div>
        <button
          onClick={() => { setOpen(false); reset(); }}
          className="text-sm text-muted transition hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1.5 block font-medium">The hole numbers are</span>
          <select
            value={expect}
            onChange={(e) => { setExpect(e.target.value as "relative" | "gross"); reset(); }}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-fairway-400"
          >
            <option value="relative">Scores against par, like 0 and -1</option>
            <option value="gross">Gross strokes, with a par row in shot</option>
          </select>
        </label>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
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
          {busy ? "Reading the sheet..." : read ? "Choose a different image" : "Choose an image"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">{error}</p>
      )}

      {read && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">
              {read.bays.length} bay{read.bays.length === 1 ? "" : "s"} read
            </span>
            <span className={`text-xs ${read.confidence === "low" ? "text-flag-500" : "text-muted"}`}>
              {read.confidence} confidence
            </span>
            <span className="text-xs text-muted">
              as {read.scoreKind === "relative" ? "scores against par" : "gross strokes"}
              {read.scoreKindAssumed && " (it could not tell, so your choice was used)"}
            </span>
            {read.details.date && (
              <span className="text-xs text-muted">
                dated {read.details.date}
                {!read.details.isoDate && " (could not be turned into a date, so set it below)"}
              </span>
            )}
          </div>

          {read.notes && <p className="text-xs text-muted">{read.notes}</p>}

          {blockers.length > 0 && (
            <div className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">
              <p className="font-medium">Fix these first</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {/* Indexed: two bays can produce the same sentence. */}
                {blockers.map((b, i) => <li key={`${i}-${b}`}>{b}</li>)}
              </ul>
            </div>
          )}
          {read.flags.length > 0 && (
            <p className="text-xs text-flag-500">
              Worth a second look: {read.flags.join("; ")}. These save as read.
            </p>
          )}
          {read.dropped.length > 0 && (
            <p className="text-xs text-muted">
              Left out of the reading: {read.dropped.join("; ")}. Type anything
              you still need in by hand once the round exists.
            </p>
          )}
          {newNames.length > 0 && (
            <p className="rounded-lg bg-amber-300/15 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-400/40 dark:text-amber-200">
              New to the pool, and added on save exactly as spelled:{" "}
              <span className="font-medium">{newNames.join(", ")}</span>.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-sm font-medium">Round name</span>
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Wednesday night"
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400" />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium">Course</span>
              <input value={course} onChange={(e) => setCourse(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400" />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium">Date played</span>
              <input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400" />
              <span className="mt-1 block text-xs text-muted">Left blank, the round takes today.</span>
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium">Players per team</span>
              <input type="number" min={MIN_TEAM_SIZE} max={MAX_TEAM_SIZE} value={rosterSize}
                onChange={(e) => setRosterSize(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400" />
              <span className="mt-1 block text-xs text-muted">
                A cap, not a quota. Bays can be uneven and need only {MIN_TEAM_SIZE} to start.
              </span>
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium">Dollars per unit</span>
              <input type="number" min={0} step="0.5" value={dollars}
                onChange={(e) => setDollars(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400" />
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium">Rake</span>
              <input type="number" min={0} step="1" value={rake}
                onChange={(e) => setRake(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400" />
              <span className="mt-1 block text-xs text-muted">Charged to every player, off settlement.</span>
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium">Round type</span>
              <select value={roundType}
                onChange={(e) => {
                  const next = e.target.value as "season" | "major";
                  setRoundType(next);
                  if (next === "major" && !read.details.setHoles) setSetHoles(6);
                }}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400">
                <option value="season">Season round</option>
                <option value="major">Major &mdash; double points</option>
              </select>
            </label>
            <label>
              <span className="mb-1.5 block text-sm font-medium">Match length</span>
              <select value={setHoles}
                onChange={(e) => setSetHoles(Number(e.target.value) as 3 | 6)}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400">
                <option value={3}>Six three-hole matches</option>
                <option value={6}>Three six-hole matches</option>
              </select>
              {read.details.setHoles && (
                <span className="mt-1 block text-xs text-muted">Read off the image.</span>
              )}
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium">Default tie ruling</span>
              <select value={tieDefault}
                onChange={(e) => setTieDefault(e.target.value as "hole" | "set")}
                className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400">
                <option value="hole">Sudden death on the next hole</option>
                <option value="set">Carry to the next set</option>
              </select>
            </label>
          </div>

          <div className="space-y-3">
            {read.bays.map((b, i) => (
              <div key={`${b.label}-${i}`} className="rounded-xl border border-line p-4">
                <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="font-medium">{b.label}</span>
                  <span className="text-xs text-muted">becomes Team {i + 1}</span>
                  <span className={`text-xs ${
                    b.players.length > rosterSize ? "text-flag-500" : "text-muted"}`}>
                    {b.players.length} player{b.players.length === 1 ? "" : "s"}
                  </span>
                </div>

                {b.players.length === 0 ? (
                  <p className="mb-3 text-xs text-flag-500">
                    No names were legible for this bay. Its scores still import;
                    add the players by hand afterwards.
                  </p>
                ) : (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {b.players.map((p, j) => (
                      <span key={`${p.read}-${j}`}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${
                          p.isNew
                            ? "bg-amber-300/15 text-amber-700 ring-amber-400/40 dark:text-amber-200"
                            : "bg-fairway-50 text-fairway-700 ring-fairway-300/50 dark:bg-fairway-900/40 dark:text-fairway-200"
                        }`}>
                        {p.read}
                        {p.isNew
                          ? <span className="font-semibold uppercase tracking-wide">new</span>
                          : p.matched && p.matched !== p.read && (
                            <span className="opacity-70">= {p.matched}</span>
                          )}
                      </span>
                    ))}
                  </div>
                )}

                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full min-w-max text-sm">
                    <thead>
                      <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                        <th className="p-2 text-left font-medium">Hole</th>
                        {HOLES.map((h) => <th key={h} className="w-11 p-2 text-center">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="p-2 font-medium">Saves as</td>
                        {HOLES.map((h) => {
                          const cell = b.holes.find((x) => x.hole === h);
                          return (
                            <td key={h} className={`p-2 text-center font-semibold tabular-nums ${
                              cell ? "" : "text-muted"}`}>
                              {cell ? formatRelative(cell.relative) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={create}
            disabled={pending || blockers.length > 0}
            className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
          >
            {pending
              ? "Creating..."
              : `Create a ${read.bays.length} team round from this image`}
          </button>
        </div>
      )}
    </section>
  );
}
