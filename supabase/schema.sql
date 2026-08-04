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
  producer text not null,
  wine_cuvee text not null,
  vintage text not null,
  -- MIGRATION-SENSITIVE: price band is no longer collected, scored, or
  -- displayed (see README) — nullable so new bottles simply never set it.
  -- Existing values are left in place but unused.
  price_band text check (price_band is null or price_band in ('under-100', '100-199', '200-399', '400-plus')),
  -- Kept the historical column name for migration safety even though any
  -- contributor (not just the host) can now set a private note here.
  host_notes text,
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
  producer_guess text not null default '',
  wine_cuvee_guess text not null default '',
  vintage_guess text not null default '',
  -- No longer written by upsert_wine_guess (price band was removed from the
  -- guess-entry form) — kept nullable so existing rows are unaffected.
  price_band_guess text check (price_band_guess is null or price_band_guess in ('under-100', '100-199', '200-399', '400-plus')),
  rating int check (rating is null or (rating between 50 and 100)),
  confidence text not null default 'medium' check (confidence in ('low', 'medium', 'high')),
  tasting_note text,
  submitted_at timestamptz not null default now(),
  unique (guest_id, wine_id)
);

create index if not exists wines_session_id_idx on wines(session_id);
create index if not exists wines_contributor_guest_id_idx on wines(contributor_guest_id);
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
  case when s.status = 'revealed' then w.grape_blend_mode else null end as grape_blend_mode
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

-- The old create_tasting_session took a `jsonb` array of wines and created
-- them all at once. Sessions no longer collect wines at creation time — bottles
-- are registered afterwards by participants — so the signature changed.
-- Explicitly drop the old overload so it can't be called with stale semantics.
drop function if exists create_tasting_session(text, date, text, text, jsonb);

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
  p_host_display_name text
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

  insert into tasting_sessions (title, tasting_date, join_code, host_token_hash, status)
  values (btrim(p_title), p_tasting_date, p_join_code, p_host_token_hash, 'registration')
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
  v_result jsonb;
begin
  select * into v_session from tasting_sessions where public_id = p_public_id;
  if not found then
    raise exception 'session_not_found';
  end if;
  if v_session.host_token_hash <> encode(digest(p_host_token, 'sha256'), 'hex') then
    raise exception 'invalid_host_token';
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
      'hostGuestId', v_session.host_guest_id
    ),
    'wines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'bottleNumber', w.bottle_number,
        'anonymousCode', w.anonymous_code
      ) order by w.bottle_number)
      from wines w where w.session_id = v_session.id
    ), '[]'::jsonb),
    'guests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'displayName', g.display_name,
        'completedAt', g.completed_at
      ) order by g.created_at)
      from guests g where g.session_id = v_session.id
    ), '[]'::jsonb)
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
-- session is a no-op success, not an error.
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

  if v_session.status <> 'revealed' then
    update tasting_sessions set status = 'revealed' where id = v_session.id;
  end if;
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
        'producer', w.producer,
        'wineCuvee', w.wine_cuvee,
        'vintage', w.vintage,
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
-- Signature changed (price band removed, grape/blend mode added) —
-- explicitly drop the old overload so it can't be called with stale
-- semantics; safe/no-op on a fresh install.
drop function if exists register_bottle(text, text, text, text, text, text, text, text, text);

create or replace function register_bottle(
  p_guest_token text,
  p_country text,
  p_region text,
  p_grape_blend_mode text,
  p_grape_blend text,
  p_producer text,
  p_wine_cuvee text,
  p_vintage text,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_guest guests%rowtype;
  v_session tasting_sessions%rowtype;
  v_next_number int;
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
  if btrim(coalesce(p_country, '')) = '' or btrim(coalesce(p_region, '')) = ''
     or btrim(coalesce(p_grape_blend, '')) = ''
     or btrim(coalesce(p_producer, '')) = '' or btrim(coalesce(p_wine_cuvee, '')) = ''
     or btrim(coalesce(p_vintage, '')) = '' then
    raise exception 'bottle_fields_required';
  end if;

  v_next_number := v_session.next_bottle_number;

  insert into wines (
    session_id, display_order, bottle_number, anonymous_code, contributor_guest_id,
    country, region, grape_style, grape_blend_mode, producer, wine_cuvee, vintage, host_notes
  ) values (
    v_session.id, v_next_number - 1, v_next_number, 'Bottle ' || v_next_number, v_guest.id,
    btrim(p_country), btrim(p_region), btrim(p_grape_blend), p_grape_blend_mode, btrim(p_producer),
    btrim(p_wine_cuvee), btrim(p_vintage), nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning wines.id into v_wine_id;

  update tasting_sessions set next_bottle_number = v_next_number + 1 where id = v_session.id;

  return jsonb_build_object('id', v_wine_id, 'bottleNumber', v_next_number);
end;
$$;

-- Participant: edit their own bottle. Bottle number and anonymous_code are
-- never touched (not in the SET list), so they're preserved exactly.
-- Signature changed (price band removed, grape/blend mode added) —
-- explicitly drop the old overload; safe/no-op on a fresh install.
drop function if exists update_bottle(text, uuid, text, text, text, text, text, text, text, text);

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
  p_notes text
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
    producer = btrim(p_producer),
    wine_cuvee = btrim(p_wine_cuvee),
    vintage = btrim(p_vintage),
    host_notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_wine_id;
end;
$$;

-- Participant: delete their own bottle. The bottle_number is never reused
-- (see register_bottle's next_bottle_number counter) and remaining bottles
-- are never renumbered.
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

  select * into v_session from tasting_sessions where id = v_wine.session_id;
  if v_session.status <> 'registration' then
    raise exception 'registration_closed';
  end if;

  delete from wines where id = p_wine_id;
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
      'status', v_session.status
    ),
    'wines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'bottleNumber', w.bottle_number,
        'anonymousCode', w.anonymous_code
      ) order by w.bottle_number)
      from wines w where w.session_id = v_session.id
    ), '[]'::jsonb),
    'guesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'wineId', wg.wine_id,
        'countryGuess', wg.country_guess,
        'regionGuess', wg.region_guess,
        'grapeBlendMode', wg.grape_blend_mode,
        'grapeBlendGuess', wg.grape_style_guess,
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
-- Signature changed (price band removed, grape/blend mode added) —
-- explicitly drop the old overload; safe/no-op on a fresh install.
drop function if exists upsert_wine_guess(text, uuid, text, text, text, text, text, text, text, int, text, text);

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

  insert into wine_guesses (
    session_id, wine_id, guest_id, country_guess, region_guess, grape_style_guess,
    grape_blend_mode, producer_guess, wine_cuvee_guess, vintage_guess, rating,
    confidence, tasting_note, submitted_at
  ) values (
    v_session.id, p_wine_id, v_guest.id, coalesce(p_country_guess, ''), coalesce(p_region_guess, ''),
    coalesce(p_grape_blend_guess, ''), nullif(p_grape_blend_mode, ''), coalesce(p_producer_guess, ''),
    coalesce(p_wine_cuvee_guess, ''), coalesce(p_vintage_guess, ''), p_rating,
    coalesce(nullif(p_confidence, ''), 'medium'), nullif(p_tasting_note, ''), now()
  )
  on conflict (guest_id, wine_id) do update set
    country_guess = excluded.country_guess,
    region_guess = excluded.region_guess,
    grape_style_guess = excluded.grape_style_guess,
    grape_blend_mode = excluded.grape_blend_mode,
    producer_guess = excluded.producer_guess,
    wine_cuvee_guess = excluded.wine_cuvee_guess,
    vintage_guess = excluded.vintage_guess,
    rating = excluded.rating,
    confidence = excluded.confidence,
    tasting_note = excluded.tasting_note,
    submitted_at = now();
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
-- Grants. anon gets EXECUTE on the RPC functions and SELECT on the views,
-- plus narrow column-level SELECT on three "safe" base tables (needed so
-- Realtime postgres_changes has something non-sensitive to broadcast).
-- Nothing else is granted — no anon INSERT/UPDATE/DELETE anywhere, and no
-- anon SELECT at all on `wine_guesses`, and no anon SELECT on any
-- answer-key column of `wines`.
-- ---------------------------------------------------------------------------

revoke all on tasting_sessions from anon;
revoke all on wines from anon;
revoke all on guests from anon;
revoke all on wine_guesses from anon;

grant select (id, public_id, join_code, title, tasting_date, status, created_at, updated_at)
  on tasting_sessions to anon;

grant select (id, session_id, display_name, created_at, completed_at)
  on guests to anon;

-- Deliberately excludes contributor_guest_id and every answer-key column —
-- those only ever reach anon through guest_visible_wines (reveal-gated) or
-- the RPC functions above (ownership-checked).
grant select (id, session_id, bottle_number, anonymous_code, created_at)
  on wines to anon;

grant select on guest_visible_wines to anon;
grant select on revealed_wine_guesses to anon;

grant execute on function create_tasting_session(text, date, text, text, text) to anon;
grant execute on function get_host_session(uuid, text) to anon;
grant execute on function start_tasting_session(uuid, text) to anon;
grant execute on function reveal_tasting_session(uuid, text) to anon;
grant execute on function join_tasting_session(uuid, text) to anon;
grant execute on function get_registration_state(text) to anon;
grant execute on function register_bottle(text, text, text, text, text, text, text, text, text) to anon;
grant execute on function update_bottle(text, uuid, text, text, text, text, text, text, text, text) to anon;
grant execute on function delete_bottle(text, uuid) to anon;
grant execute on function get_guest_session_state(text) to anon;
grant execute on function upsert_wine_guess(text, uuid, text, text, text, text, text, text, text, int, text, text) to anon;

grant execute on function complete_guest_submission(text) to anon;

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
