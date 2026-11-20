/**
 * Runs a real card from the Wednesday Degent spreadsheet through this app's
 * own engine and diffs every figure against what the sheet reports.
 *
 * The sheet is the league's hand-kept book of record. Nothing below is
 * hand-computed on the app's side: the left column of each check is the
 * figure off the sheet, the right is whatever lib/game.ts returns. If the two
 * ever part company, one of them has drifted and this says which figure.
 *
 * Card: 9/30, three bays, three six-hole sets. Rosters of 5, 4 and 4, which
 * is what the sheet's own rake column implies at $35 a player.
 *
 *   npm run audit-sheet
 */
import {
  SIX_HOLE_SETS,
  scoreMainGame,
  scoreFb18,
  fb18DollarsBySegment,
  awardMoney,
  nineTotals,
  type HoleScores,
  type MoneyBreakdown,
} from "../lib/game";

const holes = (row: number[]) => Object.fromEntries(row.map((v, i) => [i + 1, v]));
const sum = (team: string, hs: readonly number[]) =>
  hs.reduce((n, h) => n + (scores[team][h] ?? 0), 0);

/** Relative-to-par hole scores, straight off the sheet. */
const scores: HoleScores = {
  "Bay 1": holes([ 0, 0,-1, 0,-1, 0,-1, 0,-1,  -1, 0, 0, 0, 0, 0, 0, 0, 0]),
  "Bay 2": holes([-1,-1,-1, 0, 0, 0,-1,-1,-1,  -1, 0,-1,-1, 0, 0,-1,-1,-1]),
  "Bay 3": holes([-1,-1,-1, 0,-1,-1,-1, 0,-1,  -1,-1,-1, 0,-1,-2, 0,-1,-1]),
};
const teamIds = ["Bay 1", "Bay 2", "Bay 3"];
const rosters: Record<string, string[]> = {
  "Bay 1": ["a", "b", "c", "d", "e"],
  "Bay 2": ["f", "g", "h", "i"],
  "Bay 3": ["j", "k", "l", "m"],
};
const RAKE = 35;
const size = (t: string) => rosters[t].length;

let bad = 0;
function eq(label: string, sheet: unknown, app: unknown) {
  const ok = JSON.stringify(sheet) === JSON.stringify(app);
  if (!ok) bad++;
  console.log(`  ${ok ? "MATCH " : "DIFFER"}  ${label}`);
  if (!ok) console.log(`            sheet ${JSON.stringify(sheet)}\n            app   ${JSON.stringify(app)}`);
}

console.log("\n=== the segment scores the sheet reports ===");
eq("F6", [-2, -3, -5], teamIds.map((t) => sum(t, SIX_HOLE_SETS[0])));
eq("M6", [-3, -5, -5], teamIds.map((t) => sum(t, SIX_HOLE_SETS[1])));
eq("L6", [0, -4, -5], teamIds.map((t) => sum(t, SIX_HOLE_SETS[2])));
eq("F9, B9 and the eighteen",
  [[-4, -1, -5], [-6, -6, -12], [-7, -8, -15]],
  teamIds.map((t) => {
    const n = nineTotals(scores[t]);
    return [n.front, n.back, n.total];
  }));

console.log("\n=== main game: 1st +1, 2nd 0, 3rd -1, at $200 a unit ===");
// The sheet settled the middle six, where Bay 2 and Bay 3 both posted -5, in
// Bay 2's favour. Sudden death on the next hole is what does that: hole 13
// reads Bay 2 -1 against Bay 3 level.
const main = scoreMainGame({
  teamIds, scores, payouts: { 1: 1, 2: 0, 3: -1 },
  decisions: {}, tieDefault: "hole", segments: SIX_HOLE_SETS,
});
const setDollars = (team: string) =>
  main.segments.map((s) => (s.awards.find((a) => a.teamId === team)?.units ?? 0) * 200);
eq("F6, M6, B6 for Bay 1", [-200, -200, -200], setDollars("Bay 1"));
eq("F6, M6, B6 for Bay 2", [0, 200, 0], setDollars("Bay 2"));
eq("F6, M6, B6 for Bay 3", [200, 0, 200], setDollars("Bay 3"));
eq("the TOTAL column", [-600, 200, 400],
  teamIds.map((t) => (main.unitsByTeam[t] ?? 0) * 200));

console.log("\n=== FB18: the nines pay 1st +2 and the rest -1 at $40;");
console.log("    the eighteen pays 1st +2, 2nd +1, 3rd -3 at $20, which is the");
console.log("    sheet's 1ST 18 and 2ND 18 columns rolled into one pot ===");
const fb18 = scoreFb18({
  teamIds, scores,
  payouts: {
    front: { 1: 2, 2: -1, 3: -1 },
    back: { 1: 2, 2: -1, 3: -1 },
    total: { 1: 2, 2: 1, 3: -3 },
  },
});
const fbDollars = fb18DollarsBySegment(fb18.results, { front: 40, back: 40, total: 20 });
const fb = (t: string) => fbDollars[t] ?? { front: 0, back: 0, total: 0 };
eq("F9", [-40, -40, 80], teamIds.map((t) => fb(t).front));
eq("B9", [-40, -40, 80], teamIds.map((t) => fb(t).back));
eq("1ST 18 and 2ND 18 added together", [-60, 20, 40], teamIds.map((t) => fb(t).total));

console.log("\n=== settlement, with the $35 rake ===");
const breakdownByTeam: Record<string, MoneyBreakdown> = Object.fromEntries(
  teamIds.map((t) => [t, {
    main: (main.unitsByTeam[t] ?? 0) * 200,
    front: fb(t).front,
    back: fb(t).back,
    eighteen: fb(t).total,
  }]),
);
const money = awardMoney({ breakdownByTeam, rosters, rakePerPlayer: RAKE });
const mine = (t: string) => money.find((m) => m.teamId === t)!;

eq("the FB18 TOTAL column", [-140, -60, 200],
  teamIds.map((t) => fb(t).front + fb(t).back + fb(t).total));
eq("the RAKE column, which is the rake times the roster",
  [-175, -140, -140], teamIds.map((t) => -RAKE * size(t)));
eq("BALANCE TEAM", [-915, 0, 460], teamIds.map((t) => {
  const b = breakdownByTeam[t];
  return b.main + b.front + b.back + b.eighteen - RAKE * size(t);
}));

console.log("\n=== team-settled against player-settled ===");
// This is the one place the two books part company, and it is a convention
// rather than an error, so it is reported rather than failed. Everything
// above it is a hard check: if any of those start differing, something has
// actually drifted.
//
// The sheet settles at the TEAM and divides: a bay clears $460 between them
// and each of its four players takes $115. The app settles per PLAYER and
// rolls up: a unit is worth its full dollar value to everyone on the roster,
// so the same bay pays $460 to each of four players and the team figure
// becomes $1,840.
//
// Both are internally consistent, and they agree exactly when the rate is
// read as a per player rate rather than a per bay one, which is how the
// sheet's own later weeks write it: $25 and $50 a man, not $200 a bay.
//
// The difference that is not just presentation: dividing always balances,
// whatever the rosters. Paying each player in full only balances when every
// team fields the same number, which this card does not.
const sheetIndividual = teamIds.map((t) => {
  const b = breakdownByTeam[t];
  return Math.round((b.main + b.front + b.back + b.eighteen - RAKE * size(t)) / size(t));
});
eq("BALANCE INDIVIDUAL, the sheet dividing the team figure by the roster",
  [-183, 0, 115], sheetIndividual);

const appIndividual = teamIds.map((t) => Math.round(mine(t).dollars));
console.log("  NOTE    the app pays each player the team's full figure instead");
console.log(`            sheet, divided   ${JSON.stringify(sheetIndividual)}`);
console.log(`            app, in full     ${JSON.stringify(appIndividual)}`);

const balance = (rows: number[]) =>
  Math.round(teamIds.reduce((n, t, i) => n + rows[i] * size(t), 0) * 100) / 100;
const rakeOut = -RAKE * teamIds.reduce((n, t) => n + size(t), 0);
console.log(`\n  the rake takes $${-rakeOut} out of the group, so a settled card should`);
console.log(`  add up to ${rakeOut} across every player`);
console.log(`            sheet, divided   ${balance(sheetIndividual)}`);
console.log(`            app, in full     ${balance(appIndividual)}`);

console.log(bad === 0
  ? "\nSHEET AND APP AGREE ON EVERY SHARED FIGURE\n"
  : `\n${bad} FIGURE(S) DIFFER\n`);
process.exit(bad === 0 ? 0 : 1);
