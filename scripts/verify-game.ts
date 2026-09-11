import {
  awardMoney,
  fb18DollarsBySegment,
  resolveSuddenDeath,
  roundPoints,
  scoreBonusPoints,
  scoreFb18,
  scoreMainGame,
  type HoleScores,
  type PayoutTable,
} from "../lib/game";
import { modeFrom } from "../lib/view-mode";

/** Shorthand for a money breakdown in fixtures. */
function bd(main: number, front = 0, back = 0, eighteen = 0) {
  return { main, front, back, eighteen };
}

/** Shorthand for a PlayerMoney fixture. */
function pm(golferId: string, teamId: string, main: number, extra = 0, dues = 0) {
  const breakdown = bd(main, extra);
  const winnings = main + extra;
  return {
    golferId, teamId,
    winnings,
    dues,
    dollars: winnings - dues,
    cupDollars: main,
    breakdown,
  };
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
  // Back nine:  A 35, B 38, C 36. So A takes the front on the back nine.
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
  check("front nine totals", [front.totals.A, front.totals.B, front.totals.C], [36, 36, 38]);
  check("front tie goes to A on back nine",
    front.awards.find((a) => a.teamId === "A")?.position, 1);
  check("B takes second on the front",
    front.awards.find((a) => a.teamId === "B")?.position, 2);
  const back = results.find((r) => r.segment === "back")!;
  check("back nine totals", [back.totals.A, back.totals.B, back.totals.C], [35, 38, 36]);
  check("A wins all three segments", unitsByTeam.A, 6);
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
  const money = awardMoney({
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
  const money = awardMoney({
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

console.log("\n=== FB18 money does not move the Cup ===");
{
  // $180 from the main game, $120 across the FB18 segments.
  const money = awardMoney({
    breakdownByTeam: { t1: bd(180, 40, 30, 50) },
    rosters: { t1: ["p1", "p2", "p3", "p4"] },
  });
  check("money column reports the full figure", money[0].dollars, 300);
  check("Cup figure excludes FB18 entirely", money[0].cupDollars, 180);
  check("and the breakdown says where it came from",
    money[0].breakdown, { main: 180, front: 40, back: 30, eighteen: 50 });
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
  const money = awardMoney({
    breakdownByTeam: {
      A: { main: 100, front: perSeg.A.front, back: perSeg.A.back, eighteen: perSeg.A.total },
      B: { main: -100, front: perSeg.B.front, back: perSeg.B.back, eighteen: perSeg.B.total },
    },
    rosters: { A: ["a1", "a2"], B: ["b1", "b2"] },
  });
  check("settlement is main game plus all three segments",
    [money.find((m) => m.golferId === "a1")!.dollars,
     money.find((m) => m.golferId === "b1")!.dollars], [150, -150]);
  check("Cup figure still ignores FB18",
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
    return awardMoney({
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

console.log("\n=== dues come off settlement, never off points ===");
{
  const money = awardMoney({
    breakdownByTeam: { t1: bd(180, 40, 30, 50), t2: bd(-180) },
    rosters: { t1: ["p1", "p2"], t2: ["p3", "p4"] },
    duesPerPlayer: 35,
  });
  const p1 = money.find((m) => m.golferId === "p1")!;
  const p3 = money.find((m) => m.golferId === "p3")!;

  check("winnings are reported before dues", p1.winnings, 300);
  check("dues are held apart, not folded into the breakdown",
    [p1.dues, p1.breakdown], [35, { main: 180, front: 40, back: 30, eighteen: 50 }]);
  check("settlement is winnings less dues", p1.dollars, 265);
  check("a loser pays dues on top of the loss", p3.dollars, -215);
  check("everyone on the card is charged the same, whichever team they are on",
    money.map((m) => [m.teamId, m.dues]),
    [["t1", 35], ["t1", 35], ["t2", 35], ["t2", 35]]);

  // The one that matters: points must not notice dues at all.
  check("dues never touch the Cup figure", [p1.cupDollars, p3.cupDollars], [180, -180]);
  const pts = roundPoints({
    money, bonusByTeam: {}, rosters: { t1: ["p1", "p2"], t2: ["p3", "p4"] },
  });
  check("so the winner still scores the full 180",
    pts.find((p) => p.golferId === "p1")!.total, 180);
  check("and the loser still floors at 0, not at minus the dues",
    pts.find((p) => p.golferId === "p3")!.total, 0);
}
{
  // Winnings balance across a round, dues do not: they leave the group.
  const money = awardMoney({
    breakdownByTeam: { t1: bd(100), t2: bd(-100) },
    rosters: { t1: ["p1", "p2"], t2: ["p3", "p4"] },
    duesPerPlayer: 35,
  });
  const sum = (pick: (m: typeof money[number]) => number) =>
    Math.round(money.reduce((n, m) => n + pick(m), 0) * 100) / 100;

  check("equal rosters: winnings net to zero", sum((m) => m.winnings), 0);
  check("but settlement is short the whole dues take", sum((m) => m.dollars), -140);
  check("which is exactly dues times the players on the card",
    sum((m) => m.dues), 140);
}
{
  // A short roster already unbalances winnings. Dues follow heads, not teams,
  // so the shorthanded side pays less in total.
  const money = awardMoney({
    breakdownByTeam: { t1: bd(100), t2: bd(-100) },
    rosters: { t1: ["p1", "p2", "p3", "p4"], t2: ["p5", "p6", "p7"] },
    duesPerPlayer: 35,
  });
  const duesFor = (team: string) =>
    money.filter((m) => m.teamId === team).reduce((n, m) => n + m.dues, 0);

  check("four players pay four lots of dues", duesFor("t1"), 140);
  check("three players pay three", duesFor("t2"), 105);
  check("and each player's own charge is unchanged by roster size",
    [...new Set(money.map((m) => m.dues))], [35]);
}
{
  const money = awardMoney({
    breakdownByTeam: { t1: bd(100) },
    rosters: { t1: ["p1"] },
  });
  check("no dues argument means no charge",
    [money[0].winnings, money[0].dues, money[0].dollars], [100, 0, 100]);
}
{
  const money = awardMoney({
    breakdownByTeam: { t1: bd(0) },
    rosters: { t1: ["p1"] },
    duesPerPlayer: 12.5,
  });
  check("dues survive a half dollar", money[0].dollars, -12.5);
}
{
  // A cleared input reaches Number() as NaN. Math.max(0, NaN) is NaN, so the
  // clamp alone would poison every row on the round.
  const bad = awardMoney({
    breakdownByTeam: { t1: bd(100) },
    rosters: { t1: ["p1"] },
    duesPerPlayer: Number("") + Number("x"),
  });
  check("a NaN charge falls back to nothing rather than spreading",
    [bad[0].dues, bad[0].dollars], [0, 100]);

  const negative = awardMoney({
    breakdownByTeam: { t1: bd(100) },
    rosters: { t1: ["p1"] },
    duesPerPlayer: -20,
  });
  check("and a negative charge cannot pay anyone",
    [negative[0].dues, negative[0].dollars], [0, 100]);
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

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
