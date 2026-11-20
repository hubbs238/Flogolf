"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyRoundImport, readRoundPhoto } from "@/app/(app)/games/actions";
import type { RoundImportRead, RoundImportTeam } from "@/app/(app)/games/actions";
import { formatRelative, MAX_TEAM_SIZE } from "@/lib/game";
import { describeDecodeFailure, downscale } from "@/lib/image-file";
import type { MatchTeam } from "@/lib/types";

/**
 * A grid of eighteen columns across five bays needs more pixels than one
 * handwritten row does, so this reads at a larger edge than the phone photo
 * path and accepts the slower upload.
 */
const SHEET_EDGE = 3000;

const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

type Read = Extract<RoundImportRead, { ok: true }>;

export function RoundImport({
  matchId, teams, status,
}: {
  matchId: string;
  teams: MatchTeam[];
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [expect, setExpect] = useState<"relative" | "gross">("relative");
  const [mode, setMode] = useState<"fill" | "replace">("fill");
  const [preview, setPreview] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [assign, setAssign] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRead(null);
    setPreview(null);
    setAssign({});
    setError(null);
  };

  async function onFile(file: File) {
    setError(null);
    setSummary(null);
    setRead(null);
    setAssign({});
    setBusy(true);

    let dataUrl: string;
    try {
      dataUrl = await downscale(file, SHEET_EDGE);
    } catch (e) {
      setBusy(false);
      setError(describeDecodeFailure(file, e));
      return;
    }

    setPreview(dataUrl);
    try {
      const result = await readRoundPhoto(matchId, dataUrl, expect);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRead(result);
      setAssign(
        Object.fromEntries(result.teams.map((t, i) => [i, t.teamId ?? ""])),
      );
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

  // Re-derived from the live assignment rather than taken from the read, so
  // correcting a bay on screen clears its objection immediately.
  const assignedFor = (i: number) => assign[i] ?? "";
  const clashes = (() => {
    const out: string[] = [];
    if (!read) return out;
    const used = new Map<string, number>();
    read.teams.forEach((t, i) => {
      const id = assignedFor(i);
      if (!id) {
        out.push(`${t.label} is not pointed at a team yet.`);
        return;
      }
      const first = used.get(id);
      if (first !== undefined) {
        out.push(`${read.teams[first].label} and ${t.label} both point at the same team.`);
      } else {
        used.set(id, i);
      }
    });
    return out;
  })();

  const nameBlockers = read
    ? read.blockers.filter((b) => !/does not line up with a team/.test(b))
    : [];
  const blockers = [...nameBlockers, ...clashes];
  const newNames = read
    ? [...new Set(read.teams.flatMap((t) => t.players.filter((p) => p.isNew).map((p) => p.read)))]
    : [];

  function commit() {
    if (!read || blockers.length > 0) return;
    setError(null);
    startTransition(async () => {
      const r = await applyRoundImport(
        matchId,
        read.teams.map((t, i) => ({
          teamId: assignedFor(i),
          players: t.players.map((p) => ({ read: p.read, golferId: p.golferId })),
          holes: t.holes.map((h) => ({ hole: h.hole, relative: h.relative })),
        })),
        mode,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSummary(
        [
          `Seated ${r.rostered} player${r.rostered === 1 ? "" : "s"}`,
          r.created.length ? `added ${r.created.length} new to the pool (${r.created.join(", ")})` : null,
          `wrote ${r.holesWritten} hole${r.holesWritten === 1 ? "" : "s"}`,
          r.holesLeft ? `left ${r.holesLeft} already on the board alone` : null,
        ].filter(Boolean).join(", ") + ".",
      );
      reset();
      router.refresh();
    });
  }

  if (status === "complete") return null;

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <h3 className="font-semibold">Import the whole night from an image</h3>
      <p className="mt-1 text-sm text-muted">
        Upload the sheet or a shot of the grid and this reads every bay at
        once: who played and what they shot. Bay 3 goes to Team 3. Any name
        the pool has not seen gets added exactly as the sheet spells it.
        Nothing is written until you have looked it over.
      </p>

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

        <label className="text-sm">
          <span className="mb-1.5 block font-medium">Holes already on the board</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "fill" | "replace")}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-fairway-400"
          >
            <option value="fill">Leave them alone</option>
            <option value="replace">Overwrite them from the image</option>
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
          {busy ? "Reading the sheet..." : "Choose an image"}
        </button>

        {preview && !busy && (
          <button onClick={reset} className="text-sm text-muted transition hover:text-ink">
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

      {read && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">Check this before it saves</span>
            <span className={`text-xs ${read.confidence === "low" ? "text-flag-500" : "text-muted"}`}>
              {read.confidence} confidence
            </span>
            <span className="text-xs text-muted">
              read as {read.scoreKind === "relative" ? "scores against par" : "gross strokes"}
              {read.scoreKindAssumed && " (it could not tell, so your choice was used)"}
            </span>
          </div>

          {read.notes && <p className="text-xs text-muted">{read.notes}</p>}

          {blockers.length > 0 && (
            <div className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">
              <p className="font-medium">Fix these first</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {blockers.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </div>
          )}

          {read.flags.length > 0 && (
            <p className="text-xs text-flag-500">
              Worth a second look: {read.flags.join("; ")}. These save as read.
            </p>
          )}

          {newNames.length > 0 && (
            <p className="rounded-lg bg-amber-300/15 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-400/40 dark:text-amber-200">
              New to the pool, and will be added on save exactly as spelled:{" "}
              <span className="font-medium">{newNames.join(", ")}</span>. If one of
              those is really someone you already have under another spelling,
              fix the sheet or add the nickname to their golfer first.
            </p>
          )}

          {read.teams.map((t, i) => (
            <BayCard
              key={`${t.label}-${i}`}
              bay={t}
              teams={teams}
              value={assignedFor(i)}
              onChange={(id) => setAssign((prev) => ({ ...prev, [i]: id }))}
              mode={mode}
            />
          ))}

          <button
            onClick={commit}
            disabled={pending || blockers.length > 0}
            className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
          >
            {pending ? "Saving..." : "Import this round"}
          </button>
        </div>
      )}
    </section>
  );
}

function BayCard({
  bay, teams, value, onChange, mode,
}: {
  bay: RoundImportTeam;
  teams: MatchTeam[];
  value: string;
  onChange: (id: string) => void;
  mode: "fill" | "replace";
}) {
  const byHole = new Map(bay.holes.map((h) => [h.hole, h]));
  const missing = HOLES.filter((h) => !byHole.has(h));

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-medium">{bay.label}</span>
        <span className="text-xs text-muted">goes to</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-fairway-400"
        >
          <option value="">Pick a team</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="text-xs text-muted">
          {bay.players.length} player{bay.players.length === 1 ? "" : "s"}
          {bay.players.length > MAX_TEAM_SIZE && ` (over the ${MAX_TEAM_SIZE} a team holds)`}
        </span>
      </div>

      {bay.players.length === 0 ? (
        <p className="mb-3 text-xs text-flag-500">
          No names were legible for this bay. Its roster will be left as it is,
          and only the scores get written.
        </p>
      ) : (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {bay.players.map((p) => (
            <span
              key={p.read}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ${
                p.isNew
                  ? "bg-amber-300/15 text-amber-700 ring-amber-400/40 dark:text-amber-200"
                  : "bg-fairway-50 text-fairway-700 ring-fairway-300/50 dark:bg-fairway-900/40 dark:text-fairway-200"
              }`}
            >
              {p.read}
              {p.isNew
                ? <span className="font-semibold uppercase tracking-wide">new</span>
                : p.matched && p.matched !== p.read && <span className="opacity-70">= {p.matched}</span>}
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
                const cell = byHole.get(h);
                const taken = bay.alreadyFilled.includes(h);
                const struck = taken && mode === "fill";
                return (
                  <td
                    key={h}
                    className={`p-2 text-center font-semibold tabular-nums ${
                      !cell ? "text-muted" : struck ? "text-muted line-through" : ""
                    }`}
                  >
                    {cell ? formatRelative(cell.relative) : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {missing.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Nothing legible on hole{missing.length === 1 ? "" : "s"} {missing.join(", ")}.
          Type {missing.length === 1 ? "it" : "those"} in by hand after importing.
        </p>
      )}
      {bay.alreadyFilled.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          {mode === "fill"
            ? `Struck through holes already have a score and will be left alone.`
            : `${bay.alreadyFilled.length} hole${bay.alreadyFilled.length === 1 ? "" : "s"} already on the board will be overwritten.`}
        </p>
      )}
    </div>
  );
}
