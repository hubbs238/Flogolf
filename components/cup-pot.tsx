"use client";

import { useEffect, useRef, useState } from "react";
import type { CupPot } from "@/lib/match-data";

/**
 * Counts from zero to the target with an ease-out curve.
 *
 * Returns the final value immediately when the viewer prefers reduced
 * motion, so nobody gets a number ticking in their peripheral vision.
 */
function useCountUp(target: number, ms = 1400) {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    // Reduced motion takes the same path with a zero length run, so the
    // first frame lands on the final value. Branching to a synchronous
    // setState here would trigger a cascading render.
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

export function CupPot({ pot }: { pot: CupPot }) {
  const shown = useCountUp(pot.total);

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-fairway-900 via-fairway-800 to-fairway-900 p-6 text-white shadow-sm">
      <div className="flex flex-wrap items-center gap-6">
        <Trophy />

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fairway-200">
            FLO Cup pot
          </p>
          <p className="mt-1 text-4xl font-semibold tabular-nums sm:text-5xl">
            ${shown.toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-fairway-200">
            {pot.entries.toLocaleString()}{" "}
            {pot.entries === 1 ? "entry" : "entries"} across{" "}
            {pot.rounds} {pot.rounds === 1 ? "round" : "rounds"}, at $
            {pot.perEntry} a player per round.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Trophy with the pot level rising inside it and a shine sweeping across.
 *
 * Everything animates in CSS rather than JavaScript so it costs nothing to
 * run, and every animation sits behind a reduced-motion guard.
 */
function Trophy() {
  return (
    <div className="shrink-0">
      <svg
        viewBox="0 0 96 112"
        role="img"
        aria-label="FLO Cup trophy"
        className="h-28 w-24 drop-shadow-lg"
      >
        <defs>
          <linearGradient id="cupGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe9a8" />
            <stop offset="45%" stopColor="#f2c14e" />
            <stop offset="100%" stopColor="#c98f22" />
          </linearGradient>

          <linearGradient id="cupFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff4cc" />
            <stop offset="100%" stopColor="#e0a52c" />
          </linearGradient>

          <linearGradient id="cupShine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>

          {/* The bowl, used to clip the rising level so it never spills. */}
          <clipPath id="cupBowl">
            <path d="M26 12h44v22a22 22 0 0 1-44 0V12Z" />
          </clipPath>
        </defs>

        {/* handles */}
        <path d="M26 18H16a10 10 0 0 0 10 10" fill="none" stroke="url(#cupGold)" strokeWidth="5" strokeLinecap="round" />
        <path d="M70 18h10a10 10 0 0 1-10 10" fill="none" stroke="url(#cupGold)" strokeWidth="5" strokeLinecap="round" />

        {/* bowl */}
        <path d="M26 12h44v22a22 22 0 0 1-44 0V12Z" fill="url(#cupGold)" />

        {/* the pot level, rising on mount */}
        <g clipPath="url(#cupBowl)">
          <rect className="cup-level" x="26" y="12" width="44" height="44" fill="url(#cupFill)" opacity="0.95" />
        </g>

        {/* rim, stem, base */}
        <rect x="24" y="8" width="48" height="6" rx="3" fill="url(#cupGold)" />
        <rect x="43" y="56" width="10" height="18" fill="url(#cupGold)" />
        <rect x="32" y="74" width="32" height="7" rx="3" fill="url(#cupGold)" />
        <rect x="26" y="83" width="44" height="9" rx="4" fill="url(#cupGold)" />

        {/* shine sweeping across */}
        <rect className="cup-shine" x="-30" y="0" width="26" height="112" fill="url(#cupShine)" />
      </svg>
    </div>
  );
}
