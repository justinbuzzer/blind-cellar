import { WineGuess } from "@/types/tasting";

/**
 * Filters a participant's bottle list down to the ones they are actually
 * required to guess — see README "Own-bottle guessing exclusion". A
 * contributor's own bottle is never included, since the server (see
 * upsert_wine_guess/lock_wine_guess/complete_guest_submission in
 * supabase/schema.sql) never accepts a guess for it and never counts it
 * toward that guest's required-submission total. `isOwnBottle` is always
 * server-derived (see GuestSessionWineDTO/ActiveBottleDTO) — this function
 * only filters on it, never recomputes ownership itself.
 */
export function winesRequiringGuess<T extends { isOwnBottle: boolean }>(wines: T[]): T[] {
  return wines.filter((wine) => !wine.isOwnBottle);
}

/** A blank guess for a wine, used to seed a new guest's submission. */
export function emptyWineGuess(wineId: string): WineGuess {
  return {
    wineId,
    country: "",
    region: "",
    appellation: "",
    grapeBlendMode: "single",
    grapeBlend: "",
    selectedGrapes: [],
    otherGrapesText: "",
    otherGrapeSelected: false,
    producer: "",
    wineName: "",
    vintage: "",
    rating: null,
    note: "",
  };
}
