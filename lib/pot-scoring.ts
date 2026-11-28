import { FIVE_PLAYER_POINTS_MULTIPLIER, POINT_MULTIPLIER, type RoundType } from "./game";

export type PotSettings = {
  entryFee: number;
  rake: number;
  weights: readonly [number, number, number];
};

export const DEFAULT_POT_SETTINGS: PotSettings = {
  entryFee: 200,
  rake: 35,
  weights: [60, 30, 10],
};

export type PotPlayer = {
  id: string;
  name: string;
  slot: number;
  currentPoints: number;
  currentNet: number;
};

export type PotTeam = {
  id: string;
  name: string;
  slot: number;
  matchUnits: number;
  frontUnits: number;
  backUnits: number;
  total18Units: number;
  players: PotPlayer[];
};

export type PotRound = {
  id: string;
  name: string;
  date: string;
  roundType: RoundType;
  teams: PotTeam[];
  incompleteReason?: string;
};

export type PotTeamResult = {
  teamId: string;
  place: number;
  units: number;
  payout: number;
};

export type PotPlayerResult = {
  golferId: string;
  teamId: string;
  place: number;
  payout: number;
  net: number;
  points: number;
  isFivePlayerTeam: boolean;
};

export type PotResult = {
  playerCount: number;
  grossPot: number;
  totalRake: number;
  prizePot: number;
  teams: PotTeamResult[];
  players: PotPlayerResult[];
};

export function validatePotSettings(settings: PotSettings): string | null {
  const { entryFee, rake, weights } = settings;
  if (!Number.isSafeInteger(entryFee) || entryFee < 0) return "Enter a nonnegative whole-dollar entry fee.";
  if (!Number.isSafeInteger(rake) || rake < 0) return "Enter a nonnegative whole-dollar rake.";
  if (rake > entryFee) return "Rake cannot exceed the entry fee.";
  if (weights.length !== 3 || weights.some(w =>
    !Number.isFinite(w) || w < 0 || w > 100 || Math.round(w * 100) / 100 !== w
  )) return "Enter percentages between 0 and 100 with up to two decimal places.";
  if (weights.reduce((sum, w) => sum + Math.round(w * 100), 0) !== 10000) {
    return "The three payout percentages must add up to 100%.";
  }
  return null;
}

function playerCountOf(round: PotRound) {
  return round.teams.reduce((sum, team) => sum + team.players.length, 0);
}

export function potRoundIssue(round: PotRound, settings: PotSettings): string | null {
  const issue = validatePotSettings(settings) ?? round.incompleteReason;
  if (issue) return issue;
  if (!round.teams.length) return "This round has no teams.";
  if (round.teams.some(team => !team.players.length)) return "A team has no recorded players.";
  if (round.teams.some(team =>
    ![team.matchUnits, team.frontUnits, team.backUnits, team.total18Units].every(Number.isFinite)
  )) return "A team is missing the units needed to rank this round.";
  if (!settings.weights.slice(0, round.teams.length).some(w => w > 0)) {
    return "Assign a positive payout percentage to a place available in this round.";
  }
  if (!Number.isSafeInteger(settings.entryFee * playerCountOf(round))) return "The round pot is too large.";
  return null;
}

/** Allocate whole dollars to occupied places, giving spare dollars to the largest remainders. */
function placePrizes(pot: number, weights: readonly number[]): number[] {
  const basisPoints = weights.map(w => Math.round(w * 100));
  const sum = basisPoints.reduce((a, b) => a + b, 0);
  // Splitting the numerator before multiplication also works for large safe-integer pots.
  const shares = basisPoints.map((weight, index) => {
    const partial = (pot % sum) * weight;
    const dollars = Math.floor(pot / sum) * weight + Math.floor(partial / sum);
    return { index, dollars, remainder: partial % sum };
  });
  const prizes = shares.map(share => share.dollars);
  const extra = pot - prizes.reduce((a, b) => a + b, 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const share of shares.slice(0, extra)) prizes[share.index]++;
  return prizes;
}

/** Equal whole-dollar split; the first slots receive any single-dollar remainder. */
function equalShare(dollars: number, size: number, slotIndex: number) {
  return Math.floor(dollars / size) + Number(slotIndex < dollars % size);
}

function bySlot(a: { slot: number; id: string }, b: { slot: number; id: string }) {
  return a.slot - b.slot || a.id.localeCompare(b.id);
}

export function scorePotRound(round: PotRound, settings: PotSettings): PotResult | null {
  if (potRoundIssue(round, settings)) return null;
  const playerCount = playerCountOf(round);
  const grossPot = playerCount * settings.entryFee;
  const totalRake = playerCount * settings.rake;
  const prizePot = grossPot - totalRake;
  const prizes = placePrizes(prizePot, settings.weights.slice(0, round.teams.length));
  const ranked = round.teams.map(team => ({
    team,
    // Equivalent fractional wins (e.g. thirds) should tie regardless of addition order.
    units: Number((team.matchUnits + team.frontUnits + team.backUnits + team.total18Units).toFixed(9)),
  })).sort((a, b) => b.units - a.units || bySlot(a.team, b.team));

  const teams: PotTeamResult[] = [];
  const players: PotPlayerResult[] = [];
  const playingStake = settings.entryFee - settings.rake;
  for (let start = 0; start < ranked.length;) {
    let end = start + 1;
    while (end < ranked.length && ranked[end].units === ranked[start].units) end++;
    const place = start + 1;
    const groupPayout = prizes.slice(start, end).reduce((sum, amount) => sum + amount, 0);
    for (let i = start; i < end; i++) {
      const { team, units } = ranked[i];
      const payout = equalShare(groupPayout, end - start, i - start);
      teams.push({ teamId: team.id, place, units, payout });
      const roster = [...team.players].sort(bySlot);
      const isFivePlayerTeam = roster.length === 5;
      const multiplier = POINT_MULTIPLIER[round.roundType] * (isFivePlayerTeam ? FIVE_PLAYER_POINTS_MULTIPLIER : 1);
      roster.forEach((player, index) => {
        const playerPayout = equalShare(payout, roster.length, index);
        players.push({
          golferId: player.id, teamId: team.id, place, payout: playerPayout,
          net: playerPayout - settings.entryFee,
          points: Math.max(0, playerPayout - playingStake) * multiplier,
          isFivePlayerTeam,
        });
      });
    }
    start = end;
  }
  return { playerCount, grossPot, totalRake, prizePot, teams, players };
}
