import { WineGuess } from "@/types/tasting";

/** A blank guess for a wine, used to seed a new guest's submission. */
export function emptyWineGuess(wineId: string): WineGuess {
  return {
    wineId,
    country: "",
    region: "",
    grapeBlendMode: "single",
    grapeBlend: "",
    producer: "",
    wineName: "",
    vintage: "",
    rating: null,
    confidence: "medium",
    note: "",
  };
}
