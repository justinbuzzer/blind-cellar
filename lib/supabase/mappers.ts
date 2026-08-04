import { GuestSubmission, WineAnswerKey, WineGuess } from "@/types/tasting";
import { reconstructBlendComponentsFromText } from "@/lib/wineReferenceData";
import { GuestGuessDTO, GuestVisibleWineRow, RevealedWineGuessRow } from "./types";

/**
 * Maps a post-reveal `guest_visible_wines` row (fully unmasked) to the
 * domain type. `grapeBlendMode` is preserved faithfully as "" when the DB
 * column is null (legacy row, predating this field) — `lib/scoring.ts` has
 * a documented fallback for comparing against an unknown mode. This is a
 * read-only/scoring mapper, so unlike the form-feeding mappers below it does
 * NOT default a missing mode to "single".
 */
export function mapRevealedWineRowToAnswerKey(row: GuestVisibleWineRow): WineAnswerKey {
  return {
    id: row.id,
    code: row.anonymous_code,
    country: row.country ?? "",
    region: row.region ?? "",
    grapeBlendMode: row.grape_blend_mode ?? "",
    grapeBlend: row.grape_style ?? "",
    producer: row.producer ?? "",
    wineName: row.wine_cuvee ?? "",
    vintage: row.vintage ?? "",
    wineStyle: row.wine_style ?? "other",
    tastingOrder: row.tasting_order,
    hostNotes: row.host_notes ?? undefined,
  };
}

/**
 * Maps a guest's own draft-guess DTO (from get_guest_session_state) to the
 * domain type, for use as *editable* guess-entry form state. A missing mode
 * (legacy guess row, or a wine never touched yet) defaults to "single" here
 * since the guess form always needs a concrete segment selected.
 *
 * A blend-mode draft with no structured selectedGrapes/otherGrapesText (a
 * guess saved before the structured picker existed) falls back to
 * re-parsing the flattened grapeBlendGuess text, same as
 * `bottleFormInputFromDto` does for bottles — see
 * `reconstructBlendComponentsFromText`.
 */
export function mapGuestGuessDtoToWineGuess(dto: GuestGuessDTO): WineGuess {
  const grapeBlendMode = dto.grapeBlendMode ?? "single";
  let selectedGrapes = dto.selectedGrapes ?? [];
  let otherGrapesText = dto.otherGrapesText ?? "";
  if (
    grapeBlendMode === "blend" &&
    selectedGrapes.length === 0 &&
    !otherGrapesText &&
    dto.grapeBlendGuess
  ) {
    const reconstructed = reconstructBlendComponentsFromText(dto.grapeBlendGuess);
    selectedGrapes = reconstructed.selectedGrapes;
    otherGrapesText = reconstructed.otherGrapesText;
  }

  return {
    wineId: dto.wineId,
    country: dto.countryGuess,
    region: dto.regionGuess,
    grapeBlendMode,
    grapeBlend: dto.grapeBlendGuess,
    selectedGrapes,
    otherGrapesText,
    producer: dto.producerGuess,
    wineName: dto.wineCuveeGuess,
    vintage: dto.vintageGuess,
    rating: dto.rating,
    confidence: dto.confidence,
    note: dto.tastingNote ?? undefined,
  };
}

/**
 * Maps a post-reveal `revealed_wine_guesses` row to the domain type, for
 * read-only scoring/display. Preserves an unknown mode as "" — see
 * `mapRevealedWineRowToAnswerKey`. Scoring and display only ever need the
 * flattened `grapeBlend` text (see `lib/scoring.ts`), so the structured
 * selectedGrapes/otherGrapesText fields are just left empty here rather than
 * read off the row.
 */
export function mapRevealedGuessRowToWineGuess(row: RevealedWineGuessRow): WineGuess {
  return {
    wineId: row.wine_id,
    country: row.country_guess,
    region: row.region_guess,
    grapeBlendMode: row.grape_blend_mode ?? "",
    grapeBlend: row.grape_style_guess,
    selectedGrapes: [],
    otherGrapesText: "",
    producer: row.producer_guess,
    wineName: row.wine_cuvee_guess,
    vintage: row.vintage_guess,
    rating: row.rating,
    confidence: row.confidence,
    note: row.tasting_note ?? undefined,
  };
}

/**
 * Groups revealed guess rows by guest and builds `GuestSubmission[]`, keeping
 * only guests who actually completed their submission — matching the old
 * local-storage semantics where only `locked` submissions count. This
 * naturally includes the host exactly once, since the host is just another
 * row in `guests` (see `tasting_sessions.host_guest_id`).
 */
export function buildRevealedSubmissions(
  guesses: RevealedWineGuessRow[],
  completedGuests: { id: string; displayName: string }[]
): GuestSubmission[] {
  const completedIds = new Set(completedGuests.map((g) => g.id));
  const byGuest = new Map<string, RevealedWineGuessRow[]>();
  for (const row of guesses) {
    if (!completedIds.has(row.guest_id)) continue;
    const existing = byGuest.get(row.guest_id) ?? [];
    existing.push(row);
    byGuest.set(row.guest_id, existing);
  }

  return completedGuests.map((guest) => ({
    id: guest.id,
    guestId: guest.id,
    guestName: guest.displayName,
    sessionCode: "",
    locked: true,
    guesses: (byGuest.get(guest.id) ?? []).map(mapRevealedGuessRowToWineGuess),
  }));
}
