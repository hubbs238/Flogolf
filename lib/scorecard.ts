import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isUnusualScore } from "./game";

/**
 * Reads a photographed scorecard row.
 *
 * The model reports what it can SEE (gross strokes and the printed par) and
 * the subtraction happens here in TypeScript. Reading is what a vision model
 * is good at; arithmetic it does in prose is not worth trusting when the
 * answer moves money. Doing it this way also means every converted score
 * passes the same range check as a hand-entered one.
 *
 * Holes that are blank, smudged, or ambiguous are omitted rather than
 * guessed. That is deliberate: a missing hole is obvious on the card and
 * easy to type, whereas a confidently wrong 5 is invisible.
 */
const CardSchema = z.object({
  holes: z.array(
    z.object({
      hole: z.number().describe("Hole number, a whole number from 1 to 18"),
      strokes: z.number().describe("Gross strokes written in the box, a whole number"),
      par: z.number().describe("Par printed on the card for this hole, a whole number"),
    }),
  ),
  par_row_found: z.boolean().describe("Whether a printed par row was legible"),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string().describe("Anything unclear, in one short sentence"),
});

const PROMPT = `This is a photo of one team's row on a golf scorecard.

Report, for each hole where the written score is clearly legible:
- the hole number
- the gross strokes written in that box
- the par printed on the card for that hole

Rules:
- Omit any hole where the written score is blank, crossed out, smudged, or
  you are not confident. Do not guess or interpolate.
- Omit any hole where you cannot read the printed par.
- Scores are handwritten and pars are printed. Do not confuse the two rows.
- Ignore running totals, OUT, IN, and TOTAL columns. Only per-hole boxes.
- If the card shows several team rows, use the one that is clearly filled in
  or highlighted; say which in notes.

Set confidence low if the photo is blurry, angled, or partly cut off.`;

export type ExtractedHole = {
  hole: number;
  strokes: number;
  par: number;
  relative: number;
};

export type ExtractionResult =
  | {
      ok: true;
      holes: ExtractedHole[];
      confidence: "high" | "medium" | "low";
      notes: string;
      skipped: string[];
    }
  | { ok: false; error: string };

export async function extractScorecard(
  base64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
): Promise<ExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error:
        "Photo reading is not configured. An admin needs to set ANTHROPIC_API_KEY.",
    };
  }

  const client = new Anthropic();

  let response;
  try {
    response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(CardSchema) },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "The configured API key was rejected." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "Rate limited. Wait a moment and try again." };
    }
    if (error instanceof Anthropic.APIError) {
      // Log the whole thing for Vercel's runtime logs, and surface the API's
      // own words. A bare status code is not something anyone can act on.
      console.error("[scorecard] Anthropic API error", error.status, error.message);

      // The one 400 an admin can actually fix, and it arrives as a wall of
      // JSON. Nobody standing on a tee box should have to read that.
      if (/credit balance|billing|quota/i.test(error.message)) {
        return {
          ok: false,
          error:
            "The Anthropic account is out of credit, so photos cannot be read. " +
            "An admin can top it up at console.anthropic.com under Plans & Billing. " +
            "Enter scores by hand until then.",
        };
      }

      return {
        ok: false,
        error: `The API rejected that request (${error.status}): ${error.message}`,
      };
    }
    console.error("[scorecard] unexpected failure", error);
    return {
      ok: false,
      error: error instanceof Error ? `Failed: ${error.message}` : "Could not read that photo.",
    };
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    return { ok: false, error: "Could not make sense of that photo. Try a straighter, closer shot." };
  }
  if (!parsed.par_row_found) {
    return {
      ok: false,
      error:
        "Could not read the printed par row, so strokes cannot be converted. Include the par row in the shot, or enter those holes by hand.",
    };
  }

  const holes: ExtractedHole[] = [];
  const skipped: string[] = [];
  const seen = new Set<number>();

  for (const h of parsed.holes) {
    if (!Number.isInteger(h.hole) || !Number.isInteger(h.strokes) || !Number.isInteger(h.par)) {
      continue;
    }
    if (h.hole < 1 || h.hole > 18 || seen.has(h.hole)) continue;
    seen.add(h.hole);

    const relative = h.strokes - h.par;
    // Scores are unbounded, so an odd reading is surfaced for a second look
    // rather than dropped. A misread 14 on a par 4 is still a real possible
    // score; it just deserves to be noticed before it is saved.
    if (isUnusualScore(relative)) {
      skipped.push(`hole ${h.hole} read as ${h.strokes} on a par ${h.par}`);
    }
    holes.push({ hole: h.hole, strokes: h.strokes, par: h.par, relative });
  }

  holes.sort((a, b) => a.hole - b.hole);
  return { ok: true, holes, confidence: parsed.confidence, notes: parsed.notes, skipped };
}
