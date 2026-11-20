import { isUnusualScore } from "./game";

/**
 * Turning what a vision model saw on a league sheet into scores this app can
 * store, and refusing the readings it should not store at all.
 *
 * Kept apart from lib/round-import.ts, which holds the prompt and the API
 * call, for one reason: this is the arithmetic, and the arithmetic has to be
 * testable without a network or a server. The one defect that mattered in
 * this whole feature was a missing range check on a par value, which no
 * amount of reading the code had caught. It has a test now because this file
 * can have tests.
 *
 * Nothing here is a judgement call about the league. It is the narrow
 * question of whether a number on a screen is a score, and if so which one.
 */

/** Exactly what the model is asked to return, before any of it is believed. */
export type RawReading = {
  score_kind: "relative" | "gross" | "unclear";
  teams: {
    label: string;
    number: number | null;
    players: string[];
    holes: { hole: number; value: number }[];
  }[];
  par: { hole: number; par: number }[];
  money: {
    shown: boolean;
    rate: number;
    rows: {
      label: string;
      sets: number[];
      front: number;
      back: number;
      eighteen: number;
    }[];
  };
  details: {
    date: string;
    title: string;
    course: string;
    set_length: number;
    rake_per_player: number;
  };
  confidence: "high" | "medium" | "low";
  notes: string;
};

export type ImportedTeam = {
  label: string;
  number: number | null;
  players: string[];
  /** Hole number to score against par, after any conversion. */
  holes: { hole: number; relative: number; raw: number }[];
};

export type RoundDetails = {
  /** Exactly as written, so the admin can see what it read. */
  date: string | null;
  title: string | null;
  course: string | null;
  setHoles: 3 | 6 | null;
  rakePerPlayer: number | null;
};

export type RoundExtraction = {
  details: RoundDetails;
  /** What a position pays, worked back out of the money block. */
  stakes: DerivedStakes;
  teams: ImportedTeam[];
  /** What the numbers in the image turned out to be. */
  scoreKind: "relative" | "gross";
  /** True when the model could not tell and the caller's choice was used. */
  scoreKindAssumed: boolean;
  confidence: "high" | "medium" | "low";
  notes: string;
  /** Readings odd enough to deserve a second look. These are still returned. */
  flags: string[];
  /** Readings that were thrown away, and why. These are NOT returned. */
  dropped: string[];
};

export type RoundExtractionResult =
  | ({ ok: true } & RoundExtraction)
  | { ok: false; error: string };

/**
 * Labels that are a summary line rather than a bay.
 *
 * The label has to BE the word, not merely start with it, so a bay someone
 * named "Total Carnage" survives. This only catches the rows a league sheet
 * puts under its grid, and it errs towards keeping: one slipping through has
 * no players and can be struck off on the review screen, whereas a real bay
 * dropped here is gone without a trace.
 */
const SUMMARY_ROW =
  /^(total|totals|audit|average|avg|sum|net|balance|rake|par|all|overall)\s*:?$/i;

/** The range a printed par can possibly be on a golf hole. */
const MIN_PAR = 3;
const MAX_PAR = 6;

/**
 * Converts one reading into storable scores.
 *
 * @param expect What the admin says the numbers are, used only when the model
 *   cannot tell on its own.
 */
export function convertReading(
  raw: RawReading,
  expect: "relative" | "gross" = "relative",
): RoundExtractionResult {
  // Narrowed off score_kind directly rather than through the boolean, so
  // "unclear" cannot leak into the returned kind.
  const scoreKindAssumed = raw.score_kind === "unclear";
  const scoreKind: "relative" | "gross" =
    raw.score_kind === "unclear" ? expect : raw.score_kind;

  // A par has to look like a par. Without this the two ways a par row gets
  // misread both write gross strokes into a column that means relative to
  // par, and nothing downstream catches either: a blank par cell read as 0
  // leaves the stroke count untouched, and a model that locks onto the hole
  // number header instead of the par row turns a gross 4 into +3, +2, +1, 0,
  // -1 and on down the card. Every one of those sits inside the range a score
  // is allowed to take, so not one would ever be flagged.
  const parFlags: string[] = [];
  const parByHole = new Map<number, number>();
  for (const p of raw.par) {
    if (!Number.isInteger(p.hole) || !Number.isInteger(p.par)) continue;
    if (p.hole < 1 || p.hole > 18) continue;
    if (p.par < MIN_PAR || p.par > MAX_PAR) {
      parFlags.push(`hole ${p.hole} had its par read as ${p.par}, which is not a par`);
      continue;
    }
    parByHole.set(p.hole, p.par);
  }

  // Gross strokes are meaningless without a par to subtract. Rather than
  // writing nonsense, say what is missing and let the admin fix the shot or
  // tell us the numbers were already relative.
  //
  // Rejecting more pars than were kept means this is not a par row at all.
  // The case that forces it: a model reading the hole-number header as the
  // par row returns 1 through 18, of which 3, 4, 5 and 6 are inside the
  // range a par can take. Dropping only the other fourteen would quietly
  // convert four holes against a par that is really a column index, and the
  // four wrong answers all land inside the band a score is allowed to take.
  // Half a par row is worse than none, because none gets refused.
  if (scoreKind === "gross" && parFlags.length >= parByHole.size) {
    return {
      ok: false,
      error:
        parFlags.length > 0
          ? "Those look like gross strokes, but the row read as the par row " +
            "mostly does not hold pars, so it cannot be trusted to convert " +
            "them. Get the printed par row in shot, or say the numbers are " +
            "already scores against par."
          : "Those look like gross strokes but the image has no par row, so " +
            "they cannot be converted. Include the par row, or say the numbers " +
            "are already scores against par.",
    };
  }

  // Two lists, because telling an admin a hole was dropped and telling them a
  // hole looks odd but will save are opposite messages, and one list printed
  // under "these save as read" said both at once.
  const flags: string[] = [];
  const dropped: string[] = [...parFlags];
  const teams: ImportedTeam[] = [];
  let sawZeroOrBetter = false;

  for (const t of raw.teams) {
    const label = (t.label || "").trim() || "Unlabelled";
    const players = (t.players ?? []).map((p) => p.trim()).filter(Boolean);

    if (SUMMARY_ROW.test(label)) {
      dropped.push(
        `a row labelled "${label}" looks like a total rather than a bay, so it was left out`,
      );
      continue;
    }

    const seen = new Set<number>();
    const holes: ImportedTeam["holes"] = [];

    for (const h of t.holes ?? []) {
      if (!Number.isInteger(h.hole) || !Number.isFinite(h.value)) continue;
      if (h.hole < 1 || h.hole > 18) continue;
      if (seen.has(h.hole)) {
        // Worth saying out loud: the same hole twice is what a misaligned
        // column looks like, which is the thing most worth knowing.
        dropped.push(`${label} gave hole ${h.hole} twice, so the second reading was left out`);
        continue;
      }
      seen.add(h.hole);

      if (h.value <= 0) sawZeroOrBetter = true;

      let relative: number;
      if (scoreKind === "relative") {
        relative = h.value;
      } else {
        const par = parByHole.get(h.hole);
        if (par === undefined) {
          dropped.push(`${label} hole ${h.hole} has no par to subtract, so it was left out`);
          continue;
        }
        relative = h.value - par;
      }
      if (!Number.isInteger(relative)) {
        dropped.push(`${label} hole ${h.hole} read as ${h.value}, which is not a whole number`);
        continue;
      }
      if (isUnusualScore(relative)) {
        flags.push(`${label} hole ${h.hole} reads ${relative > 0 ? "+" : ""}${relative}`);
      }
      holes.push({ hole: h.hole, relative, raw: h.value });
    }

    holes.sort((a, b) => a.hole - b.hole);
    teams.push({
      label,
      number: Number.isInteger(t.number) ? t.number : null,
      players,
      holes,
    });
  }

  if (teams.length === 0) {
    return {
      ok: false,
      error: "No bay rows were legible in that image. Try a closer shot of the grid.",
    };
  }

  // The last line of defence on relative versus gross, and the only one that
  // works. A score against par is zero at par, so a whole card with no zero
  // and nothing under it is not a card of scores against par: it is gross
  // strokes taken at face value, which rewrites the night's money as though
  // everyone shot three to six over on every hole. Nothing downstream can
  // catch that, because every gross value from 1 to 9 sits inside the range a
  // relative score is allowed to take.
  if (scoreKind === "relative" && !sawZeroOrBetter && teams.some((t) => t.holes.length > 0)) {
    return {
      ok: false,
      error:
        "Every number on that card is above zero, so these do not look like " +
        "scores against par. They are probably gross strokes. Set the hole " +
        "numbers to gross strokes and get the par row in shot, or check you " +
        "photographed the right block.",
    };
  }

  const d = raw.details;
  const rake = Number(d.rake_per_player);
  const details: RoundDetails = {
    date: (d.date ?? "").trim() || null,
    title: (d.title ?? "").trim() || null,
    course: (d.course ?? "").trim() || null,
    setHoles: d.set_length === 3 || d.set_length === 6 ? d.set_length : null,
    // Zero is how the model says "not shown", so it is not a rake of nothing.
    rakePerPlayer: Number.isFinite(rake) && rake > 0 ? Math.round(rake * 100) / 100 : null,
  };

  // Worked out last, because it needs the converted scores to rank the bays
  // and the set length the headers implied to know how the eighteen was cut.
  const stakes = deriveStakes(teams, raw.money, details.setHoles);

  // The money block is the better witness on set length: it counts the
  // matches that were actually paid out rather than reading a header.
  if (stakes.setHoles) details.setHoles = stakes.setHoles;

  return {
    ok: true,
    details,
    stakes,
    teams,
    scoreKind,
    scoreKindAssumed,
    confidence: raw.confidence,
    notes: raw.notes,
    flags,
    dropped,
  };
}


// ------------------------------------------------------------
//  Working the stakes back out of the money block
// ------------------------------------------------------------

/** position -> units. The same shape the round stores. */
export type UnitTable = Record<number, number>;

export type DerivedStakes = {
  /** Null where the image did not show enough to work it out. */
  main: UnitTable | null;
  front: UnitTable | null;
  back: UnitTable | null;
  total: UnitTable | null;
  /** Dollars a unit, per pot, where it could be worked out. */
  rates: {
    main: number | null;
    front: number | null;
    back: number | null;
    total: number | null;
  };
  /** How many main-game matches the money block implies, if it says. */
  setHoles: 3 | 6 | null;
  /** What could not be worked out, and why. */
  notes: string[];
};

const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const ALL = [...FRONT, ...BACK];
const SETS_OF_3 = [[1,2,3],[4,5,6],[7,8,9],[10,11,12],[13,14,15],[16,17,18]];
const SETS_OF_6 = [[1,2,3,4,5,6],[7,8,9,10,11,12],[13,14,15,16,17,18]];

/** Greatest common divisor over whole cents, so 37.5 and 200 both work. */
function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) [x, y] = [y, x % y];
  return x;
}

/** A team's score over a set of holes, or null if any of them is missing. */
function segmentScore(team: ImportedTeam, holes: readonly number[]): number | null {
  let total = 0;
  for (const h of holes) {
    const cell = team.holes.find((x) => x.hole === h);
    if (!cell) return null;
    total += cell.relative;
  }
  return total;
}

/**
 * Turns one pot into a units table and a rate.
 *
 * Given what each bay scored on a segment and what it was paid for it, the
 * finishing order is known, so position-to-dollars follows, and the rate is
 * the largest unit those dollars all divide by. $200, $0 and -$200 is one
 * unit at $200; -$40, -$40 and $80 is one unit at $40 paying two to the
 * winner. That is the whole trick.
 *
 * A tie is refused rather than guessed. Tied bays split the pot of the
 * positions they share, so the dollars no longer say what any single
 * position was worth, and inverting them would invent a table.
 */
function invertPot(
  rows: { score: number | null; dollars: number }[],
): { table: UnitTable; rate: number } | null {
  if (rows.length < 2) return null;
  if (rows.some((r) => r.score === null)) return null;

  const scores = rows.map((r) => r.score as number);
  if (new Set(scores).size !== scores.length) return null;      // a tie
  if (rows.every((r) => r.dollars === 0)) return null;           // nothing paid

  // Cents throughout: a sheet writes 37.5 and floats do not divide cleanly.
  const cents = rows.map((r) => Math.round(r.dollars * 100));
  if (cents.reduce((n, c) => n + c, 0) !== 0) return null;       // does not balance

  const rate = cents.filter((c) => c !== 0).reduce((g, c) => gcd(g, c), 0);
  if (!rate) return null;

  const order = rows
    .map((r, i) => ({ i, score: r.score as number }))
    .sort((a, b) => a.score - b.score);

  const table: UnitTable = {};
  order.forEach((o, rank) => {
    table[rank + 1] = cents[o.i] / rate;
  });
  return { table, rate: rate / 100 };
}

/**
 * Reads the stakes off the money block.
 *
 * The league's book records what each bay WON, not what a position pays, so
 * the table is worked backwards: rank the bays on the holes they actually
 * played, line that up against the money, and factor out the unit.
 *
 * Everything it cannot work out comes back null and says why, because a
 * payout table guessed wrong is worse than one left at its default: the
 * default is obviously a default, and a wrong one looks like a decision.
 */
export function deriveStakes(
  teams: ImportedTeam[],
  money: RawReading["money"],
  setHolesHint: 3 | 6 | null,
): DerivedStakes {
  const notes: string[] = [];
  const empty: DerivedStakes = {
    main: null, front: null, back: null, total: null,
    rates: { main: null, front: null, back: null, total: null },
    setHoles: null,
    notes,
  };

  if (!money?.shown || !money.rows?.length) {
    notes.push("the image showed no money block, so the stakes are left at their defaults");
    return empty;
  }

  // Match money rows to bays by label, which is the only thing the two
  // blocks share. A row that matches nothing is not usable.
  const byLabel = new Map(teams.map((t) => [t.label.trim().toLowerCase(), t]));
  const paired = money.rows
    .map((r) => ({ row: r, team: byLabel.get((r.label ?? "").trim().toLowerCase()) }))
    .filter((p): p is { row: typeof p.row; team: ImportedTeam } => Boolean(p.team));

  if (paired.length !== teams.length) {
    notes.push(
      `the money block lined up with ${paired.length} of ${teams.length} bays, ` +
      `so the stakes are left at their defaults`,
    );
    return empty;
  }

  const out: DerivedStakes = { ...empty, notes };

  // --- the three side pots ------------------------------------------------
  const side = [
    { key: "front" as const, holes: FRONT, pick: (r: typeof paired[0]["row"]) => r.front },
    { key: "back" as const, holes: BACK, pick: (r: typeof paired[0]["row"]) => r.back },
    { key: "total" as const, holes: ALL, pick: (r: typeof paired[0]["row"]) => r.eighteen },
  ];
  for (const s of side) {
    const got = invertPot(
      paired.map((p) => ({
        score: segmentScore(p.team, s.holes),
        dollars: Number(s.pick(p.row)) || 0,
      })),
    );
    if (got) {
      out[s.key] = got.table;
      out.rates[s.key] = got.rate;
    } else {
      notes.push(`the ${s.key === "total" ? "eighteen" : s.key + " nine"} pot could not be worked out from the image`);
    }
  }

  // --- the main game ------------------------------------------------------
  //
  // Every match on the card is the same pot, so each one is an independent
  // reading of the same table. They have to agree: one disagreeing means a
  // column was misread, and taking a majority would bury that.
  const widths = new Set(paired.map((p) => (p.row.sets ?? []).length));
  const width = widths.size === 1 ? [...widths][0] : 0;
  const sets = width === 6 ? SETS_OF_3 : width === 3 ? SETS_OF_6 : null;

  if (!sets) {
    notes.push(
      width === 0 && widths.size > 1
        ? "the bays showed different numbers of match columns, so the main game could not be worked out"
        : "the image showed no per-match money, so the main game is left at its default",
    );
    return out;
  }
  out.setHoles = width === 6 ? 3 : 6;
  if (setHolesHint && setHolesHint !== out.setHoles) {
    notes.push(
      `the headers read as ${setHolesHint}-hole matches but the money block has ` +
      `${width} of them, which is ${out.setHoles}-hole matches`,
    );
  }

  const readings: { table: UnitTable; rate: number }[] = [];
  sets.forEach((holes, i) => {
    const got = invertPot(
      paired.map((p) => ({
        score: segmentScore(p.team, holes),
        dollars: Number((p.row.sets ?? [])[i]) || 0,
      })),
    );
    if (got) readings.push(got);
  });

  if (readings.length === 0) {
    notes.push("no single match on the card could be worked out, so the main game is left at its default");
    return out;
  }

  const shape = (r: { table: UnitTable; rate: number }) =>
    JSON.stringify([r.rate, Object.entries(r.table).sort()]);
  const agreed = new Set(readings.map(shape));
  if (agreed.size > 1) {
    notes.push(
      `the ${readings.length} readable matches did not agree on what a position pays, ` +
      `so the main game is left at its default`,
    );
    return out;
  }

  out.main = readings[0].table;
  out.rates.main = readings[0].rate;
  if (readings.length < sets.length) {
    notes.push(
      `${readings.length} of ${sets.length} matches were readable, and they agreed`,
    );
  }
  return out;
}
