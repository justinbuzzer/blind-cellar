/** Rounds to one decimal place, e.g. for accuracy percentages. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
