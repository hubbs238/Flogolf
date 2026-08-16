/**
 * Sanity check for the draft engine. Run with:
 *   npx tsx scripts/verify-draft.ts
 *
 * Uses a deliberately lopsided pool so the difference between Overall and
 * Balanced is obvious rather than a matter of a point here or there.
 */
import { autoDraft, pickSlot, totalPicks } from "../lib/draft";
import { overallScore } from "../lib/scoring";
import type { Characteristic, ScoredGolfer } from "../lib/types";

const characteristics: Characteristic[] = (
  [
    ["d", "distance", "Distance", 25],
    ["p", "putting", "Putting", 25],
    ["s", "short_game", "Short Game", 20],
    ["a", "accuracy", "Accuracy", 20],
    ["c", "clutch", "Clutch", 10],
  ] as const
).map(([id, key, label, weight], index) => ({
  id,
  key,
  label,
  description: null,
  weight,
  sort_order: index + 1,
  active: true,
}));

function golfer(
  name: string,
  d: number,
  p: number,
  s: number,
  a: number,
  c: number,
): ScoredGolfer {
  const scores = { d, p, s, a, c };
  return {
    id: name.toLowerCase().replace(/\s/g, "-"),
    name,
    nickname: null,
    image_path: null,
    in_pool: true,
    created_at: "",
    scores,
    overall: overallScore(scores, characteristics),
    ratingCount: 5,
  };
}

//                          dist  putt  short  acc  clutch
const pool = [
  golfer("Bomber A",          96,   40,    45,   50,    60),
  golfer("Bomber B",          93,   42,    48,   52,    55),
  golfer("Putter A",          50,   96,    70,   65,    70),
  golfer("Putter B",          48,   91,    68,   62,    68),
  golfer("Scrambler",         55,   65,    95,   60,    80),
  golfer("Straight Shooter",  60,   60,    62,   96,    58),
  golfer("Clutch Carl",       65,   70,    66,   68,    96),
  golfer("Steady Eddie",      75,   75,    75,   75,    75),
];

const captains = [
  golfer("Captain Bomber", 94, 45, 50, 55, 60), // long, cannot putt
  golfer("Captain Putter", 52, 94, 72, 66, 70), // putts, no distance
];

console.log("Pool by overall:");
[...pool]
  .sort((x, y) => (y.overall ?? 0) - (x.overall ?? 0))
  .forEach((g) => console.log(`  ${g.overall}  ${g.name}`));

console.log("\nSnake order check (2 teams, 6 picks):");
const order = Array.from({ length: 6 }, (_, i) => pickSlot(i + 1, 2));
console.log(`  ${order.join(" ")}  ${order.join(",") === "1,2,2,1,1,2" ? "OK" : "WRONG"}`);
console.log(`  totalPicks(2 teams, roster 4) = ${totalPicks(2, 4)} (expect 6)`);

for (const strategy of ["overall", "balanced"] as const) {
  console.log(`\n=== ${strategy.toUpperCase()} ===`);
  const teams = autoDraft({
    pool,
    captains,
    teamNames: ["Team Bomber", "Team Putter"],
    rosterSize: 4,
    strategy,
    characteristics,
  });

  for (const team of teams) {
    const members = [team.captain!, ...team.picks];
    const best = characteristics.map((c) => {
      const max = Math.max(...members.map((m) => m.scores[c.id] ?? 0));
      return `${c.label.split(" ")[0]} ${max}`;
    });
    console.log(`\n  ${team.name}`);
    console.log(`    captain: ${team.captain!.name}`);
    team.picks.forEach((p, i) => console.log(`    pick ${i + 1}:  ${p.name}`));
    console.log(`    best ball: ${best.join(" | ")}`);
  }
}
