import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "./types";

export type SessionUser = {
  userId: string;
  email: string;
  profile: Profile | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    profile: (profile as Profile) ?? null,
  };
}

/**
 * Every authenticated page calls this. Proxy is only an optimistic check.
 *
 * A signed in but unapproved account gets parked on /pending rather than
 * shown an empty app, since row level security would return nothing anyway.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (!session.profile?.is_approved) redirect("/pending");
  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireUser();
  if (!session.profile?.is_admin) redirect("/");
  return session;
}
