import { anthropicKey, anthropicKeyName } from "@/lib/anthropic-env";
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { convertReading } from "./round-reading";
import type { RoundExtractionResult } from "./round-reading";

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
  money: z
    .object({
      shown: z
        .boolean()
        .describe("Whether the image has a money block at all"),
      rate: z
        .number()
        .describe(
          "A unit rate written on the image, such as '$200/unit' or '$25 a " +
            "man'. Use 0 if none is written.",
        ),
      rows: z
        .array(
          z.object({
            label: z
              .string()
              .describe("The bay this row belongs to, exactly as written"),
            sets: z
              .array(z.number())
              .describe(
                "What this bay won or lost on each main-game match, in order " +
                  "across the eighteen. Columns headed 3, 6, 9, 12, 15, 18 or " +
                  "F6, M6, B6 or similar. Empty if the image does not show them.",
              ),
            front: z.number().describe("What this bay won or lost on the front nine, or 0"),
            back: z.number().describe("What this bay won or lost on the back nine, or 0"),
            eighteen: z
              .number()
              .describe(
                "What this bay won or lost on the LOWEST eighteen prize, often " +
                  "a column headed 1ST 18. 0 if not shown.",
              ),
            secondEighteen: z
              .number()
              .describe(
                "What this bay won or lost on the SECOND lowest eighteen prize, " +
                  "often a column headed 2ND 18. These are two separate pots: " +
                  "do not add them together. 0 if the image has no such column.",
              ),
          }),
        )
        .describe("One row per bay, from the money block. Empty if there is none."),
    })
    .describe("The money block, which is what the stakes are read from"),
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
   and the flat per player charge if one is written anywhere.

   For the match length, look at the SUMMARY blocks rather than the hole
   grid. A summary headed 3, 6, 9, 12, 15, 18 means the eighteen was played
   as six three-hole matches. One headed F6, M6, B6 or similar means three
   six-hole matches. The charge is often labelled rake, dues or buy in.

1. score_kind. Look at the hole cells and decide what they are. Scores
   against par contain zeros and negative numbers like 0, -1, -2. Gross
   strokes are the number of shots taken, typically 3 to 6, and are never
   zero or negative. Say "unclear" rather than guessing.

2. The money block, if the image has one. This is a second grid, usually
   under or beside the scores, holding what each bay won or lost. Report one
   row per bay with: what it won on each main-game match in order (the
   columns headed 3, 6, 9, 12, 15, 18, or F6, M6, B6, or similar), and what
   it won on the front nine, the back nine and the eighteen hole result.

   The eighteen is usually TWO columns, a lowest and a second lowest, often
   headed 1ST 18 and 2ND 18. Report them separately; they are separate pots
   and adding them together loses which is which. Use negative numbers for a
   bay that paid out.
   Report a unit rate only if one is actually written, such as "$200/unit".
   Set shown to false and leave rows empty if there is no money block.

3. One entry per bay row, with:
   - its label exactly as written, and the number in that label
   - the player names on that bay, spelled exactly as they appear, even if
     they look like nicknames or are misspelled. Do not correct, expand or
     tidy a name. Names may sit in the same row, or in a separate roster or
     draft block elsewhere in the image that uses the same bay labels. If you
     cannot find names for a bay, return an empty list for it.
   - every hole where the cell holds a legible number

4. A par row, if the image has one. Many simulator and spreadsheet layouts
   have none; return an empty list then.

Rules:
- Omit any hole whose cell is blank, crossed out, smudged, or that you are
  not confident about. Do not guess and do not interpolate from a total.
- For the hole cells, read ONLY the grid whose columns are numbered 1 to 18.
  Ignore summary and money columns that sit beside or below it: TOTAL, OUT,
  IN, F9, B9, F6, M6, B6, L6, W18, RAKE, BALANCE, and anything in dollars or
  points. Those other blocks are still worth looking at for item 0 above, but
  never for a hole score.
- If the image holds several nights, use the one block that is clearly the
  subject. Say which in notes.
- A row that is a total, an average or an audit line is not a bay. Skip it.

Set confidence low if the image is blurry, angled, partly cut off, or if the
hole columns do not line up cleanly with their headers.`;

export type {
  ImportedTeam,
  RoundDetails,
  RoundExtraction,
  RoundExtractionResult,
} from "./round-reading";

/**
 * Reads a whole round off one image.
 *
 * Everything this does beyond calling the API lives in lib/round-reading.ts,
 * where it can be tested without a network. This half is the prompt, the
 * schema and the failure messages.
 *
 * @param expect What the admin says the numbers are, used when the model
 *   cannot tell on its own. Their sheet holds scores against par, so that is
 *   the default rather than gross strokes.
 */
export async function extractRound(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  expect: "relative" | "gross" = "relative",
): Promise<RoundExtractionResult> {
  const apiKey = anthropicKey();
  if (!apiKey) {
    return {
      ok: false,
      error: `An admin can enable image reading by setting ${anthropicKeyName}.`,
    };
  }

  const client = new Anthropic({ apiKey, authToken: null });

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
    return {
      ok: false,
      error: "Could not make sense of that image. Try a straighter, closer shot.",
    };
  }

  return convertReading(parsed, expect);
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
