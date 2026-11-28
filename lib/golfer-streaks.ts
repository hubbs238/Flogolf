export type GolferStreak = { kind: "hot" | "cold"; weeks: number };

type StreakRound = {
  /** League date from the scorecard, in YYYY-MM-DD format. */
  date: string;
  /** A null settlement makes that golfer's weekly result unknown. */
  players: readonly { golferId: string; preRakeMoney: number | null }[];
};

const mondayEpoch = Date.UTC(1970, 0, 5);
const weekMs = 7 * 24 * 60 * 60 * 1000;

/** Current runs of three or more calendar weeks, as of the latest completed round supplied. */
export function getGolferStreaks(rounds: readonly StreakRound[]): Map<string, GolferStreak> {
  const weeklyMoney = new Map<number, Map<string, number | null>>();
  let latestWeek = -Infinity;
  for (const { date, players } of rounds) {
    const week = Math.floor((Date.parse(date + "T00:00:00Z") - mondayEpoch) / weekMs);
    if (!Number.isFinite(week)) continue;
    latestWeek = Math.max(latestWeek, week);
    const money = weeklyMoney.get(week) ?? new Map<string, number | null>();
    for (const { golferId, preRakeMoney } of players) {
      const previous = money.get(golferId);
      money.set(golferId, previous === null || preRakeMoney === null ? null : (previous ?? 0) + preRakeMoney);
    }
    weeklyMoney.set(week, money);
  }

  const streaks = new Map<string, GolferStreak>();
  for (const [golferId, money] of weeklyMoney.get(latestWeek) ?? []) {
    const sign = Math.sign(money ?? 0);
    if (sign === 0) continue;
    let weeks = 1;
    while (Math.sign(weeklyMoney.get(latestWeek - weeks)?.get(golferId) ?? 0) === sign) {
      weeks++;
    }
    if (weeks >= 3) streaks.set(golferId, { kind: sign > 0 ? "hot" : "cold", weeks });
  }
  return streaks;
}
