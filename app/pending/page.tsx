import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import { Logo } from "@/components/logo";

export default async function PendingPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.profile?.is_approved) redirect("/");

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-4 flex justify-center">
          <Logo size={56} className="rounded-2xl" />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          Hang on a second
        </h1>
        <p className="mt-3 text-muted">
          You are signed in as{" "}
          <span className="font-medium text-ink">{session.email}</span>, but that
          address is not on the list yet.
        </p>
        <p className="mt-2 text-sm text-muted">
          Ask whoever runs the league to add you, then refresh this page. If you
          signed in with the wrong Google account, sign out and try the other
          one.
        </p>

        <div className="mt-8">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
