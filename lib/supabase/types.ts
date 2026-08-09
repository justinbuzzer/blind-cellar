import {
  BottleFormat,
  CellarBottleStatus,
  Confidence,
  GrapeBlendMode,
  ScoringVersion,
  SessionStatus,
  TastingMode,
  WineStyle,
} from "@/types/tasting";
import { BlindGuessGrapeOptionsHint } from "@/lib/grapeAssistance";

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
  tasting_mode: TastingMode;
  /** Immutable, assigned at creation — see ScoringVersion. */
  scoring_version: ScoringVersion;
}

export interface GuestRow {
  id: string;
  session_id: string;
  display_name: string;
  created_at: string;
  completed_at: string | null;
}

/** A signed-in user's own row from account_tasting_records — RLS already scopes reads to auth.uid(), so no user_id column is needed client-side. See README "Account-linked tasting records". */
export interface AccountTastingRecordRow {
  session_id: string;
  role: "host" | "participant";
  participant_id: string | null;
  claimed_at: string;
  claim_source: "automatic" | "browser_claim";
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
  wine_style: WineStyle | null;
  tasting_order: number;
  /** Masked the same way as region/country — null until the session is revealed. See README "Region and Appellation". */
  appellation: string | null;
}

export interface RevealedWineGuessRow {
  id: string;
  session_id: string;
  wine_id: string;
  guest_id: string;
  country_guess: string;
  region_guess: string;
  /** Optional appellation guess, same curated map as actual-wine appellation — never scored. See README "Region and Appellation". */
  appellation_guess: string | null;
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
  locked_at: string | null;
}

// Shapes returned by the RPC functions (camelCase jsonb, see supabase/schema.sql).

/** Anonymous-only bottle info the host control page gets — no answer-key fields. */
/**
 * Seen mode only — wine identity plus rating-status/reveal fields for Host
 * Controls (see README "Seen Host Controls"). Present only when the
 * session's tastingMode is 'seen'; absent (not merely null) for every other
 * mode, so the DTO shape itself proves mode isolation rather than relying on
 * UI code to hide it.
 */
export interface HostSeenBottleInfo {
  producer: string;
  wineCuvee: string;
  vintage: string;
  country: string;
  region: string;
  appellation: string | null;
  /** Null until the host reveals this specific bottle's group rating. */
  ratingsRevealedAt: string | null;
  /** Eligible participants with a valid submitted rating for this bottle. */
  ratedCount: number;
  /** Distinct eligible participants for this session — same denominator for every bottle. */
  eligibleCount: number;
  /** Null until ratingsRevealedAt is set; never a preview of an unrevealed average. */
  groupRating: number | null;
}

export interface HostBottleDTO {
  id: string;
  bottleNumber: number;
  anonymousCode: string;
  wineStyle: WineStyle;
  tastingOrder: number;
  /** course_reveal only — always null for full_blind bottles and seen bottles. */
  revealedAt: string | null;
  /** Seen mode only — see HostSeenBottleInfo. Undefined for full_blind/course_reveal. */
  seen?: HostSeenBottleInfo;
}

export interface HostGuestDTO {
  id: string;
  displayName: string;
  completedAt: string | null;
}

/** course_reveal only: the current active bottle's anonymous summary + aggregate progress. */
export interface HostActiveBottleDTO {
  id: string;
  bottleNumber: number;
  anonymousCode: string;
  position: number;
  totalBottles: number;
  submittedCount: number;
  totalParticipants: number;
}

/** seen only: aggregate rating progress — never an individual participant's rating. */
export interface HostSeenProgressDTO {
  ratersCount: number;
  totalParticipants: number;
  ratingsSubmitted: number;
  totalPossibleRatings: number;
}

/** Response from reveal_seen_ratings — see README "Seen Host Controls". */
export interface RevealSeenRatingsResponse {
  wineId: string;
  ratingsRevealedAt: string;
  ratedCount: number;
  eligibleCount: number;
  groupRating: number | null;
}

/**
 * Response from get_bottle_response_progress — see README "Host per-bottle
 * response progress". Host-only, one bottle at a time, fetched only when the
 * host opens the progress popover. Never carries a guess, a rating value, a
 * score, an email, or a token — only safe counts and the existing session
 * display names of participants who have not yet submitted.
 */
export interface BottleResponseProgressDTO {
  bottleId: string;
  /** "guess" for full_blind/course_reveal, "rating" for seen. */
  responseKind: "guess" | "rating";
  submittedCount: number;
  eligibleCount: number;
  /** Safe session display names only, for participants who have not submitted. */
  missingParticipantNames: string[];
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
    tastingMode: TastingMode;
    /** Immutable, assigned at creation — see ScoringVersion. */
    scoringVersion: ScoringVersion;
  };
  wines: HostBottleDTO[];
  guests: HostGuestDTO[];
  /** Non-null only when tastingMode is course_reveal and status is collecting. */
  activeBottle: HostActiveBottleDTO | null;
  /** Non-null only when tastingMode is seen and status is collecting. */
  seenProgress: HostSeenProgressDTO | null;
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
  /** Optional appellation guess — see README "Region and Appellation". Never scored. */
  appellationGuess: string | null;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlendGuess: string;
  /** Blend mode only: curated grapes picked from the multi-select. */
  selectedGrapes: string[];
  /** Blend mode only: raw free text for varieties not on the curated list. */
  otherGrapesText: string;
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
  /** Privacy-safe grape-colour hint derived from this bottle's actual wine style — never the raw style itself. See README "Grape-entry assistance". */
  styleHint: BlindGuessGrapeOptionsHint;
  /** The contributor's session display name — a bottle-order/pouring coordination cue only, never a wine-identity reveal. Null if the bottle has no recorded contributor. See README "Bottle-order contributor labels". */
  contributorName: string | null;
}

export interface GuestSessionStateResponse {
  guest: { id: string; displayName: string; completedAt: string | null };
  session: {
    publicId: string;
    title: string;
    tastingDate: string;
    status: SessionStatus;
    tastingMode: TastingMode;
    /** Immutable, assigned at creation — see ScoringVersion. */
    scoringVersion: ScoringVersion;
    /** Internal session id — needed to query the post-reveal report views (see lib/supabase/reportData.ts). */
    id: string;
    createdAt: string;
    /** Total guests in the session — mirrors HostSessionResponse.guests.length without exposing the guest list itself. */
    participantCount: number;
  };
  wines: GuestSessionWineDTO[];
  guesses: GuestGuessDTO[];
}

/**
 * Response from get_host_guess_progress — see README "Host per-bottle
 * response progress" — "Host guess screen group progress". Shown only on
 * the host's own Full blind/Course-by-course guess-entry page, never on an
 * ordinary participant's. Deliberately more minimal than
 * BottleResponseProgressDTO (the Host Controls popover's shape) — no
 * `missingParticipantNames`, no `bottleId`, no `responseKind` — since the
 * host guess screen must never receive participant names or content, even
 * though both are computed from the same underlying eligible/submitted
 * definitions.
 */
export interface HostGuessProgressDTO {
  submittedCount: number;
  eligibleCount: number;
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
  appellation: string | null;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlend: string;
  /** Blend mode only: curated grapes picked from the multi-select. */
  selectedGrapes: string[];
  /** Blend mode only: raw free text for varieties not on the curated list. */
  otherGrapesText: string;
  producer: string;
  wineCuvee: string;
  vintage: string;
  wineStyle: WineStyle;
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

// --- course_reveal-only shapes (see get_active_bottle_state / get_revealed_bottle) ---

export interface ActiveBottleDTO {
  id: string;
  bottleNumber: number;
  anonymousCode: string;
  /** 1-based position in tasting order, e.g. "Bottle 2 of 6". */
  position: number;
  totalBottles: number;
  /** Privacy-safe grape-colour hint derived from this bottle's actual wine style — never the raw style itself. See README "Grape-entry assistance". */
  styleHint: BlindGuessGrapeOptionsHint;
  /** The contributor's session display name — a bottle-order/pouring coordination cue only, never a wine-identity reveal. Null if the bottle has no recorded contributor. See README "Bottle-order contributor labels". */
  contributorName: string | null;
}

export interface ActiveBottleStateResponse {
  session: {
    publicId: string;
    title: string;
    tastingDate: string;
    status: SessionStatus;
    tastingMode: TastingMode;
  };
  guestName: string;
  /** Null once every bottle has been revealed (session will already be 'revealed'). */
  activeBottle: ActiveBottleDTO | null;
  myGuess: GuestGuessDTO | null;
  locked: boolean;
}

/** One participant's locked guess for a just-revealed bottle — never includes an unlocked/draft guess. */
export interface RevealedBottleGuessDTO {
  guestId: string;
  guestName: string;
  countryGuess: string;
  regionGuess: string;
  /** Optional appellation guess — see README "Region and Appellation". Never scored. */
  appellationGuess: string | null;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlendGuess: string;
  producerGuess: string;
  wineCuveeGuess: string;
  vintageGuess: string;
  rating: number | null;
  confidence: Confidence;
}

export interface RevealedBottleWineDTO {
  id: string;
  bottleNumber: number;
  anonymousCode: string;
  position: number;
  totalBottles: number;
  country: string;
  region: string;
  appellation: string | null;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlend: string;
  producer: string;
  wineCuvee: string;
  vintage: string;
  wineStyle: WineStyle;
  contributorName: string | null;
}

export interface RevealedBottleResponse {
  session: { publicId: string; status: SessionStatus; scoringVersion: ScoringVersion };
  wine: RevealedBottleWineDTO;
  guesses: RevealedBottleGuessDTO[];
}

// --- seen-only shapes (see get_seen_tasting_state / upsert_seen_rating) ---

/**
 * A bottle's full details (visible to every participant once a seen tasting
 * starts) plus the caller's own rating status only — never another
 * participant's rating.
 */
export interface SeenBottleDTO {
  id: string;
  bottleNumber: number;
  anonymousCode: string;
  /** 1-based tasting-order position, e.g. "3 of 7". */
  position: number;
  totalBottles: number;
  wineStyle: WineStyle;
  country: string;
  region: string;
  appellation: string | null;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlend: string;
  producer: string;
  wineCuvee: string;
  vintage: string;
  contributorName: string | null;
  myRating: number | null;
  myConfidence: Confidence | null;
  myNote: string | null;
  /** Null until the host reveals this specific bottle's group rating — see README "Seen Host Controls". */
  ratingsRevealedAt: string | null;
  /** Null until ratingsRevealedAt is set. Never exposes other participants' individual ratings or a rated/eligible count. */
  groupRating: number | null;
}

export interface SeenTastingStateResponse {
  session: {
    publicId: string;
    title: string;
    tastingDate: string;
    status: SessionStatus;
    tastingMode: TastingMode;
  };
  guestName: string;
  bottles: SeenBottleDTO[];
}

// --- Personal Cellar (see README "Personal Cellar") ---

/**
 * A signed-in user's own row from `cellar_bottles` — RLS already scopes
 * reads to `auth.uid()`, so no owner id is needed client-side (mirrors
 * `AccountTastingRecordRow` above).
 */
export interface CellarBottleRow {
  id: string;
  wine_style: WineStyle;
  country: string;
  region: string;
  appellation: string | null;
  grape_blend_mode: GrapeBlendMode | null;
  grape_blend: string;
  grape_blend_components: { selectedGrapes?: string[]; otherGrapesText?: string } | null;
  vintage: string;
  producer: string;
  wine_cuvee: string;
  bottle_format: BottleFormat;
  bottle_format_other: string | null;
  storage_location: string | null;
  personal_note: string | null;
  status: CellarBottleStatus;
  reserved_session_id: string | null;
  reserved_tasting_bottle_id: string | null;
  reserved_at: string | null;
  consumed_at: string | null;
  consumed_session_id: string | null;
  consumed_tasting_bottle_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * `ids`/`count` cover both the single- and multi-quantity cases uniformly
 * (see README "Personal Cellar" — "Quantity") — a quantity-1 submission
 * simply returns a one-element `ids` array. Internal ids are never rendered
 * to the user; the UI only ever reads `count` for the pluralized
 * confirmation message.
 */
export interface AddCellarBottleResponse {
  ids: string[];
  count: number;
}

/** Same shape as RegisterBottleResponse — register_bottle_from_cellar returns the identical DTO. */
export interface RegisterBottleFromCellarResponse {
  id: string;
  bottleNumber: number;
}

/**
 * Grouped cellar display (see README "Personal Cellar" — "Grouped
 * display"): register_bottles_from_cellar_group's response for adding N>1
 * bottles from one grouped Add-from-cellar entry in a single atomic action.
 * `ids` are the newly created wines' ids, in the same bottle-number order as
 * `firstBottleNumber..firstBottleNumber+count-1` — never rendered to the
 * user, only `count` is (for the pluralized confirmation message).
 */
export interface RegisterBottlesFromCellarGroupResponse {
  ids: string[];
  count: number;
  firstBottleNumber: number;
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
  invalid_grape_blend_components: "That blend selection couldn't be saved — please review the grapes you picked and try again.",
  invalid_wine_style: "Choose a wine style.",
  invalid_appellation: "Select an appellation from the available options.",
  invalid_reorder_payload: "That tasting order couldn't be saved — please refresh and try again.",
  no_bottles_registered: "At least one bottle must be registered before starting the tasting.",
  bottle_not_found: "That bottle couldn't be found, or isn't yours to edit.",
  invalid_tasting_mode: "That action isn't available for this tasting's format.",
  session_not_collecting: "This tasting isn't currently collecting guesses.",
  bottle_already_revealed: "That bottle has already been revealed.",
  bottle_not_active: "That bottle isn't the current active bottle yet.",
  guess_already_locked: "Your guess for this bottle is already locked in.",
  bottle_not_revealed: "That bottle hasn't been revealed yet.",
  rating_required: "A rating is required.",
  ratings_already_revealed: "This wine's group rating has been revealed, so ratings for it are now locked.",

  // Personal Cellar (see README "Personal Cellar") — cellar_bottle_unavailable
  // deliberately covers every "can't use this bottle" case (not found, not
  // yours, already reserved/consumed) with one generic message, matching the
  // exact required copy, so a failure never reveals which specific condition
  // tripped it.
  not_authenticated: "Sign in to use your cellar.",
  cellar_bottle_unavailable:
    "This bottle is no longer available in your cellar. Choose another bottle or add a new one.",
  // Grouped display (see README "Personal Cellar" — "Grouped display") —
  // raised only by register_bottles_from_cellar_group, when fewer than the
  // requested quantity of matching bottles are still available by the time
  // the atomic add runs (another tab/device reserved or deleted one first).
  cellar_group_stock_changed: "The available bottle count changed. Please try again.",
  cellar_bottle_not_found: "That cellar bottle couldn't be found.",
  cellar_bottle_not_editable:
    "This bottle cannot be edited while it is reserved or after it has been consumed.",
  cellar_bottle_not_reserved: "That cellar bottle isn't currently reserved.",
  return_window_closed: "This bottle can no longer be returned to your cellar.",
  consumption_not_eligible: "This bottle can't be marked consumed yet.",
  invalid_bottle_format: "Choose a bottle format.",
  invalid_quantity: "Enter a quantity between 1 and 100.",
  bottle_format_detail_required: "Add a short detail for this bottle format.",
  bottle_format_detail_too_long: "That bottle format detail is too long — please shorten it.",
  storage_location_too_long: "That storage location is too long — please shorten it.",
  personal_note_too_long: "That note is too long — please shorten it.",

  // Cellar deletion eligibility (see README "Personal Cellar" — "Deleting a
  // bottle") — delete_cellar_bottle only ever raises one of these three
  // tags; the first two use the spec's exact required copy verbatim.
  cellar_bottle_reserved: "This bottle cannot be deleted while it is reserved.",
  cellar_bottle_consumed: "Consumed bottles remain part of your cellar record.",
};

/** Turns a Supabase/Postgres error into a friendly, pre-written message when we recognize it. */
export function friendlyRpcError(error: { message?: string } | null | undefined): string {
  const raw = error?.message ?? "";
  for (const [tag, message] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (raw.includes(tag)) return message;
  }
  return "Something went wrong talking to the tasting server. Please try again.";
}
