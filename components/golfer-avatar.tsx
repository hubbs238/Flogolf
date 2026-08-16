import Image from "next/image";
import { initials } from "@/lib/scoring";

const SIZES = {
  sm: "h-9 w-9 text-xs",
  md: "h-14 w-14 text-base",
  lg: "h-24 w-24 text-2xl",
};

export function GolferAvatar({
  name,
  url,
  size = "md",
}: {
  name: string;
  url: string | null;
  size?: keyof typeof SIZES;
}) {
  const pixels = size === "sm" ? 36 : size === "md" ? 56 : 96;

  return (
    <div
      className={`${SIZES[size]} relative shrink-0 overflow-hidden rounded-full bg-fairway-100 dark:bg-fairway-800 ring-1 ring-line`}
    >
      {url ? (
        <Image
          src={url}
          alt={name}
          width={pixels}
          height={pixels}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-semibold text-fairway-700 dark:text-fairway-200">
          {initials(name)}
        </div>
      )}
    </div>
  );
}
