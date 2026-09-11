import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getViewMode } from "@/lib/view-mode";
import { SignOutButton } from "@/components/sign-out-button";
import { Logo } from "@/components/logo";
import { PlayerViewBanner } from "@/components/view-as-toggle";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireUser();
  const isAdmin = session.profile?.is_admin ?? false;
  const view = await getViewMode(isAdmin);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <Logo size={28} className="rounded-lg" />
            <span className="hidden sm:inline">FLO Golf Tour</span>
          </Link>

          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-muted transition hover:text-ink">
              Golfers
            </Link>
            <Link href="/draft" className="text-muted transition hover:text-ink">
              Drafts
            </Link>
            <Link href="/games" className="text-muted transition hover:text-ink">
              Rounds
            </Link>
            <Link href="/standings" className="text-muted transition hover:text-ink">
              FLO Cup Standings
            </Link>
            {isAdmin && (
              <Link href="/admin" className="text-muted transition hover:text-ink">
                Admin
              </Link>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <span className="hidden text-sm text-muted sm:inline">
              {session.profile?.display_name ?? session.email}
            </span>
            <SignOutButton />
          </div>
        </div>

        {/* Stays with the admin onto pages that have no money of their own. */}
        {view.asPlayer && <PlayerViewBanner />}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
