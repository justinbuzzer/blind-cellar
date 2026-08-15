import { describe, expect, it } from "vitest";
import { emptyWineGuess, winesRequiringGuess } from "@/lib/guess";

describe("winesRequiringGuess", () => {
  it("excludes wines the caller contributed", () => {
    const wines = [
      { id: "a", isOwnBottle: false },
      { id: "b", isOwnBottle: true },
      { id: "c", isOwnBottle: false },
    ];
    expect(winesRequiringGuess(wines).map((w) => w.id)).toEqual(["a", "c"]);
  });

  it("returns every wine when none are the caller's own", () => {
    const wines = [
      { id: "a", isOwnBottle: false },
      { id: "b", isOwnBottle: false },
    ];
    expect(winesRequiringGuess(wines)).toHaveLength(2);
  });

  it("returns an empty array when every wine is the caller's own", () => {
    const wines = [
      { id: "a", isOwnBottle: true },
      { id: "b", isOwnBottle: true },
    ];
    expect(winesRequiringGuess(wines)).toEqual([]);
  });

  it("returns an empty array for an empty wine list", () => {
    expect(winesRequiringGuess([])).toEqual([]);
  });
});

describe("emptyWineGuess", () => {
  it("still returns a blank guess unrelated to ownership", () => {
    expect(emptyWineGuess("wine-1").wineId).toBe("wine-1");
  });
});
