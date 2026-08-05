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
- 17 RPC functions — session/host (`create_tasting_session`, `get_host_session`, `start_tasting_session`, `reveal_tasting_session`, `reorder_wines`, `reveal_bottle`), participant identity (`join_tasting_session`), bottle registration (`get_registration_state`, `register_bottle`, `update_bottle`, `delete_bottle`), and tasting (`get_guest_session_state`, `upsert_wine_guess`, `complete_guest_submission`, `get_active_bottle_state`, `lock_wine_guess`, `get_revealed_bottle`)
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

## Bottle numbering and concurrency

Every bottle gets a permanent, sequential number starting at 1 per session, and a deleted number is never reused. This is enforced entirely in `register_bottle` (see `supabase/schema.sql`):

- `tasting_sessions.next_bottle_number` is a monotonically-increasing counter — it only ever goes up, even when a bottle is deleted. This is what actually prevents number reuse: if bottle 3 is deleted, the counter is still sitting at 4, so the next registration gets 4 regardless of what remains in the `wines` table. (An earlier, naive approach of computing `max(bottle_number) + 1` would have "forgotten" the deletion and handed out 3 again — that's why a dedicated counter column exists instead.)
- Before reading or incrementing that counter, `register_bottle` runs `select ... from tasting_sessions where id = ... for update`, which takes a row lock on the session for the rest of that function call. If two participants register a bottle for the same session at the same instant, the second call simply blocks until the first one's transaction commits, then proceeds with the now-updated counter. This makes the read-then-increment atomic per session without needing application-level retries.
- The `unique (session_id, bottle_number)` database constraint remains as a hard backstop — it should never actually fire given the locking above, but it's there in case this function is ever bypassed or modified incorrectly.

## Security model, in plain English

This is a no-login MVP — nobody creates an account. Instead:

- **Host token**: when a host creates a tasting, the server generates a long random token, hashes it, and stores only the hash in `tasting_sessions.host_token_hash`. The raw token is returned once and saved in that browser's `localStorage`, and appears in the host management URL (`/host/[publicId]?token=...`). Anyone who has that exact URL can manage the tasting (see the participant list, start tasting, reveal results). Anyone who doesn't, can't — even if they know the public join code.
- **The host is also a participant.** Creating a session also creates a normal row in `guests` for the host, with its own random guest token, generated and returned in the same call. That token is stored in the same browser-storage slot a regular guest's token would use, so the host's own bottle registration and guess entry go through the exact same code paths and RPC functions as anyone else's — there is no special-cased "host bottle" or "host guess" anywhere, which is also what guarantees the host can never be double-counted in scoring: they're just one row in `guests`, like everyone else.
- **Guest token**: when anyone (including the host) joins, Postgres generates a random token for them and returns it once. It's saved in that participant's browser `localStorage` and is required for every write — registering/editing/deleting a bottle, autosaving a guess, final submit. It's what lets someone resume their form on the same phone without re-entering their name, and it's what stops one participant from touching another's bottles or guesses.
- **No Supabase Auth, no service-role key**: every privileged read or write goes through a Postgres function (`SECURITY DEFINER`) that checks the token *inside the database* before doing anything. The app's Next.js server and browser code only ever use the public **anon** key. All four tables have Row Level Security enabled, and the `anon` role has no direct table grants beyond a few already-public columns (used only so Realtime has something safe to broadcast — for `wines`, that's just `id`, `session_id`, `bottle_number`, `anonymous_code`, `created_at`; every answer-key column and `contributor_guest_id` are excluded). Everything else — the actual wine answer keys, contributor identity, everyone's guesses — is only reachable through the views/functions in `schema.sql`, which enforce the "don't leak the answer key or contributor identity before reveal" rule.
- **Host-only mutations run through Next.js Route Handlers** (`app/api/host/*`), not directly from the browser — this includes tasting-order reordering (`app/api/host/reorder-bottles`) and the host page's own re-fetch of its anonymous bottle list after a realtime change (`app/api/host/session`, since `wineStyle`/`tastingOrder` aren't in the narrow anon column grant on `wines` and can only be read back through the host-token-gated `get_host_session` RPC). This keeps the raw host token out of client-side calls hitting Supabase's REST endpoint directly, though the real enforcement is still the Postgres function itself checking the token hash.
- **Bug fixed in this revision**: the `guest_visible_wines` and `revealed_wine_guesses` views were previously declared with `security_invoker = true`. Combined with `wines`/`wine_guesses` having Row Level Security enabled but no SELECT policy for `anon`, that setting would have made these views return **zero rows for anon on a real Supabase project** — a security_invoker view evaluates RLS as the calling role, and anon was never granted any row-visibility on those tables directly. The fix is to not set `security_invoker` (the default, `false`, runs the view as its owner), so the view's own `CASE`/`WHERE` masking logic — not the caller's RLS — is what decides what anon sees. This was never caught before because the app had not yet been tested against a live Supabase project.

### Honest MVP limitations

- **Tokens are bearer credentials, not accounts.** Anyone who obtains a host or guest link (screenshot, shared clipboard, browser history on a shared device) has full access matching that role, for as long as the session exists. There's no way to revoke a token, log out, or rotate it.
- **No rate limiting.** The RPC functions don't currently throttle repeated calls at a token, so a determined script could hammer `register_bottle` or `upsert_wine_guess` — acceptable for a private dinner-party tool, not for anything public-facing.
- **Realtime + column privileges is one layer of defense, not independently verified against every Supabase version.** We rely on documented Supabase column-level privileges to keep `host_token_hash`, `guest_token`, `contributor_guest_id`, and all answer-key columns out of anon reads (including Realtime broadcasts). The tables/columns granted to anon at all are deliberately minimal; the actually sensitive data never has any anon table grant, masked/gated entirely through views and RPC functions instead — that's the layer we'd trust first if this were ever audited.
- **`display_name` uniqueness is only enforced per-session**, via a generated lower/trimmed column — it doesn't handle full Unicode normalization (accents, punctuation) the way `lib/normalize.ts`'s scoring comparisons do; "Alice" and "Álice" would currently be treated as different names.
- **No migration framework.** `supabase/schema.sql` is a single hand-maintained file with inline "MIGRATION-SENSITIVE" comments rather than a sequence of versioned migration files. That's workable for one feature step; a project with more history would want real migrations.

If you need real accounts, audit logs, or token revocation later, that's a distinct follow-up step (see the README's "Recommended next features").
