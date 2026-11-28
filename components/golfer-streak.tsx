import type { GolferStreak } from "@/lib/golfer-streaks";
import styles from "./golfer-streak.module.css";

type StreakProps = { streak?: GolferStreak | null };

export function StreakBadge({ streak }: StreakProps) {
  if (!streak) return null;
  const hot = streak.kind === "hot";
  const description = `${streak.weeks} consecutive weeks with ${hot ? "positive" : "negative"} pre-rake earnings`;
  return (
    <span className={`${styles.badge} ${styles[streak.kind]}`} title={description}>
      <span className={styles.symbol} aria-hidden="true">{hot ? null : "❄︎"}</span>
      <span aria-hidden="true">{hot ? "Hot" : "Cold"} · {streak.weeks} weeks</span>
      <span className="sr-only">{hot ? "Hot" : "Cold"} streak, {description}</span>
    </span>
  );
}

/** The artwork sits behind the content so the entire tile can carry the streak. */
export function StreakTile({ streak }: StreakProps) {
  if (!streak) return null;
  return (
    <span aria-hidden="true" className={`${styles.frame} ${styles[streak.kind]}`}>
      <span className={styles.artwork} />
      <span className={styles.atmosphere} />
    </span>
  );
}
