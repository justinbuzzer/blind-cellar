/**
 * Returns a new array with the item at `index` swapped with its neighbour in
 * the given direction. Returns the same array reference, unchanged, if the
 * move would go out of bounds (already first/last) — callers can use that to
 * decide whether to disable a move button.
 */
export function moveItem<T>(items: T[], index: number, direction: "up" | "down"): T[] {
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= items.length || targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }
  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}
