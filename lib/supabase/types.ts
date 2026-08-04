import { Confidence, GrapeBlendMode, SessionStatus } from "@/types/tasting";

// Raw shapes returned by direct table/view reads (snake_case, PostgREST).

export interface SessionRow {
  id: string;
  public_id: string;
  join_code: string;
  title: string;
  tasting_date: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface GuestRow {
  id: string;
  session_id: string;
  display_name: string;
  created_at: string;
  completed_at: string | null;
}

/** Row from the anon-granted, non-sensitive columns of `wines` (used for live counts/labels). */
export interface AnonymousWineRow {
  id: string;
  session_id: string;
  bottle_number: number;
  anonymous_code: string;
  created_at: string;
}

export interface GuestVisibleWineRow {
  id: string;
  session_id: string;
  bottle_number: number;
  anonymous_code: string;
  country: string | null;
  region: string | null;
  /** Physical column name kept for migration safety; holds the grape/blend text. */
  grape_style: string | null;
  grape_blend_mode: GrapeBlendMode | null;
  producer: string | null;
  wine_cuvee: string | null;
  vintage: string | null;
  host_notes: string | null;
  contributor_guest_id: string | null;
}

export interface RevealedWineGuessRow {
  id: string;
  session_id: string;
  wine_id: string;
  guest_id: string;
  country_guess: string;
  region_guess: string;
  /** Physical column name kept for migration safety; holds the grape/blend guess text. */
  grape_style_guess: string;
  grape_blend_mode: GrapeBlendMode | null;
  producer_guess: string;
  wine_cuvee_guess: string;
  vintage_guess: string;
  rating: number | null;
  confidence: Confidence;
  tasting_note: string | null;
  submitted_at: string;
}

// Shapes returned by the RPC functions (camelCase jsonb, see supabase/schema.sql).

/** Anonymous-only bottle info the host control page gets — no answer-key fields. */
export interface HostBottleDTO {
  id: string;
  bottleNumber: number;
  anonymousCode: string;
}

export interface HostGuestDTO {
  id: string;
  displayName: string;
  completedAt: string | null;
}

export interface HostSessionResponse {
  session: {
    id: string;
    publicId: string;
    title: string;
    tastingDate: string;
    status: SessionStatus;
    joinCode: string;
    createdAt: string;
    hostGuestId: string | null;
  };
  wines: HostBottleDTO[];
  guests: HostGuestDTO[];
}

export interface CreateSessionRpcResult {
  id: string;
  public_id: string;
  join_code: string;
  host_guest_id: string;
  host_guest_token: string;
}

export interface GuestGuessDTO {
  wineId: string;
  countryGuess: string;
  regionGuess: string;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlendGuess: string;
  producerGuess: string;
  wineCuveeGuess: string;
  vintageGuess: string;
  rating: number | null;
  confidence: Confidence;
  tastingNote: string | null;
}

export interface GuestSessionWineDTO {
  id: string;
  bottleNumber: number;
  anonymousCode: string;
}

export interface GuestSessionStateResponse {
  guest: { id: string; displayName: string; completedAt: string | null };
  session: {
    publicId: string;
    title: string;
    tastingDate: string;
    status: SessionStatus;
  };
  wines: GuestSessionWineDTO[];
  guesses: GuestGuessDTO[];
}

export interface JoinSessionResponse {
  guest_id: string;
  guest_token: string;
  display_name: string;
}

/** A participant's own registered bottle, as returned by get_registration_state. */
export interface MyBottleDTO {
  id: string;
  bottleNumber: number;
  country: string;
  region: string;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlend: string;
  producer: string;
  wineCuvee: string;
  vintage: string;
  notes: string | null;
}

export interface RegistrationStateResponse {
  guest: { id: string; displayName: string };
  session: {
    publicId: string;
    title: string;
    tastingDate: string;
    status: SessionStatus;
  };
  bottleCount: number;
  myBottles: MyBottleDTO[];
}

export interface RegisterBottleResponse {
  id: string;
  bottleNumber: number;
}

/** Machine-readable error tags raised by the RPC functions (see schema.sql). */
export const RPC_ERROR_MESSAGES: Record<string, string> = {
  title_required: "A tasting title is required.",
  invalid_wine_count: "A tasting needs between 1 and 8 wines.",
  session_not_found: "We couldn't find that tasting.",
  invalid_host_token: "This host link isn't valid for this tasting.",
  invalid_guest_token: "Your guest session isn't valid. Please join again.",
  display_name_required: "Enter a display name to join.",
  display_name_too_long: "That name is too long — please shorten it.",
  duplicate_guest_name:
    "That name is already taken in this tasting. Please use a different display name.",
  session_already_revealed:
    "This tasting has already been revealed, so guesses can no longer be submitted.",
  already_submitted: "Your guesses are already locked in and can't be edited.",
  missing_ratings: "Please rate every wine before submitting.",
  wine_not_in_session: "That wine doesn't belong to this tasting.",
  registration_closed: "Bottle registration is closed for this tasting.",
  bottle_fields_required:
    "Country, region, grape/blend, producer, wine/cuvée, and vintage are all required.",
  invalid_grape_blend_mode: "Choose single variety or blend for the grape/blend.",
  no_bottles_registered: "At least one bottle must be registered before starting the tasting.",
  bottle_not_found: "That bottle couldn't be found, or isn't yours to edit.",
};

/** Turns a Supabase/Postgres error into a friendly, pre-written message when we recognize it. */
export function friendlyRpcError(error: { message?: string } | null | undefined): string {
  const raw = error?.message ?? "";
  for (const [tag, message] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (raw.includes(tag)) return message;
  }
  return "Something went wrong talking to the tasting server. Please try again.";
}
