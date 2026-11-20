/**
 * Turning what a league sheet wrote into a date, or giving up cleanly.
 *
 * Pure and with the clock passed in, so the year guessing below can actually
 * be tested rather than reasoned about.
 */

/**
 * Reads a loose date off a sheet.
 *
 * League sheets write "9/30" with no year, which is only ambiguous once a
 * season crosses into January. Read in November, "9/30" is this season; read
 * in January, "9/30" is three months behind us, not nine months ahead. So a
 * bare month and day that would land in the FUTURE is pulled back a year,
 * which is the reading that is right every time for a sheet being entered
 * after the fact.
 *
 * A year written out is taken at its word, future or not, because then
 * somebody meant it.
 *
 * Anything that parses to nothing returns null, and the caller lets the round
 * take today. Guessing a date onto a round would quietly file a night in the
 * wrong week of the standings.
 */
export function isoFromLooseDate(raw: string | null | undefined, now = new Date()): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  const slash = text.match(/^(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?$/);
  if (slash) {
    const [, m, d, y] = slash;
    const month = Number(m);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    let year = y ? Number(y) : now.getUTCFullYear();
    if (y && year < 100) year += 2000;

    let when = Date.UTC(year, month - 1, day);
    // Guard against a rolled over date, so 2/30 is rejected rather than
    // silently becoming the 1st or 2nd of March.
    if (new Date(when).getUTCMonth() !== month - 1) return null;

    if (!y && when > now.getTime()) {
      when = Date.UTC(year - 1, month - 1, day);
      if (new Date(when).getUTCMonth() !== month - 1) return null;
    }
    return new Date(when).toISOString().slice(0, 10);
  }

  // "Oct 7", "October 7 2026", "2026-09-30" and the like. Date's own parsing
  // is loose, which is fine here: anything it refuses becomes null and the
  // admin sets the date themselves.
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}
