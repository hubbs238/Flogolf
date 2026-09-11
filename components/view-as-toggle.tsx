"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setViewAsPlayer } from "@/app/(app)/view-actions";

function useFlip(asPlayer: boolean) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const flip = () =>
    startTransition(async () => {
      await setViewAsPlayer(!asPlayer);
      router.refresh();
    });

  return { flip, pending };
}

/**
 * The way in, at the top of each page that carries money. Admins only.
 *
 * Nothing at all once the player view is on, because the way back lives in the
 * header from then on, where it follows the admin onto pages that have no
 * money and so would otherwise strand them.
 */
export function ViewAsToggle({ asPlayer }: { asPlayer: boolean }) {
  const { flip, pending } = useFlip(asPlayer);
  if (asPlayer) return null;

  return (
    <div className="mb-6 flex justify-end">
      <button
        onClick={flip}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-fairway-300 hover:text-ink disabled:opacity-50"
      >
        <EyeIcon className="h-3.5 w-3.5 shrink-0" />
        {pending ? "Switching..." : "View as player"}
      </button>
    </div>
  );
}

/**
 * The way out, in the app header, so it is on screen on every page for as long
 * as the player view is on. An admin who wandered onto the draft board should
 * not have to guess which page will give them their money back.
 */
export function PlayerViewBanner() {
  const { flip, pending } = useFlip(true);

  return (
    <div className="border-b border-flag-500/30 bg-flag-500/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <EyeIcon className="h-4 w-4 shrink-0 text-flag-500" />
        <span className="min-w-0 flex-1">
          <span className="font-medium">Player view.</span>{" "}
          <span className="text-muted">Money is hidden, points are not.</span>
        </span>
        <button
          onClick={flip}
          disabled={pending}
          className="shrink-0 rounded-lg bg-flag-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-flag-600 disabled:opacity-50"
        >
          {pending ? "Switching..." : "Back to admin view"}
        </button>
      </div>
    </div>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
