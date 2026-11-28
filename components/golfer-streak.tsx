import type { CSSProperties } from "react";
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

// Different lengths and spacing give the ice its fractured edge.
const icicles = [
  { left: "2%", width: 8, height: 8 }, { left: "6%", width: 9, height: 14 },
  { left: "14%", width: 7, height: 7 }, { left: "22%", width: 12, height: 17 },
  { left: "26%", width: 6, height: 9 }, { left: "34%", width: 10, height: 13 },
  { left: "43%", width: 13, height: 19 }, { left: "48%", width: 6, height: 8 },
  { left: "57%", width: 11, height: 15 }, { left: "63%", width: 7, height: 9 },
  { left: "74%", width: 12, height: 18 }, { left: "79%", width: 7, height: 10 },
  { left: "87%", width: 9, height: 14 }, { left: "95%", width: 6, height: 7 },
] as const;

function Flames() {
  return (
    <svg viewBox="0 0 240 24" preserveAspectRatio="none" className={styles.flames} focusable="false">
      <path className={styles.outerFlame} d="M0 24V22Q8 23 14 14Q12 21 19 18T29 6Q33 14 27 19Q37 18 40 12Q41 17 39 19Q50 18 52 2Q59 10 52 16Q50 20 58 19Q67 15 67 9Q70 13 67 18Q77 18 82 4Q86 12 79 18Q85 19 93 13Q93 19 99 17Q106 15 109 0Q115 7 110 12Q104 17 110 19Q117 16 121 9Q126 15 120 19Q133 18 139 4Q142 14 136 19Q144 19 150 13Q149 18 155 17Q162 14 165 1Q171 8 165 14Q160 19 168 19Q176 16 180 8Q183 15 177 19Q188 19 193 6Q196 14 190 19Q199 19 205 13Q203 18 209 18Q216 16 220 8Q223 15 219 20Q228 20 232 16Q230 22 240 22V24Z" />
      <path className={styles.innerFlame} d="M0 24Q15 24 24 18Q22 22 28 21Q43 21 50 12Q47 19 52 21Q60 22 64 16Q65 21 70 21Q78 20 83 13Q81 22 89 21Q102 20 108 10Q106 18 111 21Q119 21 124 17Q125 22 131 21Q140 20 145 14Q143 21 150 21Q161 20 166 11Q162 20 169 21Q178 21 182 17Q182 21 190 21Q199 21 204 15Q202 21 210 21Q218 22 225 18Q225 23 240 24Z" />
      <path className={styles.coals} d="M0 24Q24 23 40 22T74 22Q94 23 107 19Q103 22 122 22T154 22Q166 21 170 18Q169 22 182 22T213 22Q227 23 240 24Z" />
    </svg>
  );
}

/** Place inside a relatively positioned, rounded golfer card; content and controls keep their layout. */
export function StreakTile({ streak }: StreakProps) {
  if (!streak) return null;
  return (
    <span aria-hidden="true" className={`${styles.frame} ${styles[streak.kind]}`}>
      <span className={styles.edge}>
        {streak.kind === "hot" ? <Flames /> : icicles.map(({ left, width, height }, index) => (
          <span key={left} className={styles.spike}
            style={{ left, width, height, "--delay": `${-index * 0.37}s` } as CSSProperties} />
        ))}
      </span>
    </span>
  );
}
