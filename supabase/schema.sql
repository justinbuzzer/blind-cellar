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
  unique (session_id, anonymous_code)
);

create table if not exists wine_guesses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references tasting_sessions(id) on delete cascade,
  wine_id uuid not null references wines(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,
  country_guess text not null default '',
  region_guess text not null default '',
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
  w.tasting_order
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

  insert into tasting_sessions (title, tasting_date, join_code, host_token_hash, status, tasting_mode)
  values (btrim(p_title), p_tasting_date, p_join_code, p_host_token_hash, 'registration', p_tasting_mode)
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
      'tastingMode', v_session.tasting_mode
    ),
    'wines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'bottleNumber', w.bottle_number,
        'anonymousCode', w.anonymous_code,
        'wineStyle', w.wine_style,
        'tastingOrder', w.tasting_order,
        'revealedAt', w.revealed_at
      ) order by w.tasting_order)
      from wines w where w.session_id = v_session.id
    ), '[]'::jsonb),
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
  p_grape_blend_components jsonb
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

  v_next_number := v_session.next_bottle_number;
  -- New bottles always join at the end of the current tasting order — the
  -- session row is already locked above, so this is race-free with
  -- concurrent registrations, reorders, and deletes.
  select coalesce(max(tasting_order), 0) + 1 into v_next_order
  from wines where session_id = v_session.id;

  insert into wines (
    session_id, display_order, bottle_number, tasting_order, anonymous_code, contributor_guest_id,
    country, region, grape_style, grape_blend_mode, grape_blend_components, producer, wine_cuvee,
    vintage, wine_style, host_notes
  ) values (
    v_session.id, v_next_number - 1, v_next_number, v_next_order, 'Bottle ' || v_next_number, v_guest.id,
    btrim(p_country), btrim(p_region), btrim(p_grape_blend), p_grape_blend_mode, p_grape_blend_components,
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
  p_grape_blend_components jsonb
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

  update wines set
    country = btrim(p_country),
    region = btrim(p_region),
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
-- a contiguous 1..N permutation, so it's re-packed after the delete (the
-- session row is locked first to serialize this against concurrent
-- register/update/reorder calls on the same session).
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

  delete from wines where id = p_wine_id;

  update wines w
  set tasting_order = ranked.new_order
  from (
    select id, row_number() over (order by tasting_order) as new_order
    from wines where session_id = v_session.id
  ) ranked
  where w.id = ranked.id and w.tasting_order <> ranked.new_order;
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
        'anonymousCode', w.anonymous_code
      ) order by w.tasting_order, w.bottle_number)
      from wines w where w.session_id = v_session.id
    ), '[]'::jsonb),
    'guesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'wineId', wg.wine_id,
        'countryGuess', wg.country_guess,
        'regionGuess', wg.region_guess,
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
-- grape/blend components added) — explicitly drop old overloads; safe/no-op
-- on a fresh install.
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
  p_grape_blend_components jsonb
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

  insert into wine_guesses (
    session_id, wine_id, guest_id, country_guess, region_guess, grape_style_guess,
    grape_blend_mode, grape_blend_components, producer_guess, wine_cuvee_guess, vintage_guess, rating,
    confidence, tasting_note, submitted_at
  ) values (
    v_session.id, p_wine_id, v_guest.id, coalesce(p_country_guess, ''), coalesce(p_region_guess, ''),
    coalesce(p_grape_blend_guess, ''), nullif(p_grape_blend_mode, ''), p_grape_blend_components,
    coalesce(p_producer_guess, ''), coalesce(p_wine_cuvee_guess, ''), coalesce(p_vintage_guess, ''), p_rating,
    coalesce(nullif(p_confidence, ''), 'medium'), nullif(p_tasting_note, ''), now()
  )
  on conflict (guest_id, wine_id) do update set
    country_guess = excluded.country_guess,
    region_guess = excluded.region_guess,
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
      'totalBottles', v_total_bottles
    ),
    'myGuess', case when v_my_guess.id is null then null else jsonb_build_object(
      'wineId', v_my_guess.wine_id,
      'countryGuess', v_my_guess.country_guess,
      'regionGuess', v_my_guess.region_guess,
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
      'status', v_session.status
    ),
    'wine', jsonb_build_object(
      'id', v_wine.id,
      'bottleNumber', v_wine.bottle_number,
      'anonymousCode', v_wine.anonymous_code,
      'position', v_position,
      'totalBottles', v_total_bottles,
      'country', v_wine.country,
      'region', v_wine.region,
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
        'grapeBlendMode', w.grape_blend_mode,
        'grapeBlend', w.grape_style,
        'producer', w.producer,
        'wineCuvee', w.wine_cuvee,
        'vintage', w.vintage,
        'contributorName', (select display_name from guests where id = w.contributor_guest_id),
        'myRating', (select rating from wine_guesses where wine_id = w.id and guest_id = v_guest.id),
        'myConfidence', (select confidence from wine_guesses where wine_id = w.id and guest_id = v_guest.id),
        'myNote', (select tasting_note from wine_guesses where wine_id = w.id and guest_id = v_guest.id)
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
-- never locks a rating after saving — both are the defining differences from
-- course_reveal's lock_wine_guess.
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

  if not exists (select 1 from wines where id = p_wine_id and session_id = v_session.id) then
    raise exception 'wine_not_in_session';
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

grant select (id, public_id, join_code, title, tasting_date, status, created_at, updated_at, tasting_mode)
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
grant execute on function register_bottle(text, text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function update_bottle(text, uuid, text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function delete_bottle(text, uuid) to anon, authenticated;
grant execute on function reorder_wines(uuid, text, uuid[]) to anon, authenticated;
grant execute on function get_guest_session_state(text) to anon, authenticated;
grant execute on function upsert_wine_guess(text, uuid, text, text, text, text, text, text, text, int, text, text, jsonb) to anon, authenticated;
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
