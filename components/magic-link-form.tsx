"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        shouldCreateUser: true,
      },
    });

    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-fairway-300 bg-fairway-50 p-4 text-center dark:border-fairway-700 dark:bg-fairway-900/40">
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-sm text-muted">
          We sent a sign in link to{" "}
          <span className="font-medium text-ink">{email}</span>. It works on any
          device, so opening it on your phone is fine.
        </p>
        <button
          onClick={() => {
            setSent(false);
            setError(null);
          }}
          className="mt-3 text-sm text-muted underline transition hover:text-ink"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-2">
      <input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        className="w-full rounded-xl border border-line bg-raised px-4 py-3 outline-none transition focus:border-fairway-400"
      />
      <button
        type="submit"
        disabled={loading || !email.trim()}
        className="w-full rounded-xl border border-line bg-raised px-5 py-3 font-medium transition hover:border-fairway-300 disabled:opacity-60"
      >
        {loading ? "Sending..." : "Email me a sign in link"}
      </button>
      {error && <p className="text-sm text-flag-500">{error}</p>}
    </form>
  );
}
