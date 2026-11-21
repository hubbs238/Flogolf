/**
 * Walks one round through the engine and prints every stage of it.
 *
 * Built for the 11/18/2026 card, which is pasted in below exactly as the
 * database holds it. Nothing here is hand-computed: the segment winners, the
 * carries, the money and the points all come out of lib/game.ts, so what it
 * prints is what the app shows rather than a second opinion about it.
 *
 *   npm run explain-round
 */
import assert from "node:assert/strict";
import {
  scoreMainGame,
  scoreFb18,
  fb18DollarsBySegment,
  awardMoney,
  cupPointsForPlayers,
  segmentsFor,
  nineTotals,
  formatRelative,
  POINT_MULTIPLIER,
  type HoleScores,
  type MoneyBreakdown,
  type PayoutTable,
} from "../lib/game";

// ---------------------------------------------------------------- the round
const ROUND = {
  name: "11/18/2026",
  date: "2026-11-18",
  roundType: "season" as const,
  setHoles: 3 as const,
  tieDefault: "hole" as const,
  rakePerPlayer: 35,
  rates: { main: 25, front: 10, back: 10, total: 10, second: 5 },
};

const PAYOUTS: PayoutTable = { 1: 2, 2: 1, 3: -1, 4: -1, 5: -1 };
const FB18_PAYOUTS: Record<"front" | "back" | "total" | "second", PayoutTable> = {
  front: { 1: 4, 2: -1, 3: -1, 4: -1, 5: -1 },
  back: { 1: 4, 2: -1, 3: -1, 4: -1, 5: -1 },
  total: { 1: 4, 2: -1, 3: -1, 4: -1, 5: -1 },
  second: { 1: -1, 2: 4, 3: -1, 4: -1, 5: -1 },
};

const ROSTERS: Record<string, string[]> = {
  "Team 1": ["Joe Nooch", "Alex C", "Khino", "Mike"],
  "Team 2": ["Kirk", "Andrew Hubbard", "KevHim", "Ricky"],
  "Team 3": ["Josh", "Mitch", "Danh", "Douglas", "Bruce"],
  "Team 4": ["Mike K", "Mike N", "TB", "Harvey"],
  "Team 5": ["Brian", "Kong", "Fox", "Jake", "Cam"],
};

const h = (row: number[]) => Object.fromEntries(row.map((v, i) => [i + 1, v]));
const scores: HoleScores = {
  "Team 1": h([-1,-1,-1, 0,-1,-1,-1,-1,-1,  -1,-1, 0,-1,-2,-1, 0,-1,-1]),
  "Team 2": h([-1,-1, 0,-1,-1, 0,-1, 0,-1,   0,-1, 0, 0, 0, 0, 0,-1, 0]),
  "Team 3": h([-1,-1,-1, 0,-1, 0,-1,-1,-1,  -1,-1,-1, 0,-2,-1,-1,-1,-1]),
  "Team 4": h([-1, 0,-1,-2,-1,-1,-1, 0, 0,  -1,-2,-1, 0,-1,-1, 0,-1,-1]),
  "Team 5": h([-1,-1,-1,-1, 0, 0,-2,-1, 0,  -1,-1, 0,-1,-2, 0,-1,-1,-1]),
};
const teamIds = Object.keys(ROSTERS);

// -------------------------------------------------------------------- run it
const segments = segmentsFor(ROUND.setHoles);
const main = scoreMainGame({
  teamIds, scores, payouts: PAYOUTS, decisions: {},
  tieDefault: ROUND.tieDefault, segments,
});
const fb18 = scoreFb18({ teamIds, scores, payouts: FB18_PAYOUTS, overallMoneyOrder: ["Team 1", "Team 3"] });
const fbDollars = fb18DollarsBySegment(fb18.results, {
  front: ROUND.rates.front, back: ROUND.rates.back, total: ROUND.rates.total, second: ROUND.rates.second,
});
const multiplier = POINT_MULTIPLIER[ROUND.roundType];
const cupEligible = "gross";

const breakdownByTeam: Record<string, MoneyBreakdown> = Object.fromEntries(
  teamIds.map((t) => [t, {
    main: (main.unitsByTeam[t] ?? 0) * ROUND.rates.main,
    front: fbDollars[t]?.front ?? 0,
    back: fbDollars[t]?.back ?? 0,
    eighteen: (fbDollars[t]?.total ?? 0) + (fbDollars[t]?.second ?? 0),
  }]),
);
const money = awardMoney({
  breakdownByTeam, rosters: ROSTERS,
  rakePerPlayer: ROUND.rakePerPlayer, cupEligible,
});
assert.deepEqual(teamIds.map(t => money.find(row => row.teamId === t)?.dollars), [105, -220, 47, -70, -53]);
const points = cupPointsForPlayers(money, ROUND.roundType);

assert.deepEqual(teamIds.map(team => points.find(p => p.teamId === team)?.total), [140, 0, 82, 0, 0]);

// ------------------------------------------------------------------- printing
const money2 = (n: number) => (n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`);
const pad = (s: string, n: number) => s.padEnd(n);
const rpad = (s: string, n: number) => s.padStart(n);

console.log(`\n${"=".repeat(78)}`);
console.log(`  ${ROUND.name}  ${ROUND.date}`);
console.log(`  ${ROUND.roundType} round, six ${ROUND.setHoles}-hole matches, ` +
  `$${ROUND.rates.main} a unit, $${ROUND.rakePerPlayer} rake`);
console.log(`  points: money x${multiplier}, cup-eligible money = ${cupEligible}`);
console.log("=".repeat(78));

console.log("\n--- the card ---------------------------------------------------");
console.log(pad("", 9) + teamIds.map((t) => rpad(t.replace("Team ", "T"), 6)).join(""));
for (const [label, holes] of [
  ["Front 9", null], ["Back 9", null], ["All 18", null],
] as const) {
  const vals = teamIds.map((t) => {
    const n = nineTotals(scores[t]);
    return label === "Front 9" ? n.front : label === "Back 9" ? n.back : n.total;
  });
  console.log(pad(label, 9) + vals.map((v) => rpad(formatRelative(v), 6)).join(""));
  void holes;
}

console.log("\n--- the six matches --------------------------------------------");
console.log("each one scored on its own; a tie carries its units into the next");
for (const s of main.segments) {
  const carried = Object.values(s.carriedIn).some((u) => u !== 0);
  const totals = teamIds.map((t) => rpad(formatRelative(s.totals[t] ?? null), 6)).join("");
  const won = s.awards.filter((a) => a.units > 0).map((a) => a.teamId).join(" and ") || "nobody";
  const out = Object.values(s.carriedOut).some((u) => u !== 0);
  console.log(
    `\nMatch ${s.segment}  holes ${s.holes.join(", ")}` +
    (carried ? "   (carrying units in)" : "") +
    (out ? "   (a tie carried out)" : ""),
  );
  console.log(pad("  scores", 9) + totals);
  console.log(pad("  units", 9) +
    teamIds.map((t) => rpad(String(s.awards.find((a) => a.teamId === t)?.units ?? 0), 6)).join(""));
  console.log(`  won by ${won}`);
}
console.log("\n" + pad("TOTAL units", 13) +
  teamIds.map((t) => rpad(String(main.unitsByTeam[t] ?? 0), 6)).join(""));
console.log(pad(`at $${ROUND.rates.main}`, 13) +
  teamIds.map((t) => rpad(money2((main.unitsByTeam[t] ?? 0) * ROUND.rates.main), 11)).join(""));

console.log("\n--- the side game ---------------------------------------------");
for (const r of fb18.results) {
  const label = r.segment === "total" ? "All 18" : `${r.segment === "second" ? "Second 18" : r.segment + " nine"}`;
  const rate = ROUND.rates[r.segment === "total" ? "total" : r.segment];
  console.log(`\n${label}, at $${rate} a unit`);
  console.log(pad("  scores", 9) + teamIds.map((t) => rpad(formatRelative(r.totals[t] ?? null), 6)).join(""));
  console.log(pad("  units", 9) +
    teamIds.map((t) => rpad(String(r.awards.find((a) => a.teamId === t)?.units ?? 0), 6)).join(""));
  console.log(pad("  money", 9) +
    teamIds.map((t) => rpad(money2((r.awards.find((a) => a.teamId === t)?.units ?? 0) * rate), 11)).join(""));
  const pot = teamIds.reduce(
    (n, t) => n + (r.awards.find((a) => a.teamId === t)?.units ?? 0) * rate, 0);
  if (Math.abs(pot) > 0.004) console.log(`  !! this pot is ${money2(pot)} out of balance`);
}

console.log("\n--- settlement, per player ------------------------------------");
console.log("  each bay divides four shares among its players");
console.log(
  "\n  " + pad("team", 9) + rpad("match", 11) + rpad("F9", 10) + rpad("B9", 10) +
  rpad("18", 11) + rpad("winnings", 12) + rpad("rake", 9) + rpad("net", 11),
);
for (const t of teamIds) {
  const m = money.find((x) => x.teamId === t)!;
  console.log(
    "  " + pad(t, 9) +
    rpad(money2(m.breakdown.main), 11) + rpad(money2(m.breakdown.front), 10) +
    rpad(money2(m.breakdown.back), 10) + rpad(money2(m.breakdown.eighteen), 11) +
    rpad(money2(m.winnings), 12) + rpad(money2(-m.rake), 9) + rpad(money2(m.dollars), 11),
  );
}
const netAll = money.reduce((n, m) => n + m.dollars, 0);
const rakeAll = money.reduce((n, m) => n + m.rake, 0);
console.log(`\n  ${money.length} players, ${money2(rakeAll)} of rake leaves the group`);
console.log(`  every player's net added up: ${money2(netAll)}`);
assert.equal(netAll, -rakeAll);

console.log("\n--- FLO Cup points, per player --------------------------------");
console.log(
  "\n  " + pad("team", 9) + rpad("cup $", 11) + rpad("from money", 13) +
  rpad("bonus", 9) + rpad("total", 9),
);
for (const t of teamIds) {
  const m = money.find((x) => x.teamId === t)!;
  const p = points.find((x) => x.teamId === t)!;
  console.log(
    "  " + pad(t, 9) + rpad(money2(m.cupDollars), 11) +
    rpad(p.fromMoney.toFixed(1), 13) + rpad(p.bonus.toFixed(1), 9) +
    rpad(p.total.toFixed(1), 9),
  );
}

console.log("\n--- who collected what ----------------------------------------");
const byTotal = [...points].sort((a, b) => b.total - a.total);
for (const p of byTotal) {
  const m = money.find((x) => x.golferId === p.golferId)!;
  console.log(
    "  " + pad(p.golferId, 17) + pad(`(${p.teamId})`, 10) +
    rpad(money2(m.dollars), 11) + rpad(`${p.total.toFixed(1)} pts`, 12),
  );
}
console.log();
