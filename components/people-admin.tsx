"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  linkProfileToGolfer,
  setAdminFlag,
  setApproved,
} from "@/app/(app)/admin/actions";
import type { Golfer, Profile } from "@/lib/types";

export function PeopleAdmin({
  profiles,
  golfers,
  currentUserId,
}: {
  profiles: Profile[];
  golfers: Golfer[];
  currentUserId: string;
}) {
  const linkedGolferIds = new Set(
    profiles.map((p) => p.golfer_id).filter(Boolean) as string[],
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">People</h2>
        <p className="mt-1 text-sm text-muted">
          Everyone who has signed in shows up here. Linking a login to a golfer
          card is what stops them rating themselves, and it is how captains get
          to make their own picks during a live draft.
        </p>
      </div>

      <ul className="space-y-2">
        {profiles.map((profile) => (
          <PersonRow
            key={profile.id}
            profile={profile}
            golfers={golfers}
            linkedGolferIds={linkedGolferIds}
            isSelf={profile.id === currentUserId}
          />
        ))}
      </ul>

      {profiles.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
          Nobody has signed in yet.
        </p>
      )}
    </div>
  );
}

function PersonRow({
  profile,
  golfers,
  linkedGolferIds,
  isSelf,
}: {
  profile: Profile;
  golfers: Golfer[];
  linkedGolferIds: Set<string>;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleAdmin() {
    setError(null);
    startTransition(async () => {
      const result = await setAdminFlag(profile.id, !profile.is_admin);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  function toggleAccess() {
    setError(null);
    startTransition(async () => {
      const result = await setApproved(profile.id, !profile.is_approved);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  function link(golferId: string) {
    setError(null);
    startTransition(async () => {
      const result = await linkProfileToGolfer(
        profile.id,
        golferId === "" ? null : golferId,
      );
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  // A golfer already claimed by someone else should not be offered again.
  const selectable = golfers.filter(
    (g) => !linkedGolferIds.has(g.id) || g.id === profile.golfer_id,
  );

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {profile.display_name ?? profile.email}
          {isSelf && <span className="ml-2 text-xs text-muted">you</span>}
        </p>
        <p className="truncate text-xs text-muted">{profile.email}</p>
        {error && <p className="text-xs text-flag-500">{error}</p>}
      </div>

      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted">Golfer</span>
        <select
          value={profile.golfer_id ?? ""}
          disabled={pending}
          onChange={(event) => link(event.target.value)}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-fairway-400"
        >
          <option value="">Not linked</option>
          {selectable.map((golfer) => (
            <option key={golfer.id} value={golfer.id}>
              {golfer.name}
              {golfer.nickname ? ` (${golfer.nickname})` : ""}
            </option>
          ))}
        </select>
      </label>

      <button
        onClick={toggleAccess}
        disabled={pending}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
          profile.is_approved
            ? "border-line hover:border-flag-500 hover:text-flag-500"
            : "border-flag-500/50 text-flag-500"
        }`}
      >
        {profile.is_approved ? "Has access" : "No access"}
      </button>

      <button
        onClick={toggleAdmin}
        disabled={pending}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
          profile.is_admin
            ? "border-fairway-300 bg-fairway-50 text-fairway-700 dark:bg-fairway-800 dark:text-fairway-100"
            : "border-line hover:border-fairway-300"
        }`}
      >
        {profile.is_admin ? "Admin" : "Make admin"}
      </button>
    </li>
  );
}
