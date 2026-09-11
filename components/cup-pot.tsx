"use client";

import { useEffect, useRef, useState } from "react";
import type { CupPot as CupPotData } from "@/lib/match-data";

/**
 * Counts from zero to the target with an ease-out curve.
 *
 * Reduced motion takes the same path with a zero length run, so the first
 * frame lands on the final value. Branching to a synchronous setState here
 * would trigger a cascading render.
 */
function useCountUp(target: number, ms = 1600) {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduced || target === 0 ? 0 : ms;
    const start = performance.now();

    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, ms]);

  return value;
}

/**
 * When the pot gets paid out. A literal string rather than a Date, so the
 * server and the browser cannot disagree about the timezone and render two
 * different days.
 */
const SEASON_ENDS = "January 7th 2027";

export function CupPot({ pot }: { pot: CupPotData }) {
  const shown = useCountUp(pot.total);

  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-fairway-900 via-fairway-800 to-fairway-900 px-6 py-8 text-center text-white shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fairway-200">
        FloGolf Degent Cup
      </p>

      <Trophy />

      <p className="mt-4 text-6xl font-semibold leading-none tabular-nums sm:text-7xl">
        ${shown.toLocaleString()}
      </p>

      <p className="mt-3 text-xs font-medium tracking-wide text-fairway-200/80">
        Season ends {SEASON_ENDS}
      </p>
    </section>
  );
}

/**
 * The cup, carrying the FloGolf mark on its face.
 *
 * Centred and sized to be the subject of the card rather than an ornament
 * beside the number. The level rises once on mount and the shine repeats
 * slowly, both in CSS so they cost nothing to run and both stopping under
 * reduced motion.
 */
function Trophy() {
  return (
    <svg
      viewBox="0 0 104 124"
      role="img"
      aria-label="FloGolf Degent Cup trophy"
      className="mt-5 h-60 w-52 shrink-0 drop-shadow-2xl sm:h-72 sm:w-60"
    >
      <defs>
        <linearGradient id="potGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffeeb4" />
          <stop offset="42%" stopColor="#f2c14e" />
          <stop offset="100%" stopColor="#b8801a" />
        </linearGradient>

        <linearGradient id="potFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff6d6" />
          <stop offset="100%" stopColor="#dc9f22" />
        </linearGradient>

        <linearGradient id="potShine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>

        {/* The bowl, clipping the rising level so it never spills. */}
        <clipPath id="potBowl">
          <path d="M22 14h60v30a30 30 0 0 1-60 0V14Z" />
        </clipPath>

        {/* The mark sits on a rounded square, matching the logo artwork. */}
        <clipPath id="potLogo">
          <rect x="38" y="22" width="28" height="28" rx="7" />
        </clipPath>
      </defs>

      {/* handles */}
      <path d="M22 20H9a13 13 0 0 0 13 13" fill="none" stroke="url(#potGold)" strokeWidth="6" strokeLinecap="round" />
      <path d="M82 20h13a13 13 0 0 1-13 13" fill="none" stroke="url(#potGold)" strokeWidth="6" strokeLinecap="round" />

      {/* bowl */}
      <path d="M22 14h60v30a30 30 0 0 1-60 0V14Z" fill="url(#potGold)" />

      {/* the pot level, rising on mount */}
      <g clipPath="url(#potBowl)">
        <rect className="pot-level" x="22" y="14" width="60" height="60" fill="url(#potFill)" opacity="0.92" />
      </g>

      {/* the FloGolf mark on the face of the cup */}
      <g clipPath="url(#potLogo)">
        <image href="/logo.png" x="38" y="22" width="28" height="28" preserveAspectRatio="xMidYMid slice" />
      </g>
      <rect x="38" y="22" width="28" height="28" rx="7" fill="none" stroke="#8a5f10" strokeOpacity="0.5" strokeWidth="1.5" />

      {/* rim, stem, base */}
      <rect x="19" y="9" width="66" height="7" rx="3.5" fill="url(#potGold)" />
      <rect x="46" y="74" width="12" height="20" fill="url(#potGold)" />
      <rect x="34" y="94" width="36" height="8" rx="3" fill="url(#potGold)" />
      <rect x="26" y="104" width="52" height="11" rx="5" fill="url(#potGold)" />

      {/* shine sweeping across */}
      <rect className="pot-shine" x="-34" y="0" width="30" height="124" fill="url(#potShine)" />
    </svg>
  );
}
