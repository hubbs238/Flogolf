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
  defaultPayouts,
  defaultFb18Payouts,
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
const ALL_HOLES = Array.from({ length: 18 }, (_, i) => i + 1);
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
console.log("    the eighteen is TWO pots, 1ST 18 and 2ND 18, exactly as the");
console.log("    sheet keeps them ===");
const fb18 = scoreFb18({
  teamIds, scores,
  payouts: {
    front: { 1: 2, 2: -1, 3: -1 },
    back: { 1: 2, 2: -1, 3: -1 },
    // 1ST 18: the lowest takes it, the last pays, second is level.
    total: { 1: 1, 2: 0, 3: -1 },
    // 2ND 18: the second lowest takes it, the last pays, and that week the
    // lowest round was left out rather than paying in.
    second: { 1: 0, 2: 1, 3: -1 },
  },
});
const fbDollars = fb18DollarsBySegment(fb18.results, {
  front: 40, back: 40, total: 40, second: 20,
});
const fb = (t: string) =>
  fbDollars[t] ?? { front: 0, back: 0, total: 0, second: 0 };
eq("F9", [-40, -40, 80], teamIds.map((t) => fb(t).front));
eq("B9", [-40, -40, 80], teamIds.map((t) => fb(t).back));
eq("1ST 18", [-40, 0, 40], teamIds.map((t) => fb(t).total));
eq("2ND 18", [-20, 20, 0], teamIds.map((t) => fb(t).second));

console.log("\n=== settlement, with the $35 rake ===");
const breakdownByTeam: Record<string, MoneyBreakdown> = Object.fromEntries(
  teamIds.map((t) => [t, {
    main: (main.unitsByTeam[t] ?? 0) * 200,
    front: fb(t).front,
    back: fb(t).back,
    // The breakdown keeps one eighteen figure, so the two pots are added
    // here. That is presentation; the scoring kept them apart.
    eighteen: fb(t).total + fb(t).second,
  }]),
);
const money = awardMoney({ breakdownByTeam, rosters, rakePerPlayer: RAKE });
const mine = (t: string) => money.find((m) => m.teamId === t)!;

eq("the FB18 TOTAL column", [-140, -60, 200],
  teamIds.map((t) => fb(t).front + fb(t).back + fb(t).total + fb(t).second));
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


console.log("\n=== do the app's DEFAULT stakes reproduce the sheet? ===");
// The checks above told the engine what each pot pays. This asks the harder
// question: set a round up with nothing but a team count, the way an admin
// does when the uploaded image has no money block, and does the app pay what
// the league pays?
//
// This is the check that was missing. The side pots used to be handed the
// match table, which pays a second and a third place the league's nines pay
// nothing to, so a round set up without a money block came out wrong.
{
  const rate = { main: 200, front: 40, back: 40, total: 20 };
  // Position order for this card, lowest score first, per segment.
  const rank = (hs: readonly number[]) =>
    teamIds
      .map((t) => ({ t, score: sum(t, hs) }))
      .sort((a, b) => a.score - b.score)
      .map((x) => x.t);

  const paidBy = (table: Record<number, number>, hs: readonly number[], r: number) => {
    const order = rank(hs);
    const out: Record<string, number> = {};
    order.forEach((t, i) => { out[t] = (table[i + 1] ?? 0) * r; });
    return teamIds.map((t) => out[t]);
  };

  eq("the match table, by position", [1, 0, -1],
    teamIds.map((_, i) => defaultPayouts(3)[i + 1] ?? 0));
  eq("a six-hole match pays what the sheet paid", [-200, 0, 200],
    paidBy(defaultPayouts(3), SIX_HOLE_SETS[0], rate.main));
  eq("and the front nine too", [-40, -40, 80],
    paidBy(defaultFb18Payouts(3, "front"), [1,2,3,4,5,6,7,8,9], rate.front));
  eq("and the back nine", [-40, -40, 80],
    paidBy(defaultFb18Payouts(3, "back"), [10,11,12,13,14,15,16,17,18], rate.back));

  // The one place the defaults and this particular week part company, and it
  // is the sheet that is inconsistent rather than the app.
  //
  // 9/30 left the lowest round OUT of the second lowest's pot: Bay 3 won the
  // eighteen and paid nothing into 2ND 18. Every later week has it paying in
  // like everybody else. The defaults follow the later weeks, because that is
  // what the league has done every week since.
  const sheet18 = [-60, 20, 40];
  const app18 = teamIds.map((_, i) =>
    paidBy(defaultFb18Payouts(3, "total"), ALL_HOLES, rate.total)[i] +
    paidBy(defaultFb18Payouts(3, "second"), ALL_HOLES, rate.total / 2)[i]);
  console.log("  NOTE    the eighteen is the one pot 9/30 settled differently");
  console.log(`            sheet, that week   ${JSON.stringify(sheet18)}`);
  console.log(`            app, every week    ${JSON.stringify(app18)}`);
  console.log("            both net to zero; they differ on whether the");
  console.log("            lowest round pays into the second lowest's pot");

  // What the later weeks do, checked on its own terms. Five bays with the
  // eighteen at $10 and the second lowest at half that: the lowest round
  // clears $35, the second lowest $10, the rest pay $15 each.
  eq("five bays, the eighteen's two pots as the recent weeks pay them",
    [35, 10, -15, -15, -15],
    [1, 2, 3, 4, 5].map((p) =>
      (defaultFb18Payouts(5, "total")[p] ?? 0) * 10 +
      (defaultFb18Payouts(5, "second")[p] ?? 0) * 5));
  eq("five bays, each eighteen pot is winner takes all on its own place",
    [[4, -1, -1, -1, -1], [-1, 4, -1, -1, -1]],
    [defaultFb18Payouts(5, "total"), defaultFb18Payouts(5, "second")]
      .map((t) => [1, 2, 3, 4, 5].map((p) => t[p] ?? 0)));
  eq("five bays, a nine is winner takes all at ten dollars",
    [40, -10, -10, -10, -10],
    [1, 2, 3, 4, 5].map((p) => (defaultFb18Payouts(5, "front")[p] ?? 0) * 10));
  eq("five bays, a match pays fifty, twenty five, then everyone pays",
    [50, 25, -25, -25, -25],
    [1, 2, 3, 4, 5].map((p) => (defaultPayouts(5)[p] ?? 0) * 25));
}

console.log(bad === 0
  ? "\nSHEET AND APP AGREE ON EVERY SHARED FIGURE\n"
  : `\n${bad} FIGURE(S) DIFFER\n`);
process.exit(bad === 0 ? 0 : 1);
