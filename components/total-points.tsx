import { FIVE_PLAYER_POINTS_MULTIPLIER } from "@/lib/game";

export function TotalPoints({ value, fivePlayer }: { value: number; fivePlayer: boolean }) {
  return (
    <span className="whitespace-nowrap">
      {value.toLocaleString("en-US")}
      {fivePlayer && (
        <>
          <sup aria-hidden="true">*</sup>
          <span className="sr-only">, includes five-player team scoring</span>
        </>
      )}
    </span>
  );
}

export function FivePlayerPointsNote() {
  return (
    <span>* For a five-player team, each golfer’s round total equals {FIVE_PLAYER_POINTS_MULTIPLIER}× the sum of their match and bonus points.</span>
  );
}
