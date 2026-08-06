# Supabase setup for Blind Cellar

Blind Cellar uses Supabase (Postgres + Realtime) so a host can create a tasting on one device, every participant (including the host) can register their own bottles, and everyone can join and submit guesses from their own phones. This is a one-time setup per environment (local dev, and again for any deployment).

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New project**. Pick an organization, name it (e.g. `blind-cellar`), set a database password (save it somewhere — you won't need it for this app, but you'll want it if you ever connect directly to Postgres), and choose a region close to you.
3. Wait for the project to finish provisioning (a minute or two).

No Supabase CLI is required for any of this — everything below is done through the Supabase web dashboard.

## 2. Find your URL and anon key

1. In your project, go to **Project Settings** (gear icon) → **API**.
2. Copy the **Project URL** — this is `NEXT_PUBLIC_SUPABASE_URL`.
3. Copy the **anon / public** key (not the `service_role` key) — this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

You will not need the `service_role` key anywhere in this app. Never paste it into `.env.local` or any client code — it bypasses Row Level Security entirely.

## 3. Configure `.env.local`

In the `blind-cellar/` folder, copy `.env.example` to `.env.local` and fill in the two values from step 2:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

`.env.local` is already git-ignored, so these values stay out of version control.

## 4. Run `supabase/schema.sql`

1. In the Supabase dashboard, open **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql) from this repo, copy its entire contents, and paste them into the SQL editor.
3. Click **Run**.

**On a brand-new project**, this creates everything in its final shape in one pass:
- 4 tables: `tasting_sessions`, `wines`, `guests`, `wine_guesses`
- 2 views: `guest_visible_wines`, `revealed_wine_guesses`
- 20 RPC functions — session/host (`create_tasting_session`, `get_host_session`, `start_tasting_session`, `reveal_tasting_session`, `reorder_wines`, `reveal_bottle`, `end_seen_tasting`), participant identity (`join_tasting_session`), bottle registration (`get_registration_state`, `register_bottle`, `update_bottle`, `delete_bottle`), and tasting (`get_guest_session_state`, `upsert_wine_guess`, `complete_guest_submission`, `get_active_bottle_state`, `lock_wine_guess`, `get_revealed_bottle`, `get_seen_tasting_state`, `upsert_seen_rating`)
- Row Level Security enabled on all 4 tables, with narrow column-level grants for the `anon` role
- Realtime enabled on `tasting_sessions`, `guests`, and `wines`

**If you already ran an earlier version of this file** (from before bottle registration existed), running the same file again performs a safe, one-time migration in place — see "Migrating an existing project" below. Either way, it's the same file and the same single paste-and-run action.

## 5. Enable Realtime (if the SQL didn't take)

The schema script ends with an `ALTER PUBLICATION supabase_realtime ADD TABLE ...` block for `tasting_sessions`, `guests`, and `wines`. On most projects this just works. If host/participant screens don't seem to update live after you've confirmed the SQL ran without error:

1. Go to **Database** → **Replication** in the dashboard.
2. Find the `supabase_realtime` publication.
3. Make sure `tasting_sessions`, `guests`, and `wines` are all toggled **on**.

Nothing else needs Realtime — `wine_guesses` is intentionally never broadcast (see security notes below).

## Migrating an existing project

If your project already has the pre-bottle-registration schema (sessions only ever had `status in ('collecting', 'revealed')`, and the host entered all wines at session creation), re-running `supabase/schema.sql` brings it up to date safely, without deleting any data. Every migration statement in the file is written to be a no-op on a fresh install and to run in a specific, safe order on an existing one — **do not reorder or partially copy the file**; run it top to bottom in one paste. In order, it will:

1. Add the new columns (`tasting_sessions.host_guest_id`, `tasting_sessions.next_bottle_number`, `wines.bottle_number`, `wines.contributor_guest_id`, `wines.updated_at`) if they don't already exist.
2. Widen the `tasting_sessions` status check constraint to allow `'registration'` — existing sessions keep whatever status they already had (`collecting` or `revealed`); nothing is force-transitioned.
3. Backfill `bottle_number` for existing wine rows from their current `display_order` (so numbering stays sequential and matches original entry order). Existing anonymous labels (e.g. `Wine A`) are left untouched — only new bottles registered after this migration use the `Bottle N` label.
4. Make `bottle_number` required now that every row has a value.
5. Seed each existing session's `next_bottle_number` counter from its current highest bottle number, so the next bottle registered continues the sequence instead of restarting at 1.
6. Add the `unique (session_id, bottle_number)` constraint, now that step 3 guarantees it will hold.
7. Validate the `host_guest_id` foreign key added earlier (existing sessions simply have it `null` — they never had a host participant record, which is fine; that field only matters for new sessions).

Existing sessions never gain a `host_guest_id` retroactively (there's no way to know, after the fact, which existing guest row — if any — was "the host"), and their host continues to manage them exactly as before, via the host token. This only affects the *new* host-as-participant flow for sessions created after the migration.

## Migrating for the new scoring model, grape/blend, and price-band removal

Re-running `supabase/schema.sql` (same paste-and-run action as always — see step 4 above) also brings an existing project up to date for this update. It is safe to re-run on a project that's already current (every statement is a no-op in that case) and safe to run on a project still on the older bottle-registration schema (both migrations apply in the correct order in one pass). In order, the new statements:

1. Add a nullable `grape_blend_mode` column (`'single' | 'blend' | null`) to both `wines` and `wine_guesses`. Existing rows get `null`, which the app treats as "legacy/unknown" everywhere — scoring falls back to a plain alias-aware text comparison rather than guessing a mode, and the registration/guess forms default an edited legacy bottle or in-progress guess to "single" purely as a sensible starting point for further edits.
2. Drop the `not null` constraint on `wines.price_band` (already-nullable on `wine_guesses.price_band_guess`, unchanged). Existing price-band values are left exactly as they are; new bottles and guesses simply never set it. The columns themselves are not dropped — see "Data model notes" in the README.
3. Replace `register_bottle`, `update_bottle`, and `upsert_wine_guess` with new signatures (price-band parameter removed, grape-blend-mode parameter added). The file explicitly `drop function if exists`s the old signatures first — this is a schema change, not a data change, and does not touch any stored bottle/guess rows.
4. Update `get_registration_state` and `get_guest_session_state` to return `grapeBlendMode`/`grapeBlend` instead of `grapeStyle`, and to stop returning price band.
5. Append `grape_blend_mode` as a new trailing column on the `guest_visible_wines` view (Postgres only allows appending columns via `CREATE OR REPLACE VIEW`, never reordering or removing them — `price_band` stays exactly where it is, just unused by the app).

**Nothing here is destructive.** No column is dropped, no stored value is rewritten or deleted, and every RPC signature change only affects *new* calls made by the updated frontend — it has no effect on data already in the database. The frontend and this schema file must be deployed together, though, since the frontend's `guestActions.ts` calls the new RPC parameter names.

### Why `country`/`region` store a name, not an ISO code

The spec for this update suggested preferring a stable canonical *code* (e.g. ISO 3166-1 alpha-2) for country, "if that fits the current architecture." This project stores the canonical **display name** instead (e.g. `"France"`, not `"FR"`), in the same `country`/`region` text columns that already held free text before this update. The reasons:

- There's no `countries`/`regions` table with a foreign key here — country/region have always been, and remain, plain text columns compared via the same lenient text-normalisation matcher used for producer/wine-cuvée everywhere else. Storing a code would need a second, parallel comparison path (resolve code → name for display, resolve legacy free text → code for scoring) purely to bridge old and new data.
- A private, single-event app with a static ~15-country list gets essentially no benefit from a code layer (no i18n, no external API, no large-scale lookup), while a code/name mismatch between an old free-text bottle ("France") and a new guess ("FR") is a real and easy-to-introduce bug class.
- Storing the name directly means the stored value *is* the display value — no lookup step, no risk of the two drifting apart.

`lib/wineReferenceData.ts` still keeps a lightweight internal `code` alongside each grape's canonical value (not country/region) purely as stable option-list identity; it is never persisted.

## Migrating for wine style and host-controlled tasting order

Re-running `supabase/schema.sql` (same paste-and-run action as always) also brings an existing project up to date for this update. Safe to re-run on a project that's already current, and safe on a project still missing this feature — every statement is written to be a no-op where it's already applied. In order, the new statements:

1. Add a nullable `wine_style` column to `wines`. Existing rows get backfilled to `'other'` (they predate this field and have no real classification on file), then the column is made `not null` and check-constrained to `('bubbles', 'white', 'red', 'sweet', 'other')`.
2. Add a nullable `tasting_order` column to `wines`. Existing rows get backfilled from their current `display_order` (0-based → 1-based, so it starts out matching registration order), then the column is made `not null` and given a `unique (session_id, tasting_order)` constraint.
3. Add a new `reorder_wines(p_public_id, p_host_token, p_wine_ids)` function — host-only, registration-only, and only accepts a full permutation of every bottle currently in the session (rejects a payload that's missing a bottle, repeats an id, or includes an id from another session). The array position becomes each bottle's new `tasting_order`; `bottle_number` is never touched.
4. Replace `register_bottle` and `update_bottle` with new signatures (a `p_wine_style` parameter added) — the file explicitly `drop function if exists`s the old signatures first, same pattern as the earlier grape/blend-mode migration.
5. `delete_bottle` now also locks the session row and re-packs the remaining bottles' `tasting_order` into a contiguous 1..N sequence after a delete, so a gap left by the deleted bottle never persists.
6. `get_host_session` now also returns each bottle's `wineStyle` and `tastingOrder`, ordered by `tastingOrder` instead of `bottleNumber` — still only ever the anonymous fields, never country/region/producer/vintage/notes/contributor identity.
7. `get_registration_state`'s `myBottles` now also returns `wineStyle` for the calling participant's own bottles.
8. `get_guest_session_state`'s `wines` array is now ordered by `tastingOrder` (falling back to `bottleNumber` for any tie) instead of `bottleNumber`, so guess entry follows the host's arranged tasting order.
9. Append `wine_style` (reveal-gated, same masking as every other answer-key column) and `tasting_order` (**not** reveal-gated — the serving sequence itself is meant to be visible throughout, only the style/identity of each bottle is secret pre-reveal) as new trailing columns on the `guest_visible_wines` view.

**Nothing here is destructive.** No column is dropped, no stored value is rewritten or deleted beyond the one-time, safe-default backfill described above, and every RPC signature change only affects *new* calls made by the updated frontend. The `wine_style`/`tasting_order` columns are deliberately **not** added to the anon column grant on `wines` — they're only ever readable through `get_host_session` (host-token-gated) or `guest_visible_wines` (reveal-gated for style), exactly like every other answer-key field.

## Migrating for structured grape/blend components

Re-running `supabase/schema.sql` also brings an existing project up to date for the structured blend multi-select. Safe to re-run on a project that's already current. In order, the new statements:

1. Add a nullable `grape_blend_components` JSONB column to both `wines` and `wine_guesses`. No backfill — existing blend rows simply have no structured record and fall back to re-parsing their flattened `grape_style`/`grape_style_guess` text when their edit form loads (client-side only; nothing server-side re-reads or rewrites old rows).
2. Add a new `validate_grape_blend_components(p_mode, p_components)` helper function — not a client-facing RPC (no anon grant of its own), just shared shape/length/duplicate validation called from `register_bottle`, `update_bottle`, and `upsert_wine_guess`. Rejects a payload whose mode/component combination is inconsistent (e.g. components provided for `'single'` mode), a non-object payload, a `selectedGrapes` array that isn't an array, more than 20 entries, an entry over 100 characters, case-insensitive duplicate entries, or `otherGrapesText` over 500 characters.
3. Replace `register_bottle` and `update_bottle` with new signatures (a `p_grape_blend_components` parameter added) and `upsert_wine_guess` with a new signature (same addition) — the file explicitly `drop function if exists`s the old signatures first, same pattern as every prior signature change in this file. Guess entry's validation stays lenient (a `null`/empty payload is always accepted, since a guess can be incomplete mid-draft); only a genuinely malformed or mode-inconsistent payload is rejected.
4. `get_registration_state`'s `myBottles` and `get_guest_session_state`'s `guesses` now also return `selectedGrapes`/`otherGrapesText`, read out of the new JSONB column — still only ever the calling participant's own bottles/guesses, exactly like every other field those two functions already returned.

**Nothing here is destructive**, and nothing here changes what's exposed to `anon` or in any pre-reveal view: `grape_blend_components` is not added to the anon column grant on `wines`/`wine_guesses`, not added to `guest_visible_wines`, and only ever readable through the same token-gated RPCs that already governed every other answer-key/guess field. (`revealed_wine_guesses` is a `select g.*` view that will incidentally include the new column once a guess has one — same as every other guess column, and already reveal-gated by that view's existing `where s.status = 'revealed'` clause, so this doesn't change its security posture.)

## Migrating for tasting modes (full blind vs. course-by-course reveal)

Re-running `supabase/schema.sql` also brings an existing project up to date for host-selectable tasting modes (see README "Tasting modes"). Safe to re-run on a project that's already current. In order, the new statements:

1. Add `tasting_sessions.tasting_mode` (nullable at first), backfill every existing row to `'full_blind'` — the only format that existed before this feature — then make it `not null` and check-constrained to `('full_blind', 'course_reveal')`.
2. Add nullable `wines.revealed_at` and `wine_guesses.locked_at`, both with no backfill: every bottle/guess that existed before this feature correctly starts "not individually revealed/locked" (`full_blind` sessions never set either column at all — their answer keys become visible purely via the existing `tasting_sessions.status = 'revealed'` transition, unchanged). Add an index on `wines(session_id, revealed_at, tasting_order)` for the "earliest unrevealed bottle" lookup every new function below performs.
3. `create_tasting_session` gains a required `p_tasting_mode` parameter (old signature dropped first, same pattern as every prior change).
4. `reveal_tasting_session` (the existing one-shot final reveal) now rejects `course_reveal` sessions — that mode reaches `revealed` only by revealing its final bottle through the new `reveal_bottle` function below, never by skipping straight to a full reveal.
5. New `reveal_bottle(p_public_id, p_host_token, p_wine_id)` — host-only. Validates the host token, that the session is `course_reveal` and `collecting`, that the wine belongs to the session, isn't already revealed, and **is** the current active bottle (earliest unrevealed by `tasting_order`) — so a host can never skip ahead, go out of order, or double-reveal. Sets `revealed_at`; if that was the last unrevealed bottle, also flips the session to `revealed`.
6. New `get_active_bottle_state(p_guest_token)`, `lock_wine_guess(p_guest_token, p_wine_id)`, and `get_revealed_bottle(p_guest_token, p_wine_id)` — all participant-facing, `course_reveal`-only. The first two only ever expose the active bottle's anonymous label/position and the caller's own guess — never an answer-key field. `get_revealed_bottle` is the **only** path to a bottle's full answer key, contributor identity, and other participants' guesses during `collecting`, and it hard-rejects (`bottle_not_revealed`) unless that specific wine's `revealed_at` is already set — it deliberately excludes any guess that isn't `locked_at is not null`, so a participant who never finalized their guess correctly shows as "no submission," never a fabricated score.
7. `upsert_wine_guess` gains two additional guards, both no-ops for `full_blind` (which never sets `locked_at` and has never restricted which bottle a guest may guess): a `course_reveal` guess may only target the current active bottle, and a guess that's already `locked_at is not null` can no longer be edited by autosave.
8. `get_host_session` now also returns `tastingMode`, each wine's `revealedAt`, and (only when `course_reveal` and `collecting`) an `activeBottle` summary — anonymous code, tasting-order position, and an aggregate `submittedCount`/`totalParticipants`. Never another participant's individual guess.
9. `tasting_sessions.tasting_mode` is added to the anon column grant, alongside the pre-existing `status`/`title`/etc. It's non-sensitive session metadata (already shown on the host control page), and the shared results page (`app/results/[publicId]/page.tsx`) needs to read it directly to decide which submission-building path to use (see the bug note below).

**Two bugs found and fixed during live verification of this feature** (both in application code, not `schema.sql` — no further SQL changes needed beyond the grant in step 9 above):

- The shared results page (`app/results/[publicId]/page.tsx`) built its guest list by filtering on `guests.completed_at !== null` — a `full_blind`-only signal (set once, at the end of a whole tasting). `course_reveal` guests never set it; they finalize per-bottle via `wine_guesses.locked_at` instead (see point 6 above). Left unfixed, every finished `course_reveal` tasting's final report would have shown **zero guesses for every wine**. Fixed by adding `buildCourseRevealSubmissions` (`lib/supabase/mappers.ts`), which includes a guest if *any* of their guesses are individually locked, using only their locked guesses — a guest who skipped one bottle still gets credit for the ones they submitted.
- `HostControlClient.tsx`'s `handleStartTasting` flipped `status` to `"collecting"` but didn't refetch `activeBottle` (which only exists once status is `"collecting"`), so a host starting a `course_reveal` tasting would briefly see "Every bottle has been revealed" instead of the first active bottle, until the next 5-second poll caught up. Fixed by refetching `/api/host/session` immediately after a successful start.

**Nothing here is destructive**, and — deliberately — **`guest_visible_wines` and `revealed_wine_guesses` are not touched at all**. Every course-reveal read goes through the five new/changed functions above instead of layering conditions onto those two shared views, so `full_blind` sessions (and every existing results/registration code path) are provably unaffected by this migration.

**`wine_guesses` still has no anon column grant and no Realtime publication membership**, same as before this feature, and that's intentional: Supabase Realtime's `postgres_changes` broadcasts a full row per the table's RLS policy, independent of column-level `GRANT`s — so making the host's live "N of M submitted" count realtime would require a permissive `wine_guesses` SELECT policy, which would then broadcast guess *content* (ratings, country/region guesses) to every connected participant, not just a count. That count is refreshed by short client-side polling instead (see `components/host/HostControlClient.tsx`); `wines`/`tasting_sessions` changes remain realtime-driven as before, and are only ever used as a "something changed, refetch through a secure RPC" signal — the realtime payload's own field values are never read or displayed.

### Why there's no free-text "Other region" input

The spec allowed adding a labelled, separately-persisted "Other region" free-text field if a plain `Other / Unknown` region option proved insufficient. This update does not add one: `Other / Unknown` is offered as a normal selectable region for every country (and is the *only* region for the `Other / Unknown` country), which keeps every new bottle and guess in the fully controlled vocabulary the rest of this feature relies on, with no extra scoring-comparison path to maintain. If this turns out to be too coarse in practice (e.g. a host wants to note *which* obscure region), a dedicated free-text add-on remains straightforward to layer on later.

## Migrating for seen tasting mode

Re-running `supabase/schema.sql` also brings an existing project up to date for the third tasting mode, **seen tasting** (see README "Tasting modes"). Safe to re-run on a project that's already current, and this migration adds **no new columns at all** — a seen rating reuses the existing `wine_guesses` table exactly as it already is. In order, the new statements:

1. Widen the `tasting_sessions_tasting_mode_check` constraint (drop and recreate, same pattern used for every other check-constraint widening in this file) to also allow `'seen'`. Existing `full_blind`/`course_reveal` rows are untouched.
2. `create_tasting_session`'s mode validation now also accepts `'seen'`.
3. `reveal_tasting_session` (the full_blind-only one-shot reveal) now rejects *any* mode other than `full_blind` — previously it only excluded `course_reveal`. A `seen` session can only reach `revealed` through the new `end_seen_tasting` below, mirroring how `course_reveal` can only get there through `reveal_bottle`.
4. New `get_seen_tasting_state(p_guest_token)` — participant-facing. Returns every bottle's full details (visible to everyone once `seen` reaches `collecting`) plus the caller's own rating/confidence/note for each — never another participant's. Rejects during `registration` (`registration_closed`), so a participant can't peek at bottle identities before the host starts tasting.
5. New `upsert_seen_rating(p_guest_token, p_wine_id, p_rating, p_confidence, p_tasting_note)` — participant-facing. Deliberately narrow: no identification-guess parameters at all, so there's no way to write blind-guess content through this path. Requires a non-null rating (`rating_required`) and `collecting` status (`session_not_collecting` otherwise, covering both "not started yet" and "already ended"); never restricts which bottle or how many times it can be called, unlike `course_reveal`'s `lock_wine_guess`.
6. New `end_seen_tasting(p_public_id, p_host_token)` — host-only. Validates the host token, that the session is `seen` and `collecting`, then flips it to `revealed`. Strict about status (unlike `reveal_tasting_session`'s idempotent success) — calling it again on an already-revealed session is rejected, not silently accepted.
7. `get_host_session` now also returns a `seenProgress` object (only when `seen` and `collecting`): `ratersCount`/`totalParticipants` and `ratingsSubmitted`/`totalPossibleRatings`. Never an individual participant's rating.
8. `tasting_sessions.tasting_mode`'s existing anon column grant (added for course-reveal mode) already covers `seen` — no grant changes needed there. Three new `grant execute` statements for the functions in steps 4-6.

**`guest_visible_wines` and `revealed_wine_guesses` need no changes at all** — both already unmask purely based on `tasting_sessions.status = 'revealed'`, with no mode-specific logic, so seen tasting's post-reveal results page reads through them exactly as full_blind's already does.

### Why seen ratings reuse `wine_guesses` instead of a new `wine_ratings` table

A seen rating and a blind guess are both, structurally, "one row per `(guest, wine)`, with a rating" — `wine_guesses` already has the `rating`/`confidence`/`tasting_note` columns a seen rating needs, the unique `(guest_id, wine_id)` constraint, and the indexes for looking rows up by guest/wine/session. A separate table would have meant re-declaring all of that, plus extra joins anywhere a query needed both kinds of rows together, for no real isolation benefit — `upsert_seen_rating` and `get_seen_tasting_state` are already strictly mode-gated (`raise exception 'invalid_tasting_mode'` for anything but `seen`) and never read or write a single identification-guess column. The one thing this approach requires — never fabricating blank identification values to satisfy old constraints — is already true today: those columns either have a table-level default (`''`) or are nullable, exactly the same "untouched draft" state a guess row already has before a full_blind/course_reveal participant fills anything in.

## Migrating for the Tasting Archive

Re-running `supabase/schema.sql` also brings an existing project up to date for the Tasting Archive (see README "Tasting archive"). This is the smallest migration in this file so far — **no new tables, no new columns, no new check constraints, no RLS changes.** In order, the only change is:

1. `get_guest_session_state`'s returned `session` jsonb object gains three additive fields: `id` (the session's internal uuid), `createdAt`, and `participantCount` (a `count(*)` over `guests` for that session). Every existing caller of this function already ignores unknown jsonb keys, so this is purely additive — nothing that already worked can break.

That's the entire migration. The archive's own server route (`app/api/archive/lookup`) calls this RPC and the pre-existing `get_host_session` RPC exactly as they already exist otherwise, and reads the same `guest_visible_wines`/`revealed_wine_guesses`/`guests` views the results page already reads once a session is `revealed` — none of which needed any change for this feature.

## Setting up Supabase Auth (accounts)

This adds an **optional** passwordless account layer (see README "Accounts") alongside the existing host-token/guest-token model — nothing here is required to host or join a tasting. Re-running `supabase/schema.sql` brings an existing project up to date; it is additive and safe to re-run, like every migration in this file.

### 1. Run the SQL (in this exact order — all in `supabase/schema.sql`, already ordered correctly if you paste the whole file)

1. The grants block near the end of the file now revokes `tasting_sessions`/`wines`/`guests`/`wine_guesses` privileges from **both** `anon` and `authenticated` (previously `anon` only), then re-grants the same narrow column/view/RPC access to **both** roles. This must run before anyone can sign in — see "Security model, in plain English" below for why.
2. `public.profiles` is created (`id` referencing `auth.users(id)`, `email`, `display_name`, `created_at`, `updated_at`), with RLS enabled and two policies: a user may `select`/`update` only their own row (`auth.uid() = id`). No `insert`/`delete` policy exists for any client role.
3. `public.normalize_profile_display_name()` (trims/nullifies `display_name`) is attached as a `before insert or update` trigger, and a `profiles_display_name_length` check constraint caps it at 60 characters — both enforced in Postgres regardless of what a client sends.
4. `public.handle_new_user()` (`security definer`) is attached as an `after insert on auth.users` trigger, so a `profiles` row is created automatically (idempotently — `on conflict (id) do nothing`) the moment someone completes their first email sign-in.

No table was renamed, no existing column was removed, and no existing RLS policy on `tasting_sessions`/`wines`/`guests`/`wine_guesses` changed — only the `authenticated` role's grants, which did not exist as a usable role in this project before this feature.

### 2. Dashboard configuration

In your Supabase project dashboard:

- **Authentication → Providers → Email**: should already be enabled by default. No password is required for this app's flow — email OTP is a separate code path from Supabase's password-based email sign-in, so nothing else needs disabling.
- **Authentication → URL Configuration → Site URL**: set to your app's base URL (e.g. `http://localhost:3000` for local dev, your production domain otherwise). This app's OTP flow does not itself pass a redirect URL anywhere, but Supabase still uses Site URL for rate-limit scoping and as the default in its email templates.
- **Authentication → URL Configuration → Redirect URLs**: not required for the OTP flow implemented here. Only add entries here if you later enable the magic-link fallback described below.
- **Authentication → Email Templates → Magic Link** (this is the template Supabase's `signInWithOtp` uses, in both magic-link and OTP-code projects): edit the body to surface `{{ .Token }}` as a plain code, since the stock template only shows a clickable link by default. Recommended:
  - Subject: `Your Blind Cellar sign-in code`
  - Body: `Use this code to keep your private tasting record: {{ .Token }}`
  Without this edit, users would only receive a clickable link, not a typeable code, and this app's UI asks for the 6-digit code.
- **Authentication → Rate Limits**: Supabase's built-in OTP rate limits (requests per hour per email/IP) are the authoritative anti-abuse control — this app additionally disables the "Send sign-in code"/"Send a new code" buttons while a request is pending and imposes a 30-second client-side resend cooldown, but that UI cooldown is a courtesy, not the real enforcement.
- **Project Settings → Auth → SMTP**: Supabase's built-in email sending is fine for development and low volume, but is rate-limited and not intended for production traffic. For a real deployment, configure a custom SMTP provider (e.g. Postmark, SendGrid, Resend) under Project Settings → Auth → SMTP Settings so sign-in emails are reliably delivered.

### 3. OTP vs. magic link

This app implements **email OTP** (a numeric code — 6 digits by default, but the app accepts whatever length your project's Auth settings issue, up to 8 — verified via `supabase.auth.verifyOtp({ email, token, type: "email" })`) as the primary and only flow, not a magic link. Reasons:

- OTP needs no callback route and no `emailRedirectTo`/Redirect URL configuration — the whole sign-in happens through two direct browser calls (`signInWithOtp`, then `verifyOtp`), which is simpler and has fewer places for a misconfigured redirect to go wrong.
- A single page (`/account/sign-in`) can hold both steps (email, then code) with no server round trip beyond the two Supabase calls.

To add a magic-link fallback instead or in addition later:

1. Call `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${siteUrl}/auth/callback` } })`.
2. Add `/auth/callback` as a Route Handler that calls `supabase.auth.exchangeCodeForSession(code)` using a server-side Supabase client (cookie-writable — a Route Handler, not a Server Component), then redirects to a validated return path (`lib/authRedirects.ts` already has `resolveSafeReturnPath` for this).
3. Add that exact callback URL to **Authentication → URL Configuration → Redirect URLs** in the dashboard.
4. Keep using `resolveSafeReturnPath`/`isSafeReturnPath` for the post-sign-in destination either way — the open-redirect guard is independent of which Auth flow delivers the user back to the app.

## Migrating for account-linked tasting records

Builds on "Setting up Supabase Auth (accounts)" above — requires that section applied first. Re-running the full `supabase/schema.sql` brings an existing project up to date; every statement here is additive/idempotent.

### 1. Run the SQL (in this order — already correct if you paste the whole file)

1. **`public.account_tasting_records`** is created: `id`, `user_id` (→ `auth.users`, cascade delete), `session_id` (→ `tasting_sessions`, cascade delete), `role` (`'host'` or `'participant'`), `participant_id` (→ `guests`, cascade delete — see the note below on why this differs from the commonly-suggested `set null`), `claim_source` (`'automatic'` or `'browser_claim'`), `claimed_at`, `created_at`. A check constraint enforces the shape: a `'host'` row always has a null `participant_id`; a `'participant'` row always has a non-null one.
2. **Two partial unique indexes** are created: `account_tasting_records_host_uniq` on `(user_id, session_id) where role = 'host'`, and `account_tasting_records_participant_uniq` on `(user_id, session_id, participant_id) where role = 'participant'` — these are what make every insert idempotent (see the RPC below). Plus plain indexes on `user_id`, `session_id`, and `(user_id, created_at desc)` for archive retrieval.
3. **RLS is enabled**, with exactly one policy: `account_tasting_records_select_own`, `for select using (auth.uid() = user_id)`. There is no insert, update, or delete policy — see "RLS policy summary" below for why.
4. **Grants**: `revoke all ... from anon, authenticated` followed by `grant select ... to authenticated` only. `anon` gets nothing at all on this table.
5. **`claim_account_tasting_record(p_public_id uuid, p_role text, p_token text, p_claim_source text) returns void`** — `SECURITY DEFINER`, validates `auth.uid()` is present, validates `p_token` against the exact session (host: hash comparison against `host_token_hash`; participant: `guest_token` looked up *scoped to that session's id*, not just globally unique — this is what stops a valid token for a different session from being usable here), enforces `status = 'revealed'` only when `p_claim_source = 'browser_claim'`, then inserts with `on conflict ... do nothing` against the matching partial index.
6. **Grant**: `grant execute on function public.claim_account_tasting_record(uuid, text, text, text) to authenticated` — deliberately **not** granted to `anon` (it always requires `auth.uid()`, so an anon call would only ever raise `not_authenticated`).

### 2. Verification queries

Run these in the SQL Editor after applying the migration:

```sql
-- Table and constraints exist
select conname, contype from pg_constraint where conrelid = 'public.account_tasting_records'::regclass;

-- Both partial unique indexes exist
select indexname, indexdef from pg_indexes where tablename = 'account_tasting_records';

-- RLS is on, and exactly one policy exists
select relrowsecurity from pg_class where relname = 'account_tasting_records';
select polname, polcmd from pg_policy where polrelid = 'public.account_tasting_records'::regclass;

-- anon has no privileges at all on this table
select grantee, privilege_type from information_schema.role_table_grants
where table_name = 'account_tasting_records';
```

The last query should show only `authenticated` with `SELECT` (table-level) — no `anon` row, and no `INSERT`/`UPDATE`/`DELETE` for either role.

### RLS policy summary

| Role | Select own rows | Select others' rows | Insert | Update | Delete |
|---|---|---|---|---|---|
| `anon` | No (no grant at all) | No | No | No | No |
| `authenticated` | Yes (`auth.uid() = user_id`) | No | No (no policy) | No (no policy) | No (no policy) |

Writes only ever happen inside `claim_account_tasting_record`, which runs as the function owner (bypassing the missing insert policy by design) after validating the actual host/guest token — never through a direct client insert, no matter how privileged the caller's session looks. This is a deliberately narrower pattern than "authenticated users may insert their own rows," because a session id alone is public/guessable-adjacent (it's a UUID in a URL) — the token is the only thing that should ever be sufficient to create a link.

### Why `participant_id` uses `on delete cascade`, not `on delete set null`

A commonly-suggested version of this schema uses `on delete set null` for `participant_id`, matching how other "soft" foreign keys in this app behave. That doesn't work here: the check constraint requires every `role = 'participant'` row to have a non-null `participant_id`, so a `set null` cascade would leave a row that violates its own table's constraint — which fails the deleting transaction, effectively blocking the guest-row deletion entirely. `cascade` avoids that: if the specific participant record a claim points to is ever gone, the claim itself is meaningless and is removed with it. This app has no guest-deletion feature today, so this is a forward-safety choice, not a behavior change.

## Bottle numbering and concurrency

Every bottle gets a permanent, sequential number starting at 1 per session, and a deleted number is never reused. This is enforced entirely in `register_bottle` (see `supabase/schema.sql`):

- `tasting_sessions.next_bottle_number` is a monotonically-increasing counter — it only ever goes up, even when a bottle is deleted. This is what actually prevents number reuse: if bottle 3 is deleted, the counter is still sitting at 4, so the next registration gets 4 regardless of what remains in the `wines` table. (An earlier, naive approach of computing `max(bottle_number) + 1` would have "forgotten" the deletion and handed out 3 again — that's why a dedicated counter column exists instead.)
- Before reading or incrementing that counter, `register_bottle` runs `select ... from tasting_sessions where id = ... for update`, which takes a row lock on the session for the rest of that function call. If two participants register a bottle for the same session at the same instant, the second call simply blocks until the first one's transaction commits, then proceeds with the now-updated counter. This makes the read-then-increment atomic per session without needing application-level retries.
- The `unique (session_id, bottle_number)` database constraint remains as a hard backstop — it should never actually fire given the locking above, but it's there in case this function is ever bypassed or modified incorrectly.

## Security model, in plain English

Every tasting workflow (hosting, joining, registering bottles, guessing, rating, viewing a revealed report) works with no login at all — that has not changed. Instead:

- **Host token**: when a host creates a tasting, the server generates a long random token, hashes it, and stores only the hash in `tasting_sessions.host_token_hash`. The raw token is returned once and saved in that browser's `localStorage`, and appears in the host management URL (`/host/[publicId]?token=...`). Anyone who has that exact URL can manage the tasting (see the participant list, start tasting, reveal results). Anyone who doesn't, can't — even if they know the public join code.
- **The host is also a participant.** Creating a session also creates a normal row in `guests` for the host, with its own random guest token, generated and returned in the same call. That token is stored in the same browser-storage slot a regular guest's token would use, so the host's own bottle registration and guess entry go through the exact same code paths and RPC functions as anyone else's — there is no special-cased "host bottle" or "host guess" anywhere, which is also what guarantees the host can never be double-counted in scoring: they're just one row in `guests`, like everyone else.
- **Guest token**: when anyone (including the host) joins, Postgres generates a random token for them and returns it once. It's saved in that participant's browser `localStorage` and is required for every write — registering/editing/deleting a bottle, autosaving a guess, final submit. It's what lets someone resume their form on the same phone without re-entering their name, and it's what stops one participant from touching another's bottles or guesses.
- **No service-role key, ever.** Every privileged tasting read or write goes through a Postgres function (`SECURITY DEFINER`) that checks the host/guest token *inside the database* before doing anything. The app's Next.js server and browser code only ever use the public **anon** key — this remains true after adding Supabase Auth, which also never uses a service-role key (see "Accounts and the `authenticated` role" below). All four tasting tables have Row Level Security enabled, and neither `anon` nor `authenticated` has direct table grants beyond a few already-public columns (used only so Realtime has something safe to broadcast — for `wines`, that's just `id`, `session_id`, `bottle_number`, `anonymous_code`, `created_at`; every answer-key column and `contributor_guest_id` are excluded). Everything else — the actual wine answer keys, contributor identity, everyone's guesses — is only reachable through the views/functions in `schema.sql`, which enforce the "don't leak the answer key or contributor identity before reveal" rule.
- **Accounts and the `authenticated` role**: Supabase Auth (see "Setting up Supabase Auth (accounts)" above) is a wholly separate, optional identity layer — signing in never replaces a host/guest token check anywhere, and no tasting RPC gained an `auth.uid()` check. What *did* need attention: before Auth existed, no request could ever carry an `authenticated`-role JWT, so this file had only ever revoked and re-narrowed `anon`'s default privileges, never `authenticated`'s. A brand-new Supabase project grants both roles broad default privileges on every new table, so the moment real sign-in became possible, `authenticated` could have retained that untouched default access — including, in principle, `host_token_hash` and `guest_token`, which RLS's row-level `using (true)` policies do not hide (RLS filters rows, not columns; the column-level `grant select (…)` statements are what actually hide those two). The grants block now explicitly revokes-and-re-narrows `authenticated` exactly like `anon`, so a signed-in browser has exactly the same tasting-data access as an anonymous one — no more, no less. `public.profiles` (the one table an authenticated user *can* read/update) only ever holds `id`/`email`/`display_name`/timestamps — never a token, an OTP code, or any tasting data.
- **Host-only mutations run through Next.js Route Handlers** (`app/api/host/*`), not directly from the browser — this includes tasting-order reordering (`app/api/host/reorder-bottles`) and the host page's own re-fetch of its anonymous bottle list after a realtime change (`app/api/host/session`, since `wineStyle`/`tastingOrder` aren't in the narrow anon column grant on `wines` and can only be read back through the host-token-gated `get_host_session` RPC). This keeps the raw host token out of client-side calls hitting Supabase's REST endpoint directly, though the real enforcement is still the Postgres function itself checking the token hash.
- **The Tasting Archive (`/archive`, `app/api/archive/lookup`) introduces no new privilege at all** — it's a thin, bounded batch wrapper around `get_host_session`/`get_guest_session_state`, the same two token-validating RPCs the host control and guest tasting pages already call one at a time. It never accepts a bare session id with no token attached, never queries "every revealed session," and never returns a raw token in its response — only a minimized per-session summary (title, date, mode, counts, Wine of the Night, and the caller's own accuracy where applicable) for references the request already proved ownership of.
- **Account-linked tasting records (`public.account_tasting_records`, `claim_account_tasting_record`) also introduce no new privilege** — see "Migrating for account-linked tasting records" above for the full schema. The short version: the only write path re-validates the exact same host/guest token every other RPC already does, `auth.uid()` (never a client-supplied user id) decides whose row gets written, and the table has no insert/update/delete policy for any role at all — a signed-in user who merely knows or guesses a session id, with no valid token for it, can never create a link. Reading is plain RLS (`auth.uid() = user_id`), so "Your record" needs no token round trip at all — ownership of the *row* is what's being checked there, not ownership of a token.
- **Bug fixed in this revision**: the `guest_visible_wines` and `revealed_wine_guesses` views were previously declared with `security_invoker = true`. Combined with `wines`/`wine_guesses` having Row Level Security enabled but no SELECT policy for `anon`, that setting would have made these views return **zero rows for anon on a real Supabase project** — a security_invoker view evaluates RLS as the calling role, and anon was never granted any row-visibility on those tables directly. The fix is to not set `security_invoker` (the default, `false`, runs the view as its owner), so the view's own `CASE`/`WHERE` masking logic — not the caller's RLS — is what decides what anon sees. This was never caught before because the app had not yet been tested against a live Supabase project.

### Honest MVP limitations

- **Tokens are bearer credentials, not accounts.** Anyone who obtains a host or guest link (screenshot, shared clipboard, browser history on a shared device) has full access matching that role, for as long as the session exists. There's no way to revoke a token, log out, or rotate it.
- **No rate limiting.** The RPC functions don't currently throttle repeated calls at a token, so a determined script could hammer `register_bottle` or `upsert_wine_guess` — acceptable for a private dinner-party tool, not for anything public-facing.
- **Realtime + column privileges is one layer of defense, not independently verified against every Supabase version.** We rely on documented Supabase column-level privileges to keep `host_token_hash`, `guest_token`, `contributor_guest_id`, and all answer-key columns out of anon reads (including Realtime broadcasts). The tables/columns granted to anon at all are deliberately minimal; the actually sensitive data never has any anon table grant, masked/gated entirely through views and RPC functions instead — that's the layer we'd trust first if this were ever audited.
- **`display_name` uniqueness is only enforced per-session**, via a generated lower/trimmed column — it doesn't handle full Unicode normalization (accents, punctuation) the way `lib/normalize.ts`'s scoring comparisons do; "Alice" and "Álice" would currently be treated as different names.
- **No migration framework.** `supabase/schema.sql` is a single hand-maintained file with inline "MIGRATION-SENSITIVE" comments rather than a sequence of versioned migration files. That's workable for one feature step; a project with more history would want real migrations.
- **The Tasting Archive is pinned to one browser, with no server-side record of "this browser's archive."** It's reconstructed entirely from whichever host/guest tokens are still sitting in that browser's `localStorage`; clearing site data, switching devices, or using a different browser loses access to it, with no recovery path in this MVP (see README "Tasting archive"). There is also no rate limiting on `POST /api/archive/lookup` beyond the hard cap on how many references one request can contain — the same "no rate limiting" limitation above applies here too.
- **Signing in by itself still does not migrate anything.** What changed since the "Accounts" phase: a signed-in user can now explicitly add ("claim") an eligible historic browser-linked session to their account, and future sessions they host/join while signed in link automatically — see "Migrating for account-linked tasting records" above and README "Account-linked tasting records". What's still deliberately absent: nothing is migrated *silently* just because someone signs in, there's no "claim everything on this browser at once" bulk action, and a session can only ever be claimed from the exact browser that still holds its host/guest token — there is no recovery path for a browser-only session whose token is gone.
- **No un-linking or account-merging in this phase.** Once a session is linked to an account (automatically or via claim), there's no UI to remove that association, and there's no way to merge two different signed-in identities' records together. Both are believed to be safe, additive follow-ups once there's a clear product need — see README "Recommended next features".
- **No delete-account flow in this phase.** `/account` offers sign-out but not account deletion. Since `profiles.id` references `auth.users(id) on delete cascade`, deleting a user from the Auth dashboard already cleanly removes their `profiles` row (and, by the same cascade, their `account_tasting_records` rows) with no orphaned data — a self-service delete-account UI is a small, safe addition later, just out of scope for this pass; it was not omitted for any data-integrity reason.
- **Account email delivery depends on Supabase's built-in email sending unless a custom SMTP provider is configured** (see "Setting up Supabase Auth (accounts)" above) — the built-in sender is rate-limited and intended for development, not production volume.

If you need real accounts, audit logs, or token revocation later, that's a distinct follow-up step (see the README's "Recommended next features").
