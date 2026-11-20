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
  // Rows the admin has struck off: a summary line the reader took for a bay,
  // or a bay that simply is not part of this round. Without this the only
  // ways past a spurious row were to point it at a real team or abandon the
  // whole import.
  const [ignored, setIgnored] = useState<Record<number, boolean>>({});
  // Who a name read as new actually is. Keyed "bay:player"; blank means add
  // them. Asked rather than inferred, because getting it wrong pays one
  // player's money to another.
  const [swap, setSwap] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRead(null);
    setPreview(null);
    setAssign({});
    setIgnored({});
    setSwap({});
    setError(null);
  };

  async function onFile(file: File) {
    setError(null);
    setSummary(null);
    setRead(null);
    setAssign({});
    setIgnored({});
    setSwap({});
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
      setIgnored({});
      setSwap({});
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
  const isIgnored = (i: number) => ignored[i] === true;
  /** The golfer a read name will end up as, after any swap. */
  const resolvedId = (bay: number, player: number, fallback: string | null) => {
    const key = `${bay}:${player}`;
    return key in swap ? swap[key] || null : fallback;
  };
  const live = read ? read.teams.map((t, i) => ({ t, i })).filter(({ i }) => !isIgnored(i)) : [];

  const clashes = (() => {
    const out: string[] = [];
    if (!read) return out;
    const used = new Map<string, number>();
    for (const { t, i } of live) {
      const id = assignedFor(i);
      if (!id) {
        out.push(`${t.label} is not pointed at a team yet.`);
        continue;
      }
      const first = used.get(id);
      if (first !== undefined) {
        out.push(`${read.teams[first].label} and ${t.label} both point at the same team.`);
      } else {
        used.set(id, i);
      }
    }
    return out;
  })();

  // The server's objections are keyed to bays by label. Anything about a bay
  // the admin has struck off no longer applies, and the ones about team
  // assignment are replaced wholesale by the live check above.
  const nameBlockers = read
    ? read.blockers.filter((b) => {
        if (/does not line up with a team|which this round does not have/.test(b)) return false;
        // An ambiguous name stops being a problem once somebody says who it
        // is, so that objection is re-derived below rather than carried.
        if (/could be /.test(b)) return false;
        return !read.teams.some((t, i) => isIgnored(i) && b.includes(t.label));
      })
    : [];

  const swapBlockers = (() => {
    const out: string[] = [];
    if (!read) return out;
    for (const { t, i } of live) {
      for (const [pi, p] of t.players.entries()) {
        if (p.sharedBy && !resolvedId(i, pi, p.golferId)) {
          out.push(`${p.read} on ${t.label} could be ${p.sharedBy.join(" or ")}. Pick one.`);
        }
      }
    }
    // A swap can seat one man on two bays, which no round can hold.
    const seen = new Map<string, string>();
    for (const { t, i } of live) {
      for (const [pi, p] of t.players.entries()) {
        const id = resolvedId(i, pi, p.golferId);
        if (!id) continue;
        const where = seen.get(id);
        if (where && where !== t.label) {
          out.push(`${p.read} is now the same golfer on both ${where} and ${t.label}.`);
        } else {
          seen.set(id, t.label);
        }
      }
    }
    return out;
  })();

  const blockers = [...nameBlockers, ...clashes, ...swapBlockers];
  const newNames = read
    ? [...new Set(
        live.flatMap(({ t, i }) =>
          t.players
            .filter((p, pi) => (p.isNew || p.sharedBy) && !resolvedId(i, pi, p.golferId))
            .map((p) => p.read),
        ),
      )]
    : [];

  function commit() {
    if (!read || blockers.length > 0) return;
    setError(null);
    startTransition(async () => {
      const r = await applyRoundImport(
        matchId,
        live.map(({ t, i }) => ({
          teamId: assignedFor(i),
          players: t.players.map((p, pi) => ({
            read: p.read,
            golferId: resolvedId(i, pi, p.golferId),
          })),
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
              you still need in by hand afterwards.
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
              ignored={isIgnored(i)}
              onIgnoredChange={(v) => setIgnored((prev) => ({ ...prev, [i]: v }))}
              pool={read.pool}
              chosenFor={(pi, fallback) => {
                const key = `${i}:${pi}`;
                return key in swap ? swap[key] : fallback ?? "";
              }}
              onSwap={(pi, id) => setSwap((prev) => ({ ...prev, [`${i}:${pi}`]: id }))}
              /*
                The filled set has to come from the team this bay is pointed at
                RIGHT NOW, not the one it was auto-assigned to when the image
                was read. Re-pointing a bay is the whole reason the dropdown
                exists, and the strike-through described the wrong team's card
                the moment anyone used it.
              */
              filled={read.filledByTeam[assignedFor(i)] ?? []}
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
  bay, teams, value, onChange, mode, filled, ignored, onIgnoredChange,
  pool, chosenFor, onSwap,
}: {
  bay: RoundImportTeam;
  teams: MatchTeam[];
  value: string;
  onChange: (id: string) => void;
  mode: "fill" | "replace";
  /** Holes already scored on the team this bay is pointed at right now. */
  filled: number[];
  ignored: boolean;
  onIgnoredChange: (v: boolean) => void;
  pool: { id: string; name: string }[];
  chosenFor: (player: number, fallback: string | null) => string;
  onSwap: (player: number, id: string) => void;
}) {
  const byHole = new Map(bay.holes.map((h) => [h.hole, h]));
  const missing = HOLES.filter((h) => !byHole.has(h));
  const filledHere = bay.holes.map((h) => h.hole).filter((h) => filled.includes(h));

  return (
    <div className={`rounded-xl border border-line p-4 ${ignored ? "opacity-50" : ""}`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-medium">{bay.label}</span>
        <span className="text-xs text-muted">goes to</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={ignored}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-fairway-400 disabled:opacity-50"
        >
          <option value="">Pick a team</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="text-xs text-muted">
          {bay.players.length} player{bay.players.length === 1 ? "" : "s"}
          {bay.players.length > MAX_TEAM_SIZE && ` (over the ${MAX_TEAM_SIZE} a team holds)`}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={ignored}
            onChange={(e) => onIgnoredChange(e.target.checked)} />
          Not a bay, skip it
        </label>
      </div>

      {bay.players.length === 0 ? (
        <p className="mb-3 text-xs text-flag-500">
          No names were legible for this bay. Its roster will be left as it is,
          and only the scores get written.
        </p>
      ) : (
        <ul className="mb-3 space-y-1.5">
          {bay.players.map((p, i) => {
            // A name the pool has not seen, or one two golfers answer to,
            // gets asked about rather than decided. The first name is the
            // captain, which is what the sheet's roster block puts first.
            const needsAnswer = p.isNew || Boolean(p.sharedBy);
            const chosen = chosenFor(i, p.golferId);
            return (
              <li key={`${i}-${p.read}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-6 text-xs text-muted">{i === 0 ? "C" : i + 1}</span>
                <span className="font-medium">{p.read}</span>

                {!needsAnswer && p.matched && (
                  <span className="text-xs text-muted">
                    {p.matched === p.read ? "already in the pool" : `= ${p.matched}`}
                  </span>
                )}

                {needsAnswer && (
                  <>
                    <select
                      value={chosen}
                      onChange={(e) => onSwap(i, e.target.value)}
                      disabled={ignored}
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-fairway-400 disabled:opacity-50"
                    >
                      <option value="">
                        {p.sharedBy ? "Pick who this is" : `Add ${p.read} as new`}
                      </option>
                      {pool.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                    {!chosen && (
                      <span className={`text-xs font-semibold uppercase tracking-wide ${
                        p.sharedBy ? "text-flag-500" : "text-amber-700 dark:text-amber-200"}`}>
                        {p.sharedBy ? "ambiguous" : "new"}
                      </span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
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
                const taken = filled.includes(h);
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
      {filledHere.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          {mode === "fill"
            ? `Struck through holes already have a score on that team and will be left alone.`
            : `${filledHere.length} hole${filledHere.length === 1 ? "" : "s"} already on that team will be overwritten.`}
        </p>
      )}
    </div>
  );
}
