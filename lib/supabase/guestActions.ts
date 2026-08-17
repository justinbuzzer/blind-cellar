import { SupabaseClient } from "@supabase/supabase-js";
import { Confidence, WineGuess, WineIdentityInput } from "@/types/tasting";
import { isCustomSingleGrape, reconstructBlendComponentsFromText } from "@/lib/wineReferenceData";
import {
  ActiveBottleStateResponse,
  FinalLeaderboardResponse,
  GuestSessionStateResponse,
  HostGuessProgressDTO,
  MyBottleDTO,
  RegisterBottleResponse,
  RegistrationStateResponse,
  RevealedBottleResponse,
  RevealedBottlesSummaryResponse,
  SeenTastingStateResponse,
} from "./types";

export async function getGuestSessionState(
  supabase: SupabaseClient,
  guestToken: string
) {
  const { data, error } = await supabase.rpc("get_guest_session_state", {
    p_guest_token: guestToken,
  });
  return { data: data as GuestSessionStateResponse | null, error };
}

/**
 * Host-only live group-progress count for the host's own Full blind/
 * Course-by-course guess screen — see README "Host per-bottle response
 * progress" — "Host guess screen group progress". Returns null (not an
 * error toast) for an ordinary participant's guest token, a Seen session, or
 * (in course_reveal) a bottle that isn't the current active one — the
 * caller treats any of those the same way: don't show the group-progress
 * line.
 */
export async function getHostGuessProgress(
  supabase: SupabaseClient,
  guestToken: string,
  wineId: string
) {
  const { data, error } = await supabase.rpc("get_host_guess_progress", {
    p_guest_token: guestToken,
    p_wine_id: wineId,
  });
  return { data: data as HostGuessProgressDTO | null, error };
}

export async function upsertGuess(
  supabase: SupabaseClient,
  guestToken: string,
  wineId: string,
  guess: WineGuess
) {
  return supabase.rpc("upsert_wine_guess", {
    p_guest_token: guestToken,
    p_wine_id: wineId,
    p_country_guess: guess.country,
    p_region_guess: guess.region,
    p_appellation_guess: guess.appellation.trim() || null,
    p_grape_blend_mode: guess.grapeBlendMode || null,
    p_grape_blend_guess: guess.grapeBlend,
    p_producer_guess: guess.producer,
    p_wine_cuvee_guess: guess.wineName,
    p_vintage_guess: guess.vintage,
    p_rating: guess.rating,
    p_confidence: guess.confidence,
    p_tasting_note: guess.note || null,
    p_grape_blend_components:
      guess.grapeBlendMode === "blend"
        ? { selectedGrapes: guess.selectedGrapes, otherGrapesText: guess.otherGrapesText }
        : null,
  });
}

export async function completeSubmission(
  supabase: SupabaseClient,
  guestToken: string
) {
  return supabase.rpc("complete_guest_submission", {
    p_guest_token: guestToken,
  });
}

export async function getRegistrationState(
  supabase: SupabaseClient,
  guestToken: string
) {
  const { data, error } = await supabase.rpc("get_registration_state", {
    p_guest_token: guestToken,
  });
  return { data: data as RegistrationStateResponse | null, error };
}

/**
 * Participant: confirm readiness for the tasting to begin — see README
 * "Participant readiness confirmation". Idempotent server-side; safe to call
 * more than once (e.g. a double-click) with no extra effect.
 */
export async function markParticipantReady(
  supabase: SupabaseClient,
  guestToken: string
) {
  return supabase.rpc("mark_participant_ready", {
    p_guest_token: guestToken,
  });
}

// --- course_reveal only ---

export async function getActiveBottleState(
  supabase: SupabaseClient,
  guestToken: string
) {
  const { data, error } = await supabase.rpc("get_active_bottle_state", {
    p_guest_token: guestToken,
  });
  return { data: data as ActiveBottleStateResponse | null, error };
}

export async function lockWineGuess(
  supabase: SupabaseClient,
  guestToken: string,
  wineId: string
) {
  return supabase.rpc("lock_wine_guess", {
    p_guest_token: guestToken,
    p_wine_id: wineId,
  });
}

export async function getRevealedBottle(
  supabase: SupabaseClient,
  guestToken: string,
  wineId: string
) {
  const { data, error } = await supabase.rpc("get_revealed_bottle", {
    p_guest_token: guestToken,
    p_wine_id: wineId,
  });
  return { data: data as RevealedBottleResponse | null, error };
}

/** Participant-facing results hub list — see README "Results reveal". */
export async function getRevealedBottlesSummary(
  supabase: SupabaseClient,
  guestToken: string
) {
  const { data, error } = await supabase.rpc("get_revealed_bottles_summary", {
    p_guest_token: guestToken,
  });
  return { data: data as RevealedBottlesSummaryResponse | null, error };
}

/** Final leaderboard / tasting recap data source — see README "Final leaderboard and tasting recap". Only ever returns data once the whole session has reached 'revealed'; raises `not_fully_revealed` otherwise. */
export async function getFinalLeaderboard(
  supabase: SupabaseClient,
  guestToken: string
) {
  const { data, error } = await supabase.rpc("get_final_leaderboard_for_guest", {
    p_guest_token: guestToken,
  });
  return { data: data as FinalLeaderboardResponse | null, error };
}

// --- seen only ---

export async function getSeenTastingState(
  supabase: SupabaseClient,
  guestToken: string
) {
  const { data, error } = await supabase.rpc("get_seen_tasting_state", {
    p_guest_token: guestToken,
  });
  return { data: data as SeenTastingStateResponse | null, error };
}

export async function upsertSeenRating(
  supabase: SupabaseClient,
  guestToken: string,
  wineId: string,
  rating: number,
  confidence: Confidence,
  note: string
) {
  return supabase.rpc("upsert_seen_rating", {
    p_guest_token: guestToken,
    p_wine_id: wineId,
    p_rating: rating,
    p_confidence: confidence,
    p_tasting_note: note || null,
  });
}

export interface BottleFormInput extends WineIdentityInput {
  /** Private, per-tasting-only note — never part of the shared wine-identity shape (see WineIdentityInput). */
  notes: string;
  /** Object path into the public `bottle-photos` Storage bucket (see README "Bottle photos"), or null for no photo. Photo upload happens independently of form submission (see components/PhotoUploadField.tsx); this just carries the already-uploaded path through to register_bottle/update_bottle. Not part of WineIdentityInput since photo handling is tasting-bottle-specific. */
  photoPath: string | null;
}

function grapeBlendComponentsPayload(bottle: BottleFormInput) {
  return bottle.grapeBlendMode === "blend"
    ? { selectedGrapes: bottle.selectedGrapes, otherGrapesText: bottle.otherGrapesText }
    : null;
}

export async function registerBottle(
  supabase: SupabaseClient,
  guestToken: string,
  bottle: BottleFormInput
) {
  const { data, error } = await supabase.rpc("register_bottle", {
    p_guest_token: guestToken,
    p_country: bottle.country,
    p_region: bottle.region,
    p_appellation: bottle.appellation.trim() || null,
    p_grape_blend_mode: bottle.grapeBlendMode || null,
    p_grape_blend: bottle.grapeBlend,
    p_producer: bottle.producer,
    p_wine_cuvee: bottle.wineName,
    p_vintage: bottle.vintage,
    p_notes: bottle.notes,
    p_wine_style: bottle.wineStyle || null,
    p_grape_blend_components: grapeBlendComponentsPayload(bottle),
    p_photo_path: bottle.photoPath,
  });
  return { data: data as RegisterBottleResponse | null, error };
}

export async function updateBottle(
  supabase: SupabaseClient,
  guestToken: string,
  wineId: string,
  bottle: BottleFormInput
) {
  return supabase.rpc("update_bottle", {
    p_guest_token: guestToken,
    p_wine_id: wineId,
    p_country: bottle.country,
    p_region: bottle.region,
    p_appellation: bottle.appellation.trim() || null,
    p_grape_blend_mode: bottle.grapeBlendMode || null,
    p_grape_blend: bottle.grapeBlend,
    p_producer: bottle.producer,
    p_wine_cuvee: bottle.wineName,
    p_vintage: bottle.vintage,
    p_notes: bottle.notes,
    p_wine_style: bottle.wineStyle || null,
    p_grape_blend_components: grapeBlendComponentsPayload(bottle),
    p_photo_path: bottle.photoPath,
  });
}

export async function deleteBottle(
  supabase: SupabaseClient,
  guestToken: string,
  wineId: string
) {
  return supabase.rpc("delete_bottle", {
    p_guest_token: guestToken,
    p_wine_id: wineId,
  });
}

/**
 * Maps a participant's own bottle (from get_registration_state) into
 * editable bottle-form state. A missing mode (bottle registered before this
 * field existed) defaults to "single" since the form always needs a
 * concrete segment selected — matches `mapGuestGuessDtoToWineGuess`.
 *
 * A blend bottle with no structured selectedGrapes/otherGrapesText (one
 * registered before the structured picker existed) falls back to
 * re-parsing the flattened grapeBlend text — see
 * `reconstructBlendComponentsFromText` — so re-editing an old blend doesn't
 * silently wipe it out.
 */
export function bottleFormInputFromDto(bottle: MyBottleDTO): BottleFormInput {
  const grapeBlendMode = bottle.grapeBlendMode ?? "single";
  let selectedGrapes = bottle.selectedGrapes ?? [];
  let otherGrapesText = bottle.otherGrapesText ?? "";
  if (
    grapeBlendMode === "blend" &&
    selectedGrapes.length === 0 &&
    !otherGrapesText &&
    bottle.grapeBlend
  ) {
    const reconstructed = reconstructBlendComponentsFromText(bottle.grapeBlend);
    selectedGrapes = reconstructed.selectedGrapes;
    otherGrapesText = reconstructed.otherGrapesText;
  }

  return {
    country: bottle.country,
    region: bottle.region,
    appellation: bottle.appellation ?? "",
    grapeBlendMode,
    grapeBlend: bottle.grapeBlend,
    selectedGrapes,
    otherGrapesText,
    otherGrapeSelected: isCustomSingleGrape(grapeBlendMode, bottle.grapeBlend),
    producer: bottle.producer,
    wineName: bottle.wineCuvee,
    vintage: bottle.vintage,
    wineStyle: bottle.wineStyle,
    notes: bottle.notes ?? "",
    photoPath: bottle.photoPath,
  };
}
