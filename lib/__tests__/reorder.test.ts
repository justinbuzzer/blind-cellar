import { describe, expect, it } from "vitest";
import { moveItem } from "@/lib/reorder";

describe("moveItem", () => {
  it("swaps an item with its predecessor when moving up", () => {
    expect(moveItem(["a", "b", "c"], 1, "up")).toEqual(["b", "a", "c"]);
  });

  it("swaps an item with its successor when moving down", () => {
    expect(moveItem(["a", "b", "c"], 1, "down")).toEqual(["a", "c", "b"]);
  });

  it("is a no-op moving the first item up", () => {
    const items = ["a", "b", "c"];
    expect(moveItem(items, 0, "up")).toBe(items);
  });

  it("is a no-op moving the last item down", () => {
    const items = ["a", "b", "c"];
    expect(moveItem(items, 2, "down")).toBe(items);
  });

  it("does not mutate the original array", () => {
    const items = ["a", "b", "c"];
    moveItem(items, 1, "up");
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for an out-of-range index", () => {
    const items = ["a", "b", "c"];
    expect(moveItem(items, 5, "up")).toBe(items);
    expect(moveItem(items, -1, "down")).toBe(items);
  });
});
