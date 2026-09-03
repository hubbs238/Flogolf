import {
  awardMoney,
  eighteenHoleBonuses,
  fb18DollarsByTeam,
  resolveSuddenDeath,
  roundPoints,
  scoreFb18,
  scoreMainGame,
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
  check("eighteen hole tie pushes", total.pushed, [1, 2]);
  check("and pays nobody", total.awards.map((a) => a.units), [0, 0]);
}

console.log("\n=== a unit pays every player, it is not divided ===");
{
  // 3 units at $100 is $300 each, so a four man team collects $1,200.
  const money = awardMoney({
    dollarsPerPlayerByTeam: { t1: 300, t2: -300 },
    cupDollarsPerPlayerByTeam: { t1: 300, t2: -300 },
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
    dollarsPerPlayerByTeam: { t1: 90 },
    cupDollarsPerPlayerByTeam: { t1: 90 },
    rosters: { t1: ["p1", "p2", "p3"] },
  });
  check("a man short still earns the same each",
    money.map((m) => m.dollars), [90, 90, 90]);
  check("so the team total is 270, not 90",
    money.reduce((n, m) => n + m.dollars, 0), 270);
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
  const dollars = fb18DollarsByTeam(results, { front: 20, back: 20, total: 50 });
  check("A: front $20 plus the eighteen $50", dollars.A, 70);
  check("B: back nine only, $20", dollars.B, 20);

  const flat = fb18DollarsByTeam(results, { front: 20, back: 20, total: 20 });
  check("same units, one flat rate, totals differ", [flat.A, flat.B], [40, 20]);
}

console.log("\n=== FB18 money does not move the Cup ===");
{
  const money = awardMoney({
    dollarsPerPlayerByTeam: { t1: 300 },
    cupDollarsPerPlayerByTeam: { t1: 180 },
    rosters: { t1: ["p1", "p2", "p3", "p4"] },
  });
  check("money column reports the full figure", money[0].dollars, 300);
  check("Cup figure excludes FB18 entirely", money[0].cupDollars, 180);
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
  const fb = fb18DollarsByTeam(results, { front: 20, back: 20, total: 50 });

  // A: +20 front, -20 back, +50 eighteen = +50. B is the mirror.
  check("FB18 nets out per team", [fb.A, fb.B], [50, -50]);

  // Main game gave A +100 a head. Settlement must carry both.
  const money = awardMoney({
    dollarsPerPlayerByTeam: { A: 100 + fb.A, B: -100 + fb.B },
    cupDollarsPerPlayerByTeam: { A: 100, B: -100 },
    rosters: { A: ["a1", "a2"], B: ["b1", "b2"] },
  });
  check("settlement is main game plus all three segments",
    [money.find((m) => m.golferId === "a1")!.dollars,
     money.find((m) => m.golferId === "b1")!.dollars], [150, -150]);
  check("Cup figure still ignores FB18",
    money.find((m) => m.golferId === "a1")!.cupDollars, 100);
}

console.log("\n=== points earned in a round ===");
{
  // p1..p4 won $200 of Cup money and took the best eighteen.
  // p5..p8 lost $200 and finished second.
  const pts = roundPoints({
    money: [
      ...["p1","p2","p3","p4"].map((golferId) => ({
        golferId, teamId: "t1", dollars: 300, cupDollars: 200,
      })),
      ...["p5","p6","p7","p8"].map((golferId) => ({
        golferId, teamId: "t2", dollars: -200, cupDollars: -200,
      })),
    ],
    bonuses: [
      { teamIds: ["t1"], total: -6, bonus: 50 },
      { teamIds: ["t2"], total: -4, bonus: 25 },
    ],
    rosters: { t1: ["p1","p2","p3","p4"], t2: ["p5","p6","p7","p8"] },
  });

  const winner = pts.find((p) => p.golferId === "p1")!;
  check("winner: 200 from money", winner.fromMoney, 200);
  check("winner: 50 bonus", winner.bonus, 50);
  check("winner: 250 total", winner.total, 250);

  const loser = pts.find((p) => p.golferId === "p5")!;
  check("loser: a $200 loss is only -100 points", loser.fromMoney, -100);
  check("loser: still takes the 25 runner up bonus", loser.bonus, 25);
  check("loser: -75 on the round", loser.total, -75);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
