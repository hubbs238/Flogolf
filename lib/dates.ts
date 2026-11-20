/**
 * Turning what a league sheet wrote into a date, or giving up cleanly.
 *
 * Pure, and with the clock passed in, so the year guessing below can actually
 * be tested rather than reasoned about.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * Builds a UTC date, refusing anything that would roll over into the next
 * month. Date.UTC normalizes overflow, so 2/30 silently becomes 3/2 unless
 * the result is checked against what was asked for.
 */
function utcDay(year: number, month: number, day: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const when = Date.UTC(year, month - 1, day);
  const back = new Date(when);
  if (back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return when;
}

/**
 * A bare month and day carries no year, and the right guess is backwards.
 *
 * League sheets write "9/30". Read in November that is this season; read in
 * January it is three months behind us, not nine months ahead. Anything that
 * would land in the future is pulled back a year, which is the reading that
 * is right every time for a night being entered after it was played.
 */
function inferYear(month: number, day: number, now: Date): number | null {
  const thisYear = utcDay(now.getUTCFullYear(), month, day);
  if (thisYear === null) {
    // Feb 29 in a common year: try the leap year before it rather than
    // throwing the date away.
    const last = utcDay(now.getUTCFullYear() - 1, month, day);
    return last === null ? null : now.getUTCFullYear() - 1;
  }
  return thisYear > now.getTime() ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

/**
 * Reads a loose date off a sheet.
 *
 * Handles the two forms a league sheet actually uses, numeric ("9/30",
 * "10-7-26") and spelled ("Oct 7", "October 7 2026"), plus a full ISO date.
 * A year written out is taken at its word, future or not, because then
 * somebody meant it.
 *
 * Everything is assembled in UTC on purpose. The obvious version, handing the
 * string to `new Date` and calling toISOString, is wrong twice over: a
 * year-less "Oct 7" resolves to the year 2001, and a parsed local midnight
 * shifts back a day on any server east of Greenwich. Both file a night in the
 * wrong week of the standings, and the second only shows up once somebody
 * changes the server's timezone.
 *
 * Anything that does not parse returns null and the caller lets the round
 * take today, which is better than guessing a date onto it.
 */
export function isoFromLooseDate(raw: string | null | undefined, now = new Date()): string | null {
  if (!raw) return null;
  const text = raw.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!text) return null;

  const iso = (when: number) => new Date(when).toISOString().slice(0, 10);

  // 2026-09-30. Unambiguous, and the one form new Date reads as UTC anyway.
  const full = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (full) {
    const when = utcDay(Number(full[1]), Number(full[2]), Number(full[3]));
    return when === null ? null : iso(when);
  }

  // 9/30, 9-30, 10/7/26, 10/7/2026
  const numeric = text.match(/^(\d{1,2})\s*[/-]\s*(\d{1,2})(?:\s*[/-]\s*(\d{2,4}))?$/);
  if (numeric) {
    const month = Number(numeric[1]);
    const day = Number(numeric[2]);
    if (numeric[3]) {
      let year = Number(numeric[3]);
      if (year < 100) year += 2000;
      const when = utcDay(year, month, day);
      return when === null ? null : iso(when);
    }
    const year = inferYear(month, day, now);
    if (year === null) return null;
    const when = utcDay(year, month, day);
    return when === null ? null : iso(when);
  }

  // Oct 7, October 7 2026, 7 Oct 2026
  const spelled =
    text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s+(\d{2,4}))?$/) ??
    text.match(/^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{2,4}))?$/);
  if (spelled) {
    const monthFirst = /^[A-Za-z]/.test(spelled[1]);
    const monthWord = (monthFirst ? spelled[1] : spelled[2]).toLowerCase();
    const day = Number(monthFirst ? spelled[2] : spelled[1]);
    const month = MONTHS[monthWord];
    if (!month) return null;

    if (spelled[3]) {
      let year = Number(spelled[3]);
      if (year < 100) year += 2000;
      const when = utcDay(year, month, day);
      return when === null ? null : iso(when);
    }
    const year = inferYear(month, day, now);
    if (year === null) return null;
    const when = utcDay(year, month, day);
    return when === null ? null : iso(when);
  }

  // Deliberately no new Date fallback. Everything it would accept beyond the
  // forms above it also mangles, and a null here just means the admin sets
  // the date themselves on a form that is already in front of them.
  return null;
}
