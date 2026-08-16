import Image from "next/image";

/**
 * The Flo Golf mark. Lives at public/logo.png.
 *
 * The artwork carries its own dark green field, so it sits on rounded
 * corners rather than on a tinted background of ours.
 */
export function Logo({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/logo.png"
      alt="Flo Golf"
      width={size}
      height={size}
      priority
      className={`rounded-xl ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
