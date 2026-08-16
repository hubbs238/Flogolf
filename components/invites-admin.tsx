"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAllowedEmails,
  removeAllowedEmail,
  setApproved,
} from "@/app/(app)/admin/actions";
import type { AllowedEmail, Profile } from "@/lib/types";

export function InvitesAdmin({
  allowed,
  profiles,
}: {
  allowed: AllowedEmail[];
  profiles: Profile[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const byEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p]));
  const waiting = profiles.filter((p) => !p.is_approved);

  function add() {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      const result = await addAllowedEmails(raw);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const parts = [`Added ${result.added}.`];
      if (result.skipped.length > 0) {
        parts.push(`${result.skipped.length} were already on the list.`);
      }
      setSummary(parts.join(" "));
      setRaw("");
      router.refresh();
    });
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) router.refresh();
      else setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold">Who can get in</h2>
        <p className="mt-1 text-sm text-muted">
          Only addresses on this list can sign in. Anyone else who finds the URL
          lands on a holding screen until you let them through. Paste as many
          addresses as you like, separated by spaces, commas, or new lines.
        </p>
      </div>

      <section className="rounded-2xl border border-line bg-raised p-5 shadow-sm">
        <textarea
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          rows={3}
          placeholder="dan@example.com, brian@example.com"
          className="w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-fairway-400"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={add}
            disabled={pending || !raw.trim()}
            className="rounded-xl bg-fairway-600 px-5 py-2.5 font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
          >
            {pending ? "Adding..." : "Add to the list"}
          </button>
          <CopyInvite />
        </div>
        {error && <p className="mt-3 text-sm text-flag-500">{error}</p>}
        {summary && (
          <p className="mt-3 text-sm text-fairway-600 dark:text-fairway-300">
            {summary}
          </p>
        )}
      </section>

      {waiting.length > 0 && (
        <section>
          <h3 className="mb-1 font-semibold">Waiting on you</h3>
          <p className="mb-3 text-sm text-muted">
            These people signed in before their address was on the list.
          </p>
          <ul className="space-y-2">
            {waiting.map((profile) => (
              <li
                key={profile.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-flag-500/40 bg-raised p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {profile.display_name ?? profile.email}
                  </p>
                  <p className="truncate text-xs text-muted">{profile.email}</p>
                </div>
                <button
                  onClick={() => run(() => setApproved(profile.id, true))}
                  disabled={pending}
                  className="rounded-lg bg-fairway-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-fairway-700 disabled:opacity-50"
                >
                  Let them in
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-3 font-semibold">
          On the list ({allowed.length})
        </h3>

        {allowed.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
            Nobody invited yet. You are in because you were the first account.
          </p>
        ) : (
          <ul className="space-y-2">
            {allowed.map((entry) => {
              const profile = byEmail.get(entry.email);
              return (
                <li
                  key={entry.email}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {entry.email}
                    </p>
                    <p className="text-xs text-muted">
                      {profile
                        ? `Signed in as ${profile.display_name ?? profile.email}`
                        : "Has not signed in yet"}
                    </p>
                  </div>
                  <button
                    onClick={() => run(() => removeAllowedEmail(entry.email))}
                    disabled={pending}
                    className="px-2 text-xs text-muted transition hover:text-flag-500 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {allowed.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Removing an address stops a new sign in, but does not sign out
            someone already in. Revoke that on the People tab.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * Sign in is Google only, so an "invite" is really just the URL plus a nudge.
 * Origin is read on the client so this works on localhost and in production
 * without any configuration.
 */
function CopyInvite() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const message = `You're in for the golf draft. Rate the pool here and sign in with Google:\n${window.location.origin}`;

    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      onClick={copy}
      className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium transition hover:border-fairway-300"
    >
      {copied ? "Copied" : "Copy invite message"}
    </button>
  );
}
