/**
 * A small hoverable note. Uses the native title attribute so it works
 * without JavaScript and reads correctly to assistive tech, which a custom
 * tooltip on a table header would not.
 */
export function InfoIcon({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      role="img"
      className="ml-1 inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-full border border-current align-text-top text-[9px] font-bold leading-none"
    >
      i
    </span>
  );
}

export const BONUS_MONEY_NOTE = "Bonus Money does not impact Points";
