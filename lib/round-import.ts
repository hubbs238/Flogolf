import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isUnusualScore } from "./game";

/**
 * Reads a whole round off one image: every bay, who played in it, and what
 * they shot on each hole.
 *
 * This is the bulk cousin of extractScorecard, which reads one team's row and
 * fills blanks. That one is for a phone photo mid round. This one is for the
 * sheet at the end of the night, where the whole card is in front of you and
 * typing it in hole by hole is the worst part of running the league.
 *
 * Two things it does NOT do, on purpose:
 *
 * It does not decide anything. Everything it returns goes to a review screen
 * first, because a misread here writes a whole round rather than one hole.
 *
 * It does not do arithmetic in prose. The model reports what it can see and
 * says WHICH KIND of number it is looking at; the conversion to relative
 * scores happens below in TypeScript, where it can be checked.
 */

const RoundSchema = z.object({
  details: z
    .object({
      date: z
        .string()
        .describe(
          "The date this night was played, exactly as written, such as '9/30' " +
            "or 'Oct 7'. Empty string if the image shows none.",
        ),
      title: z
        .string()
        .describe("A heading naming the night or the league, or an empty string"),
      course: z
        .string()
        .describe("The course or venue, if named anywhere. Empty string otherwise."),
      set_length: z
        .union([z.literal(3), z.literal(6), z.literal(0)])
        .describe(
          "How the eighteen was divided into matches, if the image says. A " +
            "block headed 3, 6, 9, 12, 15, 18 means three-hole matches, so 3. " +
            "A block headed F6, M6, B6 or similar means six-hole matches, so " +
            "6. Use 0 if the image does not show it.",
        ),
      rake_per_player: z
        .number()
        .describe(
          "The flat charge per player, often labelled rake, dues or buy in. " +
            "Use 0 if the image does not show one.",
        ),
    })
    .describe("Round level facts, each one optional"),
  score_kind: z
    .enum(["relative", "gross", "unclear"])
    .describe(
      "What kind of number is in the hole cells. 'relative' means scores " +
        "against par, so zero and negatives appear. 'gross' means strokes " +
        "actually taken, so 3 to 6 on most holes and never negative. " +
        "'unclear' if you genuinely cannot tell.",
    ),
  teams: z
    .array(
      z.object({
        label: z
          .string()
          .describe("The row's own label exactly as written, such as 'Bay 3'"),
        number: z
          .number()
          .nullable()
          .describe("The bay or team number in that label, or null if it has none"),
        players: z
          .array(z.string())
          .describe(
            "Player names on this bay, spelled exactly as written. Empty if " +
              "the image does not show names for it.",
          ),
        holes: z.array(
          z.object({
            hole: z.number().describe("Hole number, a whole number from 1 to 18"),
            value: z.number().describe("The number in that hole's cell"),
          }),
        ),
      }),
    )
    .describe("One entry per bay or team row found, in the order they appear"),
  par: z
    .array(
      z.object({
        hole: z.number().describe("Hole number"),
        par: z.number().describe("Par printed for that hole"),
      }),
    )
    .describe("A par row if the image has one. Empty otherwise."),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().describe("Anything ambiguous or worth checking, in one or two short sentences"),
});

const PROMPT = `This image holds the results of one night of a golf simulator league.

It is laid out as a grid. Each ROW is one bay, which is one team, usually
labelled "Bay 1", "Bay 2" and so on. Each COLUMN is a hole, numbered 1 to 18
across the top. It may be a screenshot of a spreadsheet, a photo of a printed
sheet, or a simulator's own scorecard.

Report:

0. Round level details, each one optional and an empty string or 0 when the
   image does not show it: the date this night was played, a heading naming
   the night, the course or venue, how the eighteen was divided into matches,
   and the flat per player charge if one is written anywhere. A block headed
   3, 6, 9, 12, 15, 18 means three-hole matches. One headed F6, M6, B6 means
   six-hole matches. The charge is often labelled rake, dues or buy in.

1. score_kind. Look at the hole cells and decide what they are. Scores
   against par contain zeros and negative numbers like 0, -1, -2. Gross
   strokes are the number of shots taken, typically 3 to 6, and are never
   zero or negative. Say "unclear" rather than guessing.

2. One entry per bay row, with:
   - its label exactly as written, and the number in that label
   - the player names on that bay, spelled exactly as they appear, even if
     they look like nicknames or are misspelled. Do not correct, expand or
     tidy a name. Names may sit in the same row, or in a separate roster or
     draft block elsewhere in the image that uses the same bay labels. If you
     cannot find names for a bay, return an empty list for it.
   - every hole where the cell holds a legible number

3. A par row, if the image has one. Many simulator and spreadsheet layouts
   have none; return an empty list then.

Rules:
- Omit any hole whose cell is blank, crossed out, smudged, or that you are
  not confident about. Do not guess and do not interpolate from a total.
- Ignore running totals and summary columns: TOTAL, OUT, IN, F9, B9, F6, M6,
  B6, 18, RAKE, BALANCE, and any money or points columns. Only the numbered
  hole cells 1 to 18.
- If the image holds several nights, use the one block that is clearly the
  subject. Say which in notes.
- A row that is a total, an average or an audit line is not a bay. Skip it.

Set confidence low if the image is blurry, angled, partly cut off, or if the
hole columns do not line up cleanly with their headers.`;

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
  teams: ImportedTeam[];
  /** What the numbers in the image turned out to be. */
  scoreKind: "relative" | "gross";
  /** True when the model could not tell and the caller's choice was used. */
  scoreKindAssumed: boolean;
  confidence: "high" | "medium" | "low";
  notes: string;
  /** Readings odd enough to deserve a second look. They are still returned. */
  flags: string[];
};

export type RoundExtractionResult =
  | ({ ok: true } & RoundExtraction)
  | { ok: false; error: string };

/**
 * @param expect What the admin says the numbers are, used when the model
 *   cannot tell on its own. Their sheet holds scores against par, so that is
 *   the default rather than gross strokes.
 */
export async function extractRound(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  expect: "relative" | "gross" = "relative",
): Promise<RoundExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: "Image reading is not configured. An admin needs to set ANTHROPIC_API_KEY.",
    };
  }

  const client = new Anthropic();

  let response;
  try {
    response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(RoundSchema) },
    });
  } catch (error) {
    return { ok: false, error: describeApiFailure(error) };
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    return { ok: false, error: "Could not make sense of that image. Try a straighter, closer shot." };
  }

  // Narrowed off parsed.score_kind directly rather than through the boolean,
  // so "unclear" cannot leak into the returned kind.
  const scoreKindAssumed = parsed.score_kind === "unclear";
  const scoreKind: "relative" | "gross" =
    parsed.score_kind === "unclear" ? expect : parsed.score_kind;

  const parByHole = new Map<number, number>();
  for (const p of parsed.par) {
    if (Number.isInteger(p.hole) && Number.isInteger(p.par) && p.hole >= 1 && p.hole <= 18) {
      parByHole.set(p.hole, p.par);
    }
  }

  // Gross strokes are meaningless without a par to subtract. Rather than
  // writing nonsense, say what is missing and let the admin fix the shot or
  // tell us the numbers were already relative.
  if (scoreKind === "gross" && parByHole.size === 0) {
    return {
      ok: false,
      error:
        "Those look like gross strokes but the image has no par row, so they " +
        "cannot be converted. Include the par row, or say the numbers are " +
        "already scores against par.",
    };
  }

  const flags: string[] = [];
  const teams: ImportedTeam[] = [];

  for (const t of parsed.teams) {
    const seen = new Set<number>();
    const holes: ImportedTeam["holes"] = [];

    for (const h of t.holes) {
      if (!Number.isInteger(h.hole) || !Number.isFinite(h.value)) continue;
      if (h.hole < 1 || h.hole > 18 || seen.has(h.hole)) continue;
      seen.add(h.hole);

      let relative: number;
      if (scoreKind === "relative") {
        relative = h.value;
      } else {
        const par = parByHole.get(h.hole);
        if (par === undefined) {
          flags.push(`${t.label} hole ${h.hole} has no par to subtract, so it was left out`);
          continue;
        }
        relative = h.value - par;
      }
      if (!Number.isInteger(relative)) {
        flags.push(`${t.label} hole ${h.hole} read as ${h.value}, which is not a whole number`);
        continue;
      }
      if (isUnusualScore(relative)) {
        flags.push(`${t.label} hole ${h.hole} reads ${relative > 0 ? "+" : ""}${relative}`);
      }
      holes.push({ hole: h.hole, relative, raw: h.value });
    }

    holes.sort((a, b) => a.hole - b.hole);
    teams.push({
      label: (t.label || "").trim() || "Unlabelled",
      number: Number.isInteger(t.number) ? t.number : null,
      players: t.players.map((p) => p.trim()).filter(Boolean),
      holes,
    });
  }

  if (teams.length === 0) {
    return {
      ok: false,
      error: "No bay rows were legible in that image. Try a closer shot of the grid.",
    };
  }

  const d = parsed.details;
  const rake = Number(d.rake_per_player);
  const details: RoundDetails = {
    date: d.date.trim() || null,
    title: d.title.trim() || null,
    course: d.course.trim() || null,
    setHoles: d.set_length === 3 || d.set_length === 6 ? d.set_length : null,
    // Zero is how the model says "not shown", so it is not a rake of nothing.
    rakePerPlayer: Number.isFinite(rake) && rake > 0 ? Math.round(rake * 100) / 100 : null,
  };

  return {
    ok: true,
    details,
    teams,
    scoreKind,
    scoreKindAssumed,
    confidence: parsed.confidence,
    notes: parsed.notes,
    flags,
  };
}

/** The same failure handling the single-row reader uses, kept in one voice. */
function describeApiFailure(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The configured API key was rejected.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Rate limited. Wait a moment and try again.";
  }
  if (error instanceof Anthropic.APIError) {
    console.error("[round-import] Anthropic API error", error.status, error.message);
    if (/credit balance|billing|quota/i.test(error.message)) {
      return (
        "The Anthropic account is out of credit, so images cannot be read. " +
        "An admin can top it up at console.anthropic.com under Plans & Billing."
      );
    }
    return `The API rejected that request (${error.status}): ${error.message}`;
  }
  console.error("[round-import] unexpected failure", error);
  return error instanceof Error ? `Failed: ${error.message}` : "Could not read that image.";
}
