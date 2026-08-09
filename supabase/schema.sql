-- Blind Cellar — multi-device tasting sessions with participant-contributed bottles
--
-- Paste this whole file into the Supabase SQL Editor (Project > SQL Editor > New query).
--
--   * On a BRAND NEW project, the CREATE TABLE statements below already include
--     every column this app needs (bottle_number, contributor_guest_id,
--     host_guest_id, next_bottle_number) — just run the whole file once.
--   * On a project that already ran an EARLIER version of this file (before
--     bottle registration existed), the CREATE TABLE statements are no-ops
--     (`if not exists`) and the "MIGRATION" blocks further down bring your
--     existing tables up to date safely, in order, without deleting data.
--     See SUPABASE_SETUP.md for the full migration walkthrough.
--
-- Design summary:
--   * No anon (public) client ever gets direct table-level SELECT/INSERT/UPDATE
--     access beyond a few narrow, explicitly-granted column sets (see the GRANT
--     statements near the bottom). Every other read or write goes through a
--     SECURITY DEFINER function below, which validates a host or guest token
--     *inside Postgres* before touching any row.
--   * "host_token" and "guest_token" are the only credentials in this MVP —
--     there is no Supabase Auth user/session involved. Possession of the raw
--     token is treated as proof of ownership. See SUPABASE_SETUP.md for the
--     honest limitations of this model.
--   * The host is now just a `guests` row like everyone else (see
--     `tasting_sessions.host_guest_id`), so it can never appear twice in
--     scoring/leaderboard logic, which only ever counts `guests` rows once.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables (full, final shape — fresh installs get everything from here)
-- ---------------------------------------------------------------------------

create table if not exists tasting_sessions (
  id uuid primary key default gen_random_uuid(),
  public_id uuid unique not null default gen_random_uuid(),
  join_code text unique not null,
  title text not null,
  tasting_date date not null,
  -- MIGRATION-SENSITIVE: 'registration' is a new status. New sessions start
  -- here; existing 'collecting'/'revealed' sessions are never touched.
  status text not null default 'registration' check (status in ('registration', 'collecting', 'revealed')),
  -- MIGRATION-SENSITIVE: chosen once at creation, never editable afterwards
  -- (see README "Tasting modes"). Nullable here only so a fresh CREATE TABLE
  -- and the migration backfill below share one code path — every session
  -- ends up with a value, defaulting existing/legacy sessions to
  -- 'full_blind' (today's only behaviour) once the NOT NULL + check
  -- constraint are added in the migration block.
  tasting_mode text,
  -- MIGRATION-SENSITIVE: chosen once at creation, hardcoded server-side in
  -- create_tasting_session — never a client-supplied parameter, never
  -- editable afterwards (see README "Scoring model"). Nullable here only so
  -- a fresh CREATE TABLE and the migration backfill below share one code
  -- path — existing sessions are backfilled to 'legacy_v1' (the only
  -- scoring model ever actually shipped before this feature; the
  -- previously-planned 140-point Appellation-bonus model was never
  -- deployed), while brand-new sessions always get
  -- 'core_v3_appellation_conditional'.
  scoring_version text,
  host_token_hash text not null,
  -- MIGRATION-SENSITIVE: the guests row representing the host (see below).
  -- Nullable because it can only be set after the host's own guest row
  -- exists, and because pre-existing sessions never had a host participant.
  host_guest_id uuid,
  -- MIGRATION-SENSITIVE: monotonic counter for bottle numbering. Never
  -- decreases, even when a bottle is deleted — this is what guarantees a
  -- deleted bottle number is never reused. See "Bottle numbering" below.
  next_bottle_number int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tasting_sessions(id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  display_name_normalized text generated always as (lower(btrim(display_name))) stored,
  guest_token text not null unique,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, display_name_normalized)
);

-- Added after both tables exist, since tasting_sessions and guests reference
-- each other (session -> host's guest row, guest -> its session). Guarded so
-- re-running this file doesn't fail with "constraint already exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasting_sessions_host_guest_id_fkey'
  ) then
    alter table tasting_sessions
      add constraint tasting_sessions_host_guest_id_fkey
      foreign key (host_guest_id) references guests(id)
      not valid; -- see MIGRATION block below for the safe VALIDATE step
  end if;
end $$;

create table if not exists wines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tasting_sessions(id) on delete cascade,
  display_order int not null,
  -- MIGRATION-SENSITIVE: bottle_number is the durable, sequential, never-
  -- reused anonymous number. anonymous_code is the display label; for new
  -- bottles it's always 'Bottle <n>'. Existing rows keep whatever label
  -- they already had ('Wine A', etc.) — see the backfill below.
  bottle_number int,
  anonymous_code text not null,
  -- MIGRATION-SENSITIVE: who registered this bottle. Null for bottles
  -- created before this feature existed (host-entered, no single owner).
  contributor_guest_id uuid references guests(id),
  -- MIGRATION-SENSITIVE: mutable serving/tasting sequence, arranged by the
  -- host during registration and frozen once collecting starts. Distinct
  -- from bottle_number (permanent, never reused) and display_order (legacy
  -- registration-insertion-order column) — see README "Bottle number vs
  -- tasting order". Nullable here only so a fresh CREATE TABLE and the
  -- migration backfill below share one code path; register_bottle always
  -- sets it at insert time, and the NOT NULL + unique constraints are added
  -- once every row is guaranteed to have a value (see migration step 9).
  tasting_order int,
  country text not null,
  region text not null,
  -- MIGRATION-SENSITIVE: new nullable field (see README "Region and
  -- Appellation"). `region` keeps its existing meaning (broad geographical
  -- region); `appellation` is an optional, more specific recognised
  -- appellation within that region (e.g. Chablis within Burgundy), only ever
  -- offered for a small curated set of country/region pairs (see
  -- lib/appellations.ts). Null for every bottle registered before this
  -- field existed, and for any bottle whose country/region pair has no
  -- curated appellation list. Never backfilled/guessed, never used in
  -- scoring, and masked the same way as region/country in
  -- guest_visible_wines below.
  appellation text,
  -- Physical column name kept for migration safety (see README); holds the
  -- grape/blend text for both legacy single-variety/style values and new
  -- single-variety-or-blend values.
  grape_style text not null default '',
  -- MIGRATION-SENSITIVE: new nullable field. Null means legacy/unknown (a
  -- bottle registered before this field existed) — scoring and display fall
  -- back safely rather than guessing. New bottles always set 'single' or
  -- 'blend'.
  grape_blend_mode text check (grape_blend_mode is null or grape_blend_mode in ('single', 'blend')),
  -- MIGRATION-SENSITIVE: structured source data for the blend multi-select
  -- UI — {"selectedGrapes": [...curated picks], "otherGrapesText": "..."}.
  -- Null for single-mode bottles and for blends that predate this field
  -- (those fall back to re-parsing the flattened grape_style text — see
  -- reconstructBlendComponentsFromText in lib/wineReferenceData.ts). Not the
  -- source of truth for scoring/display — grape_style (the flattened,
  -- alphabetised "Cabernet Sauvignon / Merlot" text) still is, this only
  -- exists so a blend can be re-edited without losing which grapes were
  -- picked from the curated list vs. typed as free text. Never exposed to
  -- anon directly or in any pre-reveal view — see the grants section.
  grape_blend_components jsonb,
  producer text not null,
  wine_cuvee text not null,
  vintage text not null,
  -- MIGRATION-SENSITIVE: contributor-classified style, required for every
  -- new bottle. Nullable here for the same fresh-install/migration reason as
  -- tasting_order above; backfilled to 'other' and made NOT NULL + check-
  -- constrained in migration step 8. Not a scored/guessed field — shown to
  -- the contributor for their own bottles, to the host as style + anonymous
  -- number only, and in revealed results.
  wine_style text,
  -- MIGRATION-SENSITIVE: price band is no longer collected, scored, or
  -- displayed (see README) — nullable so new bottles simply never set it.
  -- Existing values are left in place but unused.
  price_band text check (price_band is null or price_band in ('under-100', '100-199', '200-399', '400-plus')),
  -- Kept the historical column name for migration safety even though any
  -- contributor (not just the host) can now set a private note here.
  host_notes text,
  -- MIGRATION-SENSITIVE: audit trail for course-by-course reveal (see README
  -- "Tasting modes") — null means this bottle is not yet revealed; once set,
  -- never cleared (no "un-reveal" in this feature). Always null in
  -- full_blind sessions and for every existing bottle; full_blind's answer
  -- keys become visible purely via tasting_sessions.status = 'revealed', as
  -- before — this column is only ever read/written for course_reveal
  -- sessions. Never added to the anon column grant or any pre-reveal view;
  -- only the new per-bottle RPCs below read it.
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, display_order),
  unique (session_id, anonymous_code),
  constraint wines_appellation_length check (appellation is null or length(appellation) <= 200)
);

create table if not exists wine_guesses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tasting_sessions(id) on delete cascade,
  wine_id uuid not null references wines(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  country_guess text not null default '',
  region_guess text not null default '',
  -- MIGRATION-SENSITIVE: new nullable field (see README "Region and
  -- Appellation" — "Blind-guess Appellation"). Optional participant call for
  -- a more specific appellation within region_guess, using the same curated
  -- country/region/appellation map as actual wine records
  -- (lib/appellations.ts / is_valid_appellation below) — never a second,
  -- separate list. Never scored: no FieldScore, no core/bonus points, no
  -- appellation_correct column. Null for every guess predating this field.
  appellation_guess text constraint wine_guesses_appellation_guess_length check (appellation_guess is null or length(appellation_guess) <= 200),
  -- Physical column name kept for migration safety; holds the grape/blend guess text.
  grape_style_guess text not null default '',
  -- MIGRATION-SENSITIVE: new nullable field, same meaning as wines.grape_blend_mode.
  grape_blend_mode text check (grape_blend_mode is null or grape_blend_mode in ('single', 'blend')),
  -- MIGRATION-SENSITIVE: same meaning/shape as wines.grape_blend_components,
  -- for a guess's own in-progress blend selection.
  grape_blend_components jsonb,
  producer_guess text not null default '',
  wine_cuvee_guess text not null default '',
  vintage_guess text not null default '',
  -- No longer written by upsert_wine_guess (price band was removed from the
  -- guess-entry form) — kept nullable so existing rows are unaffected.
  price_band_guess text check (price_band_guess is null or price_band_guess in ('under-100', '100-199', '200-399', '400-plus')),
  rating int check (rating is null or (rating between 50 and 100)),
  confidence text not null default 'medium' check (confidence in ('low', 'medium', 'high')),
  tasting_note text,
  -- MIGRATION-SENSITIVE: per-bottle finalize signal used only by course_reveal
  -- sessions (see README "Tasting modes") — null means this guess is still
  -- an editable draft; once set (via lock_wine_guess), upsert_wine_guess
  -- refuses further edits and the guess counts toward the host's "N of M
  -- submitted" count and toward that bottle's revealed results. Distinct
  -- from full_blind's existing session-wide guests.completed_at lock, which
  -- this column has no effect on and vice versa. Always null in full_blind
  -- sessions.
  locked_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (guest_id, wine_id)
);

create index if not exists wines_session_id_idx on wines(session_id);
create index if not exists wines_contributor_guest_id_idx on wines(contributor_guest_id);
-- The index on (session_id, revealed_at, tasting_order) — used to find the
-- "earliest unrevealed bottle by tasting order" — is created later, in
-- migration step 10, since on an existing project revealed_at doesn't exist
-- as a column until that step's ALTER TABLE runs (this CREATE TABLE is a
-- no-op there). See that step for the actual index statement.
create index if not exists guests_session_id_idx on guests(session_id);
create index if not exists wine_guesses_session_id_idx on wine_guesses(session_id);
create index if not exists wine_guesses_guest_id_idx on wine_guesses(guest_id);
create index if not exists wine_guesses_wine_id_idx on wine_guesses(wine_id);

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasting_sessions_set_updated_at on tasting_sessions;
create trigger tasting_sessions_set_updated_at
  before update on tasting_sessions
  for each row execute function set_updated_at();

drop trigger if exists wines_set_updated_at on wines;
create trigger wines_set_updated_at
  before update on wines
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- MIGRATION: run-once-safe statements for a project that already had the
-- pre-bottle-registration schema. Every statement here is a no-op if you're
-- running this on a fresh project (columns/constraints already exist from
-- the CREATE TABLE statements above), and safe to re-run repeatedly.
-- Order matters — do not reorder these blocks.
-- ---------------------------------------------------------------------------

-- 1. Add new columns if they don't already exist (fresh installs: no-op).
alter table tasting_sessions add column if not exists host_guest_id uuid;
alter table tasting_sessions add column if not exists next_bottle_number int not null default 1;
alter table wines add column if not exists bottle_number int;
alter table wines add column if not exists contributor_guest_id uuid references guests(id);
alter table wines add column if not exists updated_at timestamptz not null default now();
alter table wines add column if not exists grape_blend_components jsonb;
alter table wine_guesses add column if not exists grape_blend_components jsonb;

-- 1b. Region/Appellation split (see README "Region and Appellation"):
-- additive nullable column, existing `region` values and meaning are
-- untouched. Never backfilled — every existing bottle simply has a null
-- appellation until edited.
alter table wines add column if not exists appellation text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wines_appellation_length'
  ) then
    alter table wines add constraint wines_appellation_length
      check (appellation is null or length(appellation) <= 200);
  end if;
end $$;

-- 1a. Grape/blend + price-band update (see README "Scoring and grape/blend"):
-- add the new nullable grape_blend_mode columns, and stop requiring
-- price_band on existing rows now that new bottles never set it. Existing
-- price_band values are left exactly as they are — just no longer required.
alter table wines add column if not exists grape_blend_mode text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wines_grape_blend_mode_check'
  ) then
    alter table wines add constraint wines_grape_blend_mode_check
      check (grape_blend_mode is null or grape_blend_mode in ('single', 'blend'));
  end if;
end $$;
alter table wines alter column price_band drop not null;

alter table wine_guesses add column if not exists grape_blend_mode text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wine_guesses_grape_blend_mode_check'
  ) then
    alter table wine_guesses add constraint wine_guesses_grape_blend_mode_check
      check (grape_blend_mode is null or grape_blend_mode in ('single', 'blend'));
  end if;
end $$;

-- 1c. Blind-guess Appellation (see README "Region and Appellation" —
-- "Blind-guess Appellation"): additive nullable column, same shape as
-- wines.appellation above. revealed_wine_guesses (defined later in this
-- file as `select g.*`) picks this column up automatically once it exists,
-- with no view-definition change needed.
alter table wine_guesses add column if not exists appellation_guess text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wine_guesses_appellation_guess_length'
  ) then
    alter table wine_guesses add constraint wine_guesses_appellation_guess_length
      check (appellation_guess is null or length(appellation_guess) <= 200);
  end if;
end $$;

-- 2. Widen the status check constraint to allow 'registration' without
-- touching any existing row's stored status value.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'tasting_sessions_status_check'
  ) then
    alter table tasting_sessions drop constraint tasting_sessions_status_check;
  end if;
  alter table tasting_sessions
    add constraint tasting_sessions_status_check
    check (status in ('registration', 'collecting', 'revealed'));
end $$;

-- 3. Backfill bottle_number for any existing wine rows from their current
-- display_order (0-based -> 1-based), so numbering stays sequential and
-- matches the order wines were originally entered in. Existing labels
-- (anonymous_code, e.g. 'Wine A') are left untouched on purpose.
update wines set bottle_number = display_order + 1 where bottle_number is null;

-- 4. Now that every row has a value, make bottle_number required.
alter table wines alter column bottle_number set not null;

-- 5. Seed next_bottle_number for existing sessions from their current
-- highest bottle_number, so the very next registered bottle continues the
-- sequence instead of restarting at 1.
update tasting_sessions s
set next_bottle_number = coalesce((select max(w.bottle_number) + 1 from wines w where w.session_id = s.id), 1)
where s.next_bottle_number = 1;

-- 6. Add the uniqueness constraint now that backfill guarantees every
-- session's bottle numbers are populated and sequential (safe to add after
-- step 3; would fail before it if any row were still null/duplicated).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wines_session_id_bottle_number_key'
  ) then
    alter table wines add constraint wines_session_id_bottle_number_key unique (session_id, bottle_number);
  end if;
end $$;

-- 7. Validate the host_guest_id FK added earlier (kept NOT VALID above so it
-- doesn't need to lock/scan on creation for large existing tables; existing
-- rows all have host_guest_id = null, which trivially satisfies the FK).
alter table tasting_sessions validate constraint tasting_sessions_host_guest_id_fkey;

-- 8. Wine-style classification (see README "Wine style"): add the column,
-- backfill existing rows to the safe default 'other' (legacy bottles predate
-- this field and have no real classification on file), then require it.
alter table wines add column if not exists wine_style text;
update wines set wine_style = 'other' where wine_style is null;
alter table wines alter column wine_style set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'wines_wine_style_check'
  ) then
    alter table wines add constraint wines_wine_style_check
      check (wine_style in ('bubbles', 'white', 'red', 'sweet', 'other'));
  end if;
end $$;

-- 9. Tasting order (see README "Bottle number vs tasting order"): add the
-- column, backfill from the existing display_order (0-based -> 1-based;
-- already populated on every row, legacy or new), then require it and make
-- it unique per session. Every statement here is a no-op on a fresh install,
-- where register_bottle already sets tasting_order at insert time.
alter table wines add column if not exists tasting_order int;
update wines set tasting_order = display_order + 1 where tasting_order is null;
alter table wines alter column tasting_order set not null;
-- MIGRATION-SENSITIVE: must be DEFERRABLE INITIALLY DEFERRED, not a plain
-- unique constraint. reorder_wines and delete_bottle's repacking step both
-- reassign tasting_order for multiple rows of the same session in a single
-- UPDATE (e.g. swapping two bottles' positions) — a non-deferrable unique
-- index checks each row immediately as it's written and can spuriously
-- reject a mid-statement collision (row A moving to row B's old value
-- before row B has moved off it), even though the final result is a valid
-- permutation. Deferring the check to end-of-statement fixes this. A
-- deferrable constraint can't be altered in place (Postgres only supports
-- toggling INITIALLY DEFERRED/IMMEDIATE on an already-deferrable
-- constraint), so this drops and re-adds it unconditionally — safe, since
-- the data is already valid and unique by this point in the migration.
alter table wines drop constraint if exists wines_session_id_tasting_order_key;
alter table wines add constraint wines_session_id_tasting_order_key
  unique (session_id, tasting_order) deferrable initially deferred;

-- 10. Tasting modes (see README "Tasting modes"): add tasting_sessions.tasting_mode,
-- backfilling every existing session — which only ever behaved as today's
-- single format — to 'full_blind' before requiring it. Add wines.revealed_at
-- and wine_guesses.locked_at, both nullable with no backfill (every existing
-- bottle/guess correctly starts "not individually revealed/locked", since
-- course-by-course reveal did not exist when they were created).
alter table tasting_sessions add column if not exists tasting_mode text;
update tasting_sessions set tasting_mode = 'full_blind' where tasting_mode is null;
alter table tasting_sessions alter column tasting_mode set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasting_sessions_tasting_mode_check'
  ) then
    alter table tasting_sessions add constraint tasting_sessions_tasting_mode_check
      check (tasting_mode in ('full_blind', 'course_reveal'));
  end if;
end $$;

alter table wines add column if not exists revealed_at timestamptz;
alter table wine_guesses add column if not exists locked_at timestamptz;
create index if not exists wines_session_revealed_order_idx on wines(session_id, revealed_at, tasting_order);

-- 11. Seen tasting mode (see README "Tasting modes"): widen the tasting_mode
-- check constraint to also allow 'seen'. No new columns — a Seen rating is
-- just a wine_guesses row that only ever sets rating/confidence/tasting_note
-- (see upsert_seen_rating below), relying on the identification-guess
-- columns' existing blank defaults ('' / null) rather than inventing new
-- ones. Existing full_blind/course_reveal sessions and rows are completely
-- untouched by this step.
alter table tasting_sessions drop constraint if exists tasting_sessions_tasting_mode_check;
alter table tasting_sessions add constraint tasting_sessions_tasting_mode_check
  check (tasting_mode in ('full_blind', 'course_reveal', 'seen'));

-- 12. Scoring model replacement (see README "Scoring model"): country(20)/
-- region(20)/appellation(20, conditional)/grape-blend(20)/vintage(20), no
-- producer/wine-cuvée bonus, 80 or 100-point denominator depending on
-- whether the actual wine has a recorded Appellation. Existing sessions keep
-- their original scoring model forever — backfilled to 'legacy_v1', never
-- recalculated. Only two versions have ever actually existed, so there is no
-- intermediate legacy version here (see types/tasting.ts ScoringVersion).
alter table tasting_sessions add column if not exists scoring_version text;
update tasting_sessions set scoring_version = 'legacy_v1' where scoring_version is null;
alter table tasting_sessions alter column scoring_version set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasting_sessions_scoring_version_check'
  ) then
    alter table tasting_sessions add constraint tasting_sessions_scoring_version_check
      check (scoring_version in ('legacy_v1', 'core_v3_appellation_conditional'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security (enabled everywhere; anon gets no default table grants,
-- see the GRANT section below — RLS is defense-in-depth on top of that).
-- ---------------------------------------------------------------------------

alter table tasting_sessions enable row level security;
alter table wines enable row level security;
alter table guests enable row level security;
alter table wine_guesses enable row level security;

-- Session metadata is safe to expose broadly; sensitive columns (host_token_hash)
-- are hidden via column-level GRANTs below, not row filtering, so this policy
-- can be permissive.
drop policy if exists tasting_sessions_select on tasting_sessions;
create policy tasting_sessions_select on tasting_sessions
  for select using (true);

drop policy if exists guests_select on guests;
create policy guests_select on guests
  for select using (true);

-- wines: only a few non-sensitive columns are ever granted to anon (see
-- GRANT below), so a permissive row policy here does not leak answer-key
-- data — it just lets Realtime and the anonymous bottle-count queries see
-- id/session_id/bottle_number/anonymous_code/created_at for every row.
-- Full answer-key columns are only ever reachable via the SECURITY DEFINER
-- functions further down, which enforce ownership/reveal status themselves.
drop policy if exists wines_select on wines;
create policy wines_select on wines
  for select using (true);

-- No anon INSERT/UPDATE/DELETE policies on any base table, and no anon
-- SELECT at all on `wine_guesses` — reachable only through the view below
-- and the RPC functions.

-- ---------------------------------------------------------------------------
-- Views: mask sensitive wine data until the session is revealed, and only
-- expose guesses publicly once revealed.
--
-- IMPORTANT: these are intentionally NOT `security_invoker` views. The
-- default (security_invoker = false) makes a view run with the privileges
-- of the view's OWNER, not the querying role. Since anon has no RLS policy
-- granting it rows on `wine_guesses` directly, and only a narrow column
-- grant + permissive policy on `wines`, a security_invoker view here would
-- evaluate RLS as anon and could return fewer rows than intended for
-- `wine_guesses` in particular. Running as the (trusted) view owner lets the
-- view's own CASE/WHERE logic be the sole thing deciding what anon sees —
-- which is exactly the masking behaviour we want.
-- ---------------------------------------------------------------------------

create or replace view guest_visible_wines as
select
  w.id,
  w.session_id,
  w.bottle_number,
  w.anonymous_code,
  case when s.status = 'revealed' then w.country else null end as country,
  case when s.status = 'revealed' then w.region else null end as region,
  case when s.status = 'revealed' then w.grape_style else null end as grape_style,
  case when s.status = 'revealed' then w.producer else null end as producer,
  case when s.status = 'revealed' then w.wine_cuvee else null end as wine_cuvee,
  case when s.status = 'revealed' then w.vintage else null end as vintage,
  case when s.status = 'revealed' then w.price_band else null end as price_band,
  case when s.status = 'revealed' then w.host_notes else null end as host_notes,
  case when s.status = 'revealed' then w.contributor_guest_id else null end as contributor_guest_id,
  -- Appended at the end deliberately: CREATE OR REPLACE VIEW can only add
  -- trailing columns, never reorder or remove existing ones.
  case when s.status = 'revealed' then w.grape_blend_mode else null end as grape_blend_mode,
  -- Wine style is an answer-key field (masked until revealed), same as
  -- country/region/etc above. Tasting order is NOT masked — the serving
  -- sequence itself is meant to be visible to every participant throughout,
  -- only the style/identity of each bottle is secret pre-reveal.
  case when s.status = 'revealed' then w.wine_style else null end as wine_style,
  w.tasting_order,
  -- Region/Appellation (see README "Region and Appellation"): masked the
  -- same way as region/country above. Appended at the end for the same
  -- CREATE OR REPLACE VIEW column-ordering reason as grape_blend_mode/
  -- wine_style.
  case when s.status = 'revealed' then w.appellation else null end as appellation
from wines w
join tasting_sessions s on s.id = w.session_id;

create or replace view revealed_wine_guesses as
select g.*
from wine_guesses g
join tasting_sessions s on s.id = g.session_id
where s.status = 'revealed';

-- ---------------------------------------------------------------------------
-- RPC functions. All SECURITY DEFINER with a locked-down search_path, so
-- they run with the privileges needed to reach the base tables regardless
-- of the caller's (anon's) own grants. Every one validates its token before
-- doing anything.
-- ---------------------------------------------------------------------------

-- Shared shape/length/duplicate validation for the structured blend payload
-- (see wines.grape_blend_components / wine_guesses.grape_blend_components
-- above), called from register_bottle, update_bottle, and upsert_wine_guess.
-- Not a table-touching function, so it needs no SECURITY DEFINER/search_path
-- of its own — it only ever runs inside a caller that already has those.
create or replace function validate_grape_blend_components(
  p_mode text,
  p_components jsonb
) returns void
language plpgsql
as $$
declare
  v_selected jsonb;
begin
  if p_components is null then
    return;
  end if;
  if coalesce(p_mode, '') <> 'blend' then
    raise exception 'invalid_grape_blend_components';
  end if;
  if jsonb_typeof(p_components) <> 'object' then
    raise exception 'invalid_grape_blend_components';
  end if;

  v_selected := coalesce(p_components->'selectedGrapes', '[]'::jsonb);
  if jsonb_typeof(v_selected) <> 'array' then
    raise exception 'invalid_grape_blend_components';
  end if;
  if jsonb_array_length(v_selected) > 20 then
    raise exception 'invalid_grape_blend_components';
  end if;
  if exists (
    select 1 from jsonb_array_elements_text(v_selected) e
    where length(e) = 0 or length(e) > 100
  ) then
    raise exception 'invalid_grape_blend_components';
  end if;
  if (
    select count(*) from jsonb_array_elements_text(v_selected)
  ) <> (
    select count(distinct lower(e)) from jsonb_array_elements_text(v_selected) e
  ) then
    raise exception 'invalid_grape_blend_components';
  end if;
  if length(coalesce(p_components->>'otherGrapesText', '')) > 500 then
    raise exception 'invalid_grape_blend_components';
  end if;
end;
$$;

-- Server-side mirror of the curated country/region/appellation map in
-- lib/appellations.ts (see README "Region and Appellation") — used by
-- register_bottle, update_bottle, add_cellar_bottle, and
-- update_cellar_bottle so an appellation is never trusted from the client
-- alone (see that spec's "Do not trust client-only filtering"). A blank
-- appellation is always valid, matching lib/appellations.ts's
-- isValidAppellation exactly. Adding a new supported country/region pair
-- means updating BOTH this jsonb literal and lib/appellations.ts — see
-- SUPABASE_SETUP.md "Adding a new supported region/appellation pair".
create or replace function is_valid_appellation(
  p_country text,
  p_region text,
  p_appellation text
) returns boolean
language plpgsql
as $$
declare
  v_map jsonb := '{
    "France": {
      "Burgundy": ["Chablis", "Petit Chablis", "Chablis Premier Cru", "Chablis Grand Cru", "Bourgogne", "Bourgogne Aligoté", "Bourgogne Côte d''Or", "Côte de Nuits-Villages", "Côte de Beaune-Villages", "Marsannay", "Fixin", "Gevrey-Chambertin", "Morey-Saint-Denis", "Chambolle-Musigny", "Vougeot", "Vosne-Romanée", "Nuits-Saint-Georges", "Pernand-Vergelesses", "Aloxe-Corton", "Savigny-lès-Beaune", "Chorey-lès-Beaune", "Beaune", "Pommard", "Volnay", "Monthelie", "Meursault", "Puligny-Montrachet", "Chassagne-Montrachet", "Saint-Aubin", "Santenay", "Maranges", "Mercurey", "Givry", "Rully", "Montagny", "Mâcon", "Mâcon-Villages", "Pouilly-Fuissé", "Pouilly-Vinzelles", "Pouilly-Loché", "Saint-Véran", "Viré-Clessé"],
      "Beaujolais": ["Beaujolais", "Beaujolais-Villages", "Brouilly", "Côte de Brouilly", "Chénas", "Chiroubles", "Fleurie", "Juliénas", "Morgon", "Moulin-à-Vent", "Régnié", "Saint-Amour"],
      "Bordeaux": ["Bordeaux", "Bordeaux Supérieur", "Médoc", "Haut-Médoc", "Margaux", "Moulis-en-Médoc", "Listrac-Médoc", "Saint-Estèphe", "Pauillac", "Saint-Julien", "Graves", "Pessac-Léognan", "Pomerol", "Saint-Émilion", "Saint-Émilion Grand Cru", "Fronsac", "Canon-Fronsac", "Lalande-de-Pomerol", "Sauternes", "Barsac", "Cadillac", "Cérons", "Sainte-Croix-du-Mont"],
      "Champagne": ["Champagne", "Coteaux Champenois", "Rosé des Riceys"],
      "Loire Valley": ["Muscadet Sèvre et Maine", "Sancerre", "Pouilly-Fumé", "Menetou-Salon", "Quincy", "Reuilly", "Touraine", "Vouvray", "Montlouis-sur-Loire", "Saumur", "Saumur-Champigny", "Chinon", "Bourgueil", "Saint-Nicolas-de-Bourgueil", "Anjou", "Savennières", "Coteaux du Layon", "Bonnezeaux", "Quarts de Chaume"],
      "Rhône Valley": ["Côte-Rôtie", "Condrieu", "Château-Grillet", "Saint-Joseph", "Crozes-Hermitage", "Hermitage", "Cornas", "Saint-Péray", "Côtes du Rhône", "Côtes du Rhône Villages", "Châteauneuf-du-Pape", "Gigondas", "Vacqueyras", "Beaumes-de-Venise", "Tavel", "Lirac", "Rasteau", "Vinsobres", "Cairanne"],
      "Alsace": ["Alsace", "Alsace Grand Cru", "Crémant d''Alsace"],
      "Provence": ["Côtes de Provence", "Coteaux d''Aix-en-Provence", "Coteaux Varois en Provence", "Bandol", "Cassis", "Palette", "Bellet"]
    },
    "Italy": {
      "Piedmont": ["Barolo", "Barbaresco", "Langhe", "Roero", "Nebbiolo d''Alba", "Barbera d''Asti", "Barbera d''Alba", "Nizza", "Dolcetto d''Alba", "Dolcetto di Dogliani", "Dogliani", "Gavi", "Arneis", "Moscato d''Asti", "Asti", "Brachetto d''Acqui", "Gattinara", "Ghemme", "Carema", "Boca", "Lessona", "Bramaterra"],
      "Tuscany": ["Chianti", "Chianti Classico", "Brunello di Montalcino", "Rosso di Montalcino", "Vino Nobile di Montepulciano", "Bolgheri", "Bolgheri Sassicaia", "Morellino di Scansano", "Carmignano", "Vernaccia di San Gimignano", "Vin Santo del Chianti"],
      "Veneto": ["Valpolicella", "Valpolicella Classico", "Valpolicella Ripasso", "Amarone della Valpolicella", "Recioto della Valpolicella", "Soave", "Soave Classico", "Bardolino", "Lugana", "Prosecco", "Conegliano Valdobbiadene Prosecco"],
      "Sicily": ["Etna", "Cerasuolo di Vittoria", "Marsala", "Noto", "Menfi"],
      "Campania": ["Taurasi", "Fiano di Avellino", "Greco di Tufo", "Aglianico del Taburno", "Falerno del Massico"]
    },
    "Spain": {
      "La Rioja": ["Rioja", "Rioja Alta", "Rioja Alavesa", "Rioja Oriental"],
      "Ribera del Duero": ["Ribera del Duero"],
      "Priorat": ["Priorat"],
      "Rías Baixas": ["Rías Baixas", "Val do Salnés", "O Rosal", "Condado do Tea", "Soutomaior", "Ribeira do Ulla"],
      "Jerez": ["Jerez-Xérès-Sherry", "Manzanilla-Sanlúcar de Barrameda"]
    },
    "Portugal": {
      "Douro": ["Douro", "Porto"],
      "Dão": ["Dão"],
      "Alentejo": ["Alentejo"]
    },
    "Germany": {
      "Mosel": ["Mosel"],
      "Rheingau": ["Rheingau"],
      "Pfalz": ["Pfalz"]
    },
    "Austria": {
      "Wachau": ["Wachau"],
      "Kamptal": ["Kamptal"],
      "Kremstal": ["Kremstal"]
    },
    "United States": {
      "California": ["Napa Valley", "Sonoma County", "Russian River Valley", "Sonoma Coast", "Carneros", "Santa Barbara County", "Santa Maria Valley", "Santa Ynez Valley", "Sta. Rita Hills", "Paso Robles"],
      "Oregon": ["Willamette Valley", "Dundee Hills", "Eola-Amity Hills", "Yamhill-Carlton", "Chehalem Mountains", "McMinnville", "Ribbon Ridge"],
      "Washington": ["Columbia Valley", "Walla Walla Valley", "Red Mountain", "Yakima Valley", "Horse Heaven Hills"]
    },
    "Australia": {
      "South Australia": ["Barossa Valley", "Eden Valley", "McLaren Vale", "Clare Valley", "Coonawarra", "Adelaide Hills", "Padthaway", "Langhorne Creek"],
      "Victoria": ["Yarra Valley", "Mornington Peninsula", "Heathcote", "Rutherglen", "Beechworth", "Macedon Ranges"],
      "Western Australia": ["Margaret River", "Great Southern", "Swan Valley"],
      "New South Wales": ["Hunter Valley", "Riverina", "Orange", "Canberra District"]
    },
    "New Zealand": {
      "Marlborough": ["Marlborough", "Wairau Valley", "Awatere Valley", "Southern Valleys"],
      "Central Otago": ["Central Otago", "Bannockburn", "Gibbston", "Bendigo", "Alexandra", "Cromwell Basin"],
      "Hawke''s Bay": ["Hawke''s Bay", "Gimblett Gravels", "Bridge Pa Triangle"]
    }
  }'::jsonb;
begin
  if btrim(coalesce(p_appellation, '')) = '' then
    return true;
  end if;

  return exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_map->p_country->p_region, '[]'::jsonb)) a
    where lower(a) = lower(btrim(p_appellation))
  );
end;
$$;

-- The old create_tasting_session took a `jsonb` array of wines and created
-- them all at once. Sessions no longer collect wines at creation time — bottles
-- are registered afterwards by participants — so the signature changed.
-- Explicitly drop the old overloads so they can't be called with stale semantics.
drop function if exists create_tasting_session(text, date, text, text, jsonb);
drop function if exists create_tasting_session(text, date, text, text, text);

-- Host: create a session (status='registration') and the host's own
-- participant (guests) row in one transaction. Called from a Route Handler,
-- which generates and hashes the host token before calling this — the raw
-- host token never reaches Postgres. The host's own *participant* token
-- (guest_token) is generated here and returned once, same as any guest's.
create or replace function create_tasting_session(
  p_title text,
  p_tasting_date date,
  p_join_code text,
  p_host_token_hash text,
  p_host_display_name text,
  p_tasting_mode text
) returns table (
  id uuid,
  public_id uuid,
  join_code text,
  host_guest_id uuid,
  host_guest_token text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session_id uuid;
  v_public_id uuid;
  v_host_name text := btrim(coalesce(p_host_display_name, ''));
  v_host_guest_id uuid;
  v_host_token text;
begin
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'title_required';
  end if;
  if v_host_name = '' then
    raise exception 'display_name_required';
  end if;
  if length(v_host_name) > 60 then
    raise exception 'display_name_too_long';
  end if;
  if p_tasting_mode not in ('full_blind', 'course_reveal', 'seen') then
    raise exception 'invalid_tasting_mode';
  end if;

  -- scoring_version is deliberately a hardcoded literal, never a parameter —
  -- see README "Scoring model": the client can never choose or influence
  -- which scoring model a session gets.
  insert into tasting_sessions (title, tasting_date, join_code, host_token_hash, status, tasting_mode, scoring_version)
  values (btrim(p_title), p_tasting_date, p_join_code, p_host_token_hash, 'registration', p_tasting_mode, 'core_v3_appellation_conditional')
  returning tasting_sessions.id, tasting_sessions.public_id into v_session_id, v_public_id;

  v_host_token := encode(gen_random_bytes(32), 'base64');

  insert into guests (session_id, display_name, guest_token)
  values (v_session_id, v_host_name, v_host_token)
  returning guests.id into v_host_guest_id;

  update tasting_sessions set host_guest_id = v_host_guest_id where tasting_sessions.id = v_session_id;

  return query select v_session_id, v_public_id, p_join_code, v_host_guest_id, v_host_token;
end;
$$;

-- Host: validate the host token and return session metadata, guest list, and
-- ANONYMOUS bottle labels only. The host must never receive other
-- contributors' (or their own, for that matter — same endpoint for everyone)
-- answer-key details through this call; that only ever happens through the
-- public post-reveal path (guest_visible_wines) once status = 'revealed'.
create or replace function get_host_session(
  p_public_id uuid,
  p_host_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session tasting_sessions%rowtype;
  v_active_wine wines%rowtype;
  v_active_bottle jsonb := null;
  v_seen_progress jsonb := null;
  v_wines jsonb;
  v_seen_eligible_count int;
  v_result jsonb;
begin
  select * into v_session from tasting_sessions where public_id = p_public_id;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.host_token_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    raise exception 'invalid_host_token';
  end if;

  -- seen only: aggregate rating progress for the host — how many
  -- participants have rated at least one bottle, and how many ratings exist
  -- out of every possible (bottle, participant) pair. Never an individual
  -- participant's rating value (see get_seen_tasting_state, the only path to
  -- that, and only ever scoped to the caller's own rating).
  if v_session.tasting_mode = 'seen' and v_session.status = 'collecting' then
    select jsonb_build_object(
      'ratersCount', (
        select count(distinct wg.guest_id) from wine_guesses wg
        join wines w on w.id = wg.wine_id
        where w.session_id = v_session.id and wg.rating is not null
      ),
      'totalParticipants', (select count(*) from guests where session_id = v_session.id),
      'ratingsSubmitted', (
        select count(*) from wine_guesses wg
        join wines w on w.id = wg.wine_id
        where w.session_id = v_session.id and wg.rating is not null
      ),
      'totalPossibleRatings', (
        (select count(*) from wines where session_id = v_session.id)
        * (select count(*) from guests where session_id = v_session.id)
      )
    ) into v_seen_progress;
  end if;

  -- course_reveal only: the host's active-bottle card needs the current
  -- active bottle's anonymous label/position plus an aggregate "N of M
  -- submitted" count — never any other participant's individual guess
  -- content (see get_revealed_bottle for the only path to that, and only
  -- once revealed_at is set).
  if v_session.tasting_mode = 'course_reveal' and v_session.status = 'collecting' then
    select * into v_active_wine from wines
    where session_id = v_session.id and revealed_at is null
    order by tasting_order asc
    limit 1;

    if found then
      select jsonb_build_object(
        'id', v_active_wine.id,
        'bottleNumber', v_active_wine.bottle_number,
        'anonymousCode', v_active_wine.anonymous_code,
        'position', (
          select count(*) + 1 from wines
          where session_id = v_session.id and tasting_order < v_active_wine.tasting_order
        ),
        'totalBottles', (select count(*) from wines where session_id = v_session.id),
        'submittedCount', (
          select count(*) from wine_guesses
          where wine_id = v_active_wine.id and locked_at is not null
        ),
        'totalParticipants', (select count(*) from guests where session_id = v_session.id)
      ) into v_active_bottle;
    end if;
  end if;

  -- Seen-only: the host controls' wine identity + rating-status/reveal
  -- fields (see README "Seen Host Controls"). Nested under a `seen` key so
  -- full_blind/course_reveal wines never carry it at all, rather than
  -- leaving it present-but-null — the DTO shape itself proves mode
  -- isolation. eligibleCount uses one consistent denominator (every guest in
  -- the session) for every bottle, matching the existing session-wide
  -- seenProgress above. groupRating is computed only once that specific
  -- bottle's ratings_revealed_at is set — never a preview of an unrevealed
  -- average, even to the host, so a host can't undo/redo their way into
  -- info this endpoint wasn't designed to leak before the deliberate reveal
  -- action.
  if v_session.tasting_mode = 'seen' then
    select count(*) into v_seen_eligible_count from guests where session_id = v_session.id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id,
      'bottleNumber', w.bottle_number,
      'anonymousCode', w.anonymous_code,
      'wineStyle', w.wine_style,
      'tastingOrder', w.tasting_order,
      'revealedAt', w.revealed_at,
      'seen', jsonb_build_object(
        'producer', w.producer,
        'wineCuvee', w.wine_cuvee,
        'vintage', w.vintage,
        'country', w.country,
        'region', w.region,
        'appellation', w.appellation,
        'ratingsRevealedAt', w.ratings_revealed_at,
        'ratedCount', (
          select count(*) from wine_guesses where wine_id = w.id and rating is not null
        ),
        'eligibleCount', v_seen_eligible_count,
        'groupRating', case when w.ratings_revealed_at is not null then (
          select round(avg(rating)::numeric, 1) from wine_guesses where wine_id = w.id and rating is not null
        ) else null end
      )
    ) order by w.tasting_order), '[]'::jsonb)
    into v_wines
    from wines w where w.session_id = v_session.id;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id,
      'bottleNumber', w.bottle_number,
      'anonymousCode', w.anonymous_code,
      'wineStyle', w.wine_style,
      'tastingOrder', w.tasting_order,
      'revealedAt', w.revealed_at
    ) order by w.tasting_order), '[]'::jsonb)
    into v_wines
    from wines w where w.session_id = v_session.id;
  end if;

  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id,
      'publicId', v_session.public_id,
      'title', v_session.title,
      'tastingDate', v_session.tasting_date,
      'status', v_session.status,
      'joinCode', v_session.join_code,
      'createdAt', v_session.created_at,
      'hostGuestId', v_session.host_guest_id,
      'tastingMode', v_session.tasting_mode,
      'scoringVersion', v_session.scoring_version
    ),
    'wines', v_wines,
    'guests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'displayName', g.display_name,
        'completedAt', g.completed_at
      ) order by g.created_at)
      from guests g where g.session_id = v_session.id
    ), '[]'::jsonb),
    'activeBottle', v_active_bottle,
    'seenProgress', v_seen_progress
  ) into v_result;

  return v_result;
end;
$$;

-- Host: close bottle registration and open guessing. Requires at least one
-- bottle. Idempotent if already collecting.
create or replace function start_tasting_session(
  p_public_id uuid,
  p_host_token text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session tasting_sessions%rowtype;
  v_bottle_count int;
begin
  select * into v_session from tasting_sessions where public_id = p_public_id;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.host_token_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    raise exception 'invalid_host_token';
  end if;

  if v_session.status = 'collecting' then
    return;
  end if;
  if v_session.status = 'revealed' then
    raise exception 'session_already_revealed';
  end if;

  select count(*) into v_bottle_count from wines where session_id = v_session.id;
  if v_bottle_count < 1 then
    raise exception 'no_bottles_registered';
  end if;

  update tasting_sessions set status = 'collecting' where id = v_session.id;
end;
$$;

-- Host: flip status to revealed. Idempotent — revealing an already-revealed
-- session is a no-op success, not an error. course_reveal sessions must
-- reach 'revealed' only by revealing their final bottle through
-- reveal_bottle below (which also stamps that bottle's revealed_at), and
-- seen sessions only through end_seen_tasting below (which enforces the
-- host must not reopen a revealed session) — this one-shot reveal stays
-- exclusively a full_blind operation so a host can't skip the whole
-- bottle-by-bottle pacing, or a seen tasting's collecting stage, in one call.
create or replace function reveal_tasting_session(
  p_public_id uuid,
  p_host_token text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session tasting_sessions%rowtype;
begin
  select * into v_session from tasting_sessions where public_id = p_public_id;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.host_token_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    raise exception 'invalid_host_token';
  end if;
  if v_session.tasting_mode <> 'full_blind' then
    raise exception 'invalid_tasting_mode';
  end if;

  if v_session.status <> 'revealed' then
    update tasting_sessions set status = 'revealed' where id = v_session.id;
  end if;
end;
$$;

-- Host: reveal the current active bottle in a course_reveal session (see
-- README "Tasting modes"). The "active bottle" is always the earliest
-- unrevealed bottle by tasting_order — p_wine_id must match it exactly, so a
-- host can never skip ahead, reveal out of order, or reveal the same bottle
-- twice. Sets wines.revealed_at, then flips the session to 'revealed' if
-- that was the last unrevealed bottle (course_reveal's equivalent of
-- reveal_tasting_session's one-shot final reveal).
create or replace function reveal_bottle(
  p_public_id uuid,
  p_host_token text,
  p_wine_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session tasting_sessions%rowtype;
  v_wine wines%rowtype;
  v_active_wine_id uuid;
  v_remaining_count int;
  v_session_revealed boolean := false;
begin
  select * into v_session from tasting_sessions where public_id = p_public_id for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.host_token_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    raise exception 'invalid_host_token';
  end if;
  if v_session.tasting_mode <> 'course_reveal' then
    raise exception 'invalid_tasting_mode';
  end if;
  if v_session.status <> 'collecting' then
    raise exception 'session_not_collecting';
  end if;

  select * into v_wine from wines where id = p_wine_id and session_id = v_session.id;
  if not found then
    raise exception 'wine_not_in_session';
  end if;
  if v_wine.revealed_at is not null then
    raise exception 'bottle_already_revealed';
  end if;

  select id into v_active_wine_id
  from wines
  where session_id = v_session.id and revealed_at is null
  order by tasting_order asc
  limit 1;

  if v_active_wine_id is distinct from p_wine_id then
    raise exception 'bottle_not_active';
  end if;

  update wines set revealed_at = now() where id = p_wine_id;

  select count(*) into v_remaining_count
  from wines where session_id = v_session.id and revealed_at is null;

  if v_remaining_count = 0 then
    update tasting_sessions set status = 'revealed' where id = v_session.id;
    v_session_revealed := true;
  end if;

  return jsonb_build_object('sessionRevealed', v_session_revealed);
end;
$$;

-- Guest: join a session during registration or collecting. Rejects joining
-- once revealed, and rejects a display name that (after trim+lowercase)
-- already exists in this session (this also naturally protects the host's
-- own display name from being reused by a later joiner).
create or replace function join_tasting_session(
  p_public_id uuid,
  p_display_name text
) returns table (guest_id uuid, guest_token text, display_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session tasting_sessions%rowtype;
  v_name text := btrim(p_display_name);
  v_token text;
  v_guest_id uuid;
begin
  if v_name = '' then
    raise exception 'display_name_required';
  end if;
  if length(v_name) > 60 then
    raise exception 'display_name_too_long';
  end if;

  select * into v_session from tasting_sessions where public_id = p_public_id;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.status = 'revealed' then
    raise exception 'session_already_revealed';
  end if;

  if exists (
    select 1 from guests
    where session_id = v_session.id and display_name_normalized = lower(v_name)
  ) then
    raise exception 'duplicate_guest_name';
  end if;

  v_token := encode(gen_random_bytes(32), 'base64');

  insert into guests (session_id, display_name, guest_token)
  values (v_session.id, v_name, v_token)
  returning guests.id into v_guest_id;

  return query select v_guest_id, v_token, v_name;
end;
$$;

-- Participant: fetch registration-home data — their own bottles (full
-- answer key, since it's their own) plus a neutral total bottle count.
-- Never includes anyone else's bottle content.
create or replace function get_registration_state(
  p_guest_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_bottle_count int;
  v_result jsonb;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;
  select * into v_session from tasting_sessions where id = v_guest.session_id;

  select count(*) into v_bottle_count from wines where session_id = v_session.id;

  select jsonb_build_object(
    'guest', jsonb_build_object('id', v_guest.id, 'displayName', v_guest.display_name),
    'session', jsonb_build_object(
      'publicId', v_session.public_id,
      'title', v_session.title,
      'tastingDate', v_session.tasting_date,
      'status', v_session.status
    ),
    'bottleCount', v_bottle_count,
    'myBottles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'bottleNumber', w.bottle_number,
        'country', w.country,
        'region', w.region,
        'appellation', w.appellation,
        'grapeBlendMode', w.grape_blend_mode,
        'grapeBlend', w.grape_style,
        'selectedGrapes', coalesce(w.grape_blend_components->'selectedGrapes', '[]'::jsonb),
        'otherGrapesText', coalesce(w.grape_blend_components->>'otherGrapesText', ''),
        'producer', w.producer,
        'wineCuvee', w.wine_cuvee,
        'vintage', w.vintage,
        'wineStyle', w.wine_style,
        'notes', w.host_notes
      ) order by w.bottle_number)
      from wines w where w.session_id = v_session.id and w.contributor_guest_id = v_guest.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Participant: register a new bottle. This is the only place bottle numbers
-- are allocated. Concurrency safety: `select ... for update` locks the
-- session row for the rest of this transaction, so if two participants
-- register a bottle for the same session at the same instant, the second
-- call blocks until the first one's transaction (this whole function call)
-- commits — at which point it sees the already-incremented
-- next_bottle_number. That serializes the read-then-increment and makes a
-- duplicate allocation impossible. The unique (session_id, bottle_number)
-- constraint is kept as a hard backstop in case this function is ever
-- bypassed. Using a dedicated monotonic counter (next_bottle_number),
-- rather than max(bottle_number)+1, is what guarantees a deleted bottle's
-- number is never reused — max() would "forget" a deleted high-water-mark,
-- a plain counter never decreases.
-- Signature changed (price band removed, grape/blend mode added, wine style
-- added, structured grape/blend components added) — explicitly drop old
-- overloads so they can't be called with stale semantics; safe/no-op on a
-- fresh install.
drop function if exists register_bottle(text, text, text, text, text, text, text, text, text);
drop function if exists register_bottle(text, text, text, text, text, text, text, text, text, text);
drop function if exists register_bottle(text, text, text, text, text, text, text, text, text, text, jsonb);

create or replace function register_bottle(
  p_guest_token text,
  p_country text,
  p_region text,
  p_grape_blend_mode text,
  p_grape_blend text,
  p_producer text,
  p_wine_cuvee text,
  p_vintage text,
  p_notes text,
  p_wine_style text,
  p_grape_blend_components jsonb,
  p_appellation text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_next_number int;
  v_next_order int;
  v_wine_id uuid;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;

  select * into v_session from tasting_sessions where id = v_guest.session_id for update;

  if v_session.status <> 'registration' then
    raise exception 'registration_closed';
  end if;
  if p_grape_blend_mode not in ('single', 'blend') then
    raise exception 'invalid_grape_blend_mode';
  end if;
  if p_wine_style not in ('bubbles', 'white', 'red', 'sweet', 'other') then
    raise exception 'invalid_wine_style';
  end if;
  perform validate_grape_blend_components(p_grape_blend_mode, p_grape_blend_components);
  if btrim(coalesce(p_country, '')) = '' or btrim(coalesce(p_region, '')) = ''
     or btrim(coalesce(p_grape_blend, '')) = ''
     or btrim(coalesce(p_producer, '')) = '' or btrim(coalesce(p_wine_cuvee, '')) = ''
     or btrim(coalesce(p_vintage, '')) = '' then
    raise exception 'bottle_fields_required';
  end if;
  if length(coalesce(p_appellation, '')) > 200 then
    raise exception 'invalid_appellation';
  end if;
  if not is_valid_appellation(btrim(p_country), btrim(p_region), p_appellation) then
    raise exception 'invalid_appellation';
  end if;

  v_next_number := v_session.next_bottle_number;
  -- New bottles always join at the end of the current tasting order — the
  -- session row is already locked above, so this is race-free with
  -- concurrent registrations, reorders, and deletes.
  select coalesce(max(tasting_order), 0) + 1 into v_next_order
  from wines where session_id = v_session.id;

  insert into wines (
    session_id, display_order, bottle_number, tasting_order, anonymous_code, contributor_guest_id,
    country, region, appellation, grape_style, grape_blend_mode, grape_blend_components, producer, wine_cuvee,
    vintage, wine_style, host_notes
  ) values (
    v_session.id, v_next_number - 1, v_next_number, v_next_order, 'Bottle ' || v_next_number, v_guest.id,
    btrim(p_country), btrim(p_region), nullif(btrim(coalesce(p_appellation, '')), ''), btrim(p_grape_blend), p_grape_blend_mode, p_grape_blend_components,
    btrim(p_producer), btrim(p_wine_cuvee), btrim(p_vintage), p_wine_style, nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning wines.id into v_wine_id;

  update tasting_sessions set next_bottle_number = v_next_number + 1 where id = v_session.id;

  return jsonb_build_object('id', v_wine_id, 'bottleNumber', v_next_number);
end;
$$;

-- Participant: edit their own bottle. Bottle number and anonymous_code are
-- never touched (not in the SET list), so they're preserved exactly.
-- Signature changed (price band removed, grape/blend mode added, wine style
-- added, structured grape/blend components added) — explicitly drop old
-- overloads; safe/no-op on a fresh install.
drop function if exists update_bottle(text, uuid, text, text, text, text, text, text, text, text);
drop function if exists update_bottle(text, uuid, text, text, text, text, text, text, text, text, text);
drop function if exists update_bottle(text, uuid, text, text, text, text, text, text, text, text, text, jsonb);

create or replace function update_bottle(
  p_guest_token text,
  p_wine_id uuid,
  p_country text,
  p_region text,
  p_grape_blend_mode text,
  p_grape_blend text,
  p_producer text,
  p_wine_cuvee text,
  p_vintage text,
  p_notes text,
  p_wine_style text,
  p_grape_blend_components jsonb,
  p_appellation text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_wine wines%rowtype;
  v_session tasting_sessions%rowtype;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;

  select * into v_wine from wines where id = p_wine_id;
  if not found or v_wine.contributor_guest_id is distinct from v_guest.id then
    raise exception 'bottle_not_found';
  end if;

  select * into v_session from tasting_sessions where id = v_wine.session_id;
  if v_session.status <> 'registration' then
    raise exception 'registration_closed';
  end if;
  if p_grape_blend_mode not in ('single', 'blend') then
    raise exception 'invalid_grape_blend_mode';
  end if;
  if p_wine_style not in ('bubbles', 'white', 'red', 'sweet', 'other') then
    raise exception 'invalid_wine_style';
  end if;
  perform validate_grape_blend_components(p_grape_blend_mode, p_grape_blend_components);
  if btrim(coalesce(p_country, '')) = '' or btrim(coalesce(p_region, '')) = ''
     or btrim(coalesce(p_grape_blend, '')) = ''
     or btrim(coalesce(p_producer, '')) = '' or btrim(coalesce(p_wine_cuvee, '')) = ''
     or btrim(coalesce(p_vintage, '')) = '' then
    raise exception 'bottle_fields_required';
  end if;
  if length(coalesce(p_appellation, '')) > 200 then
    raise exception 'invalid_appellation';
  end if;
  if not is_valid_appellation(btrim(p_country), btrim(p_region), p_appellation) then
    raise exception 'invalid_appellation';
  end if;

  update wines set
    country = btrim(p_country),
    region = btrim(p_region),
    appellation = nullif(btrim(coalesce(p_appellation, '')), ''),
    grape_style = btrim(p_grape_blend),
    grape_blend_mode = p_grape_blend_mode,
    grape_blend_components = p_grape_blend_components,
    producer = btrim(p_producer),
    wine_cuvee = btrim(p_wine_cuvee),
    vintage = btrim(p_vintage),
    wine_style = p_wine_style,
    host_notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_wine_id;
end;
$$;

-- Participant: delete their own bottle. The bottle_number is never reused
-- (see register_bottle's next_bottle_number counter) and remaining bottles
-- keep their bottle_number exactly as-is. tasting_order, however, must stay
-- a contiguous 1..N permutation, so it's re-packed after the delete via
-- repack_tasting_order (see "Personal Cellar" section below — forward
-- reference is safe since plpgsql bodies aren't resolved until called, and
-- that section runs later in this same script, before any RPC is ever
-- invoked by the app).
--
-- MIGRATION-SENSITIVE (Personal Cellar): if this bottle was registered from
-- the contributor's cellar (wines.cellar_bottle_id is not null — a column
-- added later in this file, so this reference is forward-safe for the same
-- reason as repack_tasting_order above), releasing it back to `available`
-- here is what makes this existing, only pre-tasting removal path also
-- double as "return to cellar" with zero UI changes — see README "Personal
-- Cellar". The `where status = 'reserved'` guard makes this a no-op if the
-- cellar bottle was already returned/consumed through another path.
create or replace function delete_bottle(
  p_guest_token text,
  p_wine_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_wine wines%rowtype;
  v_session tasting_sessions%rowtype;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;

  select * into v_wine from wines where id = p_wine_id;
  if not found or v_wine.contributor_guest_id is distinct from v_guest.id then
    raise exception 'bottle_not_found';
  end if;

  select * into v_session from tasting_sessions where id = v_wine.session_id for update;
  if v_session.status <> 'registration' then
    raise exception 'registration_closed';
  end if;

  if v_wine.cellar_bottle_id is not null then
    update cellar_bottles
    set status = 'available',
        reserved_session_id = null,
        reserved_tasting_bottle_id = null,
        reserved_at = null,
        updated_at = now()
    where id = v_wine.cellar_bottle_id and status = 'reserved';
  end if;

  delete from wines where id = p_wine_id;

  perform repack_tasting_order(v_session.id);
end;
$$;

-- Host: rearrange the tasting order. p_wine_ids must be a full permutation
-- of every wine currently in the session, in the desired new order — the
-- array position (1-based) becomes each wine's new tasting_order. Never
-- touches bottle_number. Only allowed during registration; the order is
-- frozen the moment start_tasting_session moves the session to collecting.
create or replace function reorder_wines(
  p_public_id uuid,
  p_host_token text,
  p_wine_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session tasting_sessions%rowtype;
  v_count int;
  v_distinct_count int;
  v_matching_count int;
  v_session_bottle_count int;
begin
  select * into v_session from tasting_sessions where public_id = p_public_id for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.host_token_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    raise exception 'invalid_host_token';
  end if;
  if v_session.status <> 'registration' then
    raise exception 'registration_closed';
  end if;

  v_count := coalesce(array_length(p_wine_ids, 1), 0);
  if v_count = 0 then
    raise exception 'invalid_reorder_payload';
  end if;

  select count(distinct id) into v_distinct_count from unnest(p_wine_ids) as id;
  if v_distinct_count <> v_count then
    raise exception 'invalid_reorder_payload';
  end if;

  select count(*) into v_matching_count
  from wines w where w.session_id = v_session.id and w.id = any(p_wine_ids);
  if v_matching_count <> v_count then
    raise exception 'invalid_reorder_payload';
  end if;

  select count(*) into v_session_bottle_count from wines where session_id = v_session.id;
  if v_session_bottle_count <> v_count then
    raise exception 'invalid_reorder_payload';
  end if;

  update wines w
  set tasting_order = u.ord
  from unnest(p_wine_ids) with ordinality as u(id, ord)
  where w.id = u.id;
end;
$$;

-- Blind-guess grape-entry assistance (see README "Grape-entry assistance" —
-- "Blind guess forms"): derives a minimal, non-reversible rendering hint
-- from a bottle's actual wine_style, so a participant's guess form can
-- filter/auto-fill its grape dropdown by the real wine's colour without the
-- raw style value ever reaching the client. Not SECURITY DEFINER and not
-- granted to anon/authenticated — like repack_tasting_order and
-- validate_grape_blend_components above, this only ever runs via a direct
-- call from inside another SECURITY DEFINER function that already has
-- privilege to read wines.wine_style for the bottle in question.
create or replace function public.wine_style_grape_options_hint(p_wine_style text) returns text
language sql
immutable
as $$
  select case p_wine_style
    when 'white' then 'white_skin_only'
    when 'red' then 'red_skin_only'
    else 'all_skins'
  end;
$$;

-- Guest: fetch everything the tasting page needs to render/resume, in one call.
create or replace function get_guest_session_state(
  p_guest_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_result jsonb;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;
  select * into v_session from tasting_sessions where id = v_guest.session_id;

  select jsonb_build_object(
    'guest', jsonb_build_object(
      'id', v_guest.id,
      'displayName', v_guest.display_name,
      'completedAt', v_guest.completed_at
    ),
    'session', jsonb_build_object(
      'publicId', v_session.public_id,
      'title', v_session.title,
      'tastingDate', v_session.tasting_date,
      'status', v_session.status,
      'tastingMode', v_session.tasting_mode,
      'scoringVersion', v_session.scoring_version,
      -- Additive fields for the Tasting Archive (see README "Tasting
      -- archive"): id/createdAt let the archive sort/query this session the
      -- same way get_host_session's response already does, and
      -- participantCount mirrors get_host_session's guests.length without
      -- exposing the guest list itself to a participant.
      'id', v_session.id,
      'createdAt', v_session.created_at,
      'participantCount', (select count(*) from guests where session_id = v_session.id)
    ),
    'wines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'bottleNumber', w.bottle_number,
        'anonymousCode', w.anonymous_code,
        'styleHint', wine_style_grape_options_hint(w.wine_style),
        -- Bottle-order coordination cue only (see README "Grape-entry
        -- assistance" and "Bottle-order contributor labels") — the same
        -- session-scoped guests.display_name already shown to every
        -- participant in Seen mode (get_seen_tasting_state) and post-reveal
        -- (get_revealed_bottle), never a new identity surface. Null when
        -- contributor_guest_id is null (a bottle with no recorded
        -- contributor), which the client renders as no name at all.
        'contributorName', (select display_name from guests where id = w.contributor_guest_id)
      ) order by w.tasting_order, w.bottle_number)
      from wines w where w.session_id = v_session.id
    ), '[]'::jsonb),
    'guesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'wineId', wg.wine_id,
        'countryGuess', wg.country_guess,
        'regionGuess', wg.region_guess,
        'appellationGuess', wg.appellation_guess,
        'grapeBlendMode', wg.grape_blend_mode,
        'grapeBlendGuess', wg.grape_style_guess,
        'selectedGrapes', coalesce(wg.grape_blend_components->'selectedGrapes', '[]'::jsonb),
        'otherGrapesText', coalesce(wg.grape_blend_components->>'otherGrapesText', ''),
        'producerGuess', wg.producer_guess,
        'wineCuveeGuess', wg.wine_cuvee_guess,
        'vintageGuess', wg.vintage_guess,
        'rating', wg.rating,
        'confidence', wg.confidence,
        'tastingNote', wg.tasting_note
      ))
      from wine_guesses wg where wg.guest_id = v_guest.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Guest: autosave a single wine's guess. Blocked once the session is
-- revealed or the guest has already completed their submission. Every
-- participant — including a bottle's own contributor — may guess every
-- bottle, so there is no ownership check against wines here.
-- Signature changed (price band removed, grape/blend mode added, structured
-- grape/blend components added, appellation guess added) — explicitly drop
-- old overloads; safe/no-op on a fresh install.
drop function if exists upsert_wine_guess(text, uuid, text, text, text, text, text, text, text, int, text, text);
drop function if exists upsert_wine_guess(text, uuid, text, text, text, text, text, text, text, int, text, text, jsonb);

create or replace function upsert_wine_guess(
  p_guest_token text,
  p_wine_id uuid,
  p_country_guess text,
  p_region_guess text,
  p_grape_blend_mode text,
  p_grape_blend_guess text,
  p_producer_guess text,
  p_wine_cuvee_guess text,
  p_vintage_guess text,
  p_rating int,
  p_confidence text,
  p_tasting_note text,
  p_grape_blend_components jsonb,
  p_appellation_guess text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;
  if v_guest.completed_at is not null then
    raise exception 'already_submitted';
  end if;

  select * into v_session from tasting_sessions where id = v_guest.session_id;
  if v_session.status <> 'collecting' then
    raise exception 'session_already_revealed';
  end if;

  if not exists (select 1 from wines where id = p_wine_id and session_id = v_session.id) then
    raise exception 'wine_not_in_session';
  end if;

  -- course_reveal-only: a guess may only be autosaved for the current active
  -- bottle (earliest unrevealed by tasting_order) — this is what stops a
  -- participant from reaching ahead to an upcoming bottle's guess form.
  -- No-op for full_blind, which has never restricted which of its (already
  -- fully visible during collecting) bottles a guest may guess at once.
  if v_session.tasting_mode = 'course_reveal' and p_wine_id <> (
    select id from wines
    where session_id = v_session.id and revealed_at is null
    order by tasting_order asc
    limit 1
  ) then
    raise exception 'bottle_not_active';
  end if;

  -- course_reveal-only: once a guess is locked (see lock_wine_guess), it's
  -- final — no further autosave edits. Always false for full_blind, which
  -- never sets locked_at.
  if exists (
    select 1 from wine_guesses
    where wine_id = p_wine_id and guest_id = v_guest.id and locked_at is not null
  ) then
    raise exception 'guess_already_locked';
  end if;

  -- Guess entry stays lenient about grape/blend mode (a blank/incomplete
  -- draft autosaves fine, see README) — this only rejects a genuinely
  -- malformed or mode-inconsistent components payload, not an empty one.
  perform validate_grape_blend_components(p_grape_blend_mode, p_grape_blend_components);

  -- Appellation guess reuses the exact same server-side check as actual-wine
  -- appellation (see README "Region and Appellation") — never a second
  -- curated list. A blank guess is always valid regardless of
  -- country_guess/region_guess; is_valid_appellation returns false for a
  -- non-blank value against an unsupported or mismatched pair either way.
  if length(coalesce(p_appellation_guess, '')) > 200 then
    raise exception 'invalid_appellation';
  end if;
  if not is_valid_appellation(coalesce(p_country_guess, ''), coalesce(p_region_guess, ''), p_appellation_guess) then
    raise exception 'invalid_appellation';
  end if;

  insert into wine_guesses (
    session_id, wine_id, guest_id, country_guess, region_guess, appellation_guess, grape_style_guess,
    grape_blend_mode, grape_blend_components, producer_guess, wine_cuvee_guess, vintage_guess, rating,
    confidence, tasting_note, submitted_at
  ) values (
    v_session.id, p_wine_id, v_guest.id, coalesce(p_country_guess, ''), coalesce(p_region_guess, ''),
    nullif(btrim(coalesce(p_appellation_guess, '')), ''),
    coalesce(p_grape_blend_guess, ''), nullif(p_grape_blend_mode, ''), p_grape_blend_components,
    coalesce(p_producer_guess, ''), coalesce(p_wine_cuvee_guess, ''), coalesce(p_vintage_guess, ''), p_rating,
    coalesce(nullif(p_confidence, ''), 'medium'), nullif(p_tasting_note, ''), now()
  )
  on conflict (guest_id, wine_id) do update set
    country_guess = excluded.country_guess,
    region_guess = excluded.region_guess,
    appellation_guess = excluded.appellation_guess,
    grape_style_guess = excluded.grape_style_guess,
    grape_blend_mode = excluded.grape_blend_mode,
    grape_blend_components = excluded.grape_blend_components,
    producer_guess = excluded.producer_guess,
    wine_cuvee_guess = excluded.wine_cuvee_guess,
    vintage_guess = excluded.vintage_guess,
    rating = excluded.rating,
    confidence = excluded.confidence,
    tasting_note = excluded.tasting_note,
    submitted_at = now();
end;
$$;

-- Guest: fetch course_reveal's current active bottle (earliest unrevealed by
-- tasting_order) plus the caller's own draft/locked guess for it. Never
-- returns any answer-key field — only what the guess-entry form itself
-- needs (anonymous code, position, own draft). Returns activeBottle: null
-- once every bottle is revealed (the session will already be 'revealed' by
-- then; the participant-side route treats that as "go to final results").
create or replace function get_active_bottle_state(
  p_guest_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_active wines%rowtype;
  v_total_bottles int;
  v_position int;
  v_my_guess wine_guesses%rowtype;
  v_result jsonb;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;
  select * into v_session from tasting_sessions where id = v_guest.session_id;
  if v_session.tasting_mode <> 'course_reveal' then
    raise exception 'invalid_tasting_mode';
  end if;

  select count(*) into v_total_bottles from wines where session_id = v_session.id;

  select * into v_active from wines
  where session_id = v_session.id and revealed_at is null
  order by tasting_order asc
  limit 1;

  if not found then
    return jsonb_build_object(
      'session', jsonb_build_object(
        'publicId', v_session.public_id,
        'title', v_session.title,
        'tastingDate', v_session.tasting_date,
        'status', v_session.status,
        'tastingMode', v_session.tasting_mode
      ),
      'guestName', v_guest.display_name,
      'activeBottle', null,
      'myGuess', null,
      'locked', false
    );
  end if;

  select count(*) + 1 into v_position
  from wines where session_id = v_session.id and tasting_order < v_active.tasting_order;

  select * into v_my_guess from wine_guesses
  where wine_id = v_active.id and guest_id = v_guest.id;

  v_result := jsonb_build_object(
    'session', jsonb_build_object(
      'publicId', v_session.public_id,
      'title', v_session.title,
      'tastingDate', v_session.tasting_date,
      'status', v_session.status,
      'tastingMode', v_session.tasting_mode
    ),
    'guestName', v_guest.display_name,
    'activeBottle', jsonb_build_object(
      'id', v_active.id,
      'bottleNumber', v_active.bottle_number,
      'anonymousCode', v_active.anonymous_code,
      'position', v_position,
      'totalBottles', v_total_bottles,
      'styleHint', wine_style_grape_options_hint(v_active.wine_style),
      'contributorName', (select display_name from guests where id = v_active.contributor_guest_id)
    ),
    'myGuess', case when v_my_guess.id is null then null else jsonb_build_object(
      'wineId', v_my_guess.wine_id,
      'countryGuess', v_my_guess.country_guess,
      'regionGuess', v_my_guess.region_guess,
      'appellationGuess', v_my_guess.appellation_guess,
      'grapeBlendMode', v_my_guess.grape_blend_mode,
      'grapeBlendGuess', v_my_guess.grape_style_guess,
      'selectedGrapes', coalesce(v_my_guess.grape_blend_components->'selectedGrapes', '[]'::jsonb),
      'otherGrapesText', coalesce(v_my_guess.grape_blend_components->>'otherGrapesText', ''),
      'producerGuess', v_my_guess.producer_guess,
      'wineCuveeGuess', v_my_guess.wine_cuvee_guess,
      'vintageGuess', v_my_guess.vintage_guess,
      'rating', v_my_guess.rating,
      'confidence', v_my_guess.confidence,
      'tastingNote', v_my_guess.tasting_note
    ) end,
    'locked', coalesce(v_my_guess.locked_at is not null, false)
  );

  return v_result;
end;
$$;

-- Guest: finalize a course_reveal guess for the current active bottle.
-- Requires a rating already be set (same completeness bar as full_blind's
-- complete_guest_submission) and that the wine is still the active bottle —
-- both belt-and-suspenders alongside upsert_wine_guess's own checks, since
-- this is the action that actually stops further edits and counts toward
-- the host's "N of M submitted" count.
create or replace function lock_wine_guess(
  p_guest_token text,
  p_wine_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_wine wines%rowtype;
  v_active_wine_id uuid;
  v_rating int;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;
  select * into v_session from tasting_sessions where id = v_guest.session_id;
  if v_session.tasting_mode <> 'course_reveal' then
    raise exception 'invalid_tasting_mode';
  end if;
  if v_session.status <> 'collecting' then
    raise exception 'session_not_collecting';
  end if;

  select * into v_wine from wines where id = p_wine_id and session_id = v_session.id;
  if not found then
    raise exception 'wine_not_in_session';
  end if;
  if v_wine.revealed_at is not null then
    raise exception 'bottle_already_revealed';
  end if;

  select id into v_active_wine_id from wines
  where session_id = v_session.id and revealed_at is null
  order by tasting_order asc
  limit 1;
  if v_active_wine_id is distinct from p_wine_id then
    raise exception 'bottle_not_active';
  end if;

  select rating into v_rating from wine_guesses
  where wine_id = p_wine_id and guest_id = v_guest.id;
  if v_rating is null then
    raise exception 'missing_ratings';
  end if;

  update wine_guesses set locked_at = now()
  where wine_id = p_wine_id and guest_id = v_guest.id and locked_at is null;
end;
$$;

-- Guest: fetch the full reveal for one specific bottle in a course_reveal
-- session — the answer key, contributor name, and every *locked* guess for
-- it — but only once that bottle's revealed_at is actually set. This is the
-- sole path to this data during 'collecting': it is never included in
-- get_active_bottle_state, any pre-reveal view, or the anon column grant on
-- wines/wine_guesses. Draft (unlocked) guesses are deliberately excluded
-- from the `guesses` array, so a participant who never finalized their
-- guess correctly shows as "no submission" rather than a fabricated score.
create or replace function get_revealed_bottle(
  p_guest_token text,
  p_wine_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_wine wines%rowtype;
  v_position int;
  v_total_bottles int;
  v_result jsonb;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;
  select * into v_session from tasting_sessions where id = v_guest.session_id;

  select * into v_wine from wines where id = p_wine_id and session_id = v_session.id;
  if not found then
    raise exception 'wine_not_in_session';
  end if;
  if v_wine.revealed_at is null then
    raise exception 'bottle_not_revealed';
  end if;

  select count(*) + 1 into v_position
  from wines where session_id = v_session.id and tasting_order < v_wine.tasting_order;
  select count(*) into v_total_bottles from wines where session_id = v_session.id;

  select jsonb_build_object(
    'session', jsonb_build_object(
      'publicId', v_session.public_id,
      'status', v_session.status,
      'scoringVersion', v_session.scoring_version
    ),
    'wine', jsonb_build_object(
      'id', v_wine.id,
      'bottleNumber', v_wine.bottle_number,
      'anonymousCode', v_wine.anonymous_code,
      'position', v_position,
      'totalBottles', v_total_bottles,
      'country', v_wine.country,
      'region', v_wine.region,
      'appellation', v_wine.appellation,
      'grapeBlendMode', v_wine.grape_blend_mode,
      'grapeBlend', v_wine.grape_style,
      'producer', v_wine.producer,
      'wineCuvee', v_wine.wine_cuvee,
      'vintage', v_wine.vintage,
      'wineStyle', v_wine.wine_style,
      'contributorName', (select display_name from guests where id = v_wine.contributor_guest_id)
    ),
    'guesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'guestId', wg.guest_id,
        'guestName', g.display_name,
        'countryGuess', wg.country_guess,
        'regionGuess', wg.region_guess,
        'appellationGuess', wg.appellation_guess,
        'grapeBlendMode', wg.grape_blend_mode,
        'grapeBlendGuess', wg.grape_style_guess,
        'producerGuess', wg.producer_guess,
        'wineCuveeGuess', wg.wine_cuvee_guess,
        'vintageGuess', wg.vintage_guess,
        'rating', wg.rating,
        'confidence', wg.confidence
      ))
      from wine_guesses wg
      join guests g on g.id = wg.guest_id
      where wg.wine_id = v_wine.id and wg.locked_at is not null
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seen tasting mode (see README "Tasting modes"): every registered bottle
-- becomes fully visible to every participant the moment the host starts
-- tasting — there is no per-bottle blind guess, no identification scoring,
-- just an own-pace, freely-revisitable rating per bottle until the host ends
-- the tasting. A "seen rating" is stored in the existing wine_guesses table
-- (see upsert_seen_rating below) but only ever sets rating/confidence/
-- tasting_note — the identification-guess columns simply keep their existing
-- table defaults ('' / null), exactly as an untouched draft guess already
-- does in full_blind/course_reveal, so nothing fake is fabricated to satisfy
-- old constraints. full_blind and course_reveal are entirely unaffected:
-- none of the three functions below can run for those modes.
-- ---------------------------------------------------------------------------

-- Guest: fetch every bottle's full details (visible to everyone in a seen
-- session once collecting/revealed starts) plus the caller's own rating
-- status for each — never another participant's rating. Rejects during
-- 'registration' so a participant can't peek at bottle identities before the
-- host starts tasting (seen mode's registration stage keeps the same
-- contributor-only secrecy as every other mode).
--
-- groupRating/ratingsRevealedAt (see reveal_seen_ratings above) are the only
-- per-bottle rating-aggregate fields ever returned here, and only once the
-- host has revealed that specific bottle — null for every other bottle,
-- regardless of how many participants have rated it. Never a ratedCount or
-- eligibleCount here (that stays host-only, in get_host_session) and never
-- any other participant's individual rating.
create or replace function get_seen_tasting_state(
  p_guest_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_result jsonb;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;
  select * into v_session from tasting_sessions where id = v_guest.session_id;
  if v_session.tasting_mode <> 'seen' then
    raise exception 'invalid_tasting_mode';
  end if;
  if v_session.status = 'registration' then
    raise exception 'registration_closed';
  end if;

  select jsonb_build_object(
    'session', jsonb_build_object(
      'publicId', v_session.public_id,
      'title', v_session.title,
      'tastingDate', v_session.tasting_date,
      'status', v_session.status,
      'tastingMode', v_session.tasting_mode
    ),
    'guestName', v_guest.display_name,
    'bottles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'bottleNumber', w.bottle_number,
        'anonymousCode', w.anonymous_code,
        'position', w.tasting_order,
        'totalBottles', (select count(*) from wines where session_id = v_session.id),
        'wineStyle', w.wine_style,
        'country', w.country,
        'region', w.region,
        'appellation', w.appellation,
        'grapeBlendMode', w.grape_blend_mode,
        'grapeBlend', w.grape_style,
        'producer', w.producer,
        'wineCuvee', w.wine_cuvee,
        'vintage', w.vintage,
        'contributorName', (select display_name from guests where id = w.contributor_guest_id),
        'myRating', (select rating from wine_guesses where wine_id = w.id and guest_id = v_guest.id),
        'myConfidence', (select confidence from wine_guesses where wine_id = w.id and guest_id = v_guest.id),
        'myNote', (select tasting_note from wine_guesses where wine_id = w.id and guest_id = v_guest.id),
        'ratingsRevealedAt', w.ratings_revealed_at,
        'groupRating', case when w.ratings_revealed_at is not null then (
          select round(avg(rating)::numeric, 1) from wine_guesses where wine_id = w.id and rating is not null
        ) else null end
      ) order by w.tasting_order)
      from wines w where w.session_id = v_session.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Guest: save (create or update) the caller's own rating for one bottle in a
-- seen session. Deliberately narrow — no identification-guess parameters at
-- all, unlike upsert_wine_guess — so there is no way to accidentally write
-- blind-guess content through this path. A rating is required (unlike
-- full_blind/course_reveal's autosave-friendly draft-without-a-rating), and
-- the existing `rating between 50 and 100` column check enforces the range.
-- Never restricts which bottle/tasting-order position may be rated, and
-- never locks a rating after saving on its own — the one exception is the
-- per-bottle rating lock below, once the host has revealed that specific
-- bottle's group rating (see reveal_seen_ratings above): the average the
-- host and other participants already saw must never silently drift, so a
-- rating can't be added or changed for that bottle after its reveal, even
-- though the tasting overall is still collecting. This is unrelated to (and
-- does not reuse) course_reveal's lock_wine_guess.
create or replace function upsert_seen_rating(
  p_guest_token text,
  p_wine_id uuid,
  p_rating int,
  p_confidence text,
  p_tasting_note text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_wine wines%rowtype;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;
  select * into v_session from tasting_sessions where id = v_guest.session_id;
  if v_session.tasting_mode <> 'seen' then
    raise exception 'invalid_tasting_mode';
  end if;
  if v_session.status <> 'collecting' then
    raise exception 'session_not_collecting';
  end if;
  if p_rating is null then
    raise exception 'rating_required';
  end if;

  select * into v_wine from wines where id = p_wine_id and session_id = v_session.id;
  if not found then
    raise exception 'wine_not_in_session';
  end if;
  if v_wine.ratings_revealed_at is not null then
    raise exception 'ratings_already_revealed';
  end if;

  insert into wine_guesses (session_id, wine_id, guest_id, rating, confidence, tasting_note, submitted_at)
  values (
    v_session.id, p_wine_id, v_guest.id, p_rating,
    coalesce(nullif(p_confidence, ''), 'medium'), nullif(p_tasting_note, ''), now()
  )
  on conflict (guest_id, wine_id) do update set
    rating = excluded.rating,
    confidence = excluded.confidence,
    tasting_note = excluded.tasting_note,
    submitted_at = now();
end;
$$;

-- Host: end a seen tasting — locks every rating and reveals the group
-- results in one step (seen mode has no per-bottle reveal, and no one-shot
-- "reveal_tasting_session" full-blind-style call either — see the comment on
-- that function). Strict about status (unlike reveal_tasting_session's
-- idempotent success) so a host can never re-trigger this on an
-- already-revealed session.
create or replace function end_seen_tasting(
  p_public_id uuid,
  p_host_token text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session tasting_sessions%rowtype;
begin
  select * into v_session from tasting_sessions where public_id = p_public_id for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.host_token_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    raise exception 'invalid_host_token';
  end if;
  if v_session.tasting_mode <> 'seen' then
    raise exception 'invalid_tasting_mode';
  end if;
  if v_session.status <> 'collecting' then
    raise exception 'session_not_collecting';
  end if;

  update tasting_sessions set status = 'revealed' where id = v_session.id;
end;
$$;

-- Guest: final submit. Requires every wine in the session to have a rating.
-- No special-casing for the host or for a guest's own contributed bottle —
-- everyone is scored identically.
create or replace function complete_guest_submission(
  p_guest_token text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_wine_count int;
  v_rated_count int;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;
  if v_guest.completed_at is not null then
    raise exception 'already_submitted';
  end if;

  select * into v_session from tasting_sessions where id = v_guest.session_id;
  if v_session.status <> 'collecting' then
    raise exception 'session_already_revealed';
  end if;

  select count(*) into v_wine_count from wines where session_id = v_session.id;
  select count(*) into v_rated_count
    from wine_guesses
    where guest_id = v_guest.id and rating is not null;

  if v_rated_count < v_wine_count then
    raise exception 'missing_ratings';
  end if;

  update guests set completed_at = now() where id = v_guest.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. anon and authenticated get EXECUTE on the RPC functions and SELECT
-- on the views, plus narrow column-level SELECT on three "safe" base tables
-- (needed so Realtime postgres_changes has something non-sensitive to
-- broadcast). Nothing else is granted — no INSERT/UPDATE/DELETE anywhere for
-- either role, and no SELECT at all on `wine_guesses`, and no SELECT on any
-- answer-key column of `wines`.
--
-- MIGRATION-SENSITIVE / SECURITY-SENSITIVE: `authenticated` is included in
-- every grant below (added alongside Supabase Auth — see README "Accounts").
-- Before Auth existed, no request could ever carry an `authenticated` role
-- JWT, so it was never revoked here. A brand-new Supabase project grants
-- broad default privileges to BOTH `anon` and `authenticated` on every new
-- table — this file has always revoked and re-narrowed those for `anon`, but
-- never had a reason to touch `authenticated` until now. The `revoke all ...
-- from authenticated` statements below close that latent gap *before* any
-- signed-in session can exist, so a signed-in user's browser can do exactly
-- what an anonymous one already could here — nothing broader (e.g. it still
-- cannot read `host_token_hash` or `guest_token`), and nothing narrower (a
-- signed-in user must be able to join/host/guess exactly like before).
-- Sign-in never replaces host/guest token checks — those RPCs still validate
-- the token argument themselves regardless of which role called them.
-- ---------------------------------------------------------------------------

revoke all on tasting_sessions from anon, authenticated;
revoke all on wines from anon, authenticated;
revoke all on guests from anon, authenticated;
revoke all on wine_guesses from anon, authenticated;

grant select (id, public_id, join_code, title, tasting_date, status, created_at, updated_at, tasting_mode, scoring_version)
  on tasting_sessions to anon, authenticated;

grant select (id, session_id, display_name, created_at, completed_at)
  on guests to anon, authenticated;

-- Deliberately excludes contributor_guest_id and every answer-key column —
-- those only ever reach anon/authenticated through guest_visible_wines
-- (reveal-gated) or the RPC functions above (ownership-checked).
grant select (id, session_id, bottle_number, anonymous_code, created_at)
  on wines to anon, authenticated;

grant select on guest_visible_wines to anon, authenticated;
grant select on revealed_wine_guesses to anon, authenticated;

grant execute on function create_tasting_session(text, date, text, text, text, text) to anon, authenticated;
grant execute on function get_host_session(uuid, text) to anon, authenticated;
grant execute on function start_tasting_session(uuid, text) to anon, authenticated;
grant execute on function reveal_tasting_session(uuid, text) to anon, authenticated;
grant execute on function reveal_bottle(uuid, text, uuid) to anon, authenticated;
grant execute on function join_tasting_session(uuid, text) to anon, authenticated;
grant execute on function get_registration_state(text) to anon, authenticated;
grant execute on function register_bottle(text, text, text, text, text, text, text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function update_bottle(text, uuid, text, text, text, text, text, text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function delete_bottle(text, uuid) to anon, authenticated;
grant execute on function reorder_wines(uuid, text, uuid[]) to anon, authenticated;
grant execute on function get_guest_session_state(text) to anon, authenticated;
grant execute on function upsert_wine_guess(text, uuid, text, text, text, text, text, text, text, int, text, text, jsonb, text) to anon, authenticated;
grant execute on function get_active_bottle_state(text) to anon, authenticated;
grant execute on function lock_wine_guess(text, uuid) to anon, authenticated;
grant execute on function get_revealed_bottle(text, uuid) to anon, authenticated;

grant execute on function get_seen_tasting_state(text) to anon, authenticated;
grant execute on function upsert_seen_rating(text, uuid, int, text, text) to anon, authenticated;
grant execute on function end_seen_tasting(uuid, text) to anon, authenticated;

grant execute on function complete_guest_submission(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast changes on the three safe tables so host/participant
-- screens can live-update (reveal/registration status, completed-submission
-- counts, and registered-bottle counts). If this ALTER PUBLICATION doesn't
-- take effect in your project (some Supabase plans manage this via the
-- Dashboard instead), see SUPABASE_SETUP.md step 5 for the manual toggle.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'tasting_sessions'
  ) then
    alter publication supabase_realtime add table tasting_sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'guests'
  ) then
    alter publication supabase_realtime add table guests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'wines'
  ) then
    alter publication supabase_realtime add table wines;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Accounts (Supabase Auth) — see README "Accounts" and SUPABASE_SETUP.md
-- "Setting up Supabase Auth (accounts)".
--
-- This is an OPTIONAL, wholly separate identity layer bolted alongside the
-- existing host-token/guest-token model, not a replacement for it: nothing
-- above this line changes, no `auth.uid()` check is added to any tasting
-- RPC, and no `wines`/`tasting_sessions`/`guests`/`wine_guesses` row is ever
-- linked to `auth.users`. A `profiles` row records only that someone signed
-- in with an email — never a host token, guest token, OTP code, or any
-- tasting data.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  -- Intentionally optional and separate from the per-tasting display name a
  -- guest types when joining a session (guests.display_name) — see README.
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- No insert/delete policy at all: the only way a row is ever created is the
-- SECURITY DEFINER trigger below, which bypasses RLS/grants by running as
-- the function owner — a client can never insert or delete a profiles row
-- directly, including its own.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Column-level grant: a signed-in user may rename themselves, but never
-- hand-edit their own email/created_at/updated_at via a raw client update.
grant update (display_name) on public.profiles to authenticated;

-- Server-side sanitation for display_name (required regardless of what the
-- client sends, since profiles.display_name is reachable via a direct
-- client-side `update`, not just through app code): trims whitespace and
-- turns an empty/whitespace-only value into NULL, mirroring how
-- `guests.display_name` is already validated elsewhere in this file. Not
-- SECURITY DEFINER — it only transforms the row already being written by
-- whatever role owns this UPDATE, no elevated privilege needed.
create or replace function public.normalize_profile_display_name()
returns trigger
language plpgsql
as $$
begin
  if new.display_name is not null then
    new.display_name := nullif(btrim(new.display_name), '');
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_profiles_display_name on public.profiles;
create trigger normalize_profiles_display_name
before insert or update on public.profiles
for each row execute function public.normalize_profile_display_name();

alter table public.profiles
  drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 60);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function set_updated_at();

-- Auto-creates a minimal profile the moment someone completes email sign-in
-- for the first time (their first OTP verification also creates their
-- auth.users row — see README "Accounts"). SECURITY DEFINER because the
-- role that performs this insert (Supabase's internal auth service) has no
-- grant on public.profiles otherwise; runs as this function's owner instead.
-- `on conflict do nothing` makes it safe to re-run and idempotent if this
-- trigger is ever fired more than once for the same user id. A missing or
-- null email on the auth.users row (should not normally happen for email
-- OTP) is stored as-is rather than raising — a non-critical metadata gap
-- must never block sign-in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- MIGRATION-SENSITIVE BACKFILL: the trigger above only ever fires for a row
-- inserted into auth.users *after* the trigger exists — any account created
-- earlier (e.g. during initial testing of this feature, before this file's
-- trigger was ever applied) has no public.profiles row at all and never will
-- on its own. That's not merely cosmetic: profiles.include_seen_tastings and
-- display_name updates from such an account silently match zero rows (no
-- error, no effect) because there is nothing to update, and every read
-- (`.select().eq('id', ...)`) returns empty. This one-time, idempotent
-- backfill (`on conflict do nothing`, safe to re-run) creates the missing
-- row for every existing auth.users entry, so this can never recur for an
-- account that already existed when this line was added.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Account-linked tasting records — see README "Account-linked tasting
-- records" and SUPABASE_SETUP.md "Migrating for account-linked tasting
-- records".
--
-- A durable (user_id, session_id, role[, participant_id]) association,
-- created only through the SECURITY DEFINER RPC below — never a bare client
-- insert. This table records ONLY that a link exists; it never duplicates
-- host/guest tokens, Auth tokens, OTP codes, or any tasting content (wines,
-- guesses, ratings, results). It grants no new session privilege by itself —
-- every existing host/guest-token authorization rule is completely
-- unaffected; this table only makes a browser-linked association durable and
-- discoverable from another device, exactly the same as the token already
-- permitted on the browser where it was created.
-- ---------------------------------------------------------------------------

create table if not exists public.account_tasting_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.tasting_sessions(id) on delete cascade,
  role text not null check (role in ('host', 'participant')),
  -- MIGRATION-SENSITIVE DESIGN NOTE: the task's suggested schema used
  -- `on delete set null` here, but that would let a guest-row deletion leave
  -- a `role = 'participant'` row with a null participant_id, which the check
  -- constraint below forbids — that combination would make the guest's
  -- deletion itself fail inside the same transaction. `on delete cascade` is
  -- used instead: if the specific participant record is ever gone, an
  -- association to it is meaningless and should go with it. This app has no
  -- guest-deletion feature today, so this is a forward-safety choice, not a
  -- behavior change.
  participant_id uuid references public.guests(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  claim_source text not null check (claim_source in ('automatic', 'browser_claim')),
  created_at timestamptz not null default now(),
  constraint account_tasting_records_role_participant_shape check (
    (role = 'host' and participant_id is null) or
    (role = 'participant' and participant_id is not null)
  )
);

-- "One host link per (user_id, session_id, role)" and "one participant link
-- per (user_id, session_id, participant_id, role)" from the spec, expressed
-- as partial unique indexes (role is constant within each, so it's the WHERE
-- predicate rather than an indexed column) — these are also the exact
-- ON CONFLICT targets the claim RPC below uses for idempotent inserts.
create unique index if not exists account_tasting_records_host_uniq
  on public.account_tasting_records (user_id, session_id)
  where role = 'host';

create unique index if not exists account_tasting_records_participant_uniq
  on public.account_tasting_records (user_id, session_id, participant_id)
  where role = 'participant';

create index if not exists account_tasting_records_user_id_idx
  on public.account_tasting_records (user_id);
create index if not exists account_tasting_records_session_id_idx
  on public.account_tasting_records (session_id);
-- Archive retrieval order: tasting date lives on tasting_sessions, not here,
-- so this index supports "this user's records, newest-created first" as the
-- practical secondary sort the archive query itself performs after joining.
create index if not exists account_tasting_records_user_created_idx
  on public.account_tasting_records (user_id, created_at desc);

alter table public.account_tasting_records enable row level security;

drop policy if exists account_tasting_records_select_own on public.account_tasting_records;
create policy account_tasting_records_select_own on public.account_tasting_records
  for select using (auth.uid() = user_id);

-- No insert/update/delete policy at all, on purpose: a client can read only
-- its own rows, and can never write one directly, not even its own —
-- writes only ever happen inside claim_account_tasting_record below, which
-- re-validates the actual host/guest token (not just "some session id") no
-- matter who calls it. This mirrors the profiles table's "no direct
-- insert/delete" pattern above, extended here to also exclude update, since
-- the spec requires every column to stay immutable once written.
revoke all on public.account_tasting_records from anon, authenticated;
grant select on public.account_tasting_records to authenticated;

-- Links a signed-in user's account to a specific session, in a specific
-- role, by validating the exact same host/guest credential every other RPC
-- in this file already validates — SECURITY DEFINER only changes who can
-- reach the base tables, never what's required to pass. Reachable directly
-- via the anon key (like every RPC here), so it re-checks everything itself
-- rather than trusting that some Route Handler already did — a signed-in
-- user calling this with a session id they merely know, and no valid token
-- for it, always fails.
--
-- p_claim_source distinguishes two product-level flows sharing one
-- validation path:
--   'automatic'     — called immediately after this same user creates or
--                      joins a session while signed in (see README); the
--                      session is typically still in registration/collecting
--                      at that moment, so status is not restricted here.
--   'browser_claim' — the explicit "Add to my tasting record" action for a
--                      historic session; only allowed once status is
--                      'revealed' (see README "Historic browser-linked
--                      claims").
-- Either way, what actually governs whether a link is later visible in
-- "Your record" is the session's CURRENT status, re-checked at read time —
-- so a claim_source value alone never grants early or extra visibility.
create or replace function public.claim_account_tasting_record(
  p_public_id uuid,
  p_role text,
  p_token text,
  p_claim_source text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_session tasting_sessions%rowtype;
  v_guest guests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_role not in ('host', 'participant') then
    raise exception 'invalid_role';
  end if;
  if p_claim_source not in ('automatic', 'browser_claim') then
    raise exception 'invalid_claim_source';
  end if;

  select * into v_session from tasting_sessions where public_id = p_public_id;
  if not found then
    raise exception 'session_not_found';
  end if;

  if p_claim_source = 'browser_claim' and v_session.status <> 'revealed' then
    raise exception 'session_not_revealed';
  end if;

  if p_role = 'host' then
    if p_token is null or v_session.host_token_hash <> encode(digest(p_token, 'sha256'), 'hex') then
      raise exception 'invalid_host_token';
    end if;

    insert into public.account_tasting_records (user_id, session_id, role, participant_id, claim_source)
    values (v_uid, v_session.id, 'host', null, p_claim_source)
    on conflict (user_id, session_id) where role = 'host' do nothing;
  else
    -- Scoped by session_id, not just guest_token: guest_token is unique
    -- across the whole table, so without this a token that is valid for a
    -- DIFFERENT session could otherwise resolve to a real guest row here and
    -- (mis)link this session to that unrelated participant.
    select * into v_guest from guests
    where guest_token = p_token and session_id = v_session.id;
    if not found then
      raise exception 'invalid_guest_token';
    end if;

    insert into public.account_tasting_records (user_id, session_id, role, participant_id, claim_source)
    values (v_uid, v_session.id, 'participant', v_guest.id, p_claim_source)
    on conflict (user_id, session_id, participant_id) where role = 'participant' do nothing;
  end if;
end;
$$;

-- Authenticated-only: every other RPC in this file also accepts `anon`
-- because guests/hosts never sign in to use them, but this one always
-- requires auth.uid(), so granting it to anon would only ever raise
-- not_authenticated — narrower on purpose.
grant execute on function public.claim_account_tasting_record(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Palate Profile — see README "Palate Profile" and SUPABASE_SETUP.md
-- "Migrating for the Palate Profile".
--
-- The profile is built entirely from account_tasting_records the signed-in
-- user already owns (RLS-scoped to auth.uid()), plus two small additive
-- grants below. No new tables, no new RLS policies, no relaxation of any
-- existing policy.
-- ---------------------------------------------------------------------------

-- Scope preference: "Blind tastings only" (default) vs. "Include Seen
-- tastings" — see README "Core scope rule: Seen tasting filter". Same
-- column-grant pattern as profiles.display_name above: RLS
-- (profiles_update_own) already restricts writes to the signed-in user's own
-- row; this only widens which column a client update is allowed to touch.
alter table public.profiles add column if not exists include_seen_tastings boolean not null default false;
grant update (include_seen_tastings) on public.profiles to authenticated;

-- Lets the profile attribute a host's own blind guesses/ratings to their own
-- guest row when only a role='host' account_tasting_records link exists (see
-- README "Palate Profile" — "Duplicate handling"). This is not new exposure:
-- every guest id (host or otherwise) is already fully readable by anyone via
-- the existing `grant select (id, ...) on guests` above — this grant only
-- reveals *which already-public guest id* is the host, for a session the
-- caller already independently holds an account_tasting_records link to.
-- authenticated-only, since anon has no account-linked records to resolve
-- this for.
grant select (host_guest_id) on tasting_sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Personal Cellar v1 — see README "Personal Cellar" and SUPABASE_SETUP.md
-- "Migrating for Personal Cellar v1".
--
-- A private, account-owned inventory of physical bottles, wholly separate
-- from the anonymous host/guest token model above: a cellar bottle belongs
-- to exactly one auth.users row (never a guest/session identity), is never
-- readable by anyone but its owner, and only ever becomes visible inside a
-- tasting indirectly — as the already-anonymous wines row it was used to
-- create. No existing RLS, RPC, or grant on tasting_sessions/wines/guests/
-- wine_guesses is loosened by any of this.
-- ---------------------------------------------------------------------------

-- One record = one physical bottle (see README "Physical-bottle model") —
-- deliberately not a quantity column. `region`/`grape_blend`/`vintage` use
-- the same not-null-with-blank-default shape as the equivalent `wines`
-- columns (rather than this file's own earlier "nullable" sketch) so the two
-- tables can never drift into divergent wine-field formats — every add/edit
-- RPC below still requires them non-blank in practice, exactly like
-- register_bottle/update_bottle already do for `wines`.
create table if not exists public.cellar_bottles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,

  wine_style text not null check (wine_style in ('bubbles', 'white', 'red', 'sweet', 'other')),
  country text not null,
  region text not null default '',
  -- Optional, more specific appellation within `region` — see README
  -- "Region and Appellation" and wines.appellation above. Same meaning,
  -- same curated-list source (lib/appellations.ts), never used in scoring
  -- (the cellar has no scoring at all).
  appellation text constraint cellar_bottles_appellation_length check (appellation is null or length(appellation) <= 200),
  grape_blend_mode text check (grape_blend_mode is null or grape_blend_mode in ('single', 'blend')),
  grape_blend text not null default '',
  grape_blend_components jsonb,
  vintage text not null,
  producer text not null,
  wine_cuvee text not null,

  bottle_format text not null default '750ml' check (bottle_format in ('375ml', '500ml', '750ml', '1500ml', 'other')),
  -- Free-text detail, required only when bottle_format = 'other' (see check
  -- constraint below) — e.g. "3L double magnum".
  bottle_format_other text,
  storage_location text,
  personal_note text,

  status text not null default 'available' check (status in ('available', 'reserved', 'consumed')),

  -- MIGRATION-SENSITIVE DESIGN NOTE: `on delete set null` here (rather than
  -- `restrict`) is intentionally paired with the status-shape check
  -- constraint below as a belt-and-suspenders pair: every RPC that deletes a
  -- reserved bottle's `wines` row (delete_bottle,
  -- return_cellar_bottle_to_available) always clears these three columns
  -- back to null in the SAME transaction *before* the delete, so this FK
  -- action is never actually exercised on the happy path. If some future
  -- code path ever deleted a linked `wines` row without going through one of
  -- those two RPCs, `on delete set null` would leave `status = 'reserved'`
  -- with a null `reserved_tasting_bottle_id` — which the check constraint
  -- below forbids — so the deletion itself would fail loudly instead of
  -- silently orphaning a reservation.
  reserved_session_id uuid references public.tasting_sessions(id) on delete set null,
  reserved_tasting_bottle_id uuid references public.wines(id) on delete set null,
  reserved_at timestamptz,

  consumed_at timestamptz,
  consumed_session_id uuid references public.tasting_sessions(id) on delete set null,
  consumed_tasting_bottle_id uuid references public.wines(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The three status invariants from the spec, enforced in the database
  -- itself rather than trusted to application code — see README "Personal
  -- Cellar" for the full lifecycle. Every RPC below writes exactly one of
  -- these three shapes per transaction; there is no fourth shape possible.
  constraint cellar_bottles_status_shape check (
    (status = 'available'
      and reserved_session_id is null and reserved_tasting_bottle_id is null and reserved_at is null
      and consumed_at is null and consumed_session_id is null and consumed_tasting_bottle_id is null)
    or
    (status = 'reserved'
      and reserved_session_id is not null and reserved_tasting_bottle_id is not null and reserved_at is not null
      and consumed_at is null and consumed_session_id is null and consumed_tasting_bottle_id is null)
    or
    (status = 'consumed'
      and reserved_session_id is null and reserved_tasting_bottle_id is null and reserved_at is null
      and consumed_at is not null and consumed_session_id is not null and consumed_tasting_bottle_id is not null)
  ),
  constraint cellar_bottles_format_other_required check (
    bottle_format <> 'other' or bottle_format_other is not null
  )
);

-- MIGRATION: additive nullable column for a project where cellar_bottles
-- already existed before Region/Appellation (see README "Region and
-- Appellation") — no-op on a fresh install (already defined above).
alter table public.cellar_bottles add column if not exists appellation text;
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cellar_bottles_appellation_length'
  ) then
    alter table public.cellar_bottles add constraint cellar_bottles_appellation_length
      check (appellation is null or length(appellation) <= 200);
  end if;
end $$;

-- Cellar list default filter ("Available") and the Reserved/Consumed tabs
-- both query (owner_user_id, status) together; the archive-style
-- newest-first ordering uses (owner_user_id, created_at desc). The other two
-- support the reservation/consumption RPCs' own lookups and are narrow on
-- purpose (partial, non-null only).
create index if not exists cellar_bottles_owner_status_idx on public.cellar_bottles (owner_user_id, status);
create index if not exists cellar_bottles_owner_created_idx on public.cellar_bottles (owner_user_id, created_at desc);
create index if not exists cellar_bottles_reserved_session_idx on public.cellar_bottles (reserved_session_id) where reserved_session_id is not null;
create index if not exists cellar_bottles_reserved_wine_idx on public.cellar_bottles (reserved_tasting_bottle_id) where reserved_tasting_bottle_id is not null;
create index if not exists cellar_bottles_consumed_session_idx on public.cellar_bottles (consumed_session_id) where consumed_session_id is not null;

alter table public.cellar_bottles enable row level security;

drop policy if exists cellar_bottles_select_own on public.cellar_bottles;
create policy cellar_bottles_select_own on public.cellar_bottles
  for select using (auth.uid() = owner_user_id);

-- No insert/update/delete policy at all, for any role — stricter than even
-- `profiles`. Unlike a display name or a scope preference, a cellar bottle's
-- status/reservation fields are exactly the kind of "must be transactionally
-- consistent with another table" data this app has always kept off direct
-- client mutation paths; add/edit/reserve/return/consume all go through the
-- SECURITY DEFINER RPCs below instead, every one of which independently
-- re-validates auth.uid() and ownership regardless of who calls it (the
-- anon key can reach any RPC in this file).
revoke all on public.cellar_bottles from anon, authenticated;
grant select on public.cellar_bottles to authenticated;

-- Additive, nullable link from an existing tasting bottle back to the
-- cellar bottle it was created from — null for every manually-registered
-- bottle, before and after this migration. Never exposed to the host, other
-- participants, or reports: no anon/authenticated column grant is added for
-- it (the narrow `wines` grant a few sections above stays exactly as it
-- was), so the only way to ever read it is a SECURITY DEFINER function that
-- explicitly selects it.
alter table public.wines add column if not exists cellar_bottle_id uuid references public.cellar_bottles(id) on delete set null;

-- The reservation-time write path (register_bottle_from_cellar below) is the
-- only place this column is ever set, always to a wines.id it just inserted
-- in the same transaction — so in practice this can never collide. This
-- index is the hard backstop that makes that a guarantee rather than an
-- assumption: no two wines rows can ever reference the same cellar bottle.
create unique index if not exists wines_cellar_bottle_id_uniq on public.wines (cellar_bottle_id) where cellar_bottle_id is not null;

-- Re-packs tasting_order into a contiguous 1..N permutation after a bottle
-- is removed from a session — extracted from delete_bottle so
-- return_cellar_bottle_to_available (below) can reuse the exact same logic
-- rather than duplicating it. Not SECURITY DEFINER: like
-- validate_grape_blend_components above, it only ever runs via `perform`
-- from inside a caller that already has the privilege it needs.
create or replace function public.repack_tasting_order(p_session_id uuid) returns void
language plpgsql
as $$
begin
  update wines w
  set tasting_order = ranked.new_order
  from (
    select id, row_number() over (order by tasting_order) as new_order
    from wines where session_id = p_session_id
  ) ranked
  where w.id = ranked.id and w.tasting_order <> ranked.new_order;
end;
$$;

-- Owner: add one or more identical new available cellar bottles in one
-- atomic operation (see README "Personal Cellar" — "Quantity"). SECURITY
-- DEFINER only to reach the table past its "no insert policy at all" RLS
-- above; auth.uid() (never a client-supplied owner id) is what every new row
-- is actually attributed to. Validation mirrors register_bottle's exactly,
-- plus the cellar-only bottle format/storage/note/quantity fields. The
-- one-cellar-bottle-row-per-physical-bottle model is unchanged: p_quantity
-- only controls how many separate, independently-reservable/consumable rows
-- this single call creates — it is never itself persisted as a stock count.
-- Signature changed (quantity added) — explicitly drop the old overload so
-- it can't be called with stale semantics; safe/no-op on a fresh install.
drop function if exists public.add_cellar_bottle(text, text, text, text, jsonb, text, text, text, text, text, text, text, text, text);

create or replace function public.add_cellar_bottle(
  p_country text,
  p_region text,
  p_grape_blend_mode text,
  p_grape_blend text,
  p_grape_blend_components jsonb,
  p_producer text,
  p_wine_cuvee text,
  p_vintage text,
  p_wine_style text,
  p_bottle_format text,
  p_bottle_format_other text,
  p_storage_location text,
  p_personal_note text,
  p_appellation text,
  p_quantity int default 1
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[];
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_grape_blend_mode not in ('single', 'blend') then
    raise exception 'invalid_grape_blend_mode';
  end if;
  if p_wine_style not in ('bubbles', 'white', 'red', 'sweet', 'other') then
    raise exception 'invalid_wine_style';
  end if;
  if p_bottle_format not in ('375ml', '500ml', '750ml', '1500ml', 'other') then
    raise exception 'invalid_bottle_format';
  end if;
  if p_bottle_format = 'other' and length(btrim(coalesce(p_bottle_format_other, ''))) = 0 then
    raise exception 'bottle_format_detail_required';
  end if;
  if length(coalesce(p_bottle_format_other, '')) > 60 then
    raise exception 'bottle_format_detail_too_long';
  end if;
  if length(coalesce(p_storage_location, '')) > 120 then
    raise exception 'storage_location_too_long';
  end if;
  if length(coalesce(p_personal_note, '')) > 500 then
    raise exception 'personal_note_too_long';
  end if;
  if length(coalesce(p_appellation, '')) > 200 then
    raise exception 'invalid_appellation';
  end if;
  if not is_valid_appellation(btrim(p_country), btrim(p_region), p_appellation) then
    raise exception 'invalid_appellation';
  end if;
  -- Authoritative range check — the client only ever provides immediate
  -- feedback (see lib/cellar.ts); this is what actually prevents a bypassed
  -- client from creating 0, a negative count, or an unbounded number of rows
  -- in one call. p_quantity's `int` parameter type already rejects a
  -- fractional value (e.g. "2.5") at the PostgREST binding layer, before
  -- this function body ever runs, so it is never silently rounded.
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'invalid_quantity';
  end if;
  perform validate_grape_blend_components(p_grape_blend_mode, p_grape_blend_components);
  if btrim(coalesce(p_country, '')) = '' or btrim(coalesce(p_region, '')) = ''
     or btrim(coalesce(p_grape_blend, '')) = ''
     or btrim(coalesce(p_producer, '')) = '' or btrim(coalesce(p_wine_cuvee, '')) = ''
     or btrim(coalesce(p_vintage, '')) = '' then
    raise exception 'bottle_fields_required';
  end if;

  -- One INSERT ... SELECT, not a loop of separate statements: this is a
  -- single atomic operation inside the function's own transaction — either
  -- every row is created, or (on any error) none are, exactly like every
  -- other single-statement write in this file. Each generate_series
  -- iteration produces its own independent row with its own id; nothing here
  -- collapses the physical bottles into a shared quantity counter.
  with inserted as (
    insert into public.cellar_bottles (
      owner_user_id, wine_style, country, region, appellation, grape_blend_mode, grape_blend, grape_blend_components,
      producer, wine_cuvee, vintage, bottle_format, bottle_format_other, storage_location, personal_note
    )
    select
      v_uid, p_wine_style, btrim(p_country), btrim(p_region), nullif(btrim(coalesce(p_appellation, '')), ''),
      p_grape_blend_mode, btrim(p_grape_blend), p_grape_blend_components,
      btrim(p_producer), btrim(p_wine_cuvee), btrim(p_vintage), p_bottle_format,
      nullif(btrim(coalesce(p_bottle_format_other, '')), ''),
      nullif(btrim(coalesce(p_storage_location, '')), ''),
      nullif(btrim(coalesce(p_personal_note, '')), '')
    from generate_series(1, p_quantity)
    returning id
  )
  select array_agg(id) into v_ids from inserted;

  return jsonb_build_object('ids', to_jsonb(v_ids), 'count', p_quantity);
end;
$$;

-- Owner: edit a bottle that is still `available`. Re-validated the same way
-- as add_cellar_bottle; a `reserved`/`consumed` row is never matched by the
-- `for update` lookup's status check, so this always fails safely for those
-- (see README — reserved/consumed bottles are read-only in v1).
-- Signature changed (appellation added) — explicitly drop the old overload
-- so it can't be called with stale semantics; safe/no-op on a fresh install.
drop function if exists public.update_cellar_bottle(uuid, text, text, text, text, jsonb, text, text, text, text, text, text, text, text);

create or replace function public.update_cellar_bottle(
  p_cellar_bottle_id uuid,
  p_country text,
  p_region text,
  p_grape_blend_mode text,
  p_grape_blend text,
  p_grape_blend_components jsonb,
  p_producer text,
  p_wine_cuvee text,
  p_vintage text,
  p_wine_style text,
  p_bottle_format text,
  p_bottle_format_other text,
  p_storage_location text,
  p_personal_note text,
  p_appellation text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_cellar cellar_bottles%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_cellar from cellar_bottles where id = p_cellar_bottle_id for update;
  if not found or v_cellar.owner_user_id is distinct from v_uid then
    raise exception 'cellar_bottle_not_found';
  end if;
  if v_cellar.status <> 'available' then
    raise exception 'cellar_bottle_not_editable';
  end if;

  if p_grape_blend_mode not in ('single', 'blend') then
    raise exception 'invalid_grape_blend_mode';
  end if;
  if p_wine_style not in ('bubbles', 'white', 'red', 'sweet', 'other') then
    raise exception 'invalid_wine_style';
  end if;
  if p_bottle_format not in ('375ml', '500ml', '750ml', '1500ml', 'other') then
    raise exception 'invalid_bottle_format';
  end if;
  if p_bottle_format = 'other' and length(btrim(coalesce(p_bottle_format_other, ''))) = 0 then
    raise exception 'bottle_format_detail_required';
  end if;
  if length(coalesce(p_bottle_format_other, '')) > 60 then
    raise exception 'bottle_format_detail_too_long';
  end if;
  if length(coalesce(p_storage_location, '')) > 120 then
    raise exception 'storage_location_too_long';
  end if;
  if length(coalesce(p_personal_note, '')) > 500 then
    raise exception 'personal_note_too_long';
  end if;
  if length(coalesce(p_appellation, '')) > 200 then
    raise exception 'invalid_appellation';
  end if;
  if not is_valid_appellation(btrim(p_country), btrim(p_region), p_appellation) then
    raise exception 'invalid_appellation';
  end if;
  perform validate_grape_blend_components(p_grape_blend_mode, p_grape_blend_components);
  if btrim(coalesce(p_country, '')) = '' or btrim(coalesce(p_region, '')) = ''
     or btrim(coalesce(p_grape_blend, '')) = ''
     or btrim(coalesce(p_producer, '')) = '' or btrim(coalesce(p_wine_cuvee, '')) = ''
     or btrim(coalesce(p_vintage, '')) = '' then
    raise exception 'bottle_fields_required';
  end if;

  update cellar_bottles set
    wine_style = p_wine_style,
    country = btrim(p_country),
    region = btrim(p_region),
    appellation = nullif(btrim(coalesce(p_appellation, '')), ''),
    grape_blend_mode = p_grape_blend_mode,
    grape_blend = btrim(p_grape_blend),
    grape_blend_components = p_grape_blend_components,
    producer = btrim(p_producer),
    wine_cuvee = btrim(p_wine_cuvee),
    vintage = btrim(p_vintage),
    bottle_format = p_bottle_format,
    bottle_format_other = nullif(btrim(coalesce(p_bottle_format_other, '')), ''),
    storage_location = nullif(btrim(coalesce(p_storage_location, '')), ''),
    personal_note = nullif(btrim(coalesce(p_personal_note, '')), ''),
    updated_at = now()
  where id = p_cellar_bottle_id;
end;
$$;

-- Participant (who must also be the cellar owner): register a tasting
-- bottle from an available cellar bottle, atomically reserving it in the
-- same transaction — see README "Personal Cellar" — "Atomic reserve +
-- tasting-bottle creation". Reachable directly via the anon key regardless
-- of caller, so every condition is re-validated here independently: this
-- never trusts that a Route Handler or the browser already checked
-- anything. Both `for update` locks (session row, then cellar row) are what
-- make concurrent double-booking impossible — a second concurrent call
-- blocks on whichever row the first call locked first, then re-reads
-- already-committed state and fails its own check.
--
-- One error tag ('cellar_bottle_unavailable') covers every cellar-side
-- failure — bottle not found, not owned by this signed-in user, or already
-- reserved/consumed — so a caller can never distinguish "not yours" from
-- "no longer available" from the response alone.
create or replace function public.register_bottle_from_cellar(
  p_guest_token text,
  p_cellar_bottle_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_cellar cellar_bottles%rowtype;
  v_next_number int;
  v_next_order int;
  v_wine_id uuid;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;

  select * into v_session from tasting_sessions where id = v_guest.session_id for update;
  if v_session.status <> 'registration' then
    raise exception 'registration_closed';
  end if;

  if v_uid is null then
    raise exception 'cellar_bottle_unavailable';
  end if;

  select * into v_cellar from cellar_bottles where id = p_cellar_bottle_id for update;
  if not found or v_cellar.owner_user_id is distinct from v_uid or v_cellar.status <> 'available' then
    raise exception 'cellar_bottle_unavailable';
  end if;

  perform validate_grape_blend_components(v_cellar.grape_blend_mode, v_cellar.grape_blend_components);

  v_next_number := v_session.next_bottle_number;
  select coalesce(max(tasting_order), 0) + 1 into v_next_order
  from wines where session_id = v_session.id;

  insert into wines (
    session_id, display_order, bottle_number, tasting_order, anonymous_code, contributor_guest_id,
    country, region, appellation, grape_style, grape_blend_mode, grape_blend_components, producer, wine_cuvee,
    vintage, wine_style, cellar_bottle_id
  ) values (
    v_session.id, v_next_number - 1, v_next_number, v_next_order, 'Bottle ' || v_next_number, v_guest.id,
    v_cellar.country, v_cellar.region, v_cellar.appellation, v_cellar.grape_blend, v_cellar.grape_blend_mode, v_cellar.grape_blend_components,
    v_cellar.producer, v_cellar.wine_cuvee, v_cellar.vintage, v_cellar.wine_style, v_cellar.id
  )
  returning wines.id into v_wine_id;

  update tasting_sessions set next_bottle_number = v_next_number + 1 where id = v_session.id;

  update cellar_bottles
  set status = 'reserved',
      reserved_session_id = v_session.id,
      reserved_tasting_bottle_id = v_wine_id,
      reserved_at = now(),
      updated_at = now()
  where id = v_cellar.id;

  return jsonb_build_object('id', v_wine_id, 'bottleNumber', v_next_number);
end;
$$;

-- Grouped cellar display (see README "Personal Cellar" — "Grouped display"):
-- the atomic "Add to tasting" action for a grouped Add-from-cellar entry
-- with more than one available physical bottle. Generalizes
-- register_bottle_from_cellar above rather than replacing it — a one-bottle
-- group still goes through the single-bottle RPC unchanged; this one only
-- ever runs when the contributor explicitly adds more than one bottle from
-- the same grouped entry in a single action.
--
-- p_cellar_bottle_id is only ever an *anchor* — one bottle the client
-- already legitimately has from its own RLS-scoped fetch, used purely to
-- let the server look up which material identity to match. The actual set
-- of physical bottles reserved is always recomputed here from
-- (owner_user_id, status = 'available', <every material identity field>),
-- never trusted from the client, so a tampered/stale anchor id, quantity,
-- or client-side "group key" can never reserve bottles outside the caller's
-- own matching set. Locking is `for update` on exactly the N rows selected
-- (oldest `created_at` first, `id` as a stable tie-breaker — see README),
-- so a concurrent identical call can never double-reserve the same physical
-- bottle; if fewer than N still qualify by the time the lock is acquired,
-- nothing is inserted or reserved at all (all-or-nothing).
create or replace function public.register_bottles_from_cellar_group(
  p_guest_token text,
  p_cellar_bottle_id uuid,
  p_quantity int
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_anchor cellar_bottles%rowtype;
  v_ids uuid[];
  v_next_number int;
  v_next_order int;
  v_first_bottle_number int;
  v_wine_ids uuid[];
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;

  select * into v_session from tasting_sessions where id = v_guest.session_id for update;
  if v_session.status <> 'registration' then
    raise exception 'registration_closed';
  end if;

  if v_uid is null then
    raise exception 'cellar_bottle_unavailable';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'invalid_quantity';
  end if;

  select * into v_anchor from cellar_bottles where id = p_cellar_bottle_id;
  if not found or v_anchor.owner_user_id is distinct from v_uid or v_anchor.status <> 'available' then
    raise exception 'cellar_bottle_unavailable';
  end if;

  perform validate_grape_blend_components(v_anchor.grape_blend_mode, v_anchor.grape_blend_components);

  -- Recompute the group and lock exactly p_quantity of its rows (or fewer,
  -- if stock has changed since the client last saw it) — every field here
  -- mirrors buildCellarGroupKey (lib/cellarGrouping.ts) exactly, so the
  -- server's notion of "same group" can never quietly diverge from the
  -- client's grouped display.
  select array_agg(id order by created_at asc, id asc) into v_ids
  from (
    select id, created_at from cellar_bottles
    where owner_user_id = v_uid
      and status = 'available'
      and country is not distinct from v_anchor.country
      and region is not distinct from v_anchor.region
      and appellation is not distinct from v_anchor.appellation
      and grape_blend_mode is not distinct from v_anchor.grape_blend_mode
      and grape_blend is not distinct from v_anchor.grape_blend
      and grape_blend_components is not distinct from v_anchor.grape_blend_components
      and producer is not distinct from v_anchor.producer
      and wine_cuvee is not distinct from v_anchor.wine_cuvee
      and vintage is not distinct from v_anchor.vintage
      and wine_style is not distinct from v_anchor.wine_style
      and bottle_format is not distinct from v_anchor.bottle_format
      and bottle_format_other is not distinct from v_anchor.bottle_format_other
      and storage_location is not distinct from v_anchor.storage_location
    order by created_at asc, id asc
    limit p_quantity
    for update
  ) matching;

  if v_ids is null or array_length(v_ids, 1) < p_quantity then
    raise exception 'cellar_group_stock_changed';
  end if;

  v_next_number := v_session.next_bottle_number;
  select coalesce(max(tasting_order), 0) + 1 into v_next_order
  from wines where session_id = v_session.id;
  v_first_bottle_number := v_next_number;

  with inserted as (
    insert into wines (
      session_id, display_order, bottle_number, tasting_order, anonymous_code, contributor_guest_id,
      country, region, appellation, grape_style, grape_blend_mode, grape_blend_components, producer, wine_cuvee,
      vintage, wine_style, cellar_bottle_id
    )
    select
      v_session.id,
      v_first_bottle_number - 1 + (u.ord - 1),
      v_first_bottle_number + (u.ord - 1),
      v_next_order + (u.ord - 1),
      'Bottle ' || (v_first_bottle_number + (u.ord - 1)),
      v_guest.id,
      cb.country, cb.region, cb.appellation, cb.grape_blend, cb.grape_blend_mode, cb.grape_blend_components,
      cb.producer, cb.wine_cuvee, cb.vintage, cb.wine_style, cb.id
    from unnest(v_ids) with ordinality as u(cellar_id, ord)
    join cellar_bottles cb on cb.id = u.cellar_id
    returning wines.id as wine_id, wines.cellar_bottle_id as cellar_id, wines.bottle_number as bottle_number
  ),
  updated as (
    update cellar_bottles cb
    set status = 'reserved',
        reserved_session_id = v_session.id,
        reserved_tasting_bottle_id = inserted.wine_id,
        reserved_at = now(),
        updated_at = now()
    from inserted
    where cb.id = inserted.cellar_id
    returning inserted.wine_id as wine_id, inserted.bottle_number as bottle_number
  )
  select array_agg(wine_id order by bottle_number) into v_wine_ids from updated;

  update tasting_sessions set next_bottle_number = v_first_bottle_number + p_quantity where id = v_session.id;

  return jsonb_build_object(
    'ids', to_jsonb(v_wine_ids),
    'count', p_quantity,
    'firstBottleNumber', v_first_bottle_number
  );
end;
$$;

-- Owner (from /cellar — no guest token involved, unlike delete_bottle's
-- equivalent release path): void the reservation's tasting bottle and
-- restore the cellar bottle to available. Only permitted while the linked
-- session is still `registration` (before tasting begins) — see README
-- "Personal Cellar" — "Return to cellar". auth.uid() plus cellar ownership
-- is the entire authorization chain; it deliberately does not require or
-- accept a guest/host token, since the signed-in owner may not be on the
-- browser that holds one.
create or replace function public.return_cellar_bottle_to_available(
  p_cellar_bottle_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_cellar cellar_bottles%rowtype;
  v_session tasting_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_cellar from cellar_bottles where id = p_cellar_bottle_id for update;
  if not found or v_cellar.owner_user_id is distinct from v_uid then
    raise exception 'cellar_bottle_not_found';
  end if;
  if v_cellar.status <> 'reserved' then
    raise exception 'cellar_bottle_not_reserved';
  end if;

  select * into v_session from tasting_sessions where id = v_cellar.reserved_session_id for update;
  if not found or v_session.status <> 'registration' then
    raise exception 'return_window_closed';
  end if;

  -- Must run before the delete below: wines.id is referenced by
  -- reserved_tasting_bottle_id with `on delete set null`, so deleting the
  -- wines row first would fire that FK action mid-transaction and leave
  -- status = 'reserved' with a null reserved_tasting_bottle_id for an
  -- instant — which cellar_bottles_status_shape forbids, aborting the
  -- transaction before this update ever ran. Updating the shape to
  -- 'available' first means the FK action either never fires (fields
  -- already null) or is a harmless no-op.
  update cellar_bottles
  set status = 'available',
      reserved_session_id = null,
      reserved_tasting_bottle_id = null,
      reserved_at = null,
      updated_at = now()
  where id = v_cellar.id;

  delete from wines where id = v_cellar.reserved_tasting_bottle_id;
  perform repack_tasting_order(v_session.id);
end;
$$;

-- Owner: the deliberate, explicit "Mark bottle as consumed" action — see
-- README "Personal Cellar" — "Consume action". Only reachable once the
-- linked session has actually reached `revealed` (this app's equivalent of
-- "completed"), so a bottle can never be marked consumed while its tasting
-- is still in progress or hasn't started.
create or replace function public.mark_cellar_bottle_consumed(
  p_cellar_bottle_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_cellar cellar_bottles%rowtype;
  v_session tasting_sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_cellar from cellar_bottles where id = p_cellar_bottle_id for update;
  if not found or v_cellar.owner_user_id is distinct from v_uid then
    raise exception 'cellar_bottle_not_found';
  end if;
  if v_cellar.status <> 'reserved' then
    raise exception 'cellar_bottle_not_reserved';
  end if;

  select * into v_session from tasting_sessions where id = v_cellar.reserved_session_id;
  if not found or v_session.status <> 'revealed' then
    raise exception 'consumption_not_eligible';
  end if;

  update cellar_bottles
  set status = 'consumed',
      consumed_at = now(),
      consumed_session_id = v_cellar.reserved_session_id,
      consumed_tasting_bottle_id = v_cellar.reserved_tasting_bottle_id,
      reserved_session_id = null,
      reserved_tasting_bottle_id = null,
      reserved_at = null,
      updated_at = now()
  where id = v_cellar.id;
end;
$$;

-- All five require auth.uid() to ever succeed, so — like
-- claim_account_tasting_record — granting to anon would only let it raise
-- not_authenticated/cellar_bottle_unavailable; authenticated-only is
-- narrower on purpose.
grant execute on function public.add_cellar_bottle(text, text, text, text, jsonb, text, text, text, text, text, text, text, text, text, int) to authenticated;
grant execute on function public.update_cellar_bottle(uuid, text, text, text, text, jsonb, text, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.register_bottle_from_cellar(text, uuid) to authenticated;
grant execute on function public.register_bottles_from_cellar_group(text, uuid, int) to authenticated;
grant execute on function public.return_cellar_bottle_to_available(uuid) to authenticated;
grant execute on function public.mark_cellar_bottle_consumed(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Seen Host Controls: per-bottle rating reveal — see README "Tasting modes"
-- — "Seen Host Controls".
--
-- Seen tasting previously had only one, session-wide rating reveal
-- (end_seen_tasting above, unchanged). This adds an independent, per-bottle
-- reveal the host can trigger in any order during the collecting stage,
-- without ending the tasting or affecting any other bottle. Deliberately a
-- separate column from `revealed_at` (course_reveal's identity-reveal
-- timestamp) rather than reusing it: in seen mode the wine's identity is
-- already fully visible from the start (see get_seen_tasting_state below),
-- so this column only ever gates the *rating aggregate*, never identity —
-- overloading revealed_at here would conflate two unrelated concepts and
-- risk leaking rating state into course_reveal's identity-reveal logic (and
-- vice versa). Additive and nullable: every existing bottle (of any mode)
-- defaults to null/unrevealed, and full_blind/course_reveal bottles never
-- have this column touched by any function.
-- ---------------------------------------------------------------------------

alter table wines add column if not exists ratings_revealed_at timestamptz;

-- Host: reveal the group rating for one seen-tasting bottle, independent of
-- every other bottle and of bottle/tasting order. Idempotent — revealing an
-- already-revealed bottle succeeds without changing its timestamp, so a
-- retried request (e.g. a flaky connection) never errors or produces a
-- different value. Deliberately has no "is every eligible participant rated"
-- requirement and no active/current-bottle constraint, unlike course_reveal's
-- reveal_bottle — see README for why seen mode's reveal is unordered by
-- design.
create or replace function reveal_seen_ratings(
  p_public_id uuid,
  p_host_token text,
  p_wine_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session tasting_sessions%rowtype;
  v_wine wines%rowtype;
  v_revealed_at timestamptz;
  v_rated_count int;
  v_eligible_count int;
  v_group_rating numeric;
begin
  select * into v_session from tasting_sessions where public_id = p_public_id for update;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.host_token_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    raise exception 'invalid_host_token';
  end if;
  if v_session.tasting_mode <> 'seen' then
    raise exception 'invalid_tasting_mode';
  end if;
  if v_session.status <> 'collecting' then
    raise exception 'session_not_collecting';
  end if;

  select * into v_wine from wines where id = p_wine_id and session_id = v_session.id for update;
  if not found then
    raise exception 'wine_not_in_session';
  end if;

  update wines
  set ratings_revealed_at = coalesce(ratings_revealed_at, now())
  where id = p_wine_id
  returning ratings_revealed_at into v_revealed_at;

  select count(*) into v_eligible_count from guests where session_id = v_session.id;
  select count(*) into v_rated_count
    from wine_guesses where wine_id = p_wine_id and rating is not null;
  select round(avg(rating)::numeric, 1) into v_group_rating
    from wine_guesses where wine_id = p_wine_id and rating is not null;

  return jsonb_build_object(
    'wineId', p_wine_id,
    'ratingsRevealedAt', v_revealed_at,
    'ratedCount', v_rated_count,
    'eligibleCount', v_eligible_count,
    'groupRating', v_group_rating
  );
end;
$$;

grant execute on function reveal_seen_ratings(uuid, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cellar deletion eligibility (see README "Personal Cellar" — "Deleting a
-- bottle"): a cellar bottle may be permanently deleted only while
-- status = 'available'. Reserved bottles are linked to an active or pending
-- tasting and Consumed bottles are permanent cellar-history records in v1 —
-- neither may ever be deleted, including via a manipulated id or a direct
-- RPC call bypassing the UI. There is no unlink/cascade/admin-override path:
-- the existing `return_cellar_bottle_to_available` flow above remains the
-- only way to make a Reserved bottle eligible again, and a Consumed bottle
-- can never become eligible.
-- ---------------------------------------------------------------------------

-- Owner: permanently delete an available cellar bottle. The conditional
-- `delete ... where ... and status = 'available'` is the actual enforcement
-- — not merely a pre-check — so this is safe even under concurrent
-- modification (e.g. a reservation racing this delete): whichever change
-- commits first determines whether the row still matches, and Postgres's
-- row-level locking means only one of them can win. `v_deleted` distinguishes
-- "deleted" from "matched nothing" without a separate existence check.
--
-- When nothing was deleted, the second lookup is scoped to
-- `owner_user_id = v_uid` exactly like every other cellar RPC's ownership
-- check, so it can only ever reveal a status the caller's own account
-- already had visibility into via `cellar_bottles_select_own` — never
-- whether some other user's bottle exists. A bottle that is missing, already
-- deleted, or owned by someone else all collapse to the same
-- 'cellar_bottle_not_found' tag already used by update_cellar_bottle for the
-- identical reasons, so a caller can never distinguish those cases from the
-- error alone.
create or replace function public.delete_cellar_bottle(
  p_cellar_bottle_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  delete from cellar_bottles
  where id = p_cellar_bottle_id
    and owner_user_id = v_uid
    and status = 'available'
  returning id into v_deleted_id;

  if v_deleted_id is not null then
    return;
  end if;

  select status into v_status
  from cellar_bottles
  where id = p_cellar_bottle_id and owner_user_id = v_uid;

  if v_status = 'reserved' then
    raise exception 'cellar_bottle_reserved';
  elsif v_status = 'consumed' then
    raise exception 'cellar_bottle_consumed';
  else
    raise exception 'cellar_bottle_not_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Host per-bottle response-progress popover (see README "Host per-bottle
-- response progress"): lets the host see, for one bottle at a time, how many
-- eligible participants have submitted the relevant response and the safe
-- display names of the ones who haven't — never guess/rating content, never
-- an average, never anything not already computed elsewhere in this file.
-- Deliberately a single on-demand RPC (called only when the host opens the
-- popover) rather than baked into get_host_session's eager payload, so a
-- normal page load never fetches every bottle's participant-name list.
-- ---------------------------------------------------------------------------

-- Host: per-bottle participant response progress. Reuses the exact same
-- "eligible"/"submitted" predicates already used elsewhere in this file for
-- each mode, so this can never drift into a second, competing definition:
--   full_blind    -> guests.completed_at is not null (get_host_session's
--                    completedCount / complete_guest_submission's own gate;
--                    full_blind has no per-bottle lock, so this is
--                    identical for every bottle in the session)
--   course_reveal -> wine_guesses.locked_at is not null for this wine
--                    (get_host_session's activeBottle.submittedCount /
--                    lock_wine_guess), and only for the current active
--                    bottle — the same "earliest unrevealed by tasting_order"
--                    lookup and bottle_not_active guard as lock_wine_guess,
--                    so a not-yet-released or already-revealed bottle can
--                    never be queried, including by a host manually passing
--                    a different wine id.
--   seen          -> wine_guesses.rating is not null for this wine
--                    (get_host_session's seen.ratedCount)
-- "Eligible" is the same `guests` row count used by every one of those
-- existing computations — the host counts once only because they have
-- exactly one guests row (see create_tasting_session), never a special case
-- here. Returns only counts and missing participants' existing safe
-- guests.display_name — never a guess, a rating, a score, an email, or a
-- token.
create or replace function get_bottle_response_progress(
  p_public_id uuid,
  p_host_token text,
  p_wine_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session tasting_sessions%rowtype;
  v_wine wines%rowtype;
  v_active_wine_id uuid;
  v_response_kind text;
  v_submitted_count int;
  v_eligible_count int;
  v_missing_names jsonb;
begin
  select * into v_session from tasting_sessions where public_id = p_public_id;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.host_token_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    raise exception 'invalid_host_token';
  end if;

  select * into v_wine from wines where id = p_wine_id and session_id = v_session.id;
  if not found then
    raise exception 'wine_not_in_session';
  end if;

  select count(*) into v_eligible_count from guests where session_id = v_session.id;

  if v_session.tasting_mode = 'full_blind' then
    v_response_kind := 'guess';
    select count(*) into v_submitted_count from guests
      where session_id = v_session.id and completed_at is not null;
    select coalesce(jsonb_agg(display_name order by created_at), '[]'::jsonb) into v_missing_names
      from guests where session_id = v_session.id and completed_at is null;

  elsif v_session.tasting_mode = 'course_reveal' then
    v_response_kind := 'guess';

    -- Same lookup lock_wine_guess uses: the single earliest-tasting_order
    -- unrevealed bottle. A not-yet-released or already-revealed bottle id
    -- (including a manually-substituted one) can never match, so this can't
    -- be used to peek at a bottle the host isn't currently working through.
    select id into v_active_wine_id from wines
      where session_id = v_session.id and revealed_at is null
      order by tasting_order asc
      limit 1;
    if v_active_wine_id is distinct from p_wine_id then
      raise exception 'bottle_not_active';
    end if;

    select count(*) into v_submitted_count from wine_guesses
      where wine_id = p_wine_id and locked_at is not null;
    select coalesce(jsonb_agg(g.display_name order by g.created_at), '[]'::jsonb) into v_missing_names
      from guests g
      where g.session_id = v_session.id
        and not exists (
          select 1 from wine_guesses wg
          where wg.wine_id = p_wine_id and wg.guest_id = g.id and wg.locked_at is not null
        );

  elsif v_session.tasting_mode = 'seen' then
    v_response_kind := 'rating';
    select count(*) into v_submitted_count from wine_guesses
      where wine_id = p_wine_id and rating is not null;
    select coalesce(jsonb_agg(g.display_name order by g.created_at), '[]'::jsonb) into v_missing_names
      from guests g
      where g.session_id = v_session.id
        and not exists (
          select 1 from wine_guesses wg
          where wg.wine_id = p_wine_id and wg.guest_id = g.id and wg.rating is not null
        );

  else
    raise exception 'invalid_tasting_mode';
  end if;

  return jsonb_build_object(
    'bottleId', p_wine_id,
    'responseKind', v_response_kind,
    'submittedCount', v_submitted_count,
    'eligibleCount', v_eligible_count,
    'missingParticipantNames', v_missing_names
  );
end;
$$;

grant execute on function get_bottle_response_progress(uuid, text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Host-participant guess-screen live group-progress count (see README "Host
-- per-bottle response progress" — "Host guess screen group progress"): a
-- minimal, host-only aggregate the host's OWN guess-entry page can show
-- while they're guessing, distinct from the Host Controls popover above.
-- Authenticated by guest_token (the host's own participant identity on this
-- page — the same token used by upsert_wine_guess/lock_wine_guess), never by
-- host_token, since the host guess screen never has the host token in scope.
-- Returns only the two counts — never a missing-participant name, unlike
-- get_bottle_response_progress just above. Deliberately does not share a SQL
-- subroutine with that function (this codebase has no shared-helper pattern
-- across its RPCs — every function is self-contained), but every predicate
-- here is intentionally identical to the corresponding branch there, so the
-- two can never quietly diverge into two different "submitted" definitions.
-- ---------------------------------------------------------------------------
create or replace function get_host_guess_progress(
  p_guest_token text,
  p_wine_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_wine wines%rowtype;
  v_active_wine_id uuid;
  v_submitted_count int;
  v_eligible_count int;
begin
  select * into v_guest from guests where guest_token = p_guest_token;
  if not found then
    raise exception 'invalid_guest_token';
  end if;

  select * into v_session from tasting_sessions where id = v_guest.session_id;

  -- Only the session's own host, guessing as a participant, may see this —
  -- the exact same host-as-participant definition used throughout this file
  -- (tasting_sessions.host_guest_id), never a second concept of "host".
  -- Collapsed into the same generic error an invalid token would raise, so
  -- an ordinary participant's guest token can never distinguish "you aren't
  -- the host" from "that token isn't valid at all".
  if v_session.host_guest_id is distinct from v_guest.id then
    raise exception 'invalid_guest_token';
  end if;

  if v_session.tasting_mode not in ('full_blind', 'course_reveal') then
    raise exception 'invalid_tasting_mode';
  end if;

  select * into v_wine from wines where id = p_wine_id and session_id = v_session.id;
  if not found then
    raise exception 'wine_not_in_session';
  end if;

  select count(*) into v_eligible_count from guests where session_id = v_session.id;

  if v_session.tasting_mode = 'full_blind' then
    -- Same signal as get_bottle_response_progress/complete_guest_submission
    -- — full_blind has no per-bottle lock, so this is identical for every
    -- bottle in the session regardless of which one p_wine_id names.
    select count(*) into v_submitted_count from guests
      where session_id = v_session.id and completed_at is not null;
  else
    -- course_reveal: same "current active bottle" guard as
    -- get_bottle_response_progress/lock_wine_guess — a not-yet-released or
    -- already-revealed bottle id can never be queried, so this can never
    -- expose progress for a future or past bottle from the host's own
    -- guess screen either.
    select id into v_active_wine_id from wines
      where session_id = v_session.id and revealed_at is null
      order by tasting_order asc
      limit 1;
    if v_active_wine_id is distinct from p_wine_id then
      raise exception 'bottle_not_active';
    end if;

    select count(*) into v_submitted_count from wine_guesses
      where wine_id = p_wine_id and locked_at is not null;
  end if;

  return jsonb_build_object(
    'submittedCount', v_submitted_count,
    'eligibleCount', v_eligible_count
  );
end;
$$;

grant execute on function get_host_guess_progress(text, uuid) to anon, authenticated;

grant execute on function public.delete_cellar_bottle(uuid) to authenticated;
