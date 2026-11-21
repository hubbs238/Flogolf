"use client";

import { useRef, useState, useTransition } from "react";
import { ImportPlayerRow, playerReviewErrors, useImportPlayers } from "./import-player-review";
import { useRouter } from "next/navigation";
import { createRoundFromImport, readRoundDetails } from "@/app/(app)/games/actions";
import type { ReadRoundDetails } from "@/app/(app)/games/actions";
import {
  defaultFb18Payouts,
  defaultPayouts,
  FIVE_TEAM_STAKES,
  formatRelative,
  MAX_TEAM_SIZE,
  MIN_TEAM_SIZE,
} from "@/lib/game";
import type { Fb18Segment } from "@/lib/game";
import { describeDecodeFailure, downscale } from "@/lib/image-file";

/**
 * A grid of eighteen columns across several bays needs more pixels than one
 * handwritten row does, so this reads at a larger edge than the phone photo
 * path and accepts the slower upload.
 */
const SHEET_EDGE = 3000;
const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

type Read = Extract<ReadRoundDetails, { ok: true }>;
type Units = Record<number, number>;

const POTS = [
  { key: "main" as const, label: "Match" },
  { key: "front" as const, label: "Front nine" },
  { key: "back" as const, label: "Back nine" },
  { key: "total" as const, label: "Lowest eighteen" },
  // Its own pot, which the lowest round pays into. Two columns on the sheet,
  // two pots here.
  { key: "second" as const, label: "2nd lowest eighteen" },
];

/**
 * Builds a whole round out of one uploaded image.
 *
 * Everything on this form arrives filled in: the bays, who was in them, the
 * card, the date, the rake, how the eighteen was cut, and what a finishing
 * position pays, all worked out of the sheet. The job here is reading it back
 * and correcting what the reader got wrong, not filling a page in beside an
 * image of the same numbers.
 *
 * The one thing it will not decide for you is who a new name belongs to.
 * Every name the pool has not seen gets a control: add them, or say which
 * existing golfer it really is. Guessing that wrong pays one player's money
 * to another, so it is asked rather than inferred.
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

  // What a finishing position pays, per pot, and the side rates that differ.
  const [units, setUnits] = useState<Record<string, Units>>({});
  const [segRates, setSegRates] = useState<Partial<Record<Fb18Segment, number>>>({});

  const review = useImportPlayers();

  function reset() {
    setRead(null);
    setError(null);
    setUnits({});
    setSegRates({});
    review.reset();
  }

  async function onFile(file: File) {
    setError(null);
    reset();
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

      const s = result.suggested;
      setName(s.name);
      setCourse(s.course);
      setMatchDate(s.isoDate ?? "");
      setRosterSize(s.rosterSize);
      setDollars(s.dollarsPerUnit);
      setRake(s.rakePerPlayer);
      setRoundType(s.roundType);
      setSetHoles(s.setHoles);
      setSegRates(s.fb18Rates);
      review.reset();

      // A pot the money block did not give up falls back to the league's
      // own shape FOR THAT POT, so the grid is never blank and never shows
      // the match table against a side game that does not pay like one.
      setUnits({
        main: s.payouts ?? defaultPayouts(s.teamCount),
        front: s.fb18Payouts.front ?? defaultFb18Payouts(s.teamCount, "front"),
        back: s.fb18Payouts.back ?? defaultFb18Payouts(s.teamCount, "back"),
        total: s.fb18Payouts.total ?? defaultFb18Payouts(s.teamCount, "total"),
        second: s.fb18Payouts.second ?? defaultFb18Payouts(s.teamCount, "second"),
      });
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

  const teamCount = read?.bays.length ?? 0;
  const positions = Array.from({ length: teamCount }, (_, i) => i + 1);


  const blockers = (() => {
    if (!read) return [];
    const out = [...read.blockers, ...playerReviewErrors(
      read.bays.map((bay, index) => ({ ...bay, index })), review, read.pool,
    )];

    for (const b of read.bays) {
      if (b.players.length > rosterSize) {
        out.push(`Players per team is set to ${rosterSize}, but ${b.label} has more.`);
      }
    }
    for (const pot of POTS) {
      const table = units[pot.key];
      if (!table) continue;
      const sum = positions.reduce((n, p) => n + (Number(table[p]) || 0), 0);
      if (Math.abs(sum) > 0.001) {
        out.push(`${pot.label} units come to ${round2(sum)} rather than zero.`);
      }
    }
    return out;
  })();

  function commit() {
    if (!read || blockers.length > 0) return;
    setError(null);
    startTransition(async () => {
      const r = await createRoundFromImport({
        round: {
          name, course,
          teamCount,
          rosterSize,
          dollarsPerUnit: dollars,
          tieDefault,
          roundType,
          setHoles,
          matchDate: matchDate || undefined,
          rakePerPlayer: rake,
          payouts: units.main,
          fb18Payouts: {
            front: units.front, back: units.back,
            total: units.total, second: units.second,
          },
          fb18Rates: segRates,
        },
        bays: read.bays.map((b, bi) => ({
          players: b.players.map((p, pi) => review.reviewed(bi, pi, p)),
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

  const field =
    "w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none focus:border-fairway-400";
  const legend = "mb-1.5 block text-sm font-medium";

  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Upload round details</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Upload the sheet and this fills the whole round in from it: the
            bays, who played, the card, the date, the rake, how the eighteen
            was cut, and what a finishing position pays. Review the scores and player assignments before saving.
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
          <span className={legend}>The hole numbers are</span>
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
        <div className="mt-5 space-y-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium">
              {teamCount} bay{teamCount === 1 ? "" : "s"} read
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
                {!read.details.isoDate && " (not a date it could use, so set it below)"}
              </span>
            )}
          </div>

          {read.notes && <p className="text-xs text-muted">{read.notes}</p>}

          {blockers.length > 0 && (
            <div className="rounded-lg bg-flag-500/10 px-3 py-2 text-sm text-flag-500">
              <p className="font-medium">Fix these first</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
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

          {/* --- the round itself ------------------------------------- */}
          <div>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Round</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className={legend}>Round name</span>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Wednesday night" className={field} />
              </label>
              <label>
                <span className={legend}>Course</span>
                <input value={course} onChange={(e) => setCourse(e.target.value)} className={field} />
              </label>
              <label>
                <span className={legend}>Date played</span>
                <input type="date" value={matchDate}
                  onChange={(e) => setMatchDate(e.target.value)} className={field} />
                <span className="mt-1 block text-xs text-muted">Left blank, the round takes today.</span>
              </label>
              <label>
                <span className={legend}>Players per team</span>
                <input type="number" min={MIN_TEAM_SIZE} max={MAX_TEAM_SIZE} value={rosterSize}
                  onChange={(e) => setRosterSize(Number(e.target.value))} className={field} />
                <span className="mt-1 block text-xs text-muted">
                  A cap, not a quota. Bays can be uneven and need only {MIN_TEAM_SIZE} to start.
                </span>
              </label>
              <label>
                <span className={legend}>Round type</span>
                <select value={roundType}
                  onChange={(e) => setRoundType(e.target.value as "season" | "major")}
                  className={field}>
                  <option value="season">Season round</option>
                  <option value="major">Major &mdash; double points</option>
                </select>
                {read.suggested.roundType === "major" && (
                  <span className="mt-1 block text-xs text-muted">The sheet called it a major.</span>
                )}
              </label>
              <label>
                <span className={legend}>Match length</span>
                <select value={setHoles}
                  onChange={(e) => setSetHoles(Number(e.target.value) as 3 | 6)}
                  className={field}>
                  <option value={3}>Six three-hole matches</option>
                  <option value={6}>Three six-hole matches</option>
                </select>
                {read.details.setHoles && (
                  <span className="mt-1 block text-xs text-muted">Read off the image.</span>
                )}
              </label>
              <label className="sm:col-span-2">
                <span className={legend}>Default tie ruling</span>
                <select value={tieDefault}
                  onChange={(e) => setTieDefault(e.target.value as "hole" | "set")}
                  className={field}>
                  <option value="hole">Sudden death on the next hole</option>
                  <option value="set">Carry to the next set</option>
                </select>
                <span className="mt-1 block text-xs text-muted">
                  Not something an image can show, so this one is yours.
                </span>
              </label>
            </div>
          </div>

          {/* --- stakes ----------------------------------------------- */}
          <div>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Stakes and payouts
            </h4>
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <label>
                <span className={legend}>Dollars per unit</span>
                <input type="number" min={0} step="0.5" value={dollars}
                  onChange={(e) => setDollars(Number(e.target.value))} className={field} />
              </label>
              <label>
                <span className={legend}>Rake</span>
                <input type="number" min={0} step="1" value={rake}
                  onChange={(e) => setRake(Number(e.target.value))} className={field} />
                <span className="mt-1 block text-xs text-muted">
                  Charged to every player, off settlement. Never touches points.
                </span>
              </label>
            </div>

            {read.stakeNotes.length > 0 && (
              <p className="mb-3 text-xs text-muted">
                On the stakes: {read.stakeNotes.join("; ")}.
              </p>
            )}

            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="p-2 text-left font-medium">Units</th>
                    {positions.map((p) => (
                      <th key={p} className="w-16 p-2 text-center font-medium">{ordinal(p)}</th>
                    ))}
                    <th className="w-28 p-2 text-left font-medium">$ / unit</th>
                  </tr>
                </thead>
                <tbody>
                  {POTS.map((pot) => {
                    const table = units[pot.key] ?? {};
                    const sum = positions.reduce((n, p) => n + (Number(table[p]) || 0), 0);
                    return (
                      <tr key={pot.key} className="border-b border-line last:border-0">
                        <td className="p-2 font-medium">
                          {pot.label}
                          <span className={`ml-2 text-xs font-normal ${
                            Math.abs(sum) > 0.001 ? "text-flag-500" : "text-muted"}`}>
                            {Math.abs(sum) > 0.001 ? `sums to ${round2(sum)}` : "balanced"}
                          </span>
                        </td>
                        {positions.map((p) => (
                          <td key={p} className="p-1 text-center">
                            <input
                              type="number" step="0.5"
                              value={table[p] ?? 0}
                              onChange={(e) =>
                                setUnits((prev) => ({
                                  ...prev,
                                  [pot.key]: { ...(prev[pot.key] ?? {}), [p]: Number(e.target.value) },
                                }))
                              }
                              className="w-14 rounded-lg border border-line bg-surface px-1.5 py-1 text-center tabular-nums outline-none focus:border-fairway-400"
                            />
                          </td>
                        ))}
                        <td className="p-1">
                          {pot.key === "main" ? (
                            <span className="px-1.5 text-xs text-muted">${dollars}</span>
                          ) : (
                            <input
                              type="number" min={0} step="0.5"
                              placeholder={String(teamCount === 5 ? FIVE_TEAM_STAKES.rates[pot.key as Fb18Segment] : dollars)}
                              value={segRates[pot.key as Fb18Segment] ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setSegRates((prev) => {
                                  const next = { ...prev };
                                  if (v === "") delete next[pot.key as Fb18Segment];
                                  else next[pot.key as Fb18Segment] = Number(v);
                                  return next;
                                });
                              }}
                              className="w-20 rounded-lg border border-line bg-surface px-1.5 py-1 text-center tabular-nums outline-none focus:border-fairway-400"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              Each row has to come to zero: the money moves between bays rather
              than coming from anywhere. A blank rate follows the main one.
            </p>
          </div>

          {/* --- the bays --------------------------------------------- */}
          <div>
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Bays
            </h4>
            <div className="space-y-3">
              {read.bays.map((b, bi) => (
                <div key={`${b.label}-${bi}`} className="rounded-xl border border-line p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="font-medium">{b.label}</span>
                    <span className="text-xs text-muted">becomes Team {bi + 1}</span>
                    <span className={`text-xs ${
                      b.players.length > rosterSize ? "text-flag-500" : "text-muted"}`}>
                      {b.players.length} player{b.players.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {b.players.length === 0 ? (
                    <p className="mb-3 text-xs text-flag-500">
                      No names were legible for this bay. Its scores still
                      import; add the players by hand afterwards.
                    </p>
                  ) : (
                    <ul className="mb-3 space-y-1.5">
                      {b.players.map((p, pi) => (
                        <ImportPlayerRow key={pi} player={p} bay={bi} slot={pi} label={b.label}
                          pool={read.pool} review={review} disabled={pending} />
                      ))}
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
          </div>

          <button
            onClick={commit}
            disabled={pending || blockers.length > 0}
            className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
          >
            {pending ? "Creating..." : `Create a ${teamCount} team round from this image`}
          </button>
        </div>
      )}
    </section>
  );
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function ordinal(n: number) {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
