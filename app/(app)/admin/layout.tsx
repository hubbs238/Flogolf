import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

const TABS = [
  { href: "/admin", label: "Weights" },
  { href: "/admin/golfers", label: "Golfers" },
  { href: "/admin/invites", label: "Invites" },
  { href: "/admin/users", label: "People" },
  { href: "/admin/diagnostics", label: "Diagnostics" },
] as const;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <nav className="mt-4 mb-8 flex gap-1 border-b border-line">
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
