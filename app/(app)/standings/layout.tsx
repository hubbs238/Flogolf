import Link from "next/link";
import { requireUser } from "@/lib/auth";

const TABS = [
  { href: "/standings", label: "FLO Cup Standings" },
  { href: "/standings/money", label: "FLO Tour Money Leaders" },
] as const;

export default async function StandingsLayout({ children }: LayoutProps<"/standings">) {
  await requireUser();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">FLO Cup</h1>
      <nav className="mt-4 mb-8 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-t-lg px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-raised hover:text-ink"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
