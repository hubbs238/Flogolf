import {
  awardMoney,
  defaultPayouts,
  defaultFb18Payouts,
  FB18_SEGMENTS,
  SECOND_EIGHTEEN_RATE_SHARE,
  nameKey,
  MIN_TEAM_SIZE,
  MAX_TEAM_SIZE,
  cupPointsForPlayers,
  cupDollarsOf,
  fb18DollarsBySegment,
  resolveSuddenDeath,
  pointsForRound,
  roundPoints,
  BONUS_POINTS,
  SIX_HOLE_SETS,
  POINT_MULTIPLIER,
  scoreBonusPoints,
  scoreFb18,
  scoreMainGame,
  type HoleScores,
  type PayoutTable,
  segmentsFor,
  setLengthOf,
} from "../lib/game";
import { modeFrom } from "../lib/view-mode";
import { checkMoves, movedDecisionKey, movedScores, type ScoreRow } from "../lib/score-move";
import { isoFromLooseDate } from "../lib/dates";
import { convertReading, deriveStakes, type RawReading } from "../lib/round-reading";

/** Shorthand for a money breakdown in fixtures. */
function bd(main: number, front = 0, back = 0, eighteen = 0) {
  return { main, front, back, eighteen };
}

/** Shorthand for a PlayerMoney fixture. */
function pm(golferId: string, teamId: string, main: number, extra = 0, rake = 0) {
  const breakdown = bd(main, extra);
  const winnings = main + extra;
  return {
    golferId, teamId,
    winnings,
    rake,
    dollars: winnings - rake,
    cupDollars: main,
    breakdown,
  };
}


/**
 * Most money tests use bays of one or two to isolate a rule (rake, Cup
 * eligibility), not to test the four-share split. They ask for a share per
 * man on the first bay, so those bays take the per-man figure unscaled. The
 * split itself has its own tests further down.
 */
function awardMoneyAt(opts: Parameters<typeof awardMoney>[0]) {
  const first = Object.values(opts.rosters)[0]?.length ?? 1;
  return awardMoney({ shares: first, ...opts });
}

let failures = 0;
function check(label: string, got: unknown, want: unknown) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  const ok = a === b;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        got  ${a}\n        want ${b}`);
}

/** Builds a hole map from an array of 18 (or fewer) scores. */
function card(...strokes: (number | undefined)[]): Record<number, number | undefined> {
  const out: Record<number, number | undefined> = {};
  strokes.forEach((s, i) => {
    if (s !== undefined) out[i + 1] = s;
  });
  return out;
}

const TEAMS = ["A", "B", "C", "D", "E", "F", "G"];

// 1st +3, 2nd +1, 3rd 0, 4th..7th -1 each. Sums to zero.
const PAYOUTS: PayoutTable = { 1: 3, 2: 1, 3: 0, 4: -1, 5: -1, 6: -1, 7: -1 };

// Segment 1 totals: A 11, B 11, C 12, D 13, E 14, F 14, G 15
// Hole 4 separates A (4) from B (5).
const scores: HoleScores = {
  A: card(4, 4, 3, 4),
  B: card(3, 4, 4, 5),
  C: card(4, 4, 4, 4),
  D: card(4, 4, 5, 4),
  E: card(5, 4, 5, 4),
  F: card(4, 5, 5, 4),
  G: card(5, 5, 5, 4),
};

console.log("\n=== the worked example, segment 1 ===");
console.log("A 11  B 11  C 12  D 13  E 14  F 14  G 15\n");

console.log("-- tie default: HOLE (sudden death on hole 4) --");
{
  const { segments, unitsByTeam } = scoreMainGame({
    teamIds: TEAMS, scores, payouts: PAYOUTS, decisions: {}, tieDefault: "hole",
  });
  const s1 = segments[0];
  check("segment 1 complete", s1.status, "complete");
  check("A takes 1st, +3", unitsByTeam.A, 3);
  check("B takes 2nd, +1", unitsByTeam.B, 1);
  check("C 3rd, 0", unitsByTeam.C, 0);
  check("D 4th, -1", unitsByTeam.D, -1);
  check("E and F split 5th/6th, both -1", [unitsByTeam.E, unitsByTeam.F], [-1, -1]);
  check("G 7th, -1", unitsByTeam.G, -1);

  const efTie = s1.ties.find((t) => t.teamIds.join() === "E,F");
  check("E/F tie needs no ruling (both -1)", efTie?.needsDecision, false);
  const abTie = s1.ties.find((t) => t.teamIds.join() === "A,B");
  check("A/B tie does need a ruling", abTie?.needsDecision, true);

  const total = TEAMS.reduce((n, t) => n + unitsByTeam[t], 0);
  check("units sum to zero", total, 0);
}

console.log("\n-- tie ruling: SET (units roll into match 2) --");
{
  const { segments, unitsByTeam } = scoreMainGame({
    teamIds: TEAMS, scores, payouts: PAYOUTS,
    decisions: { "1:A+B": "set" }, tieDefault: "hole",
  });
  const s1 = segments[0];
  check("A collects nothing in match 1", unitsByTeam.A, 0);
  check("B collects nothing in match 1", unitsByTeam.B, 0);
  check("A flagged as carried forward",
    s1.awards.find((a) => a.teamId === "A")?.carriedForward, true);
  check("1st and 2nd roll forward as 3 and 1", s1.carriedOut, { 1: 3, 2: 1 });
  check("match 2 carries them in", segments[1].carriedIn, { 1: 3, 2: 1 });
  check("everyone else still paid", [unitsByTeam.C, unitsByTeam.D, unitsByTeam.G], [0, -1, -1]);
}

console.log("\n=== sudden death ===");
{
  // A and B tie again on hole 4, separate on hole 5.
  const s: HoleScores = { A: card(4, 4, 3, 4, 3), B: card(3, 4, 4, 4, 4) };
  check("runs past the first hole", resolveSuddenDeath(["A", "B"], 4, s), [["A"], ["B"]]);
}
{
  // Three-way: hole 4 peels off A, then B and C separate on hole 5.
  const s: HoleScores = {
    A: card(4, 4, 3, 3, 4), B: card(3, 4, 4, 4, 3), C: card(4, 3, 4, 4, 4),
  };
  check("partial separation, then the rest", resolveSuddenDeath(["A", "B", "C"], 4, s),
    [["A"], ["B"], ["C"]]);
}
{
  const s: HoleScores = { A: card(4, 4, 3, 4), B: card(3, 4, 4, 4) };
  check("null while the deciding hole is unplayed", resolveSuddenDeath(["A", "B"], 5, s), null);
}

console.log("\n=== a tie that never breaks splits evenly ===");
{
  // Two teams, dead level all eighteen. 1st +3 and 2nd +1 is 4 units
  // between them, so 2 each per segment, six segments.
  const same = Array.from({ length: 18 }, () => 4);
  const s: HoleScores = { A: card(...same), B: card(...same) };
  const { segments, unitsByTeam } = scoreMainGame({
    teamIds: ["A", "B"], scores: s,
    payouts: { 1: 3, 2: 1 }, decisions: {}, tieDefault: "hole",
  });
  check("each takes half the block, every segment",
    segments[0].awards.map((a) => a.units), [2, 2]);
  check("flagged as a shared split",
    segments[0].awards.every((a) => a.splitShare === true), true);
  check("six segments at 2 apiece", [unitsByTeam.A, unitsByTeam.B], [12, 12]);
}
{
  // Three teams level: 1st +3, 2nd +1, 3rd 0 is 4 units three ways.
  const same = Array.from({ length: 18 }, () => 4);
  const s: HoleScores = { A: card(...same), B: card(...same), C: card(...same) };
  const { segments } = scoreMainGame({
    teamIds: ["A", "B", "C"], scores: s,
    payouts: { 1: 3, 2: 1, 3: 0 }, decisions: {}, tieDefault: "hole",
  });
  check("three way split of 4 units",
    segments[0].awards.map((a) => a.units), [1.333, 1.333, 1.333]);
}
{
  // A carryover in the last segment has nowhere to roll, so it shares out.
  const same = Array.from({ length: 18 }, () => 4);
  const s: HoleScores = { A: card(...same), B: card(...same) };
  const { segments } = scoreMainGame({
    teamIds: ["A", "B"], scores: s,
    payouts: { 1: 3, 2: 1 }, decisions: { "6:A+B": "set" }, tieDefault: "hole",
  });
  check("final segment carryover splits instead of vanishing",
    segments[5].awards.map((a) => a.units), [2, 2]);
}

console.log("\n=== FB18 ===");
{
  // Front nine: A 36, B 36, C 38. A and B tie.
  // Back nine:  A 35, B 38, C 36. A would win the front on the back nine.
  //
  // For MONEY it does not get the chance: the league's book splits a front
  // nine tie, so A and B share the pot. On 10/28 Bay 1 and Bay 7 both went -5
  // on the front and the sheet paid them $15 each, where settling it on the
  // back nine handed Bay 1 the whole $40. The back nine rule belongs to the
  // Cup bonus, and the same card shows it still applies there.
  const s: HoleScores = {
    A: card(4,4,4,4,4,4,4,4,4, 4,4,4,4,4,4,4,4,3),
    B: card(4,4,4,4,4,4,4,4,4, 5,4,4,4,4,4,4,4,5),
    C: card(4,4,4,4,4,4,4,5,5, 4,4,4,4,4,4,4,4,4),
  };
  const { results, unitsByTeam } = scoreFb18({
    teamIds: ["A", "B", "C"], scores: s,
    payouts: { front: { 1: 2, 2: 0, 3: -2 }, back: { 1: 2, 2: 0, 3: -2 }, total: { 1: 2, 2: 0, 3: -2 } },
  });
  const front = results.find((r) => r.segment === "front")!;
  const frontUnits = (t: string) => front.awards.find((a) => a.teamId === t)?.units;
  check("front nine totals", [front.totals.A, front.totals.B, front.totals.C], [36, 36, 38]);
  check("a front nine money tie is split, not settled on the back nine",
    [frontUnits("A"), frontUnits("B"), frontUnits("C")], [1, 1, -2]);
  check("both tied bays share first place",
    [front.awards.find((a) => a.teamId === "A")?.position,
     front.awards.find((a) => a.teamId === "B")?.position], [1, 1]);
  const back = results.find((r) => r.segment === "back")!;
  check("back nine totals", [back.totals.A, back.totals.B, back.totals.C], [35, 38, 36]);
  check("A wins the back and the eighteen and shares the front", unitsByTeam.A, 5);

  const bonus = scoreBonusPoints(["A", "B", "C"], s, 1);
  check("but the Cup bonus still settles that front nine tie on the back nine",
    bonus.segments.find((b) => b.segment === "front")?.winners, ["A"]);

  // Asking for the back nine explicitly still works, for anything that wants it.
  const backNine = scoreFb18({
    teamIds: ["A", "B", "C"], scores: s, frontTiebreak: "back-nine",
    payouts: { front: { 1: 2, 2: 0, 3: -2 } },
  });
  check("the back nine rule is still there when asked for",
    backNine.results[0].awards.find((a) => a.teamId === "A")?.units, 2);
}
{
  // Dead level over eighteen with nothing left to break it.
  const same = Array.from({ length: 18 }, () => 4);
  const s: HoleScores = { A: card(...same), B: card(...same) };
  const { results } = scoreFb18({
    teamIds: ["A", "B"], scores: s,
    payouts: { front: { 1: 2, 2: -2 }, back: { 1: 2, 2: -2 }, total: { 1: 2, 2: -2 } },
  });
  const total = results.find((r) => r.segment === "total")!;
  check("eighteen hole tie shares the prize", total.split, [1, 2]);
  // 1st +2 and 2nd -2 is 0 between them, so an even split is 0 each.
  check("a symmetric table nets to nothing", total.awards.map((a) => a.units), [0, 0]);
}

console.log("\n=== a unit pays every player, it is not divided ===");
{
  // 3 units at $100 is $300 each, so a four man team collects $1,200.
  const money = awardMoneyAt({
    breakdownByTeam: { t1: bd(300), t2: bd(-300) },
    rosters: { t1: ["p1", "p2", "p3", "p4"], t2: ["p5", "p6", "p7", "p8"] },
  });
  check("every winner earns the full 300",
    money.filter((m) => m.teamId === "t1").map((m) => m.dollars), [300, 300, 300, 300]);
  check("team of four collects 1200",
    money.filter((m) => m.teamId === "t1").reduce((n, m) => n + m.dollars, 0), 1200);
  check("losers each pay the full 300",
    money.filter((m) => m.teamId === "t2").map((m) => m.dollars), [-300, -300, -300, -300]);
}
{
  // Roster size no longer divides anything, it multiplies the team total.
  const money = awardMoneyAt({
    breakdownByTeam: { t1: bd(90) },
    rosters: { t1: ["p1", "p2", "p3"] },
  });
  check("a man short still earns the same each",
    money.map((m) => m.dollars), [90, 90, 90]);
  check("so the team total is 270, not 90",
    money.reduce((n, m) => n + m.dollars, 0), 270);
}

console.log("\n=== FB18 top teams share an unbroken tie ===");
{
  // Level over all eighteen. 1st +4, 2nd 0, so 4 units between two teams.
  const same = Array.from({ length: 18 }, () => 0);
  const s: HoleScores = { A: card(...same), B: card(...same) };
  const { results } = scoreFb18({
    teamIds: ["A", "B"], scores: s,
    payouts: { front: { 1: 4, 2: 0 }, back: { 1: 4, 2: 0 }, total: { 1: 4, 2: 0 } },
  });
  const total = results.find((r) => r.segment === "total")!;
  check("2 units each, not nothing", total.awards.map((a) => a.units), [2, 2]);
  check("flagged as shared", total.awards.every((a) => a.splitShare === true), true);
  check("both contested places listed", total.split, [1, 2]);

  // A three way tie divides the same pot three ways.
  const s3: HoleScores = { A: card(...same), B: card(...same), C: card(...same) };
  const r3 = scoreFb18({
    teamIds: ["A", "B", "C"], scores: s3,
    payouts: { front: { 1: 6, 2: 0, 3: 0 }, back: { 1: 6, 2: 0, 3: 0 }, total: { 1: 6, 2: 0, 3: 0 } },
  }).results.find((r) => r.segment === "total")!;
  check("three way tie splits 6 units", r3.awards.map((a) => a.units), [2, 2, 2]);
}

console.log("\n=== each FB18 segment converts at its own rate ===");
{
  // Front nine and back nine at $20 a unit, the eighteen at $50.
  //   A: front -9, back -1, total -10  -> wins the front and the eighteen
  //   B: front  0, back -2, total  -2  -> wins the back
  // So A collects 20 + 50 = 70, B collects 20.
  const A = Array.from({ length: 18 }, (_, i) => (i < 9 ? -1 : 0));
  A[9] = -1;
  const B = Array.from({ length: 18 }, () => 0);
  B[9] = -1; B[10] = -1;
  const s: HoleScores = { A: card(...A), B: card(...B) };
  const { results } = scoreFb18({
    teamIds: ["A", "B"], scores: s,
    payouts: { front: { 1: 1, 2: 0 }, back: { 1: 1, 2: 0 }, total: { 1: 1, 2: 0 } },
  });
  const seg = fb18DollarsBySegment(results, { front: 20, back: 20, total: 50 });
  const sum = (id: string) => seg[id].front + seg[id].back + seg[id].total;
  check("A: front $20 plus the eighteen $50", sum("A"), 70);
  check("B: back nine only, $20", sum("B"), 20);
  check("and it says which segment each came from",
    [seg.A.front, seg.A.back, seg.A.total], [20, 0, 50]);

  const flatSeg = fb18DollarsBySegment(results, { front: 20, back: 20, total: 20 });
  const flat = {
    A: flatSeg.A.front + flatSeg.A.back + flatSeg.A.total,
    B: flatSeg.B.front + flatSeg.B.back + flatSeg.B.total,
  };
  check("same units, one flat rate, totals differ", [flat.A, flat.B], [40, 20]);
}

console.log("\n=== FB18 money does not move the Cup on a season round ===");
{
  // $180 from the main game, $120 across the FB18 segments.
  const card = {
    breakdownByTeam: { t1: bd(180, 40, 30, 50) },
    rosters: { t1: ["p1", "p2", "p3", "p4"] },
  };
  const money = awardMoneyAt(card);
  check("money column reports the full figure", money[0].dollars, 300);
  check("Cup figure excludes FB18 entirely", money[0].cupDollars, 180);
  check("and the breakdown says where it came from",
    money[0].breakdown, { main: 180, front: 40, back: 30, eighteen: 50 });

  // The same card under major rules. Every dollar converts there.
  const major = awardMoneyAt({ ...card, cupEligible: "all" });
  check("a major counts every dollar won", major[0].cupDollars, 300);
  check("which is the winnings figure exactly, gross of rake",
    major[0].cupDollars, major[0].winnings);
  check("and the breakdown is untouched either way",
    major[0].breakdown, money[0].breakdown);

  check("the default is the season rule, so a caller who forgets cannot pay twice",
    awardMoneyAt(card)[0].cupDollars, 180);
  check("and the helper agrees with both",
    [cupDollarsOf(bd(180, 40, 30, 50), "main"), cupDollarsOf(bd(180, 40, 30, 50), "all")],
    [180, 300]);
}

console.log("\n=== rake never reach the Cup figure, on either round type ===");
{
  const card = {
    breakdownByTeam: { t1: bd(100, 10, 10, 10) },
    rosters: { t1: ["p1"] },
    rakePerPlayer: 35,
  };
  const season = awardMoneyAt(card)[0];
  const major = awardMoneyAt({ ...card, cupEligible: "all" })[0];
  check("matches only: Cup figure is the matches, before rake", season.cupDollars, 100);
  check("everything: Cup figure is the winnings, before rake", major.cupDollars, 130);
  check("the rake only comes off what changes hands",
    [season.dollars, major.dollars], [95, 95]);
}

console.log("\n=== bonus points: 10 front, 10 back, 15 for the eighteen ===");
{
  //   A: front -3, back  0, total -3  -> wins the front and the eighteen
  //   B: front  0, back -2, total -2  -> wins the back
  //   C: level everywhere             -> wins nothing
  const par = Array.from({ length: 18 }, () => 0);
  const A = [...par]; A[0] = -1; A[1] = -1; A[2] = -1;
  const B = [...par]; B[9] = -1; B[10] = -1;

  const s: HoleScores = { A: card(...A), B: card(...B), C: card(...par) };
  const { segments, pointsByTeam } = scoreBonusPoints(["A", "B", "C"], s);

  const seg = (name: string) => segments.find((x) => x.segment === name)!;
  check("front nine: one winner, 10 points",
    [seg("front").winners, seg("front").each], [["A"], 10]);
  check("back nine: one winner, 10 points",
    [seg("back").winners, seg("back").each], [["B"], 10]);
  check("all eighteen: one winner, 15 points",
    [seg("total").winners, seg("total").each], [["A"], 15]);
  check("second place pays nothing anywhere", pointsByTeam.C, 0);
  check("a team can take more than one", pointsByTeam, { A: 25, B: 10, C: 0 });
}
{
  // A front nine tie is settled on the back nine among the tied teams.
  //   A: front -2, back -1, total -3
  //   B: front -2, back -3, total -5
  const par = Array.from({ length: 18 }, () => 0);
  const A = [...par]; A[0] = -2; A[9] = -1;
  const B = [...par]; B[0] = -2; B[9] = -3;

  const s: HoleScores = { A: card(...A), B: card(...B) };
  const { segments, pointsByTeam } = scoreBonusPoints(["A", "B"], s);
  const front = segments.find((x) => x.segment === "front")!;

  check("a front nine tie carries to the back nine", front.winners, ["B"]);
  check("and the winner takes the full 10, not a share", front.each, 10);
  check("B sweeps all three", pointsByTeam, { A: 0, B: 35 });
}
{
  // Level after eighteen and nothing left to settle it: split the 15.
  //   A: front -1, back -1, total -2
  //   B: front -2, back  0, total -2
  const par = Array.from({ length: 18 }, () => 0);
  const A = [...par]; A[0] = -1; A[9] = -1;
  const B = [...par]; B[0] = -2;

  const s: HoleScores = { A: card(...A), B: card(...B) };
  const { segments, pointsByTeam } = scoreBonusPoints(["A", "B"], s);
  const total = segments.find((x) => x.segment === "total")!;

  check("a tie after eighteen names both teams", total.winners, ["A", "B"]);
  check("and splits the 15 between them", total.each, 7.5);
  check("each side keeps its own nine plus half the eighteen",
    pointsByTeam, { A: 17.5, B: 17.5 });
}
{
  const partial = Array.from({ length: 17 }, () => 0);
  const s: HoleScores = { A: card(...partial), B: card(...partial) };
  const { segments, pointsByTeam } = scoreBonusPoints(["A", "B"], s);

  check("the eighteen stays pending while a card is unfinished",
    segments.find((x) => x.segment === "total")!.status, "pending");
  check("and awards nothing off a partial card",
    segments.find((x) => x.segment === "total")!.winners, []);
  check("the finished front nine still pays",
    segments.find((x) => x.segment === "front")!.status, "complete");
  check("so nobody banks the eighteen early", pointsByTeam, { A: 5, B: 5 });
}

console.log("\n=== settlement includes every FB18 segment ===");
{
  //   A: front -9, back -1, total -10  -> wins front and the eighteen
  //   B: front  0, back -2, total  -2  -> wins the back
  const A = Array.from({ length: 18 }, (_, i) => (i < 9 ? -1 : 0)); A[9] = -1;
  const B = Array.from({ length: 18 }, () => 0); B[9] = -1; B[10] = -1;
  const s: HoleScores = { A: card(...A), B: card(...B) };

  const { results } = scoreFb18({
    teamIds: ["A", "B"], scores: s,
    payouts: { front: { 1: 1, 2: -1 }, back: { 1: 1, 2: -1 }, total: { 1: 1, 2: -1 } },
  });
  const perSeg = fb18DollarsBySegment(results, { front: 20, back: 20, total: 50 });
  const fb = {
    A: perSeg.A.front + perSeg.A.back + perSeg.A.total,
    B: perSeg.B.front + perSeg.B.back + perSeg.B.total,
  };

  // A: +20 front, -20 back, +50 eighteen = +50. B is the mirror.
  check("FB18 nets out per team", [fb.A, fb.B], [50, -50]);

  // Main game gave A +100 a head. Settlement must carry both.
  const money = awardMoneyAt({
    breakdownByTeam: {
      A: { main: 100, front: perSeg.A.front, back: perSeg.A.back, eighteen: perSeg.A.total },
      B: { main: -100, front: perSeg.B.front, back: perSeg.B.back, eighteen: perSeg.B.total },
    },
    rosters: { A: ["a1", "a2"], B: ["b1", "b2"] },
  });
  check("settlement is main game plus all three segments",
    [money.find((m) => m.golferId === "a1")!.dollars,
     money.find((m) => m.golferId === "b1")!.dollars], [150, -150]);
  check("Cup figure still ignores FB18 on a season round",
    money.find((m) => m.golferId === "a1")!.cupDollars, 100);
}

console.log("\n=== points never go below zero ===");
{
  const pts = roundPoints({
    money: [
      pm("p1", "t1", 500, 0),
      pm("p2", "t2", -500, 0),
    ],
    bonusByTeam: {},
    rosters: { t1: ["p1"], t2: ["p2"] },
  });
  check("a big win still scores in full", pts.find((p) => p.golferId === "p1")!.total, 500);
  check("a heavy loss floors at 0", pts.find((p) => p.golferId === "p2")!.total, 0);
  check("and reads 0 from money, not a negative", pts.find((p) => p.golferId === "p2")!.fromMoney, 0);
}
{
  // A bad round cannot eat an earlier good one: it contributes 0 rather
  // than subtracting.
  const season = [100, -400, 30].map((cupDollars) =>
    roundPoints({
      money: [pm("p1", "t1", cupDollars)],
      bonusByTeam: {}, rosters: { t1: ["p1"] },
    })[0].total,
  );
  check("round by round: 100, 0, 30", season, [100, 0, 30]);
  check("season keeps the good weeks", season.reduce((a, b) => a + b, 0), 130);
}

console.log("\n=== changing a rate moves every player's money ===");
{
  //   A: front -9, back -1, total -10  -> wins front and the eighteen
  //   B: front  0, back -2, total  -2  -> wins the back
  const A = Array.from({ length: 18 }, (_, i) => (i < 9 ? -1 : 0)); A[9] = -1;
  const B = Array.from({ length: 18 }, () => 0); B[9] = -1; B[10] = -1;
  const s: HoleScores = { A: card(...A), B: card(...B) };

  const { results } = scoreFb18({
    teamIds: ["A", "B"], scores: s,
    payouts: { front: { 1: 1, 2: -1 }, back: { 1: 1, 2: -1 }, total: { 1: 1, 2: -1 } },
  });

  const rosters = { A: ["a1", "a2", "a3", "a4"], B: ["b1", "b2", "b3", "b4"] };

  const settle = (rates: { front: number; back: number; total: number }) => {
    const fb = fb18DollarsBySegment(results, rates);
    const seg = (id: string) => fb[id] ?? { front: 0, back: 0, total: 0 };
    return awardMoneyAt({
      breakdownByTeam: {
        A: { main: 100, front: seg("A").front, back: seg("A").back, eighteen: seg("A").total },
        B: { main: -100, front: seg("B").front, back: seg("B").back, eighteen: seg("B").total },
      },
      rosters,
    });
  };

  // Before: every segment at $20. A takes front and eighteen, drops the back.
  const before = settle({ front: 20, back: 20, total: 20 });
  check("before: each A player on 120",
    before.filter((m) => m.teamId === "A").map((m) => m.dollars), [120, 120, 120, 120]);

  // After: the eighteen revalued to $80, the nines untouched.
  const after = settle({ front: 20, back: 20, total: 80 });
  check("after: each A player on 180",
    after.filter((m) => m.teamId === "A").map((m) => m.dollars), [180, 180, 180, 180]);
  check("and every B player moves the other way",
    after.filter((m) => m.teamId === "B").map((m) => m.dollars), [-180, -180, -180, -180]);
  check("all four teammates move together, nobody left behind",
    new Set(after.filter((m) => m.teamId === "A").map((m) => m.dollars)).size, 1);

  // Cup points are untouched: FB18 money never fed them.
  check("Cup figure unchanged by an FB18 rate change",
    after.find((m) => m.golferId === "a1")!.cupDollars,
    before.find((m) => m.golferId === "a1")!.cupDollars);
}

console.log("\n=== rake come off settlement, never off points ===");
{
  const money = awardMoneyAt({
    breakdownByTeam: { t1: bd(180, 40, 30, 50), t2: bd(-180) },
    rosters: { t1: ["p1", "p2"], t2: ["p3", "p4"] },
    rakePerPlayer: 35,
  });
  const p1 = money.find((m) => m.golferId === "p1")!;
  const p3 = money.find((m) => m.golferId === "p3")!;

  check("winnings are reported before rake", p1.winnings, 300);
  check("the rake is held apart, not folded into the breakdown",
    [p1.rake, p1.breakdown], [35, { main: 180, front: 40, back: 30, eighteen: 50 }]);
  check("settlement is winnings less rake", p1.dollars, 265);
  check("a loser pays rake on top of the loss", p3.dollars, -215);
  check("everyone on the card is charged the same, whichever team they are on",
    money.map((m) => [m.teamId, m.rake]),
    [["t1", 35], ["t1", 35], ["t2", 35], ["t2", 35]]);

  // The one that matters: points must not notice rake at all.
  check("rake never touch the Cup figure", [p1.cupDollars, p3.cupDollars], [180, -180]);
  const pts = roundPoints({
    money, bonusByTeam: {}, rosters: { t1: ["p1", "p2"], t2: ["p3", "p4"] },
  });
  check("so the winner still scores the full 180",
    pts.find((p) => p.golferId === "p1")!.total, 180);
  check("and the loser still floors at 0, not at minus the rake",
    pts.find((p) => p.golferId === "p3")!.total, 0);
}
{
  // Winnings balance across a round, rake do not: they leave the group.
  const money = awardMoneyAt({
    breakdownByTeam: { t1: bd(100), t2: bd(-100) },
    rosters: { t1: ["p1", "p2"], t2: ["p3", "p4"] },
    rakePerPlayer: 35,
  });
  const sum = (pick: (m: typeof money[number]) => number) =>
    Math.round(money.reduce((n, m) => n + pick(m), 0) * 100) / 100;

  check("equal rosters: winnings net to zero", sum((m) => m.winnings), 0);
  check("but settlement is short the whole rake take", sum((m) => m.dollars), -140);
  check("which is exactly rake times the players on the card",
    sum((m) => m.rake), 140);
}
{
  // A short roster already unbalances winnings. Rake follow heads, not teams,
  // so the shorthanded side pays less in total.
  const money = awardMoneyAt({
    breakdownByTeam: { t1: bd(100), t2: bd(-100) },
    rosters: { t1: ["p1", "p2", "p3", "p4"], t2: ["p5", "p6", "p7"] },
    rakePerPlayer: 35,
  });
  const rakeFor = (team: string) =>
    money.filter((m) => m.teamId === team).reduce((n, m) => n + m.rake, 0);

  check("four players pay four lots of rake", rakeFor("t1"), 140);
  check("three players pay three", rakeFor("t2"), 105);
  check("and each player's own charge is unchanged by roster size",
    [...new Set(money.map((m) => m.rake))], [35]);
}
{
  const money = awardMoneyAt({
    breakdownByTeam: { t1: bd(100) },
    rosters: { t1: ["p1"] },
  });
  check("no rake argument means no charge",
    [money[0].winnings, money[0].rake, money[0].dollars], [100, 0, 100]);
}
{
  const money = awardMoneyAt({
    breakdownByTeam: { t1: bd(0) },
    rosters: { t1: ["p1"] },
    rakePerPlayer: 12.5,
  });
  check("a fractional rake rounds to the nearest whole dollar", [money[0].rake, money[0].dollars], [13, -13]);
}
{
  // A cleared input reaches Number() as NaN. Math.max(0, NaN) is NaN, so the
  // clamp alone would poison every row on the round.
  const bad = awardMoneyAt({
    breakdownByTeam: { t1: bd(100) },
    rosters: { t1: ["p1"] },
    rakePerPlayer: Number("") + Number("x"),
  });
  check("a NaN charge falls back to nothing rather than spreading",
    [bad[0].rake, bad[0].dollars], [0, 100]);

  const negative = awardMoneyAt({
    breakdownByTeam: { t1: bd(100) },
    rosters: { t1: ["p1"] },
    rakePerPlayer: -20,
  });
  check("and a negative charge cannot pay anyone",
    [negative[0].rake, negative[0].dollars], [0, 100]);
}

console.log("\n=== points earned in a round ===");
{
  // t1 won $200 of Cup money and took the back nine and the eighteen.
  // t2 lost $200 but still took the front nine.
  const pts = roundPoints({
    money: [
      ...["p1","p2","p3","p4"].map((g) => pm(g, "t1", 200, 100)),
      ...["p5","p6","p7","p8"].map((g) => pm(g, "t2", -200)),
    ],
    bonusByTeam: { t1: 25, t2: 10 },
    rosters: { t1: ["p1","p2","p3","p4"], t2: ["p5","p6","p7","p8"] },
  });

  const winner = pts.find((p) => p.golferId === "p1")!;
  check("winner: 200 from money", winner.fromMoney, 200);
  check("winner: 25 of bonus points", winner.bonus, 25);
  check("winner: 225 total", winner.total, 225);

  const loser = pts.find((p) => p.golferId === "p5")!;
  check("loser: a losing round is worth 0, never negative", loser.fromMoney, 0);
  check("loser: still takes the front nine bonus", loser.bonus, 10);
  check("loser: 10 on the round, the bonus alone", loser.total, 10);

  check("every teammate collects the same bonus in full",
    new Set(pts.filter((p) => p.teamId === "t1").map((p) => p.bonus)).size, 1);
}
{
  // A split bonus lands on a half point and must survive the rounding.
  const pts = roundPoints({
    money: [pm("p1", "t1", 0)],
    bonusByTeam: { t1: 7.5 },
    rosters: { t1: ["p1"] },
  });
  check("a split bonus keeps its half point", pts[0].bonus, 7.5);
  check("and carries into the total", pts[0].total, 7.5);
}

console.log("\n=== three-hole sets and six-hole sets ===");
{
  check("threes give six matches", segmentsFor(3).length, 6);
  check("sixes give three", segmentsFor(6).length, 3);
  check("and covers the same eighteen holes",
    SIX_HOLE_SETS.flat(), Array.from({ length: 18 }, (_, i) => i + 1));
  check("with no hole in two matches at once",
    new Set(SIX_HOLE_SETS.flat()).size, 18);

  // Team A wins the first six, B the second, A the last. Same payout table,
  // three matches instead of six, so the units are over three decisions.
  const par = Array.from({ length: 18 }, () => 0);
  const A = [...par]; A[0] = -1; A[12] = -1;
  const B = [...par]; B[6] = -1;
  const s: HoleScores = { A: card(...A), B: card(...B) };

  const major = scoreMainGame({
    teamIds: ["A", "B"], scores: s, payouts: { 1: 1, 2: -1 },
    decisions: {}, tieDefault: "hole", segments: segmentsFor(6),
  });
  check("three matches are played", major.segments.length, 3);
  check("the first runs holes 1 to 6", major.segments[0].holes, [1, 2, 3, 4, 5, 6]);
  check("A takes two of the three", major.unitsByTeam, { A: 1, B: -1 });

  const season = scoreMainGame({
    teamIds: ["A", "B"], scores: s, payouts: { 1: 1, 2: -1 },
    decisions: {}, tieDefault: "hole",
  });
  check("units still balance either way",
    [major.unitsByTeam.A + major.unitsByTeam.B,
     season.unitsByTeam.A + season.unitsByTeam.B], [0, 0]);
}
{
  // The segmentation genuinely changes who wins what. A is three under over
  // the first three holes and B takes one back on the fifth: two matches
  // split over sixes, one match to A over a six.
  const par = Array.from({ length: 18 }, () => 0);
  const A = [...par]; A[0] = -3;
  const B = [...par]; B[4] = -1;
  const s: HoleScores = { A: card(...A), B: card(...B) };
  const opts = {
    teamIds: ["A", "B"], scores: s, payouts: { 1: 1, 2: -1 },
    decisions: {}, tieDefault: "hole" as const,
  };

  const season = scoreMainGame(opts);
  const major = scoreMainGame({ ...opts, segments: segmentsFor(6) });

  const winner = (r: { awards: { teamId: string; units: number }[] }) =>
    r.awards.find((a) => a.units > 0)?.teamId;

  check("over threes they take one match each",
    [season.segments[0].holes, winner(season.segments[0]),
     season.segments[1].holes, winner(season.segments[1])],
    [[1, 2, 3], "A", [4, 5, 6], "B"]);
  check("over a six it is one match, and A's best three carries it",
    [major.segments[0].holes, winner(major.segments[0])],
    [[1, 2, 3, 4, 5, 6], "A"]);
}

{
  // A tie in the LAST match has no following hole to settle it on. A major's
  // last match ends at 18 exactly as a season round's does, so the two must
  // behave identically rather than one of them running off the end.
  const par = Array.from({ length: 18 }, () => 0);
  const s: HoleScores = { A: card(...par), B: card(...par) };
  const opts = {
    teamIds: ["A", "B"], scores: s, payouts: { 1: 1, 2: -1 },
    decisions: {}, tieDefault: "hole" as const,
  };
  const major = scoreMainGame({ ...opts, segments: segmentsFor(6) });
  const season = scoreMainGame(opts);

  const last = (r: { segments: { status: string }[] }) => r.segments[r.segments.length - 1];
  check("the last match of a major still resolves", last(major).status, "complete");
  check("and so does a season round's", last(season).status, "complete");
  check("an all level card pays nobody either way",
    [major.unitsByTeam, season.unitsByTeam],
    [{ A: 0, B: 0 }, { A: 0, B: 0 }]);
}

{
  // The shape and the multiplier are independent now: a season round can be
  // played over six-hole sets without becoming worth double, and a major can
  // be played over threes without stopping being a major.
  check("a stored 6 means six-hole sets", setLengthOf(6), 6);
  check("a stored 3 means threes", setLengthOf(3), 3);
  check("so does anything that is not a shape we can cut eighteen into",
    [setLengthOf(null), setLengthOf(undefined), setLengthOf(0), setLengthOf(4), setLengthOf("6")],
    [3, 3, 3, 3, 6]);

  check("a season round over sixes still pays single",
    pointsForRound(100, POINT_MULTIPLIER.season), 100);
  check("and a major over threes still pays double",
    pointsForRound(100, POINT_MULTIPLIER.major), 200);
  check("the shape never touches what a point is worth",
    [segmentsFor(3).length, segmentsFor(6).length, POINT_MULTIPLIER.season],
    [6, 3, 1]);
}

console.log("\n=== a major pays double, in points only ===");
{
  check("the multiplier is one for a season round", POINT_MULTIPLIER.season, 1);
  check("and two for a major", POINT_MULTIPLIER.major, 2);

  check("a hundred dollars won is a hundred points normally",
    pointsForRound(100), 100);
  check("and two hundred on a major", pointsForRound(100, 2), 200);
  check("a losing round is still worth nothing, doubled or not",
    [pointsForRound(-100), pointsForRound(-100, 2)], [0, 0]);

  // Bonus points double at source, so what the banner shows is the truth.
  // A leads the front AND the back, so it sweeps all three outright. Without
  // a back nine lead that segment ties and splits, which is a different rule
  // being tested somewhere else.
  const par = Array.from({ length: 18 }, () => 0);
  const A = [...par]; A[0] = -1; A[9] = -1;
  const s: HoleScores = { A: card(...A), B: card(...par) };
  const normal = scoreBonusPoints(["A", "B"], s);
  const major = scoreBonusPoints(["A", "B"], s, 2);
  check("front nine, back nine and eighteen are 10, 10 and 15 normally",
    normal.segments.map((x) => x.each), [10, 10, 15]);
  check("and 20, 20 and 30 on a major",
    major.segments.map((x) => x.each), [20, 20, 30]);
  check("A sweeps 35 normally", normal.pointsByTeam.A, 35);
  check("and 70 on a major", major.pointsByTeam.A, 70);

  // The round page prints the tier values beside the totals the engine paid.
  // If those two ever disagree the page contradicts itself on one screen, so
  // pin that they come from the same arithmetic.
  for (const type of ["season", "major"] as const) {
    const m = POINT_MULTIPLIER[type];
    const stated = (["front", "back", "total"] as const).map((seg) => BONUS_POINTS[seg] * m);
    const paid = scoreBonusPoints(["A", "B"], s, m);
    check(`what a ${type} round states is what it pays`,
      stated, paid.segments.map((x) => x.each));
    check(`and the sweep adds up on a ${type} round`,
      stated.reduce((a, b) => a + b, 0), paid.pointsByTeam.A);
  }
}

console.log("\n=== the double is applied once, not twice ===");
{
  const rosters = { t1: ["p1"], t2: ["p2"] };
  const money = [pm("p1", "t1", 100), pm("p2", "t2", -100)];
  const bonus = { t1: 70, t2: 0 };   // already doubled by scoreBonusPoints

  const pts = roundPoints({ money, bonusByTeam: bonus, rosters, multiplier: 2 });
  const winner = pts.find((p) => p.golferId === "p1")!;
  check("money doubles: 100 won becomes 200", winner.fromMoney, 200);
  check("the bonus is taken as given, not doubled again", winner.bonus, 70);
  check("270 on the round", winner.total, 270);

  const loser = pts.find((p) => p.golferId === "p2")!;
  check("and a loss still floors at zero on a major", loser.total, 0);

  const plain = roundPoints({ money, bonusByTeam: { t1: 35, t2: 0 }, rosters });
  check("the same round as a season game is 135",
    plain.find((p) => p.golferId === "p1")!.total, 135);
}

{
  const money = awardMoney({
    breakdownByTeam: { win: bd(25, 0.625), loss: bd(-25, -0.625) },
    rosters: { win: ["a","b","c","d","e"], loss: ["f","g","h","i","j"] },
    rakePerPlayer: 35, cupEligible: "gross",
  });
  check("round each five-player share once before rake, including signed half dollars",
    [money[0], money[5]].map(p => [p.winnings, p.dollars]), [[21, -14], [-20, -55]]);
}

{
  const cases = [
    { label: "equal category remainders favor the match", raw: bd(12.5, 12.5), expected: bd(13, 12) },
    { label: "negative category remainders use the same tie order", raw: bd(-12.5, -12.5), expected: bd(-12, -13) },
    { label: "the combined side game wins a larger remainder", raw: bd(0.49, 0.26, 0.26), expected: bd(0, 1, 0) },
    { label: "negative side ties are resolved front then back then eighteen",
      raw: bd(0, -0.5, -0.5, -0.5), expected: bd(0, 0, 0, -1) },
    { label: "unequal remainders determine mixed-sign payouts",
      raw: bd(-7.4, 2.1, -5.2, 3.8), expected: bd(-8, 2, -5, 4) },
  ];
  for (const { label, raw, expected } of cases) {
    const [player] = awardMoneyAt({ breakdownByTeam: { bay: raw }, rosters: { bay: ["a"] }, rakePerPlayer: 35 });
    check(label, player.breakdown, expected);
    check(`${label}: categories sum to gross`, Object.values(player.breakdown).reduce((sum, v) => sum + v, 0), player.winnings);
    check(`${label}: cash rounds once before rake`,
      player.dollars, Math.round(raw.main + raw.front + raw.back + raw.eighteen) - 35);
  }
}

console.log("\n=== independent match and FB18 point awards ===");
{
  const money = awardMoneyAt({
    breakdownByTeam: { win: bd(91.7, 40, 30, 39.98), loss: bd(-1,0,0,0), even: bd(0,0,0,0) },
    rosters: { win: ["a"], loss: ["b"], even: ["c"] }, rakePerPlayer: 35,
  });
  const major = cupPointsForPlayers(money, "major");
  check("major points double eligible whole-dollar categories before rake",
    major.map(p => [p.fromMoney, p.bonus, p.total]), [[184,220,404],[0,0,0],[0,0,0]]);
  check("season and major differ only in multiplier",
    cupPointsForPlayers(money, "season").map(p => p.total * 2), major.map(p => p.total));
}

{
  const values = [
    bd(75, 40, -10, 35),  // 11/18 Bay 1, including both 18-hole pots.
    bd(90, -20), bd(-20, 90), bd(30, -40), bd(-40, 30), bd(12.5, 12.5),
    bd(-20.01, 20.01), bd(-4.49, -0.50), bd(0.24, 0.25), bd(0.10, 0.20),
    bd(10, 25, -35, 4), // The combined FB18 category lost $6 despite winning the front nine.
  ];
  const earned = values.map((b) => awardMoneyAt({
    breakdownByTeam: { bay: b }, rosters: { bay: ["p1"] }, rakePerPlayer: 35, cupEligible: "gross",
  })[0]);
  const split = (round: "season" | "major") =>
    cupPointsForPlayers(earned, round).map(p => [p.fromMoney, p.bonus, p.total]);
  const expected = [
    [75,65,140], [90,0,90], [0,90,90], [30,0,30], [0,30,30], [13,12,25],
    [0,20,20], [0,0,0], [0,0,0], [0,0,0], [10,0,10],
  ];
  check("gross Cup dollars equal both independently eligible categories before the multiplier",
    earned.map(player => player.cupDollars), expected.map(row => row[2]));
  check("regular match and net FB18 points each have a zero floor and sum to the total", split("season"), expected);
  check("majors double both components of the same award", split("major"), expected.map(row => row.map(n => n * 2)));
}

console.log("\n=== whole-dollar Cup eligibility ===");
{
  check("the all-money option uses the nearest gross dollar",
    cupDollarsOf(bd(91.7, 40, 30, 39.98), "all"), 202);
  check("a single cent rounds to zero",
    cupDollarsOf(bd(0.01, 0, 0, 0), "all"), 0);
  check("a figure already whole is left alone",
    cupDollarsOf(bd(100, 50, 0, 0), "all"), 150);
  check("the matches-alone option uses whole dollars",
    cupDollarsOf(bd(91.7, 40, 30, 39.98), "main"), 92);
  check("and a losing total is still floored at zero, not rounded into points",
    roundPoints({
      money: [{ golferId: "p1", teamId: "t1", winnings: -150.3, rake: 0,
                dollars: -150.3, cupDollars: cupDollarsOf(bd(-100, -20, -20, -10.3), "all"),
                breakdown: bd(-100, -20, -20, -10.3) }],
      bonusByTeam: {}, rosters: { t1: ["p1"] }, multiplier: POINT_MULTIPLIER.major,
    })[0].total, 0);
}


console.log("\n=== matching a name off the sheet to a golfer ===");
{
  // The whole point of the fold is that it absorbs the noise a hand-kept
  // sheet carries week to week, and NOTHING else. A fold that reached any
  // further would start merging people, and merging two players is how one
  // of them silently collects the other's money.
  const same = (a: string, b: string) => nameKey(a) === nameKey(b);

  check("case does not make a new player", same("Tb", "TB"), true);
  check("nor does shouting", same("HUBBS", "Hubbs"), true);
  check("nor stray whitespace", same("  Kong  ", "Kong"), true);
  check("nor a doubled space", same("Cali  Dan", "Cali Dan"), true);
  check("nor a trailing comma a column split left behind", same("Khino,", "Khino"), true);
  check("nor a trailing period", same("Tb.", "Tb"), true);

  check("a first name is not a longer name", same("Dan", "Cali Dan"), false);
  check("two different people stay two people", same("Kevin", "Kirk"), false);
  check("an initial is not a name", same("K", "Kevin"), false);
  check("a nickname is not derived, it has to be recorded", same("Hubbs", "Andrew"), false);

  // An empty cell must not fold to the same key as another empty cell and
  // get treated as a player, so callers drop blanks. This just pins the
  // shape they test for.
  check("a blank folds to a blank", nameKey("   "), "");

  // Spelled exactly as read is the contract: the pool and the league's book
  // have to agree, and the book is the sheet.
  check("the fold is only for comparing, never for storing",
    nameKey("  cALi  dAN "), "cali dan");
}

console.log("\n=== how many players a bay holds ===");
{
  check("two to six", [MIN_TEAM_SIZE, MAX_TEAM_SIZE], [2, 6]);
  check("a bay of one is not a team", MIN_TEAM_SIZE > 1, true);
  check("and six is the ceiling the importer enforces", MAX_TEAM_SIZE, 6);
}


console.log("\n=== reading a loose date off a sheet ===");
{
  // The clock is passed in so the year guessing is testable rather than
  // something that only misbehaves in January.
  const nov = new Date("2026-11-20T12:00:00Z");
  const jan = new Date("2027-01-05T12:00:00Z");
  const on = (raw: string, now: Date) => isoFromLooseDate(raw, now);

  check("a bare month and day in the past takes this year",
    on("9/30", nov), "2026-09-30");
  check("and a dash reads the same as a slash",
    on("9-30", nov), "2026-09-30");
  check("whitespace around it does not matter",
    on("  10 / 7 ", nov), "2026-10-07");

  // The one that matters. A season crossing new year means a bare 9/30
  // entered in January is last autumn, not next.
  check("a bare date that would land in the future comes back a year",
    on("9/30", jan), "2026-09-30");
  check("while one already behind us stays put",
    on("1/2", jan), "2027-01-02");
  check("today itself is not pushed back", on("11/20", nov), "2026-11-20");

  check("a written year is taken at its word, even ahead of us",
    on("9/30/2027", nov), "2027-09-30");
  check("and a two digit year means this century",
    on("9/30/25", nov), "2025-09-30");

  check("a full ISO date parses", on("2026-09-30", nov), "2026-09-30");

  // Spelled months are what the schema asks the model for, so they have to
  // work. Handing them to new Date does not: a year-less "Oct 7" resolves to
  // the year 2001, and a parsed local midnight shifts back a day on any
  // server east of Greenwich. Both file a night in the wrong week.
  check("a spelled month with no year infers like a numeric one",
    on("Oct 7", nov), "2026-10-07");
  check("the long form reads the same", on("October 7", nov), "2026-10-07");
  check("so does the abbreviation the sheet actually uses",
    on("Sept 30", nov), "2026-09-30");
  check("day first reads the same", on("7 Oct", nov), "2026-10-07");
  check("a spelled month with a year is taken at its word",
    on("Oct 7 2027", nov), "2027-10-07");
  check("a comma does not matter", on("October 7, 2026", nov), "2026-10-07");
  check("and a spelled month ahead of us comes back a year too",
    on("Dec 20", nov), "2025-12-20");
  check("a month that is not a month is nothing", on("Smarch 7", nov), null);

  check("an impossible day is refused rather than rolled over",
    on("2/30", nov), null);
  check("including the spelled form", on("Feb 30", nov), null);
  check("and a thirty first of September", on("9/31", nov), null);
  check("so is a thirteenth month", on("13/1", nov), null);
  check("and nonsense", on("not a date", nov), null);
  check("an empty string is nothing", on("   ", nov), null);
  check("so is nothing at all",
    [isoFromLooseDate(null, nov), isoFromLooseDate(undefined, nov)], [null, null]);

  // Everything is assembled in UTC, so the answer cannot depend on where the
  // server is. This is the regression that would otherwise only appear after
  // somebody changed a deployment region.
  check("the reading does not move with the server's timezone",
    ["9/30", "Oct 7", "2026-09-30"].map((s) => on(s, nov)),
    ["2026-09-30", "2026-10-07", "2026-09-30"]);
  check("and nothing lands in 2001, which is what new Date would have done",
    ["Oct 7", "October 7", "Sept 30"].every((s) => !String(on(s, nov)).startsWith("2001")),
    true);
}


console.log("\n=== turning a read image into storable scores ===");
{
  const card = (over: Partial<RawReading> = {}): RawReading => ({
    score_kind: "relative",
    teams: [],
    par: [],
    money: { shown: false, rate: 0, rows: [] },
    details: { date: "", title: "", course: "", set_length: 0, rake_per_player: 0 },
    confidence: "high",
    notes: "",
    ...over,
  });
  const bay = (label: string, values: number[], players: string[] = ["a", "b"]) => ({
    label, number: Number(label.replace(/\D/g, "")) || null, players,
    holes: values.map((value, i) => ({ hole: i + 1, value })),
  });
  const ok = (r: ReturnType<typeof convertReading>) => (r.ok ? r : null);

  // --- the defect that mattered ---------------------------------------
  //
  // A par row misread writes gross strokes into a column that means relative
  // to par, and the flag band provably cannot catch it: every gross value a
  // golfer posts falls inside the range a relative score is allowed to take.
  // Both misreads are real. A blank par cell comes back as 0, and a model
  // that locks onto the hole-number header returns par = hole number.
  {
    const strokes = [4, 4, 4, 4, 4, 4, 4, 4, 4];
    const zeroPar = convertReading(card({
      score_kind: "gross",
      teams: [bay("Bay 1", strokes)],
      par: strokes.map((_, i) => ({ hole: i + 1, par: 0 })),
    }));
    check("a par row of zeroes is refused, not subtracted", zeroPar.ok, false);

    const headerPar = convertReading(card({
      score_kind: "gross",
      teams: [bay("Bay 1", strokes)],
      par: strokes.map((_, i) => ({ hole: i + 1, par: i + 1 })),
    }));
    check("so is a par row that is really the hole numbers", headerPar.ok, false);

    const realPar = ok(convertReading(card({
      score_kind: "gross",
      teams: [bay("Bay 1", [4, 5, 3, 4, 4, 6, 3, 4, 5])],
      par: [4, 4, 3, 4, 5, 4, 3, 4, 4].map((par, i) => ({ hole: i + 1, par })),
    })));
    check("a real par row converts",
      realPar?.teams[0].holes.map((h) => h.relative), [0, 1, 0, 0, -1, 2, 0, 0, 1]);
    check("and keeps the gross figure for the review screen",
      realPar?.teams[0].holes[1].raw, 5);

    // A par of 7 is not a par on any hole anyone plays. One of those on an
    // otherwise good row costs that hole and nothing else; it is only when
    // most of the row is not pars that the row itself stops being believable.
    const oddPar = ok(convertReading(card({
      score_kind: "gross",
      teams: [bay("Bay 1", [4, 4, 4, 4, 4, 4, 4, 4, 4])],
      par: [4, 7, 3, 4, 5, 4, 3, 4, 4].map((par, i) => ({ hole: i + 1, par })),
    })));
    check("one bad par drops its own hole, not the card",
      oddPar?.teams[0].holes.map((h) => h.hole), [1, 3, 4, 5, 6, 7, 8, 9]);
    check("and says so rather than going quiet",
      oddPar?.dropped.some((d) => d.includes("not a par")), true);

    // The threshold itself: a row where the rejects outnumber the keeps is
    // not a par row, however many pars happen to be in range.
    const mostlyBad = convertReading(card({
      score_kind: "gross",
      teams: [bay("Bay 1", [4, 4, 4, 4])],
      par: [{ hole: 1, par: 4 }, { hole: 2, par: 9 }, { hole: 3, par: 0 }, { hole: 4, par: 12 }],
    }));
    check("a row that is mostly not pars is refused outright", mostlyBad.ok, false);
  }

  // --- the other way gross reaches the column --------------------------
  //
  // The model says it cannot tell, the admin's dropdown is on its default,
  // and a card of gross strokes passes straight through as relative.
  {
    const grossAsRelative = convertReading(card({
      score_kind: "unclear",
      teams: [bay("Bay 1", [4, 5, 4, 6, 3, 4]), bay("Bay 2", [5, 4, 4, 4, 5, 3])],
    }), "relative");
    check("a card with no zero and nothing under it is refused as relative",
      grossAsRelative.ok, false);

    const realCard = ok(convertReading(card({
      score_kind: "unclear",
      teams: [bay("Bay 1", [0, -1, 0, 1, -1, 0])],
    }), "relative"));
    check("while a real card of scores against par goes through",
      realCard?.teams[0].holes.map((h) => h.relative), [0, -1, 0, 1, -1, 0]);
    check("and says the kind was assumed, since the model could not tell",
      realCard?.scoreKindAssumed, true);

    const toldSo = ok(convertReading(card({
      score_kind: "relative",
      teams: [bay("Bay 1", [0, -1, -2])],
    })));
    check("a kind the model was sure of is not marked assumed",
      toldSo?.scoreKindAssumed, false);
  }

  // --- rows that are not bays -------------------------------------------
  {
    const withTotals = ok(convertReading(card({
      teams: [
        bay("Bay 1", [0, -1]),
        bay("Bay 2", [-1, 0]),
        { label: "Audit", number: null, players: [], holes: [{ hole: 1, value: 0 }] },
        { label: "TOTAL", number: null, players: [], holes: [{ hole: 1, value: -1 }] },
      ],
    })));
    check("a totals row is not handed a team's slot",
      withTotals?.teams.map((t) => t.label), ["Bay 1", "Bay 2"]);
    check("and the admin is told it was dropped",
      withTotals?.dropped.filter((d) => d.includes("total")).length, 2);

    const realName = ok(convertReading(card({
      teams: [bay("Total Carnage", [0, -1])],
    })));
    check("but a bay whose name merely starts that way is safe",
      realName?.teams.length, 1);
  }

  // --- a misaligned column looks like a repeated hole --------------------
  {
    const dupes = ok(convertReading(card({
      teams: [{
        label: "Bay 1", number: 1, players: ["a", "b"],
        holes: [{ hole: 1, value: 0 }, { hole: 1, value: -2 }, { hole: 2, value: -1 }],
      }],
    })));
    check("the first reading of a hole wins",
      dupes?.teams[0].holes.map((h) => [h.hole, h.relative]), [[1, 0], [2, -1]]);
    check("and the repeat is reported rather than swallowed",
      dupes?.dropped.some((d) => d.includes("twice")), true);
  }

  // --- flags and drops are different messages ----------------------------
  {
    const odd = ok(convertReading(card({
      teams: [bay("Bay 1", [0, 11, -1])],
    })));
    check("an unusual score is flagged but still saved",
      odd?.teams[0].holes.map((h) => h.relative), [0, 11, -1]);
    check("under flags, which say they save",
      odd?.flags.length, 1);
    check("and not under dropped, which says they did not",
      odd?.dropped.length, 0);
  }

  // --- details -----------------------------------------------------------
  {
    const details = ok(convertReading(card({
      teams: [bay("Bay 1", [0, -1])],
      details: { date: " 9/30 ", title: "Wednesday Degent", course: "", set_length: 6, rake_per_player: 35 },
    })));
    check("the date comes back as written, for the admin to see",
      details?.details.date, "9/30");
    check("a blank course is nothing rather than an empty string",
      details?.details.course, null);
    check("the set length is read", details?.details.setHoles, 6);
    check("so is the rake", details?.details.rakePerPlayer, 35);

    const noRake = ok(convertReading(card({
      teams: [bay("Bay 1", [0, -1])],
      details: { date: "", title: "", course: "", set_length: 0, rake_per_player: 0 },
    })));
    check("a zero rake means the image did not show one, not a free round",
      noRake?.details.rakePerPlayer, null);
    check("and a set length of zero is the same", noRake?.details.setHoles, null);
  }

  // --- nothing legible ----------------------------------------------------
  check("a card with no bays at all is refused",
    convertReading(card({ teams: [] })).ok, false);
  check("holes outside the eighteen are dropped",
    ok(convertReading(card({
      teams: [{
        label: "Bay 1", number: 1, players: ["a", "b"],
        holes: [{ hole: 0, value: 0 }, { hole: 19, value: -1 }, { hole: 5, value: 0 }],
      }],
    })))?.teams[0].holes.map((h) => h.hole), [5]);
}


console.log("\n=== working the stakes back out of a money block ===");
{
  // The real 9/30 card, hole by hole, with the money block beside it. These
  // are the same figures npm run audit-sheet checks the engine against, so
  // the units derived here have to come back as the ones that reproduce the
  // sheet: one unit at $200 on the matches, two to the winner at $40 on each
  // nine, and the eighteen's two prizes together at $20.
  const holes = (row: number[]) => row.map((value, i) => ({ hole: i + 1, value }));
  const teams = [
    { label: "Bay 1", number: 1, players: ["a", "b"],
      holes: holes([ 0, 0,-1, 0,-1, 0,-1, 0,-1,  -1, 0, 0, 0, 0, 0, 0, 0, 0]) },
    { label: "Bay 2", number: 2, players: ["c", "d"],
      holes: holes([-1,-1,-1, 0, 0, 0,-1,-1,-1,  -1, 0,-1,-1, 0, 0,-1,-1,-1]) },
    { label: "Bay 3", number: 3, players: ["e", "f"],
      holes: holes([-1,-1,-1, 0,-1,-1,-1, 0,-1,  -1,-1,-1, 0,-1,-2, 0,-1,-1]) },
  ].map((t) => ({ ...t, holes: t.holes.map((h) => ({ ...h, relative: h.value, raw: h.value })) }));

  const money = {
    shown: true,
    rate: 0,
    rows: [
      { label: "Bay 1", sets: [-200, -200, -200], front: -40, back: -40, eighteen: -40, secondEighteen: -20 },
      { label: "Bay 2", sets: [0, 200, 0], front: -40, back: -40, eighteen: 0, secondEighteen: 20 },
      { label: "Bay 3", sets: [200, 0, 200], front: 80, back: 80, eighteen: 40, secondEighteen: 0 },
    ],
  };

  const got = deriveStakes(teams, money, 6);
  const fractional = deriveStakes(teams, {
    ...money,
    rows: money.rows.map(row => ({ ...row, sets: row.sets.map(dollars => dollars / 16) })),
  }, 6);
  check("fractional sheet payouts survive import at a whole-dollar rate",
    [fractional.rates.main, fractional.main], [1, { 1: 12.5, 2: 0, 3: -12.5 }]);
  check("the matches come back as one unit, first to last",
    got.main, { 1: 1, 2: 0, 3: -1 });
  check("at two hundred dollars a unit", got.rates.main, 200);
  check("three columns of match money means six-hole matches", got.setHoles, 6);

  check("the front nine pays the winner two and charges the rest one",
    got.front, { 1: 2, 2: -1, 3: -1 });
  check("at forty a unit", got.rates.front, 40);
  check("the back nine reads the same", [got.back, got.rates.back],
    [{ 1: 2, 2: -1, 3: -1 }, 40]);

  // Two prizes, two pots, which is how the league plays them and now how the
  // app stores them. Ranked on the same eighteen: Bay 3 lowest, Bay 2 second.
  check("the lowest eighteen is its own pot",
    got.total, { 1: 1, 2: 0, 3: -1 });
  check("at forty a unit", got.rates.total, 40);
  check("and the second lowest is another, paying position two",
    got.second, { 1: 0, 2: 1, 3: -1 });
  check("at twenty, which is half of it", got.rates.second, 20);
  check("the tied middle six is skipped, and the note says what was used",
    got.notes, ["2 of 3 matches were readable, and they agreed"]);

  // --- what it refuses ----------------------------------------------------

  // A tie means the tied bays split the pot of the places they share, so the
  // dollars stop saying what any one position was worth.
  const tied = deriveStakes(
    teams.map((t) => ({ ...t, holes: t.holes.map((h) => ({ ...h, relative: 0 })) })),
    money, 6,
  );
  check("a segment every bay tied on is refused rather than inverted",
    [tied.main, tied.front], [null, null]);

  // Money that does not net to zero is a misread, not a payout table.
  const unbalanced = deriveStakes(teams, {
    ...money,
    rows: money.rows.map((r, i) => (i === 0 ? { ...r, front: -10 } : r)),
  }, 6);
  check("a pot that does not balance is refused", unbalanced.front, null);
  check("and says so", unbalanced.notes.some((n) => n.includes("front nine")), true);

  // Matches that disagree about what a position pays mean a column was
  // misread, and a majority vote would bury that.
  // Planted on the front six, which is readable. The back six still says one
  // unit at $200 paying 1 / 0 / -1, while the front six now says two units at
  // $100 paying 2 / -1 / -1. Same card, two different tables.
  const inconsistent = deriveStakes(teams, {
    ...money,
    rows: [
      { label: "Bay 1", sets: [-100, -200, -200], front: -40, back: -40, eighteen: -40, secondEighteen: -20 },
      { label: "Bay 2", sets: [-100, 200, 0], front: -40, back: -40, eighteen: 0, secondEighteen: 20 },
      { label: "Bay 3", sets: [200, 0, 200], front: 80, back: 80, eighteen: 40, secondEighteen: 0 },
    ],
  }, 6);
  check("matches that disagree leave the main game alone", inconsistent.main, null);
  check("and say they disagreed",
    inconsistent.notes.some((n) => n.includes("did not agree")), true);

  // No money block at all is the common case, and it is not an error.
  const none = deriveStakes(teams, { shown: false, rate: 0, rows: [] }, null);
  check("no money block leaves every pot at its default",
    [none.main, none.front, none.back, none.total], [null, null, null, null]);
  check("and says why once", none.notes.length, 1);

  // Labels are the only thing the two blocks share.
  const mismatched = deriveStakes(teams, {
    ...money,
    rows: money.rows.map((r) => ({ ...r, label: r.label.replace("Bay", "Lane") })),
  }, 6);
  check("a money block that lines up with no bay is refused", mismatched.main, null);

  // Six columns of match money is six three-hole matches, and the derived
  // length is reported so the form can follow it.
  // Three-hole sets on the same card. Holes 1-3 and 7-9 are tied and get
  // skipped; the other four pay whichever bay actually won them, two units to
  // the winner at $25 and one off everybody else.
  const threes = deriveStakes(teams, {
    shown: true, rate: 0,
    rows: [
      { label: "Bay 1", sets: [0, -25, 0, -25, -25, -25], front: 0, back: 0, eighteen: 0, secondEighteen: 0 },
      { label: "Bay 2", sets: [0, -25, 0, -25, -25,  50], front: 0, back: 0, eighteen: 0, secondEighteen: 0 },
      { label: "Bay 3", sets: [0,  50, 0,  50,  50, -25], front: 0, back: 0, eighteen: 0, secondEighteen: 0 },
    ],
  }, null);
  check("six columns of match money means three-hole matches", threes.setHoles, 3);
  check("and the units follow from the order they finished in",
    [threes.main, threes.rates.main], [{ 1: 2, 2: -1, 3: -1 }, 25]);
}


console.log("\n=== what a finishing position pays, by default ===");
{
  const row = (t: Record<number, number>, n: number) =>
    Array.from({ length: n }, (_, i) => t[i + 1] ?? 0);
  const sums = (a: number[]) => a.reduce((x, y) => x + y, 0);

  // Every pot has to net to zero at every size. The money moves between bays
  // rather than coming from anywhere, so a table that does not balance would
  // invent or destroy money on every round played at that size.
  for (const n of [2, 3, 4, 5, 6, 7, 8, 12]) {
    check(`${n} bays: the match balances`, sums(row(defaultPayouts(n), n)), 0);
    for (const seg of ["front", "back", "total", "second"] as const) {
      // A two bay round has no second lowest pot at all, which is an empty
      // table rather than an unbalanced one.
      if (seg === "second" && n < 3) continue;
      check(`${n} bays: the ${seg} pot balances`,
        sums(row(defaultFb18Payouts(n, seg), n)), 0);
    }
  }

  // --- against the league's own book ------------------------------------
  //
  // Three bays, 9/30. Matches settled at $200 a unit, nines at $40.
  check("three bays, a match pays 1 / 0 / -1",
    row(defaultPayouts(3), 3), [1, 0, -1]);
  check("which is the 200, 0, -200 the sheet settled",
    row(defaultPayouts(3), 3).map((u) => u * 200), [200, 0, -200]);
  check("three bays, a nine is winner takes all",
    row(defaultFb18Payouts(3, "front"), 3), [2, -1, -1]);
  check("which is the 80, -40, -40 the sheet settled",
    row(defaultFb18Payouts(3, "front"), 3).map((u) => u * 40), [80, -40, -40]);

  // Five bays, every week from 10/7 on. Matches at $25, nines at $10, the
  // eighteen at $5 a half unit.
  check("five bays, a match pays 2 / 1 then everyone pays",
    row(defaultPayouts(5), 5), [2, 1, -1, -1, -1]);
  check("which is the 50, 25, -25, -25, -25 the sheet settled",
    row(defaultPayouts(5), 5).map((u) => u * 25), [50, 25, -25, -25, -25]);
  check("five bays, a nine is winner takes all",
    row(defaultFb18Payouts(5, "back"), 5), [4, -1, -1, -1, -1]);
  check("which is the 40 against -10 four times the sheet settled",
    row(defaultFb18Payouts(5, "back"), 5).map((u) => u * 10), [40, -10, -10, -10, -10]);
  // The eighteen is two pots, as the league plays it. The lowest round takes
  // a full one and pays into the second lowest's, which runs at half.
  check("five bays, the lowest eighteen is winner takes all",
    row(defaultFb18Payouts(5, "total"), 5), [4, -1, -1, -1, -1]);
  check("five bays, the second lowest is the same pot one place down",
    row(defaultFb18Payouts(5, "second"), 5), [-1, 4, -1, -1, -1]);
  check("at ten and five, together they are the 35, 10, -15 the sheet settled",
    row(defaultFb18Payouts(5, "total"), 5)
      .map((u, i) => u * 10 + row(defaultFb18Payouts(5, "second"), 5)[i] * 5),
    [35, 10, -15, -15, -15]);
  check("and each pot balances on its own",
    [sums(row(defaultFb18Payouts(5, "total"), 5)),
     sums(row(defaultFb18Payouts(5, "second"), 5))], [0, 0]);

  // --- the shape of the rules, stated once ------------------------------
  check("third place and below always pay a unit in the match",
    [4, 5, 6, 7].every((n) => row(defaultPayouts(n), n).slice(2).every((u) => u === -1)),
    true);
  check("second place is paid something from four bays up",
    [4, 5, 6, 7].map((n) => defaultPayouts(n)[2]! >= 0), [true, true, true, true]);
  check("but never more than first",
    [2, 3, 4, 5, 6, 7, 8, 12].every((n) => defaultPayouts(n)[1]! >= defaultPayouts(n)[2]!),
    true);
  check("a nine pays nobody but the winner",
    [3, 5, 7].every((n) => row(defaultFb18Payouts(n, "front"), n).slice(1).every((u) => u === -1)),
    true);
  check("each eighteen pot pays exactly one place, like the nines",
    [5, 7].every((n) =>
      [row(defaultFb18Payouts(n, "total"), n), row(defaultFb18Payouts(n, "second"), n)]
        .every((r) => r.filter((u) => u > 0).length === 1)),
    true);
  check("and between them they pay the top two, nobody else",
    [5, 7].every((n) => {
      const paid = row(defaultFb18Payouts(n, "total"), n)
        .map((u, i) => u + row(defaultFb18Payouts(n, "second"), n)[i]);
      return paid[0] > 0 && paid[1] > 0 && paid.slice(2).every((u) => u < 0);
    }),
    true);

  // Two bays is the degenerate case every one of these has to survive.
  check("two bays: the match is a straight unit", row(defaultPayouts(2), 2), [1, -1]);
  check("two bays: so is a nine", row(defaultFb18Payouts(2, "front"), 2), [1, -1]);
  check("two bays: and the lowest eighteen", row(defaultFb18Payouts(2, "total"), 2), [1, -1]);
  check("two bays: the second lowest pot does not exist, since paying the " +
    "loser out of the winner is the first pot run backwards",
    defaultFb18Payouts(2, "second"), {});

  // Three bays on the eighteen is the one place the league's own book
  // disagrees with itself. 9/30 settled it 40 / 20 / -60, where the lowest
  // round was excluded from the second pot rather than paying into it. Every
  // week after pays it the way these defaults do, which at $40 and $20 comes
  // to 60 / 0 / -60.
  check("three bays: the lowest eighteen", row(defaultFb18Payouts(3, "total"), 3), [2, -1, -1]);
  check("three bays: the second lowest", row(defaultFb18Payouts(3, "second"), 3), [-1, 2, -1]);
  check("which at forty and twenty is 60 / 0 / -60, not 9/30's 40 / 20 / -60",
    row(defaultFb18Payouts(3, "total"), 3)
      .map((u, i) => u * 40 + row(defaultFb18Payouts(3, "second"), 3)[i] * 20),
    [60, 0, -60]);

  // The side pots must not be the match shape. This is the regression that
  // sent a round out paying places the league does not pay.
  check("a nine is never the match table",
    [3, 5, 7].every((n) =>
      JSON.stringify(row(defaultFb18Payouts(n, "front"), n)) !==
      JSON.stringify(row(defaultPayouts(n), n))),
    true);
  check("nor is either eighteen pot",
    [3, 5, 7].every((n) =>
      (["total", "second"] as const).every((seg) =>
        JSON.stringify(row(defaultFb18Payouts(n, seg), n)) !==
        JSON.stringify(row(defaultPayouts(n), n)))),
    true);
  check("the second lowest pot is the lowest's, shifted one place",
    [3, 5, 7].every((n) => {
      const first = row(defaultFb18Payouts(n, "total"), n);
      const second = row(defaultFb18Payouts(n, "second"), n);
      return second[0] === -1 && second[1] === first[0] && first[1] === -1;
    }),
    true);
  check("and the two nines pay the same as each other",
    [2, 3, 5, 7].every((n) =>
      JSON.stringify(defaultFb18Payouts(n, "front")) ===
      JSON.stringify(defaultFb18Payouts(n, "back"))),
    true);
}


console.log("\n=== the eighteen is two pots, not one table ===");
{
  // Three bays on one card. Bay C has the lowest eighteen, Bay B the second
  // lowest, Bay A the highest. Every pot is ranked off the same eighteen.
  const h = (row: number[]) => Object.fromEntries(row.map((v, i) => [i + 1, v]));
  const scores: HoleScores = {
    A: h([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),       // E
    B: h([-1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),      // -1
    C: h([-1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),     // -2
  };
  const teamIds = ["A", "B", "C"];

  const scored = scoreFb18({
    teamIds, scores,
    payouts: {
      total: defaultFb18Payouts(3, "total"),
      second: defaultFb18Payouts(3, "second"),
    },
  });

  check("every pot is scored, the second eighteen included",
    scored.results.map((r) => r.segment), [...FB18_SEGMENTS]);

  const pot = (seg: string) => {
    const r = scored.results.find((x) => x.segment === seg)!;
    return teamIds.map((t) => r.awards.find((a) => a.teamId === t)?.units ?? 0);
  };
  check("the lowest eighteen goes to the lowest round", pot("total"), [-1, -1, 2]);
  check("the second lowest goes to the runner up", pot("second"), [-1, 2, -1]);
  check("and the lowest round pays into that pot, rather than sitting it out",
    pot("second")[2], -1);

  // Rates: the second pot runs at half, so the lowest round clears more than
  // the runner up even though each pot is winner takes all.
  const rate = 10;
  const half = rate * SECOND_EIGHTEEN_RATE_SHARE;
  check("the second pot runs at half the rate", SECOND_EIGHTEEN_RATE_SHARE, 0.5);
  check("so five dollars a unit against ten", half, 5);

  const dollars = fb18DollarsBySegment(scored.results, { total: rate, second: half });
  const take = (t: string) => {
    const d = dollars[t] ?? { front: 0, back: 0, total: 0, second: 0 };
    return d.total + d.second;
  };
  // C takes the lowest pot (+$20) and pays $5 into the second; B pays $10
  // into the lowest and takes the second (+$10); A pays into both.
  check("lowest round clears 15, runner up breaks even, last pays 15",
    teamIds.map(take), [-15, 0, 15]);
  check("and the two pots net to nothing between them",
    teamIds.reduce((n, t) => n + take(t), 0), 0);

  // The whole reason for two pots rather than one table: a tie at the top.
  // One table splits first and second between the tied pair. Two pots still
  // split, but each pot splits on its own, which is a different number.
  const tied: HoleScores = {
    A: h([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    B: h([-1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    C: h([-1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  };
  const tiedScored = scoreFb18({
    teamIds, scores: tied,
    payouts: {
      total: defaultFb18Payouts(3, "total"),
      second: defaultFb18Payouts(3, "second"),
    },
  });
  const tiedDollars = fb18DollarsBySegment(tiedScored.results, { total: rate, second: half });
  const tiedTake = (t: string) => {
    const d = tiedDollars[t] ?? { front: 0, back: 0, total: 0, second: 0 };
    return d.total + d.second;
  };
  // Both tied bays occupy first and second in each pot. Each gets half a
  // unit per pot, while the third-place bay pays one full unit into each.
  check("two bays tied for lowest share the signed first and second payouts",
    teamIds.map(tiedTake), [-15, 7.5, 7.5]);
  check("which still nets to nothing",
    teamIds.reduce((n, t) => n + tiedTake(t), 0), 0);

  // A pot nobody set up pays nothing, which is how every round made before
  // this existed keeps settling exactly as it did.
  const legacy = scoreFb18({
    teamIds, scores,
    payouts: { total: defaultFb18Payouts(3, "total") },
  });
  const legacyDollars = fb18DollarsBySegment(legacy.results, { total: rate });
  check("a round with no second pot pays nothing out of it",
    teamIds.map((t) => (legacyDollars[t] ?? { second: 0 }).second ?? 0), [0, 0, 0]);
}


console.log("\n=== shared finishes pay the same way in every cash pot ===");
{
  const teamIds = ["A", "B", "C", "D"];
  const scores: HoleScores = {};
  for (const [i, id] of teamIds.entries()) {
    // A and B tie for the two highest places, across a positive and negative rate.
    scores[id] = Object.fromEntries(Array.from({ length: 18 }, (_, h) => [h + 1, Math.max(0, i - 1)]));
  }
  const payouts = { 1: 3, 2: -1, 3: -1, 4: -1 };
  const main = scoreMainGame({ teamIds, scores, payouts, decisions: {}, tieDefault: "hole" });
  const side = scoreFb18({ teamIds, scores, payouts: {
    front: payouts, back: payouts, total: payouts, second: { 1: -1, 2: 3, 3: -1, 4: -1 },
  } });
  for (const pot of [...main.segments, ...side.results]) {
    const byTeam = teamIds.map(id => pot.awards.find(a => a.teamId === id)?.units);
    check(`pot ${pot.segment}: both tied bays get one unit and the others pay one`, byTeam, [1,1,-1,-1]);
  }
}

console.log("\n=== the order teams are listed in never changes what they win ===");
{
  // Nothing in the scoring may read the order teams are listed in, or a
  // team's place on the page would change what it wins. This scores the 11/18
  // card, ties and all, in every one of the 120 orders five teams can be
  // listed in, and requires one answer.
  const h = (row: number[]) => Object.fromEntries(row.map((v, i) => [i + 1, v]));
  const card: HoleScores = {
    t1: h([-1,-1,-1, 0,-1,-1,-1,-1,-1,  -1,-1, 0,-1,-2,-1, 0,-1,-1]),
    t2: h([-1,-1, 0,-1,-1, 0,-1, 0,-1,   0,-1, 0, 0, 0, 0, 0,-1, 0]),
    t3: h([-1,-1,-1, 0,-1, 0,-1,-1,-1,  -1,-1,-1, 0,-2,-1,-1,-1,-1]),
    t4: h([-1, 0,-1,-2,-1,-1,-1, 0, 0,  -1,-2,-1, 0,-1,-1, 0,-1,-1]),
    t5: h([-1,-1,-1,-1, 0, 0,-2,-1, 0,  -1,-1, 0,-1,-2, 0,-1,-1,-1]),
  };
  const ids = ["t1", "t2", "t3", "t4", "t5"];
  const orders = (a: string[]): string[][] =>
    a.length <= 1 ? [a]
      : a.flatMap((x, i) => orders([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));

  const outcome = (order: string[]) => {
    const main = scoreMainGame({
      teamIds: order, scores: card, payouts: { 1: 2, 2: 1, 3: -1, 4: -1, 5: -1 },
      decisions: {}, tieDefault: "hole", segments: segmentsFor(3),
    });
    const side = scoreFb18({
      teamIds: order, scores: card,
      payouts: {
        front: defaultFb18Payouts(5, "front"), back: defaultFb18Payouts(5, "back"),
        total: defaultFb18Payouts(5, "total"), second: defaultFb18Payouts(5, "second"),
      },
    });
    const bonus = scoreBonusPoints(order, card, 1);
    return JSON.stringify([
      ids.map((t) => main.unitsByTeam[t] ?? 0),
      ids.map((t) => side.unitsByTeam[t] ?? 0),
      ids.map((t) => bonus.pointsByTeam[t] ?? 0),
    ]);
  };

  const every = orders(ids);
  check("there are 120 ways to list five teams", every.length, 120);
  check("and every one of them pays exactly the same",
    new Set(every.map(outcome)).size, 1);
}

console.log("\n=== moving a card typed against the wrong team ===");
{
  const ids = ["A", "B", "C"];

  check("a straight swap is fine",
    checkMoves(ids, [{ from: "A", to: "B" }, { from: "B", to: "A" }]), null);
  check("so is a three-way rotation",
    checkMoves(ids, [{ from: "A", to: "B" }, { from: "B", to: "C" }, { from: "C", to: "A" }]), null);
  check("but not a card copied onto a team that keeps its own",
    checkMoves(ids, [{ from: "A", to: "B" }]) !== null, true);
  check("nor two cards onto one team",
    checkMoves(ids, [{ from: "A", to: "C" }, { from: "B", to: "C" }]) !== null, true);
  check("nor a team from another round",
    checkMoves(ids, [{ from: "A", to: "Z" }, { from: "Z", to: "A" }]) !== null, true);
  check("and moving nothing is not a move", checkMoves(ids, []) !== null, true);

  const row = (team_id: string, hole: number, strokes: number): ScoreRow =>
    ({ team_id, hole, strokes });

  // A has three holes, B has two: the cards are different lengths, so the
  // hole A no longer has after the swap has to be cleared, not left behind.
  const rows = [row("A", 1, -1), row("A", 2, 0), row("A", 3, -2), row("B", 1, 1), row("B", 2, 0)];
  const swapped = movedScores(rows, [{ from: "A", to: "B" }, { from: "B", to: "A" }]);
  const holesOf = (t: string) =>
    swapped.upsert.filter((r) => r.team_id === t).map((r) => [r.hole, r.strokes]);
  check("B takes A's card hole for hole", holesOf("B"), [[1, -1], [2, 0], [3, -2]]);
  check("A takes B's", holesOf("A"), [[1, 1], [2, 0]]);
  check("and A's third hole is cleared rather than left behind",
    swapped.prune.find((p) => p.team_id === "A")!.keep, [1, 2]);

  // A card moved onto a team that had none: that team's empty card moves back.
  const ontoEmpty = movedScores([row("A", 1, -1)], [{ from: "A", to: "C" }, { from: "C", to: "A" }]);
  check("a card moved onto an empty team arrives whole",
    ontoEmpty.upsert.map((r) => [r.team_id, r.hole, r.strokes]), [["C", 1, -1]]);
  check("and the team it left is cleared",
    ontoEmpty.prune.find((p) => p.team_id === "A")!.keep, []);

  // A tie ruling follows the scores it was made about.
  const swap = [{ from: "A", to: "B" }, { from: "B", to: "A" }];
  check("a ruling on A and C moves to B and C", movedDecisionKey("A+C", swap), "B+C");
  check("a ruling between the two swapped teams stays theirs", movedDecisionKey("A+B", swap), "A+B");
  check("a ruling the move does not touch is left alone", movedDecisionKey("C+D", swap), "C+D");
  check("and keys stay sorted, the way the engine builds them",
    movedDecisionKey("C+A", [{ from: "C", to: "Z" }, { from: "Z", to: "C" }]), "A+Z");

  // End to end on the 11/18 card: swap Team 1's and Team 2's scores and the
  // money swaps with them, because money follows the card, not the team.
  const h = (row: number[]) => Object.fromEntries(row.map((v, i) => [i + 1, v]));
  const card: HoleScores = {
    t1: h([-1,-1,-1, 0,-1,-1,-1,-1,-1,  -1,-1, 0,-1,-2,-1, 0,-1,-1]),
    t2: h([-1,-1, 0,-1,-1, 0,-1, 0,-1,   0,-1, 0, 0, 0, 0, 0,-1, 0]),
    t3: h([-1,-1,-1, 0,-1, 0,-1,-1,-1,  -1,-1,-1, 0,-2,-1,-1,-1,-1]),
    t4: h([-1, 0,-1,-2,-1,-1,-1, 0, 0,  -1,-2,-1, 0,-1,-1, 0,-1,-1]),
    t5: h([-1,-1,-1,-1, 0, 0,-2,-1, 0,  -1,-1, 0,-1,-2, 0,-1,-1,-1]),
  };
  const teams = Object.keys(card);
  const asRows = (c: HoleScores): ScoreRow[] =>
    Object.entries(c).flatMap(([team_id, holes]) =>
      Object.entries(holes).map(([hole, strokes]) =>
        ({ team_id, hole: Number(hole), strokes: strokes as number })));
  const moved = movedScores(asRows(card), [{ from: "t1", to: "t2" }, { from: "t2", to: "t1" }]);
  const after: HoleScores = { ...card, t1: {}, t2: {} };
  for (const r of moved.upsert) after[r.team_id][r.hole] = r.strokes;

  const units = (c: HoleScores) => scoreMainGame({
    teamIds: teams, scores: c, payouts: { 1: 2, 2: 1, 3: -1, 4: -1, 5: -1 },
    decisions: {}, tieDefault: "hole", segments: segmentsFor(3),
  }).unitsByTeam;
  const before = units(card);
  const now = units(after);
  check("after the swap Team 2 wins what Team 1 used to",
    [now.t1, now.t2], [before.t2, before.t1]);
  check("and nobody else's money moves",
    [now.t3, now.t4, now.t5], [before.t3, before.t4, before.t5]);
}

console.log("\n=== the 10/28 major, as the sheet settled it ===");
{
  // The live sheet's 10/28 block, hole by hole, scored as six three-hole
  // matches with the league's tables at $25, $10, $10, $10 and $5. Every
  // money column on the sheet has to come back, the tied front nine included.
  const h = (row: number[]) => Object.fromEntries(row.map((v, i) => [i + 1, v]));
  const ids = ["B1", "B2", "B4", "B5", "B7"];
  const card1028: HoleScores = {
    B1: h([ 0,-1, 0,  0,-1,-1, -1,-1, 0, -1,-1, 0, -1, 0, 0, -1,-1, 0]),
    B2: h([ 0,-1, 0, -1,-1, 0, -1, 0, 0,  0,-1, 0, -1,-1, 0, -1, 0, 0]),
    B4: h([-1, 0, 0, -1, 0, 0, -1,-1, 0,  0,-1, 0,  0, 0, 0,  0, 0,-1]),
    B5: h([-1,-1, 0, -1, 0,-1, -1, 0, 1, -1,-1, 0,  0, 0, 0,  0,-1, 0]),
    B7: h([ 0,-1,-1, -1, 0, 0,  0,-1,-1,  0,-1, 0,  0,-1, 0, -1,-1, 0]),
  };
  const main = scoreMainGame({
    teamIds: ids, scores: card1028, payouts: { 1: 2, 2: 1, 3: -1, 4: -1, 5: -1 },
    decisions: {}, tieDefault: "hole", segments: segmentsFor(3),
  });
  check("each bay's match money, at $25",
    ids.map((t) => (main.unitsByTeam[t] ?? 0) * 25), [162.5, -25, -150, -25, 37.5]);

  const side = scoreFb18({
    teamIds: ids, scores: card1028,
    payouts: {
      front: defaultFb18Payouts(5, "front"), back: defaultFb18Payouts(5, "back"),
      total: defaultFb18Payouts(5, "total"), second: defaultFb18Payouts(5, "second"),
    },
  });
  const pot = (seg: string, rate: number) => {
    const r = side.results.find((x) => x.segment === seg)!;
    return ids.map((t) => (r.awards.find((a) => a.teamId === t)?.units ?? 0) * rate);
  };
  check("F9: Bay 1 and Bay 7 tied at -5 and split it, $15 each",
    pot("front", 10), [15, -10, -10, -10, 15]);
  check("B9", pot("back", 10), [40, -10, -10, -10, -10]);
  check("1ST 18", pot("total", 10), [40, -10, -10, -10, -10]);
  check("2ND 18", pot("second", 5), [-5, -5, -5, -5, 20]);
}

console.log("\n=== who is shown money ===");
{
  const player = modeFrom(false, undefined);
  check("a player is never shown money", player.showMoney, false);
  check("and is never offered the toggle", player.isAdmin, false);

  // A forged cookie can only ever take money away from someone who was
  // not going to be shown any, so this is inert rather than a hole.
  check("a forged cookie cannot turn money on for a player",
    modeFrom(false, "0").showMoney, false);
  check("nor does it make them look like an admin",
    [modeFrom(false, "1").isAdmin, modeFrom(false, "1").asPlayer], [false, false]);

  const admin = modeFrom(true, undefined);
  check("an admin with no cookie sees money", admin.showMoney, true);
  check("and is not in the player view", admin.asPlayer, false);

  const preview = modeFrom(true, "1");
  check("an admin previewing the player view loses money",
    preview.showMoney, false);
  check("but stays an admin, so the way back is still on screen",
    [preview.isAdmin, preview.asPlayer], [true, true]);

  check("only the exact opt in value counts, so a stale cookie is ignored",
    ["", "0", "true", "yes", "01"].map((v) => modeFrom(true, v).showMoney),
    [true, true, true, true, true]);
  check("showMoney is always the opposite of asPlayer for an admin",
    [modeFrom(true, "1"), modeFrom(true, undefined)]
      .every((m) => m.showMoney === !m.asPlayer), true);
}

// November 11 card: Bays 3 and 5 shared the front, ahead of Bay 1.
{
  const teamIds = ["1", "2", "3", "4", "5"];
  const holeRows = [
    [-1,-1,-1, 0,-1,0, 0,-1,-1, -1,-1,-1, -1,-1,-1, 0,-1,-1],
    [-1,0,-1, 0,0,0, 0,-2,-1, -1,-1,0, 0,-1,0, 0,1,-1],
    [-1,-1,0, -1,-1,-1, 0,-1,0, -1,-1,0, 0,-1,-1, 1,-1,-2],
    [0,-1,-1, -1,-1,0, 0,-1,0, -1,-1,-1, 0,-1,-1, 0,0,-2],
    [-1,-1,0, -1,-1,0, 0,-1,-1, -1,-1,0, 0,-1,-1, 0,-1,0],
  ];
  const scores = Object.fromEntries(teamIds.map((id, i) =>
    [id, Object.fromEntries(holeRows[i].map((score, j) => [j + 1, score]))]));
  const main = scoreMainGame({ teamIds, scores, decisions: {}, tieDefault: "hole",
    payouts: { 1: 2, 2: 1, 3: -1, 4: -1, 5: -1 }, segments: segmentsFor(3) });
  const first = { 1: 4, 2: -1, 3: -1, 4: -1, 5: -1 };
  const payouts = { front: first, back: first, total: first, second: { ...first, 1: -1, 2: 4 } };
  const fb18 = scoreFb18({ teamIds, scores, payouts,
    frontMoneyTiers: [["3","5"],["1"]], overallMoneyOrder: ["4","3"] });
  const side = fb18DollarsBySegment(fb18.results, { front: 10, back: 10, total: 10, second: 5 });
  check("November 11 front nine per share", teamIds.map(id => side[id].front), [-10,-10,15,-10,15]);
  const rosters = Object.fromEntries(teamIds.map(id => [id,
    Array.from({ length: id === "1" ? 5 : 4 }, (_, i) => id + "-" + i)]));
  const breakdownByTeam = Object.fromEntries(teamIds.map(id =>
    [id, bd(main.unitsByTeam[id] * 25, side[id].front, side[id].back, side[id].total + side[id].second)]));
  const money = awardMoney({ breakdownByTeam, rosters, rakePerPlayer: 35,
    cupEligible: "gross" });
  const each = teamIds.map(id => money.find(player => player.teamId === id)!);
  check("November 11 net per player", each.map(p => p.dollars), [150,-145,-28,-103,-95]);
  check("November 11 points from settled whole-dollar categories",
    cupPointsForPlayers(each, "season").map(p => [p.fromMoney, p.bonus, p.total]),
    [[133,52,185],[0,0,0],[17,0,17],[0,0,0],[0,0,0]]);
  check("November 11 team settlements", teamIds.map(id =>
    money.filter(p => p.teamId === id).reduce((sum, p) => sum + p.dollars, 0)), [750,-580,-112,-412,-380]);
  const stale = scoreFb18({ teamIds, scores, payouts, frontMoneyTiers: [["3","5"]] });
  check("a ruling for different tied bays does not override the countback",
    stale.results[0].awards, scoreFb18({ teamIds, scores, payouts }).results[0].awards);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
