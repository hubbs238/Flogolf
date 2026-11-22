import Link from "next/link";
import type { ReactNode } from "react";

export function GolferProfileLink({
  golferId, children, className = "", newTab = false,
}: {
  golferId: string | null | undefined;
  children: ReactNode;
  className?: string;
  newTab?: boolean;
}) {
  if (!golferId) return <span className={className}>{children}</span>;

  return (
    <Link
      href={`/golfer/${golferId}`}
      prefetch={false}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener" : undefined}
      className={`rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fairway-400 ${className}`}
    >
      {children}
      {newTab && <span className="sr-only"> (opens in a new tab)</span>}
    </Link>
  );
}
