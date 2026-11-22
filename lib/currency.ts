import { wholeDollars } from "./game";

const unsigned = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
});
const signed = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0, signDisplay: "exceptZero",
});

/** Whole-dollar cash, with an optional plus sign for amounts won. */
export function formatDollars(amount: number, showPlus = false): string {
  return (showPlus ? signed : unsigned).format(wholeDollars(amount));
}
