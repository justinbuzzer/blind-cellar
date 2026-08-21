import {
  BottleFormat,
  CellarBottleStatus,
  ContributorStyleBucket,
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
  /** Chosen once at creation, course_reveal only — see README "Tasting modes" — "Betting". */
  betting_enabled: boolean;
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
  /** Masked the same way as wine_style — null until the session is revealed. See README "Bottle labels". */
  contributor_style_sequence: number | null;
  /** Masked the same way as producer/etc — null until the session is revealed. See README "Bottle photos". */
  photo_path: string | null;
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
  /** See README "Bottle photos" — Seen shows this unmasked from the start, same as every other field here. */
  photoPath: string | null;
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
  /** full_blind and course_reveal only — see reveal_full_blind_bottle/reveal_bottle in supabase/schema.sql. Always null for seen bottles (see HostSeenBottleInfo.ratingsRevealedAt instead). */
  revealedAt: string | null;
  /** Same safe, never-secret display name shown throughout the app (see README "Bottle-order contributor labels" and "Tasting-order contributor labels"). Null only for a bottle with no recorded contributor (e.g. registered before contributor_guest_id existed) — never fabricated. Present for every tasting mode, including seen (in addition to seen's own nested wine-identity fields). */
  contributorName?: string | null;
  /** This contributor's stable 1-based ordinal within their same-style bottles for this session — see README "Bottle labels". Null under the same conditions as contributorName. */
  contributorStyleSequence?: number | null;
  /** Seen mode only — see HostSeenBottleInfo. Undefined for full_blind/course_reveal. */
  seen?: HostSeenBottleInfo;
}

export interface HostGuestDTO {
  id: string;
  displayName: string;
  completedAt: string | null;
  /** See README "Participant readiness confirmation" — set once, server-side, never null→null→re-null. */
  readyToBeginAt: string | null;
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

/** blind_match only: aggregate match/rating progress — never an individual participant's guess. Same shape as HostSeenProgressDTO (submitted = has a rating). */
export interface HostMatchProgressDTO {
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
    /** Chosen once at creation, course_reveal only — see README "Tasting modes" — "Betting". Optional for the same pre-betting-fixture reason as LeaderboardWineDTO.contributorGuestId — treat a missing value as false. */
    bettingEnabled?: boolean;
    /** Per-field decimal odds, set once at creation — see README "Tasting modes" — "Betting". Optional/nullable for the same pre-betting-fixture reason as bettingEnabled above; null for a non-betting session. */
    countryBetMultiplier?: number | null;
    regionBetMultiplier?: number | null;
    appellationBetMultiplier?: number | null;
    grapeBlendBetMultiplier?: number | null;
    vintageBetMultiplier?: number | null;
    producerBetMultiplier?: number | null;
    wineCuveeBetMultiplier?: number | null;
  };
  wines: HostBottleDTO[];
  guests: HostGuestDTO[];
  /** Non-null only when tastingMode is course_reveal and status is collecting. */
  activeBottle: HostActiveBottleDTO | null;
  /** Non-null only when tastingMode is seen and status is collecting. */
  seenProgress: HostSeenProgressDTO | null;
  /** Non-null only when tastingMode is blind_match and status is collecting. */
  matchProgress: HostMatchProgressDTO | null;
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
  tastingNote: string | null;
  /**
   * Betting sub-mode only (see README "Tasting modes" — "Betting") —
   * course_reveal + bettingEnabled sessions only, via get_active_bottle_state.
   * Always undefined for full_blind's get_guest_session_state, which shares
   * this DTO shape but never populates these.
   */
  countryBet?: number | null;
  regionBet?: number | null;
  appellationBet?: number | null;
  grapeBlendBet?: number | null;
  vintageBet?: number | null;
  producerBet?: number | null;
  wineCuveeBet?: number | null;
}

export interface GuestSessionWineDTO {
  id: string;
  bottleNumber: number;
  anonymousCode: string;
  /** Privacy-safe grape-colour hint derived from this bottle's actual wine style — never the raw style itself. See README "Grape-entry assistance". */
  styleHint: BlindGuessGrapeOptionsHint;
  /** The contributor's session display name — a bottle-order/pouring coordination cue only, never a wine-identity reveal. Null if the bottle has no recorded contributor. See README "Bottle-order contributor labels". */
  contributorName: string | null;
  /** The minimal bucketed style word for the contributor label (see README "Bottle labels") — never the raw five-value WineStyle, which would also distinguish sweet from other. Null under the same condition as contributorName. */
  contributorStyleBucket: ContributorStyleBucket | null;
  /** This contributor's stable 1-based ordinal within contributorStyleBucket for this session. Null under the same condition as contributorName. */
  contributorStyleSequence: number | null;
  /** True only when the current caller is this bottle's canonical contributor — derived server-side, never from displayName/email/client state. See README "Own-bottle guessing exclusion". */
  isOwnBottle: boolean;
}

export interface GuestSessionStateResponse {
  /** isHost is server-verified (guest.id = tasting_sessions.host_guest_id) — never inferred client-side from whether a host token merely exists in this browser. See README "Host per-bottle response progress" for the bug that caused. */
  guest: { id: string; displayName: string; completedAt: string | null; isHost: boolean };
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

/** See README "Session rejoin" — join_tasting_session_as_account. */
export interface JoinAsAccountResponse {
  guest_id: string;
  guest_token: string;
  display_name: string;
  already_member: boolean;
}

/** One side of a resolve_join_identity match — see lib/rejoin.ts IdentityMatch. */
export interface IdentityMatchDTO {
  guestId: string;
  displayName: string;
  guestToken: string;
}

/** See README "Session rejoin" — resolve_join_identity. */
export interface JoinResolutionResponse {
  session: {
    publicId: string;
    status: SessionStatus;
    tastingMode: TastingMode | null;
  };
  accountMatch: IdentityMatchDTO | null;
  deviceMatch: IdentityMatchDTO | null;
}

/** See README "Session rejoin" — redeem_recovery_code. */
export interface RecoveryRedeemResponse {
  guest_id: string;
  guest_token: string;
  display_name: string;
}

/** See README "Session rejoin" — redeem_recovery_code_global. Same shape as RecoveryRedeemResponse plus the resolved session, since the caller doesn't already know which tasting the code belongs to. */
export interface RecoveryRedeemGlobalResponse extends RecoveryRedeemResponse {
  public_id: string;
  status: SessionStatus;
}

/** One row of get_my_tastings — see README "Session rejoin" — "Resume from account area". */
export interface MyTastingEntry {
  publicId: string;
  title: string;
  tastingDate: string;
  status: SessionStatus;
  tastingMode: TastingMode;
  role: "host" | "participant";
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
  /** See README "Bottle photos". Own bottle, so unmasked regardless of reveal state. */
  photoPath: string | null;
}

export interface RegistrationStateResponse {
  guest: { id: string; displayName: string; readyToBeginAt: string | null };
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
  /** The minimal bucketed style word for the contributor label (see README "Bottle labels") — never the raw five-value WineStyle. Null under the same condition as contributorName. */
  contributorStyleBucket: ContributorStyleBucket | null;
  /** This contributor's stable 1-based ordinal within contributorStyleBucket for this session. Null under the same condition as contributorName. */
  contributorStyleSequence: number | null;
  /** True only when the current caller is this bottle's canonical contributor — derived server-side, never from displayName/email/client state. See README "Own-bottle guessing exclusion". */
  isOwnBottle: boolean;
}

export interface ActiveBottleStateResponse {
  session: {
    publicId: string;
    title: string;
    tastingDate: string;
    status: SessionStatus;
    tastingMode: TastingMode;
    /** See README "Tasting modes" — "Betting". Always false outside course_reveal. */
    bettingEnabled: boolean;
    /** Per-field decimal odds, set once at creation — see README "Tasting modes" — "Betting". Null for a non-betting session. */
    countryBetMultiplier: number | null;
    regionBetMultiplier: number | null;
    appellationBetMultiplier: number | null;
    grapeBlendBetMultiplier: number | null;
    vintageBetMultiplier: number | null;
    producerBetMultiplier: number | null;
    wineCuveeBetMultiplier: number | null;
  };
  guestName: string;
  /** Server-verified — see GuestSessionStateResponse.guest.isHost for the full rationale. */
  isHost: boolean;
  /** Betting sub-mode only — this guest's chosen balance at join time. Null for a non-betting session. */
  startingCredits: number | null;
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
  /** This contributor's stable 1-based ordinal within their same-style bottles for this session (see README "Bottle labels") — bucket is derived client-side from wineStyle above via wineStyleToContributorBucket, since wineStyle is already present on this post-reveal DTO. Null under the same condition as contributorName. */
  contributorStyleSequence: number | null;
  /** See README "Bottle photos". Only ever populated here since this DTO is only ever returned once the bottle is revealed. */
  photoPath: string | null;
}

export interface RevealedBottleResponse {
  session: { publicId: string; status: SessionStatus; scoringVersion: ScoringVersion };
  wine: RevealedBottleWineDTO;
  /** Whether the caller (this guest) has a submitted guess for this bottle — see README "Results reveal". False means `guesses` is empty; never a partial/draft guess. */
  submitted: boolean;
  /** The caller's own guess only — 0 or 1 elements. See README "Results reveal" for why this is no longer every guest's guess. */
  guesses: RevealedBottleGuessDTO[];
}

// --- Results reveal (see README "Results reveal") ---

/** Response from reveal_full_blind_bottle. */
export interface RevealFullBlindBottleResponse {
  wineId: string;
  revealedAt: string;
  /** True exactly when this was the last unrevealed bottle in the session — tasting_sessions.status has now flipped to 'revealed'. */
  sessionRevealed: boolean;
}

/** Response from release_course_bottle — see README "Course-by-course host-selected release". */
export interface ReleaseCourseBottleResponse {
  wineId: string;
}

/** A participant's guess content only — no guestId/guestName (those live one level up on BottleResultParticipantDTO), matching get_bottle_result_for_host's/get_bottle_result_for_guest's shared per-participant jsonb shape exactly. */
export interface BottleResultGuessDTO {
  countryGuess: string;
  regionGuess: string;
  appellationGuess: string | null;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlendGuess: string;
  producerGuess: string;
  wineCuveeGuess: string;
  vintageGuess: string;
  rating: number | null;
  /**
   * Betting sub-mode only (see README "Tasting modes" — "Betting") — always
   * null for a non-betting session. Optional (rather than required) for the
   * same pre-betting-fixture reason as LeaderboardWineDTO.contributorGuestId
   * elsewhere in this file: existing tests construct this DTO without these
   * fields.
   */
  countryBet?: number | null;
  regionBet?: number | null;
  appellationBet?: number | null;
  grapeBlendBet?: number | null;
  vintageBet?: number | null;
  producerBet?: number | null;
  wineCuveeBet?: number | null;
}

/** One participant's submission status + guess (full_blind/course_reveal only) for a per-bottle result view — shared shape returned by both get_bottle_result_for_host and get_bottle_result_for_guest. Never includes a token, email, or any field beyond display name + guess content. */
export interface BottleResultParticipantDTO {
  guestName: string;
  submitted: boolean;
  /** Null exactly when submitted is false. */
  guess: BottleResultGuessDTO | null;
}

/** Response from get_bottle_result_for_host — every eligible participant's guess for one revealed bottle. Host-token authenticated; see BottleResultForGuestResponse below for the identically-shaped participant-facing endpoint. See README "Results reveal". */
export interface BottleResultForHostResponse {
  session: {
    publicId: string;
    status: SessionStatus;
    scoringVersion: ScoringVersion;
    /** Per-field decimal odds, set once at creation — see README "Tasting modes" — "Betting". Optional for the same pre-betting-fixture reason as other betting fields in this file; null/absent for a non-betting session. */
    countryBetMultiplier?: number | null;
    regionBetMultiplier?: number | null;
    appellationBetMultiplier?: number | null;
    grapeBlendBetMultiplier?: number | null;
    vintageBetMultiplier?: number | null;
    producerBetMultiplier?: number | null;
    wineCuveeBetMultiplier?: number | null;
  };
  wine: RevealedBottleWineDTO;
  participants: BottleResultParticipantDTO[];
}

/**
 * Response from get_bottle_result_for_guest — every eligible participant's
 * guess for one revealed bottle, visible to any participant of the session
 * (not just the host) once it's revealed. Byte-identical shape to
 * BottleResultForHostResponse (kept as a distinct type only so each RPC
 * wrapper's return type documents which endpoint produced it) — see README
 * "Results reveal". Currently only wired into the course_reveal per-bottle
 * reveal screen; full_blind's separate per-bottle result page still calls
 * get_revealed_bottle (own guess only).
 */
export type BottleResultForGuestResponse = BottleResultForHostResponse;

/** One bottle's safe label + reveal state for the participant results hub — never an answer-key field. */
export interface RevealedBottleSummaryDTO {
  wineId: string;
  bottleNumber: number;
  contributorName: string | null;
  /** Only ever populated when isRevealed is true — see README "Bottle labels". This list mixes revealed and still-future/unrevealed rows (course_reveal in particular), and an unrevealed row's style must never leak here. */
  contributorStyleBucket: ContributorStyleBucket | null;
  /** Only ever populated when isRevealed is true — see contributorStyleBucket above. */
  contributorStyleSequence: number | null;
  isRevealed: boolean;
}

/** Response from get_revealed_bottles_summary — the participant-facing results hub list. */
export interface RevealedBottlesSummaryResponse {
  bottles: RevealedBottleSummaryDTO[];
  /** True once every bottle in the session has been revealed — this is what unlocks the final leaderboard (see the existing /results page). */
  allRevealed: boolean;
  revealedCount: number;
  totalCount: number;
}

/** One revealed bottle's full answer key, for the host provisional leaderboard — see get_provisional_leaderboard_for_host. */
export interface LeaderboardWineDTO {
  id: string;
  anonymousCode: string;
  bottleNumber: number;
  country: string;
  region: string;
  appellation: string | null;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlend: string;
  producer: string;
  wineCuvee: string;
  vintage: string;
  wineStyle: WineStyle;
  tastingOrder: number;
  /** See README "Bottle photos". Only ever populated here since this DTO is only ever returned for already-revealed bottles. */
  photoPath: string | null;
  /**
   * Betting sub-mode only (see README "Tasting modes" — "Betting") — the
   * settlement counterparty for every bet on this bottle. Null for a legacy
   * bottle with no recorded contributor. Optional (rather than
   * `string | null`) purely so pre-betting test fixtures that construct this
   * DTO literally don't all need updating — the RPC itself always includes
   * it now.
   */
  contributorGuestId?: string | null;
}

/** One guess against a revealed bottle, for the host provisional leaderboard. */
export interface LeaderboardGuessDTO {
  wineId: string;
  guestId: string;
  guestName: string;
  lockedAt: string | null;
  countryGuess: string;
  regionGuess: string;
  appellationGuess: string | null;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlendGuess: string;
  producerGuess: string;
  wineCuveeGuess: string;
  vintageGuess: string;
  rating: number | null;
  /** Betting sub-mode only — see README "Tasting modes" — "Betting". Null/0/undefined all mean no bet was placed on this field; optional for the same pre-betting-fixture reason as LeaderboardWineDTO.contributorGuestId above. */
  countryBet?: number | null;
  regionBet?: number | null;
  appellationBet?: number | null;
  grapeBlendBet?: number | null;
  vintageBet?: number | null;
  producerBet?: number | null;
  wineCuveeBet?: number | null;
}

/** Response from get_provisional_leaderboard_for_host — raw revealed-only data; ranking is computed client-side by reusing the existing calculateTasterResults pipeline (see lib/resultsReveal.ts). */
export interface ProvisionalLeaderboardResponse {
  wines: LeaderboardWineDTO[];
  guesses: LeaderboardGuessDTO[];
  guests: { id: string; displayName: string; completedAt: string | null; startingCredits?: number | null }[];
  scoringVersion: ScoringVersion;
  sessionStatus: SessionStatus;
  tastingMode: TastingMode;
  /** See README "Tasting modes" — "Betting". Optional for the same pre-betting-fixture reason as LeaderboardWineDTO.contributorGuestId above — treat a missing value as false. */
  bettingEnabled?: boolean;
  /** Per-field decimal odds, set once at creation. Optional/nullable for the same pre-betting-fixture reason as bettingEnabled above; null for a non-betting session. */
  countryBetMultiplier?: number | null;
  regionBetMultiplier?: number | null;
  appellationBetMultiplier?: number | null;
  grapeBlendBetMultiplier?: number | null;
  vintageBetMultiplier?: number | null;
  producerBetMultiplier?: number | null;
  wineCuveeBetMultiplier?: number | null;
  totalCount: number;
  revealedCount: number;
}

/**
 * Response from get_final_leaderboard_for_guest — see README "Final
 * leaderboard and tasting recap". Same wines/guesses/guests shape as
 * ProvisionalLeaderboardResponse (so both feed the exact same client-side
 * ranking pipeline — see lib/resultsReveal.ts), but only ever returned once
 * the whole session has reached 'revealed'. `myGuestId` is the caller's own
 * guest id, used purely for "(you)" row-marking and picking out the
 * viewer's own per-bottle score — never another participant's.
 */
export interface FinalLeaderboardResponse {
  wines: LeaderboardWineDTO[];
  guesses: LeaderboardGuessDTO[];
  guests: { id: string; displayName: string; completedAt: string | null; startingCredits?: number | null }[];
  scoringVersion: ScoringVersion;
  sessionStatus: SessionStatus;
  tastingMode: TastingMode;
  /** See README "Tasting modes" — "Betting". Optional — see ProvisionalLeaderboardResponse.bettingEnabled. */
  bettingEnabled?: boolean;
  /** Per-field decimal odds — see ProvisionalLeaderboardResponse's identical fields above. */
  countryBetMultiplier?: number | null;
  regionBetMultiplier?: number | null;
  appellationBetMultiplier?: number | null;
  grapeBlendBetMultiplier?: number | null;
  vintageBetMultiplier?: number | null;
  producerBetMultiplier?: number | null;
  wineCuveeBetMultiplier?: number | null;
  totalCount: number;
  revealedCount: number;
  title: string;
  tastingDate: string;
  myGuestId: string;
}

// --- Betting sub-mode (see README "Tasting modes" — "Betting") ---

/** One revealed bottle's identity + settlement counterparty, for the credits ledger — see get_credit_ledger_for_guest. Deliberately narrower than LeaderboardWineDTO (no wineStyle/photoPath — this ledger never renders a bottle card, only feeds lib/betting.ts's settlement math). */
export interface CreditLedgerWineDTO {
  id: string;
  anonymousCode: string;
  bottleNumber: number;
  country: string;
  region: string;
  appellation: string | null;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlend: string;
  producer: string;
  wineCuvee: string;
  vintage: string;
  tastingOrder: number;
  contributorGuestId: string | null;
}

/** One guess + its bets against a revealed bottle, for the credits ledger. */
export interface CreditLedgerGuessDTO {
  wineId: string;
  guestId: string;
  guestName: string;
  /** Only a locked guess's bets are ever settled — see README "Tasting modes" — "Betting" and buildCourseRevealSubmissions's identical convention for accuracy scoring. */
  lockedAt: string | null;
  countryGuess: string;
  regionGuess: string;
  appellationGuess: string | null;
  grapeBlendMode: GrapeBlendMode | null;
  grapeBlendGuess: string;
  producerGuess: string;
  wineCuveeGuess: string;
  vintageGuess: string;
  countryBet: number | null;
  regionBet: number | null;
  appellationBet: number | null;
  grapeBlendBet: number | null;
  vintageBet: number | null;
  producerBet: number | null;
  wineCuveeBet: number | null;
}

/**
 * Response from get_credit_ledger_for_guest — raw revealed-only bets/answer-
 * keys, folded into a ranked credit ledger client-side by
 * lib/betting.ts's buildCreditLedger, the same "server returns raw rows,
 * client computes once" convention as ProvisionalLeaderboardResponse/
 * FinalLeaderboardResponse above. Unlike those two, never gated on the whole
 * session being revealed — a guest needs their live running balance while
 * betting on the still-active (not yet revealed) bottle too.
 */
export interface CreditLedgerResponse {
  wines: CreditLedgerWineDTO[];
  guesses: CreditLedgerGuessDTO[];
  guests: { id: string; displayName: string; startingCredits: number | null }[];
  scoringVersion: ScoringVersion;
  myGuestId: string;
  /** Per-field decimal odds, set once at creation — see README "Tasting modes" — "Betting". Always present, since this RPC is unconditionally betting-only (raises betting_not_enabled otherwise). */
  countryBetMultiplier: number | null;
  regionBetMultiplier: number | null;
  appellationBetMultiplier: number | null;
  grapeBlendBetMultiplier: number | null;
  vintageBetMultiplier: number | null;
  producerBetMultiplier: number | null;
  wineCuveeBetMultiplier: number | null;
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
  /** This contributor's stable 1-based ordinal within their same-style bottles for this session (see README "Bottle labels") — bucket is derived client-side from wineStyle above via wineStyleToContributorBucket, since Seen mode always shows wineStyle unmasked. Null under the same condition as contributorName. */
  contributorStyleSequence: number | null;
  /** See README "Bottle photos" — Seen shows this unmasked from the start, same as every other field here. */
  photoPath: string | null;
  myRating: number | null;
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

// --- blind_match-only shapes (see get_match_tasting_state / upsert_match_guess) ---

/** One choice in the wine picker — see get_match_tasting_state. */
export interface MatchWineListEntryDTO {
  id: string;
  producer: string;
  wineCuvee: string;
  vintage: string;
  country: string;
  region: string;
  wineStyle: WineStyle;
}

/**
 * One glass in a blind_match session, plus the caller's own current
 * match/rating/note only — never another participant's, and never which
 * wine this glass actually is (that stays secret until the host ends the
 * tasting).
 */
export interface MatchBottleDTO {
  id: string;
  bottleNumber: number;
  anonymousCode: string;
  wineStyle: WineStyle;
  contributorName: string | null;
  myMatchedWineId: string | null;
  myRating: number | null;
  myNote: string | null;
}

export interface MatchTastingStateResponse {
  session: {
    publicId: string;
    title: string;
    tastingDate: string;
    status: SessionStatus;
    tastingMode: TastingMode;
  };
  guestName: string;
  wineList: MatchWineListEntryDTO[];
  bottles: MatchBottleDTO[];
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
  invalid_photo_mime_type: "That photo type isn't supported — use a JPEG, PNG, or WebP image.",
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
  bottle_already_active: "Another bottle is already active — reveal it before releasing a different one.",
  guess_already_locked: "Your guess for this bottle is already locked in.",
  own_bottle_not_guessable: "You contributed this bottle, so you don't guess or score it.",
  bottle_not_revealed: "That bottle hasn't been revealed yet.",
  not_fully_revealed: "The final leaderboard and tasting recap will be available once every bottle has been revealed.",
  rating_required: "A rating is required.",
  ratings_already_revealed: "This wine's group rating has been revealed, so ratings for it are now locked.",
  matched_wine_not_in_session: "That wine doesn't belong to this tasting.",

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

  // Session rejoin (see README "Session rejoin"). rate_limited and
  // recovery_failed deliberately use the spec's exact generic copy and are
  // raised for every distinct underlying reason (expired/used/wrong-session/
  // too-many-attempts) — never anything more specific, on purpose.
  rate_limited: "Please wait a moment and try again.",
  recovery_failed: "That code could not be used. Check it and try again.",
  not_signed_in: "Sign in to continue with your account.",
  account_already_linked:
    "This account already has a participant record for this tasting.",

  // Participant readiness confirmation (see README) — raised by
  // mark_participant_ready once the session has left 'registration'.
  readiness_unavailable: "Readiness can no longer be updated for this tasting.",

  // Betting sub-mode (see README "Tasting modes" — "Betting").
  invalid_betting_mode: "Betting is only available for Course-by-course reveal tastings.",
  invalid_starting_credits: "Enter a starting credit balance between 1 and 100,000.",
  invalid_bet_multiplier: "Every betting odds value must be greater than 1 and at most 10.",
  betting_roster_locked:
    "This tasting's betting roster is locked once tasting begins — new participants can no longer join.",
  invalid_bet_amount: "Bets must be zero or a positive whole number.",
  bet_exceeds_balance: "Your total bets on this bottle can't exceed your starting balance.",
  betting_not_enabled: "This tasting doesn't have betting enabled.",
};

/** Turns a Supabase/Postgres error into a friendly, pre-written message when we recognize it. */
export function friendlyRpcError(error: { message?: string } | null | undefined): string {
  const raw = error?.message ?? "";
  for (const [tag, message] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (raw.includes(tag)) return message;
  }
  return "Something went wrong talking to the tasting server. Please try again.";
}
