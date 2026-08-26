/**
 * Checks the match scoring engine against the worked example that was
 * agreed before any of it was written, plus the edge cases around it.
 *
 *   npx tsx scripts/verify-game.ts
 */
import {
  eighteenHoleBonuses,
  scoreMainGame,
  scoreFb18,
  splitMoney,
  resolveSuddenDeath,
  type HoleScores,
  type PayoutTable,
} from "../lib/game";

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

console.log("\n=== a tie that never breaks is a push ===");
{
  const same = Array.from({ length: 18 }, () => 4);
  const s: HoleScores = { A: card(...same), B: card(...same) };
  const { unitsByTeam } = scoreMainGame({
    teamIds: ["A", "B"], scores: s,
    payouts: { 1: 2, 2: -2 }, decisions: {}, tieDefault: "hole",
  });
  check("identical all 18: nobody collects", [unitsByTeam.A, unitsByTeam.B], [0, 0]);
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
  check("eighteen hole tie pushes", total.pushed, [1, 2]);
  check("and pays nobody", total.awards.map((a) => a.units), [0, 0]);
}

console.log("\n=== money, split at player level ===");
{
  const money = splitMoney({
    dollarsByTeam: { t1: 1000, t2: -400 },
    cupDollarsByTeam: { t1: 1000, t2: -400 },
    rosters: { t1: ["p1", "p2", "p3", "p4"], t2: ["p5", "p6", "p7", "p8"] },
  });
  check("a $1000 team win is $250 each",
    money.filter((m) => m.teamId === "t1").map((m) => m.dollars), [250, 250, 250, 250]);
  check("losses split too",
    money.filter((m) => m.teamId === "t2").map((m) => m.dollars), [-100, -100, -100, -100]);
}
{
  const money = splitMoney({
    dollarsByTeam: { t1: 90 }, cupDollarsByTeam: { t1: 90 },
    rosters: { t1: ["p1", "p2", "p3"] },
  });
  check("a short roster splits three ways, not four",
    money.map((m) => m.dollars), [30, 30, 30]);
}

console.log("\n=== front and back nine money does not move the Cup ===");
{
  // Team won $300 all in: $100 main, $120 from the front and back nines,
  // $80 from the eighteen. Only $180 of it counts toward points.
  const money = splitMoney({
    dollarsByTeam: { t1: 300 },
    cupDollarsByTeam: { t1: 180 },
    rosters: { t1: ["p1", "p2", "p3", "p4"] },
  });
  check("money column reports the full share", money[0].dollars, 75);
  check("Cup share excludes the nines", money[0].cupDollars, 45);
}

console.log("\n=== best eighteen bonus ===");
{
  // A -3, B -1, C +2 over eighteen.
  const par = Array.from({ length: 18 }, () => 0);
  const with3Under = [...par]; with3Under[0] = -1; with3Under[1] = -1; with3Under[2] = -1;
  const with1Under = [...par]; with1Under[0] = -1;
  const with2Over  = [...par]; with2Over[0] = 1; with2Over[1] = 1;

  const s: HoleScores = {
    A: card(...with3Under), B: card(...with1Under), C: card(...with2Over),
  };
  const tiers = eighteenHoleBonuses(["A", "B", "C"], s);
  check("best eighteen takes 50", tiers[0], { teamIds: ["A"], total: -3, bonus: 50 });
  check("runner up takes 25", tiers[1], { teamIds: ["B"], total: -1, bonus: 25 });
  check("third place gets nothing", tiers.length, 2);
}
{
  // A and B tie for best, C behind.
  const par = Array.from({ length: 18 }, () => 0);
  const under = [...par]; under[0] = -2;
  const over = [...par]; over[0] = 1;
  const s: HoleScores = { A: card(...under), B: card(...under), C: card(...over) };
  const tiers = eighteenHoleBonuses(["A", "B", "C"], s);
  check("tied leaders each take the full 50", tiers[0], { teamIds: ["A", "B"], total: -2, bonus: 50 });
  check("next distinct score takes 25", tiers[1], { teamIds: ["C"], total: 1, bonus: 25 });
}
{
  const partial = Array.from({ length: 17 }, () => 0);
  const s: HoleScores = { A: card(...partial), B: card(...partial) };
  check("no bonus while a card is unfinished", eighteenHoleBonuses(["A", "B"], s), []);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
