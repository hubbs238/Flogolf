// The staging practice fixture has its own roster. It must not advance the league's streak week.
const stagingDemoRoundId = "9231103f-c495-4276-b135-57a63fb1fb89";

export function isLeagueStreakRound(roundId: string): boolean {
  return process.env.FLO_APP_ENV !== "staging" || roundId !== stagingDemoRoundId;
}
