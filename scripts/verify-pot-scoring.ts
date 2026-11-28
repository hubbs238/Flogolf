import assert from "node:assert/strict";
import {
  DEFAULT_POT_SETTINGS as defaults, potRoundIssue, scorePotRound, validatePotSettings,
  type PotRound, type PotSettings, type PotTeam,
} from "../lib/pot-scoring";

function team(slot: number, units: number, size = 4): PotTeam {
  const id = `bay-${slot}`;
  return {
    id, name: id, slot, matchUnits: units, frontUnits: 0, backUnits: 0, total18Units: 0,
    players: Array.from({ length: size }, (_, player) => ({
      id: `${id}-${player}`, name: `Golfer ${player + 1}`, slot: player + 1, currentPoints: 0, currentNet: 0,
    })),
  };
}
function round(teams: PotTeam[], roundType: PotRound["roundType"] = "season"): PotRound {
  return { id: "round", name: "Test round", date: "2026-11-18", roundType, teams };
}

const example = round([team(1, 4), team(2, 2), team(3, 1), team(4, -1), team(5, -2)]);
const original = JSON.stringify(example);
const result = scorePotRound(example, defaults)!;
assert.equal(JSON.stringify(example), original);
assert.deepEqual([result.playerCount, result.grossPot, result.totalRake, result.prizePot], [20, 4000, 700, 3300]);
assert.deepEqual(result.teams.map(t => t.payout), [1980, 990, 330, 0, 0]);
assert.deepEqual(result.players.slice(0, 4).map(p => [p.payout, p.net, p.points]),
  Array(4).fill([495, 295, 330]));
assert.ok(result.players.slice(-8).every(p => p.payout === 0 && p.net === -200 && p.points === 0));
assert.equal(result.players.reduce((sum, p) => sum + p.net, 0), -700);

const uneven = round([team(1, 2, 5), team(2, 1, 3), team(3, -3, 4)], "major");
const major = scorePotRound(uneven, defaults)!;
assert.equal(major.playerCount, 12);
assert.deepEqual(major.players.slice(0, 5).map(p => [p.payout, p.points, p.isFivePlayerTeam]), [
  [238, 182.5, true], [238, 182.5, true], [238, 182.5, true], [237, 180, true], [237, 180, true],
]);
assert.ok(major.players.slice(-4).every(p => p.points === 0 && !p.isFivePlayerTeam));

const fractional = round([team(3, -2), team(2, 0.3), team(1, 0.1)]);
fractional.teams[2].backUnits = 0.2;
const tie = scorePotRound(fractional, { entryFee: 10, rake: 3, weights: [60, 30, 10] })!;
assert.deepEqual(tie.teams.map(t => [t.teamId, t.place, t.payout]), [
  ["bay-1", 1, 38], ["bay-2", 1, 38], ["bay-3", 3, 8],
]);
const threeTiedForThird = scorePotRound(
  round([team(1, 2), team(2, 1), team(3, -1), team(4, -1), team(5, -1)]), defaults,
)!;
assert.deepEqual(threeTiedForThird.teams.map(t => [t.place, t.payout]), [
  [1, 1980], [2, 990], [3, 110], [3, 110], [3, 110],
]);

const sides = round([team(1, 3), team(2, 1), team(3, -1)]);
sides.teams[1].frontUnits = sides.teams[1].backUnits = sides.teams[1].total18Units = 1;
assert.deepEqual(scorePotRound(sides, defaults)!.teams.map(t => t.teamId), ["bay-2", "bay-1", "bay-3"]);

const small = round([team(1, 1), team(2, 0)]);
assert.deepEqual(scorePotRound(small, defaults)!.teams.map(t => t.payout), [880, 440]);
assert.equal(scorePotRound(small, { ...defaults, weights: [0, 0, 100] }), null);
assert.deepEqual(scorePotRound(small, { ...defaults, entryFee: 35 })!.teams.map(t => t.payout), [0, 0]);
assert.equal(scorePotRound({ ...example, incompleteReason: "Missing holes" }, defaults), null);
assert.equal(potRoundIssue({ ...example, incompleteReason: "Missing holes" }, defaults), "Missing holes");
assert.equal(scorePotRound(round([]), defaults), null);
assert.equal(scorePotRound(round([team(1, 0, 0)]), defaults), null);
assert.equal(scorePotRound(round([team(1, NaN)]), defaults), null);
assert.equal(validatePotSettings({ ...defaults, weights: [33.33, 33.33, 33.34] }), null);
for (const invalid of [
  { entryFee: -1 }, { entryFee: 35.5 }, { rake: 201 }, { rake: NaN }, { weights: [50, 30, 10] },
  { weights: [120, -20, 0] }, { weights: [33.333, 33.333, 33.334] },
]) {
  assert.ok(validatePotSettings({ ...defaults, ...invalid } as PotSettings));
}
// Uneven pots and rosters must still return precisely the dollars paid in less rake.
for (const weights of [[60, 30, 10], [0, 75, 25], [33.33, 33.33, 33.34]] as const) {
  for (let size = 2; size <= 6; size++) {
    const sample = round(Array.from({ length: size }, (_, i) => team(i, i % 2, i + 1)));
    const scored = scorePotRound(sample, { entryFee: 157, rake: 18, weights })!;
    assert.equal(scored.teams.reduce((sum, t) => sum + t.payout, 0), scored.prizePot);
    assert.equal(scored.players.reduce((sum, p) => sum + p.payout, 0), scored.prizePot);
    assert.equal(scored.players.reduce((sum, p) => sum + p.net, 0), -scored.totalRake);
    assert.ok(scored.players.every(p => Number.isInteger(p.payout) && p.points >= 0));
  }
}
console.log("Pot scoring checks passed.");
