# Blind Cellar

Private blind tasting, fairly scored. Every participant — including the host — privately registers their own bottle(s), everyone joins from their own phones and guesses blind, and once revealed the app scores everyone and shows a report with each bottle's contributor.

## Running it

1. Set up Supabase — see [SUPABASE_SETUP.md](SUPABASE_SETUP.md) (create a project, run `supabase/schema.sql`, get your URL + anon key).
2. Copy `.env.example` to `.env.local` and fill in the two Supabase values.
3. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). A host creates a tasting on one device; everyone — including the host — registers their own bottle(s) from their own phones, then joins the blind tasting via a shared link, QR code, or join code.

Other useful commands:

```bash
npm run build     # production build
npm run lint      # ESLint
npm run test      # unit tests (Vitest)
npx tsc --noEmit  # type-check
```

## What this app supports

A tasting session moves through three stages: **registration** → **collecting** → **revealed**.

- **Host setup**: the host enters a title, date, their own display name, and a required **tasting format** (see "Tasting modes" below) — no wines up front. This creates the session and a normal participant record for the host — the host is a participant like anyone else, and appears exactly once in the leaderboard.
- **Registration**: the host gets a management link (`/host/[publicId]?token=...`) with a QR code, join link/code, live bottle count, and a "Start tasting" action. Every participant — including the host, via "Register my bottle" — can privately register any number of bottles using controlled dropdowns for country and region (region filtered by country), a grape/blend selector for single variety **or a structured multi-select blend picker** (see "Structured grape/blend" below), a year picker or NV toggle for vintage, a required **wine style** (Bubbles/White/Red/Sweet/Other), and free-text producer/wine-cuvée (with guidance to add the specific wine name, vineyard, cru, or appellation where relevant)/optional private note. Each bottle gets a permanent, sequential anonymous number (`Bottle 1`, `Bottle 2`, …) the moment it's registered; numbers are never reused, even after a delete. The host can also arrange a separate **tasting order** for the bottles (see "Bottle number vs. tasting order" below) from a "Tasting order" panel on the host page, using Move up/down controls; this locks the moment tasting starts. Participants can edit or delete only their own bottles, and only during registration. No one — including the host — can see another contributor's bottle details or identity at this stage; the host sees only each bottle's anonymous number, wine style, and tasting-order position, never country/region/producer/vintage/notes or who contributed it.
- **Collecting**: the host starts tasting once at least one bottle is registered; this locks bottle registration, numbering, and the tasting order. What happens next depends on the session's **tasting mode** — see "Tasting modes" below.
- **Revealed**: whether reached via full blind's one-shot reveal, course-by-course's final bottle, or seen's "End tasting" action, the shared report unlocks for everyone in real time. For full blind and course-by-course, the report shows each bottle's full answer key, its **wine style** and **served position** (e.g. "Style: Red · Served 1st"), **and its contributor's name**, alongside Wine of the Night, Best Taster, Most Divisive Wine (with tie handling), per-bottle guess breakdowns (core vs. bonus categories), and the taster leaderboard. Seen tasting's report is rating-only instead — see "Seen tasting" below.
- **Scoring** is a 120-point-per-wine model: a 100-point **core** score (country 20, region 30, grape/blend 30, vintage 20 — exact, case/whitespace/accent-lenient matching) plus a 20-point **bonus** score (producer 10, wine/cuvée 10, exact normalised match). Price band is never scored, and no points are awarded or deducted for contributing a bottle. The leaderboard ranks by total points, then core points, then exact core-category matches, with ties sharing a rank. See "Scoring model" below for full details.
- A **"See a demo report"** link on the home page (`/demo`) renders a canned 3-bottle, 3-taster report (including contributor names) entirely client-side, for a quick look without creating a real tasting. It's explicitly labeled as a local-only demo and isn't saved anywhere.

## Tasting modes

Chosen once by the host when creating a session (`tasting_sessions.tasting_mode`) and **never editable afterwards**. Every session created before this feature existed safely reads as `full_blind` — today's only behaviour.

### Full blind tasting (default)

> All bottles are tasted blind before any wines are revealed. Best for comparative tastings where complete objectivity matters.

The existing, original flow: every participant (including the host and a bottle's own contributor) guesses every bottle **in the host's tasting order** (progress shown as e.g. `Bottle 4 — 1 of 5`) at their own pace via Previous/Next, autosaved as they go. No bottle's answer key, contributor identity, other guesses, or score is visible to anyone until the host performs one final reveal — there is no per-bottle reveal control in this mode. The host control page shows "All bottles remain hidden until the final reveal." during collecting.

### Course-by-course reveal

> Each bottle is tasted blind, then revealed before moving to the next. Best for casual dinners and relaxed tasting discussions.

Only one **active bottle** is open at a time — the earliest bottle by tasting order that the host hasn't yet revealed:

- Participants can only see and guess the active bottle (`/session/[publicId]/active`) — never an upcoming one's identity, guesses, or scores.
- A participant finalises their guess by tapping **Lock in my guess** (requires a rating, same as full blind's final-submission bar); the form then shows *"Your guess for Bottle [number] is locked. Waiting for the host to reveal it."* Unlike full blind, this locks per-bottle, not the whole session.
- The host doesn't need everyone to submit — **Reveal Bottle [number]** is available at any time, with a confirmation warning that anyone who hasn't submitted gets no score for that bottle (no guess is fabricated on their behalf). The host also sees a live aggregate `N of M participants submitted` count for the active bottle only, never individual guesses.
- Revealing shows a focused per-bottle screen (`/session/[publicId]/bottle/[wineId]/reveal`): full answer key, contributor, group rating stats, and every participant's guess/score breakdown for *that bottle only* — reusing the exact same scoring functions the final report uses, just scoped to one wine. There is deliberately no running leaderboard here, to keep a mid-tasting screen simple.
- A participant chooses **Continue to next bottle** whenever they're ready (never force-navigated away from a reveal they're still reading); reloading or returning later routes them to whatever's now current — the next active bottle, or final results if the session finished revealing while they were away.
- The host cannot skip a bottle, reveal out of order, reveal the same bottle twice, or reveal the whole session in one step — only the current active bottle, one at a time. Revealing the last bottle transitions the session straight to `revealed` and the normal final report.
- Bottle numbers and tasting order are never touched by any of this — only a new `wines.revealed_at` timestamp (null = not yet revealed) and a new `wine_guesses.locked_at` timestamp (null = still an editable draft) change.

### Seen tasting

> All bottles are visible from the start. Best for relaxed tastings where guests want to compare wines openly and rate them at their own pace.

A tasting-note-and-rating format, not a blind-identification competition — there is no guessing, no scoring, and no Best Taster:

- The moment the host starts tasting, **every bottle's full details become visible to every participant** — style, country, region, grape/blend, vintage, producer, wine/cuvée, and contributor name — at `/session/[publicId]/seen`. Bottle registration's usual pre-start secrecy (no contributor sees another's bottle) is unaffected; visibility only opens up once collecting begins.
- Participants **rate any bottle in any order** — tasting order is display order only, not a pacing restriction — and can **revisit and change a saved rating as many times as they like** while the session stays `collecting`. There is no per-bottle lock and no session-wide "submitted" state; a rating is simply the latest value saved for that `(guest, bottle)` pair.
- All individual ratings (and optional notes) stay private between participants during collecting — the host sees only aggregate progress (`N of M participants have rated at least one bottle`, `N of M possible ratings entered`), never anyone's individual rating.
- The host ends the tasting with **End tasting and reveal ratings**, which locks every rating (further save attempts are rejected server-side) and reveals a rating-focused report: Wine of the Night and Most Divisive Wine by average rating, a full bottle ranking (average → lower spread → more ratings → shared tie), and — expandable per bottle — every participant's rating (`No rating` shown honestly for anyone who skipped a bottle, never a fabricated zero).
- A seen rating is stored in the same `wine_guesses` table as full_blind/course_reveal guesses, but only ever sets `rating`/`confidence`/`tasting_note` — every identification-guess column simply keeps its existing blank default, exactly as an untouched draft guess already does in the other two modes. See `upsert_seen_rating` in `supabase/schema.sql`.

## Scoring model

Each guess earns a **core score (0–100)** and a **bonus score (0–20)**, for a **total (0–120)** per wine:

| Category | Weight | Type |
|---|---|---|
| Country | 20 | Core |
| Region | 30 | Core |
| Grape / blend | 30 | Core |
| Vintage | 20 | Core |
| Producer | 10 | Bonus |
| Wine / cuvée | 10 | Bonus |

- **Country, region, vintage** and **producer, wine/cuvée**: exact match after case/whitespace/accent/punctuation-lenient normalisation (`lib/normalize.ts`). No partial credit.
- **Grape / blend**: a **single variety** guess must exactly match the answer's canonical grape (aliases like Syrah/Shiraz, Pinot Gris/Pinot Grigio, and Zinfandel/Primitivo count as equal). A **blend** guess is tokenised on commas/slashes/semicolons/ampersands/hyphens, each token alias-canonicalised, and compared as an unordered set against the answer's blend — an exact set match is required, no partial-overlap credit. If the guess's mode (single/blend) doesn't match the answer's mode, it scores zero even if the text overlaps. If either side's mode is unknown (legacy data predating this field), scoring falls back to a plain alias-aware text comparison. The structured blend picker (see "Structured grape/blend" below) always saves a clean, alphabetised, "/"-joined list of canonical grape names — the exact same tokenisation this scoring already does — so no scoring logic changed to support it.
- **Vintage**: `NV` is an exact value, not a year — it only matches another `NV`, never a specific year.
- **Confidence** is captured but never scored.
- **Price band** is never scored (and no longer collected in new bottle/guess forms — see "Data model notes" below).

The taster leaderboard ranks by total points, then core points, then count of exact core-category matches; a full tie on all three shares a rank. Reports are recalculated from live data on every load, so revealing an old session always uses the current scoring rules — there's no separate stored/frozen score to migrate.

## Structured grape/blend

Choosing **Blend** replaces free-text entry with:

- **Grapes in this blend** — a multi-select of the same curated list single-variety mode uses (search box + checkboxes + removable chips), so blend components are canonical and score-comparable the same way a single variety is, regardless of typing/spelling/ordering differences between contributor and guesser.
- **Other grape(s), if not listed** — an optional free-text field for varieties not on the curated list (e.g. "Carignan, Counoise"). Multiple entries are split on commas/slashes/semicolons/ampersands/line breaks, trimmed, deduplicated case-insensitively, and alias-resolved to a curated grape's canonical name where recognised (so typing "Shiraz" here is the same as checking Syrah above) — a grape already picked from the curated list can't also sneak in via this field.

At least two total grapes (curated picks + unlisted entries, after the deduplication above) are required to save a blend on a bottle; one selected grape shows *"Select at least two grapes for a blend, or choose Single variety instead."* rather than saving. Guess entry stays lenient for autosave (a blank/incomplete draft is fine — see "Scoring model" above for why a blank guess just scores zero), but the same message blocks *final* submission if a guess's blend has exactly one grape, mirroring the existing missing-rating check.

Internally, the two curated/free-text inputs are combined into one canonical, alphabetised list (`lib/wineReferenceData.ts`'s `combineBlendComponents`) that becomes the "/"-joined display/storage text (e.g. `Cabernet Sauvignon / Merlot / Carignan`) — the same shape a blend has always been stored in, so scoring needed no changes (see "Scoring model" above). A new nullable `wines.grape_blend_components` / `wine_guesses.grape_blend_components` JSONB column separately stores which parts came from the curated multi-select vs. the free-text field (`{"selectedGrapes": [...], "otherGrapesText": "..."}`), purely so a blend can be re-opened for editing without losing that distinction — it is never used for scoring or display, and is never exposed to anon directly or through any pre-reveal view (only through the existing token-gated `get_registration_state`/`get_guest_session_state` RPCs, scoped to the caller's own bottles/guesses). A blend saved before this feature (no structured record) is re-parsed from its flattened text when its edit form loads — grapes matching the curated list get pre-checked, everything else lands in the free-text field verbatim — without ever needing to be re-saved.

## Data model notes: grape/blend, price band, and controlled country/region

- **Grape/blend** replaces the old free-text "grape/style" field everywhere in the UI. The underlying database column is still named `grape_style` (kept for migration safety — renaming a live column is riskier than mapping it internally); it now holds the canonical single-variety name or the flattened, alphabetised blend text (see "Structured grape/blend" above). A new nullable `grape_blend_mode` column (`'single' | 'blend' | null`) was added; `null` means the row predates this feature, and scoring/display fall back safely rather than guessing. See `lib/wineReferenceData.ts` for the curated grape list and alias table.
- **Price band** has been removed from all new bottle registration, guess entry, scoring, and results display. The `price_band`/`price_band_guess` database columns and any existing stored values are left in place untouched (the columns are simply no longer required or written) — nothing destructive happens to old data, it's just unused.
- **Country and region** are now controlled dropdowns (`lib/wineReferenceData.ts`), region filtered by the selected country. Both are stored as their canonical **display name** (e.g. `"France"`, `"Bordeaux"`) in the existing `country`/`region` text columns — deliberately *not* an ISO code — so a bottle registered before this feature (free-text country/region) and one registered after it remain directly comparable via the same text-normalisation matcher used everywhere else, with no separate code-to-name lookup needed for scoring or display. See the completion notes in `SUPABASE_SETUP.md` for the full rationale.
- **Wine style** (`wines.wine_style`) is a required, contributor-set classification (Bubbles/White/Red/Sweet/Other) — not scored or guessed, just a category shown to the contributor for their own bottles, to the host alongside the bottle's anonymous number only, and in revealed results. Existing bottles from before this feature backfill to `'other'`.
- **Bottle number vs. tasting order**: `bottle_number` (e.g. "Bottle 3") is the bottle's permanent anonymous identity — assigned once at registration from a monotonic per-session counter, and never reused or changed, even after a delete. `tasting_order` is a *separate*, mutable 1..N sequence the host can freely rearrange during registration (via Move up/down controls on the host page) to control the order bottles are actually poured and guessed in; it's contiguous and unique per session, defaults to registration order, is re-packed automatically when a bottle is deleted, and is frozen the moment the host starts tasting. A bottle keeps the same permanent number regardless of where it sits in the tasting order — e.g. "Bottle 3" might be tasted 1st.

## Multi-device architecture

Sessions live in Supabase Postgres. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the full setup, the bottle-numbering concurrency approach, and the security model (host/guest tokens, Row Level Security, and why there's no service-role key anywhere in this app). This is the model every tasting workflow uses regardless of whether anyone is signed in — see "Accounts" below for the separate, optional identity layer that sits alongside it. In short:

- The browser only keeps two things locally: the **host token** for tastings this device hosts, and the **guest token** for tastings this device has joined (`lib/deviceStorage.ts`) — the host's own participant token is stored in the same slot a regular guest's would be, so registration/tasting pages need no host-specific branching. Everything else — session, bottles, guesses — is fetched live from Supabase.
- Host-only mutations (create session, start tasting, reveal) go through Next.js Route Handlers (`app/api/host/*`), which validate the host token server-side.
- Participant actions (join, register/edit/delete a bottle, autosave a guess, final submit) call `SECURITY DEFINER` Postgres functions directly from the browser using the public anon key; the functions validate the guest token and bottle ownership inside Postgres.
- Supabase Realtime pushes live status/bottle-count/submission-count updates to the host and registration pages, and reveal transitions to the tasting/results pages.

## Tasting archive

A private, read-only `/archive` page lets a host see every tasting they've hosted ("Hosted by you") and a participant see every tasting they've joined ("Joined by you") from **this browser**, once each one is revealed. It is deliberately browser-linked, not account-linked — there's no sign-in in this app (see "Multi-device architecture" above), so "who can see this in their archive" is defined the same way every other permission in this app already is: possession of a valid host or guest token.

- **How it works**: `lib/deviceStorage.ts` already stores a host/guest token per session it creates/joins; it now also appends a tiny `{ publicId, role, lastSeenAt }` reference to a local index (`blindCellar.archiveRefs`) whenever a token is stored — no raw token is ever duplicated into this index, it only ever points back at the existing per-session token slot. The archive page reads that index, resolves each reference's token, and POSTs `{ publicId, role, token }` triples to `POST /api/archive/lookup`.
- **How access is validated**: that route calls the exact same `SECURITY DEFINER` RPCs every other host/guest action already uses — `get_host_session` for a host reference, `get_guest_session_state` for a participant one — so a stale or forged token is rejected by Postgres itself, the same as it would be anywhere else in the app. A reference only becomes a visible archive entry once its RPC call succeeds *and* the session's `status` is `revealed`; a valid token for a not-yet-revealed session is kept locally but simply produces no entry yet. If a session is reachable through both a host and a participant reference (the host is always also a guest in their own session), it's shown once, under "Hosted by you."
- **What it reuses, not duplicates**: Wine of the Night and blind-identification accuracy come from the same `buildTastingReport`/`buildSeenTastingReport` pipeline the results page uses (now shared via `lib/supabase/reportData.ts`), and "View report" opens the *existing* `/results/[publicId]` page — the archive adds a "FROM THE ARCHIVE" marker and a "Back to archive" link there, nothing else. It does not change who can open a results link; that has always been "anyone who knows the link, once revealed" (see "Security model, in plain English" in `SUPABASE_SETUP.md`) — the archive only changes *discovery* (which sessions a given browser is shown), never report access itself.
- **Browser/device limitation**: this is genuinely a "this browser only" feature. A tasting hosted or joined on one phone won't appear in the archive on another device, or after clearing site data. This remains true even for a signed-in user in this phase — see "Accounts" below: signing in does not yet reattach this browser's archive to anything. The archive page says so directly: *"Your archive is available on this browser. Account-based access and cross-device history may be added later."*
- **Removing a local archive reference**: since there's no server-side record of "this browser's archive" beyond the tokens it already holds, clearing that browser's site data/localStorage for this app (or just for the `blindCellar.archiveRefs` / `blindCellar.hostToken.*` / `blindCellar.guestToken.*` keys) removes it from that browser's archive — there's nothing to delete on the server, since the archive was never a server-side list in the first place.
- **Future path (not implemented)**: linking this archive concept to the account layer described below, so it can follow a person across devices instead of staying pinned to one browser, is tracked as a Phase 2 follow-up — see "Accounts" and "Recommended next features" below.

## Accounts

An **optional**, passwordless account layer sits alongside the host/guest token model above — see SUPABASE_SETUP.md "Setting up Supabase Auth (accounts)" for the Dashboard configuration. Nothing about hosting or joining a tasting requires signing in; this is purely a foundation for a future cross-device tasting record.

- **Sign-in method**: email one-time code (OTP) via `supabase.auth.signInWithOtp()` / `verifyOtp()` — no passwords, no social login, no magic link (see SUPABASE_SETUP.md for why OTP was chosen and how magic links could be enabled instead). `/account/sign-in` is a single page with two steps (enter email, then enter the 6-digit code); `/account` shows the signed-in email, an optional account-level display name, a link to the archive, and sign out.
- **What signing in does NOT do**: it does not migrate, attach, or reveal any of this browser's existing host/guest-token tastings to the account. The Tasting Archive (above) keeps working exactly as before, browser-linked, whether or not the same browser also happens to be signed in — the archive page just adds a quiet "Signed in as …" line when it is. See "Recommended next features" for the Phase 2 that would actually link them.
- **Identity model**: a `public.profiles` row (`id` referencing `auth.users(id)`, `email`, optional `display_name`) is created automatically the moment someone verifies their first sign-in code — see `handle_new_user()` in `supabase/schema.sql`. This is deliberately the *only* thing an account layer touches; no `wines`/`tasting_sessions`/`guests`/`wine_guesses` row is ever linked to `auth.users` in this phase, and no tasting RPC gained an `auth.uid()` check.
- **A signed-in browser still uses the exact same anonymous RPCs and views** (`join_tasting_session`, `register_bottle`, `upsert_wine_guess`, `guest_visible_wines`, …) that an anonymous one does — see "Security model, in plain English" in `SUPABASE_SETUP.md` for the grant change this required (`authenticated` needed the same narrow access `anon` already had, nothing more) so that signing in never breaks or changes tasting behaviour.
- **Session storage**: the browser Supabase client (`lib/supabase/client.ts`) now uses `@supabase/ssr`'s cookie-based session storage instead of plain `localStorage`, and a minimal `middleware.ts` refreshes that session cookie on navigation. This only affects the Auth session itself — host tokens, guest tokens, and the archive's local reference index are completely untouched and still stored exactly as before.
- **Account display name vs. tasting display name**: the optional name on `/account` (`profiles.display_name`) is entirely separate from the name a guest types when joining a specific tasting (`guests.display_name`) — saving one never touches the other, and an existing session's guest name is never silently replaced.
- **Sign-out** clears only the Supabase Auth session (cookies) — it never touches `blindCellar.hostToken.*`, `blindCellar.guestToken.*`, or `blindCellar.archiveRefs`, so anonymous host/guest access and the local archive keep working immediately afterward.

## Assumptions and design choices

- Price band is no longer part of any new form or scoring calculation (see "Data model notes" above); it was previously required on every bottle.
- Grape/blend is required on every bottle (single variety from the curated list, or a non-empty blend description); the private note remains optional.
- Country and region are required, controlled-vocabulary selections on every new bottle and are no longer free text.
- "Other / Unknown" is offered as a normal region option per relevant country rather than a separate free-text "other region" field — the curated list plus that catch-all option was judged sufficient without adding a second, harder-to-score input path.
- "Confidence" is captured per guess but does not affect scoring, as specified.
- No Supabase service-role key is used anywhere — every privileged operation is enforced by a `SECURITY DEFINER` Postgres function validating a token, which lets the whole app run on the public anon key.
- Host and guest tokens are bearer credentials with no expiry or revocation in this MVP.
- The host control page shows a link to the shared results page after reveal rather than re-rendering the full report inline a second time, and no longer shows any bottle answer-key content itself (previously it did, before other participants could contribute bottles — that's no longer safe to expose to the host).
- Kept the database column name `host_notes` (now used for any contributor's private note, not just the host's) to avoid a wider, riskier rename across the schema, views, and every layer that reads it.
- `entered_by_type` from the brief's suggested schema was left out: `wines.contributor_guest_id` plus `tasting_sessions.host_guest_id` already fully answer "who contributed this bottle, and is it the host" without a redundant column.
- Existing sessions from before this feature keep their original wine labels (e.g. `Wine A`) and are never retroactively given a host participant record; see "Migrating an existing project" in `SUPABASE_SETUP.md`.
- Tasting order uses Move up/down controls rather than drag-and-drop — with typically 3–8 bottles, a couple of taps covers any rearrangement, and this avoids adding a drag-and-drop dependency for marginal benefit.
- A new bottle always joins the tasting order at the end (after whatever the host has already arranged), never inserted mid-sequence automatically.
- Reordering during registration never touches `bottle_number` — only `tasting_order`. Reordering is blocked entirely once the tasting starts (registration closed).
- The blend multi-select is an always-visible, searchable checkbox list rather than a floating popover/combobox — this app has no existing popover primitive suited to an inline dropdown (`Modal.tsx` is a full-screen dialog), and a search-filtered checkbox list is equally accessible without adding a new UI-library dependency.
- The two-grapes-minimum for a blend counts curated picks and unlisted free-text entries *together*, after cross-deduplication — picking "Merlot" and also typing "Merlot" in the unlisted field still counts as one grape, not two, so it can't be used to bypass the minimum.
- `grape_blend_components` is a convenience for re-editing a blend faithfully (which parts were curated picks vs. free text); it is never the source of truth for scoring or display — the flattened `grape_style` text is, exactly as it already was before this feature.
- Guess entry blocks a blend guess with *exactly one* grape at final submission (not before, so autosave never nags mid-draft), matching how a missing rating is already handled; a completely blank blend guess is left alone since it already legitimately scores zero.
- Wine/cuvée guidance is shown as persistent helper text under the field on every device size, rather than a tooltip/info icon, since the app's existing `TextField` already had a `hint` slot wired up for exactly this (accessible via `aria-describedby`) and the copy is short enough not to meaningfully add to page density.
- Tasting mode is locked at creation with no edit path, as specified — changing formats mid-session would leave `revealed_at`/`locked_at` state in an ambiguous position, so this was intentionally out of scope rather than a partial implementation.
- A course_reveal guess is only ever counted as "submitted" for host-progress and reveal purposes once explicitly locked (a new per-guess `wine_guesses.locked_at`) — a rating saved by autosave but never locked in still shows as "no submission" if the host reveals first, matching the requirement that no guess/score is fabricated.
- `guest_visible_wines` and `revealed_wine_guesses` (the views full blind's results page already relies on) are completely unchanged by this feature. Course-by-course reveal reads exclusively through new, narrowly-scoped RPCs (`get_active_bottle_state`, `get_revealed_bottle`) that check `wines.revealed_at` themselves — this was chosen over adding `OR revealed_at is not null` conditions to the shared views, to avoid touching code every other results/registration path depends on.
- The host's "N of M participants submitted" count for the active bottle is refreshed by short polling (every 5s) rather than Supabase Realtime. Realtime's `postgres_changes` broadcasts a full row per RLS policy, independent of column-level grants — so a permissive RLS policy on `wine_guesses` (needed for any realtime signal to reach anon at all) would broadcast guess *content* (ratings, country/region guesses) to every participant in real time, not just a completion count. `wine_guesses` therefore still has no anon grant and no realtime publication membership, exactly as before this feature; only `wines`/`tasting_sessions` changes (already realtime-enabled, never read for their payload content — only used as a "something changed, refetch through a secure RPC" signal) drive live updates.
- A revealed bottle's reveal screen intentionally omits a running leaderboard/ranking (the spec explicitly calls this unnecessary complexity for a mid-tasting screen) — it shows only that bottle's own group stats and per-guest breakdown, reusing `calculateWineResults` scoped to one wine.
- Seen tasting reuses the existing `wine_guesses` table rather than a new `wine_ratings` table — a seen rating and a blind guess are both fundamentally "one row per `(guest, wine)`, with a rating," and the existing table already has every column a seen rating needs (`rating`, `confidence`, `tasting_note`) plus a unique `(guest_id, wine_id)` constraint. A separate table would have meant either duplicating that constraint/index/trigger setup or writing extra joins anywhere both kinds of rows needed to be queried together — for no isolation benefit, since `upsert_seen_rating`/`get_seen_tasting_state` are already mode-gated and never touch the identification-guess columns.
- Seen tasting's report is built by an entirely separate pure-function pipeline (`lib/seenResults.ts`, `SeenBottleResult`/`SeenTastingReport` types) rather than a branch inside `lib/results.ts`/`lib/scoring.ts` — a seen rating has no answer key to score against, so forcing it through `calculateWineResults`/`ScoredGuess` would mean fabricating fake core/bonus scores. The two pipelines share only the generic, scoring-agnostic tie-break helpers (`rankByDescendingKeys`/`maxBy`/`minBy`, now exported from `lib/results.ts`).
- Seen mode's host progress card intentionally has no per-guest "Submitted"/"In progress" status (unlike full_blind/course_reveal's participant list) — there's no meaningful binary state for "rated some but not all bottles," and showing one anyway risked implying more granularity than the aggregate-only requirement intends.
- Like course_reveal's per-active-bottle submission count, seen mode's aggregate rating progress is refreshed by short polling (every 5s) rather than Realtime, for the identical reason: `wine_guesses` has no anon grant or realtime publication membership, since Realtime broadcasts full rows regardless of column grants.
- A seen-tasting rating save is an explicit "Save rating" action, not silent autosave-as-you-type like full_blind/course_reveal's guess entry — the spec's rating-entry actions are `Save rating` / `Back to all bottles`, and an explicit save also makes the exact required confirmation copy ("Rating saved. You can change it until the tasting ends.") meaningful as a one-time event rather than a debounced status label.
- The Tasting Archive's local reference index (`blindCellar.archiveRefs`) is a new, minimal addition rather than reusing a scan of existing `blindCellar.hostToken.*`/`blindCellar.guestToken.*` keys directly — `localStorage` has no efficient prefix-query API, so an explicit small index avoids crawling every key in storage on every archive page load.
- The archive's per-item server response distinguishes "invalid" (token rejected, or a guest token that resolves to a different session than the local reference claimed) from "not_revealed" (a genuinely valid token for a session that just isn't finished yet), so the client can safely forget the first kind of reference and keep the second for later. This is safe to return only because it's always the token's own holder asking about their own reference — it's not a public-facing error message.
- Archive entries never come from a query like "all sessions with status = revealed" — every entry is the result of independently re-validating one locally-held token through the same RPC any other part of the app would use for it. A browser with no local references never triggers a lookup request at all.
- Wine of the Night and blind accuracy in the archive summary are computed from the full `buildTastingReport`/`buildSeenTastingReport` result for each session, the same as the results page — a lighter, partial recomputation was considered and rejected, since duplicating even part of the scoring/ranking logic risked the two surfaces disagreeing over time.
- `get_guest_session_state`'s returned session object gained three additive fields (`id`, `createdAt`, `participantCount`) purely for the archive's own use — no existing caller reads them, so this needed no migration, only a `CREATE OR REPLACE FUNCTION`.
- Email OTP was chosen over magic links because it needs no callback route and no `emailRedirectTo`/redirect-URL Dashboard configuration to function at all — the whole sign-in/verify round trip happens through two direct browser calls (`signInWithOtp`, `verifyOtp`), which is both simpler to implement correctly and has fewer places an open-redirect or misconfigured Site URL could go wrong. See SUPABASE_SETUP.md for how a magic-link flow could be added instead.
- Every existing `anon`-only grant/RPC-execute privilege in `supabase/schema.sql` was widened to `anon, authenticated` *together with* an explicit `revoke all ... from authenticated` on the same four tables `anon` already had revoked — done as one atomic change, not two, specifically because a project's default privileges typically grant `authenticated` broad access no one had a reason to revoke before Auth existed. Widening the grants alone (without also revoking the untouched defaults) would have left a latent path for a signed-in session to read columns like `host_token_hash` that RLS's row-level `using (true)` policies don't restrict.
- Signing in never adds an `auth.uid()` check to any tasting RPC, and no `wines`/`tasting_sessions`/`guests`/`wine_guesses` row references `auth.users` — this phase's account layer is additive and parallel to the token model, not a replacement for any part of it.
- Profile updates (the optional account display name) go straight through Postgres RLS from the browser (`profiles_update_own`, column-limited via `grant update (display_name)`) rather than a Route Handler — this matches how every other participant-owned write in this app already works, and needs no new server code.
- `/account` and `/account/sign-in` protect themselves client-side (check `getUser()`, redirect if absent) rather than via middleware-based route protection — this app has no server-rendered, auth-aware page anywhere, so adding one just for this would be a bigger, riskier change than the two lines of client-side redirect logic it replaces.
- The OTP entry is a single labelled text input (`inputMode="numeric"`, `autoComplete="one-time-code"`, native paste), not six separate digit boxes — this codebase has no existing multi-box input pattern, and a single input is simpler, has one error message instead of managing per-box focus/backspace/paste-splitting, and still gets the same browser/OS one-time-code autofill treatment.

## Recommended next features

- Linking the account layer to the Tasting Archive, so a signed-in user's browser-linked history actually becomes visible across their devices — the natural Phase 2 for both features above
- Token expiry/revocation and rate limiting on the participant RPC functions, including the archive lookup route
- Partial-credit scoring rules (e.g. close vintage, correct country but wrong region)
- Proper Postgres migrations instead of a single `schema.sql` for schema evolution
- An external wine-data API for country/region/grape lookups, if the curated static list ever feels limiting

## Manual test checklist

Run this against a real Supabase project (see `SUPABASE_SETUP.md`) using multiple devices/browsers (or one device + incognito windows to simulate other participants):

1. **Host creates a registration-stage session.** Go to `/host/new`, fill in title/date/your display name, submit. You land on `/host/[publicId]?token=...` showing "Bottle registration open", the join code, QR code, and copy-link/copy-code buttons.
2. **Host contributes zero or multiple bottles.** From the host page, click "Register my bottle" to add one or more bottles via `/register/[publicId]`; confirm "Start tasting" stays disabled with 0 bottles and enables once at least 1 exists — and confirm the host can also legitimately contribute 0 bottles and still start tasting once someone else has registered one.
3. **Multiple participants join on different phones/browsers** via the QR code or join link, landing on `/register/[publicId]`.
4. **One participant adds several bottles** — confirm the registration home lists all of them with sequential numbers, and "Add another bottle" is offered after the first.
5. **Different participants add bottles at the same time** (fire two registrations within a second or two of each other from different devices) — confirm no two bottles in the session ever get the same number.
6. **Bottle numbers remain sequential and unique**, and **deleted numbers are not reused** — delete a middle-numbered bottle, then register a new one, and confirm the new bottle's number is higher than every number ever issued, not a reused gap.
7. **A participant cannot see another contributor's answer key** — inspect the registration home and network responses; only your own bottles' details should ever appear.
8. **Participants can edit/delete only their own bottles before tasting starts** — confirm attempting to edit/delete via a manipulated URL for someone else's bottle fails.
9. **Host starts tasting and locks registration** — confirm the confirmation modal text, that bottle registration closes, and that participants on `/register` automatically transition to `/tasting` via Realtime.
10. **Host submits guesses as a participant** via "Enter my guesses" on the host page, using the same guess-entry flow as anyone else, including guessing their own contributed bottle.
11. **Guests submit guesses** for every bottle, autosaving as they go, then submit and see the "locked" screen.
12. **Host reveals wines** via the confirmation modal on the host page.
13. **Contributors are visible only after reveal** — before reveal, no contributor name ever appears anywhere; after reveal, every bottle's card shows "Contributed by [name]".
14. **Host appears exactly once in the leaderboard**, with their own bottle (if any) scored identically to everyone else's — no bonus or penalty for contributing.
15. **Existing pre-feature sessions still load correctly** — a session created before this migration (status `collecting` or `revealed`, wines labeled `Wine A`/`Wine B`) continues to work end-to-end without a host participant record.
16. **Country/region controls work correctly** in both bottle registration and guess entry — region is disabled with a "Select country first" placeholder until a country is chosen, only shows that country's regions, and resets to blank if you change country after picking a region.
17. **Vintage picker works correctly** — toggling to "NV" hides the year selector and stores `NV`; toggling back to "Vintage year" clears any prior NV value and requires a fresh year pick; years list current+1 down to 1900, descending.
18. **Grape/blend selector works correctly** — "Single variety" shows a dropdown (required for registration); "Blend" shows the multi-select grape picker plus an optional "Other grape(s)" field (see "Structured grape/blend" checklist below for detail); switching modes clears the previous value; a blend entered with the same grapes picked in a different order (e.g. Merlot then Cabernet Sauvignon vs. Cabernet Sauvignon then Merlot) still scores as correct after reveal.
19. **Price band appears nowhere** in the new bottle form, edit form, guess form, or results/leaderboard.
20. **Producer and wine/cuvée are visibly labelled "— bonus"** in guess entry, and the results view clearly separates core categories (100 pts) from bonus categories (20 pts) with a `Core: X/100 · Bonus: Y/20 · Total: Z/120` summary per guess.
21. **Existing sessions with legacy grape/style and price-band data still load and score sensibly** — a bottle registered before this update (no `grape_blend_mode`) still displays its old grape/style text and scores against new-format guesses using the alias-aware text fallback described in "Scoring model" above.

### Wine style

22. **Wine style is required to register or edit a bottle** — submitting without a style is rejected client-side; picking each of Bubbles/White/Red/Sweet/Other is accepted.
23. **Legacy bottles show "Other"** — a bottle registered before this feature displays wine style "Other" everywhere it's shown.
24. **A contributor can edit their own bottle's style during registration only** — editing after tasting starts is unavailable, matching every other bottle field.
25. **The host sees style + anonymous number only** — on the host page's tasting-order list, confirm no country/region/producer/vintage/notes/contributor-name ever appears, for any bottle, before reveal.
26. **Other participants cannot see any bottle's style pre-reveal** — inspect the registration and guess-entry pages/network responses for a non-host, non-contributor guest; wine style never appears there before reveal.
27. **Wine style appears in revealed results** as `Style: <Style>` on every bottle's result card.

### Tasting order

28. **Bottle number and tasting order are independent** — reorder a session's bottles and confirm every bottle keeps its original `Bottle N` label throughout.
29. **Reordering only ever changes `tasting_order`** — verify via the database (or by re-registering the same bottle) that `bottle_number` is untouched by a reorder.
30. **Tasting order stays a contiguous 1..N permutation** — after any sequence of moves, every bottle in the session has a unique order value with no gaps.
31. **A newly registered bottle joins at the end of the tasting order**, not inserted into the middle of an already-arranged sequence.
32. **Deleting a bottle doesn't reuse its bottle number** and leaves the remaining bottles' tasting order still a valid, gapless 1..N sequence.
33. **Reordering is host-only and registration-only** — a non-host request is rejected; a reorder attempted after tasting has started is rejected with the tasting order left unchanged.
34. **An invalid or duplicate reorder payload is rejected** — submitting a list that omits a bottle, repeats an id, or includes an id from another session fails without partially applying.
35. **Guess entry follows the host's tasting order**, not bottle-number order, once collecting starts — confirm the progress label (`Bottle 4 — 1 of 5`) and Previous/Next sequence match the host's arranged order.
36. **Results show both the bottle number and a served-order indicator** (e.g. "Served 1st") for every bottle.
37. **Starting the tasting locks the order** — confirm the "Start tasting" confirmation mentions the tasting order will be locked, and that the host's reorder controls disappear/reject changes once collecting begins.

### Structured grape/blend

38. **Single variety is unchanged** — the dropdown still allows exactly one selection and scores exactly as before.
39. **Blend mode shows the multi-select** with a search box, checkboxes, and an "Other grape(s)" free-text field beneath it.
40. **Picking two or more curated grapes saves and re-edits correctly** — reopen the bottle's edit form afterwards and confirm the same checkboxes are still checked.
41. **Picking exactly one grape is rejected** — inline message reads exactly "Select at least two grapes for a blend, or choose Single variety instead," both in bottle registration/edit and (at final submit only, not mid-draft) in guess entry.
42. **Checking a grape already typed in "Other grapes" doesn't double-count it** — total-grape validation still requires two *distinct* grapes.
43. **Typing multiple unlisted grapes** (e.g. "Carignan, Counoise") separated by commas/slashes/semicolons/ampersands/line breaks each become a separate component; duplicates (including case-insensitive ones) collapse to one.
44. **A blend using only unlisted grapes** (zero curated picks, two-plus typed) saves and validates correctly.
45. **Guessing the identical blend with grapes selected in a different order** still scores full 30 points after reveal.
46. **Typing "Shiraz" as an unlisted grape** while the answer has "Syrah" (or vice versa, via the curated picker) still scores as a match.
47. **A guess missing one component of a 3-grape answer blend** scores zero for grape/blend, not partial credit.
48. **A legacy blend bottle (registered before this feature, plain flattened text)** still loads, still scores correctly against new-format guesses, and its edit form pre-populates the multi-select with whichever of its grapes are recognised, without altering the stored answer unless explicitly re-saved.
49. **No pre-reveal secrecy leak** — inspect network responses for a non-contributor, non-host participant before reveal; no bottle's `grape_blend_components` or any other grape/blend detail is ever visible.

### Wine/cuvée guidance

50. **The exact helper text** ("Add the specific wine name, vineyard, cru, or appellation where relevant — e.g. Nuits-Saint-Georges, Margaux, or Santa Rita Hills.") appears under Wine / cuvée on the add-bottle form, the edit-bottle form, and the guess-entry form (labelled "Wine / cuvée — bonus" there).
51. **The helper text is programmatically associated with the field** (inspect `aria-describedby` on the input pointing at the hint's `id`), not just visually nearby.
52. **Wine/cuvée bonus scoring is unchanged** — still worth 10 points, still an exact normalised-text match, unaffected by the new helper text.

### Tasting modes

53. **Creating a session defaults to Full blind tasting** and shows both mode cards with their exact descriptions before creating.
54. **Choosing Course-by-course reveal** persists that mode; reopening the host page afterwards shows the mode label + description and no way to change it.
55. **A full blind session behaves exactly as before**: no per-bottle reveal control anywhere, all bottles hidden during collecting, one final reveal shows the complete report.
56. **A course_reveal session only shows one active bottle** to participants at a time — attempting to reach a future bottle's guess form (e.g. by guessing at a wine id from the tasting order) is rejected server-side.
57. **The host can reveal the active bottle before every participant has submitted** — the confirmation modal names the bottle and warns non-submitters get no score; after reveal, a participant who never locked a guess shows no score for that bottle, not a fabricated one.
58. **The host cannot reveal a bottle out of order** — attempting to reveal a later bottle while an earlier one is still unrevealed is rejected server-side (`bottle_not_active`), and revealing an already-revealed bottle is rejected (`bottle_already_revealed`).
59. **A non-host cannot reveal any bottle** — calling the reveal endpoint with a guest token (or no token) fails.
60. **Revealing a non-final bottle** keeps the session `collecting`, makes the next unrevealed bottle active, and shows the per-bottle reveal screen (answer key, contributor, group stats, every locked guess's score breakdown) — while the *next* bottle's identity/guesses remain completely invisible.
61. **Choosing "Continue to next bottle"** loads the new active bottle's empty guess form; reloading the reveal screen later still works, and reloading the active-bottle route routes to whatever's current (next active bottle, or final results if the session finished while away).
62. **Revealing the final bottle** transitions the session to `revealed` and shows the same comprehensive final report (Wine of the Night, Best Taster, Most Divisive Wine, full leaderboard, every bottle) as full blind.
63. **The host can submit their own guess** for the active bottle in course_reveal, same as any participant.
64. **Bottle numbers and tasting order never change** across any of the above — only `revealed_at`/`locked_at` timestamps move.
65. **Two devices see live updates**: a second participant's screen transitions from "locked, waiting" to the reveal prompt shortly after the host reveals, without needing a manual refresh (allow a few seconds — see the polling/realtime note in "Assumptions and design choices").
66. **A pre-existing session from before this feature** still loads and behaves as `full_blind` with no visible change.

### Seen tasting

67. **Creating a session shows all three mode cards** (Full blind tasting, Course-by-course reveal, Seen tasting) with their exact descriptions, defaulting to Full blind tasting; choosing Seen tasting persists that mode with no way to change it afterwards.
68. **Participants register bottles exactly as in any other mode** — normal pre-start secrecy applies (no contributor sees another's bottle before the host starts tasting).
69. **The moment the host starts tasting, every participant immediately sees every bottle's full details** (style, country, region, grape/blend, vintage, producer, wine/cuvée, contributor) at `/session/[publicId]/seen` — inspect network responses for a non-host, non-contributor participant to confirm nothing is masked.
70. **A participant can rate bottle 1, skip to bottle 4, then return to bottle 1 and change its rating** — all while the session stays `collecting`; tasting order is display order only, never a pacing gate.
71. **Re-saving a rating for the same bottle updates the existing row rather than creating a duplicate** — confirm via the database (or by reloading the rating page and seeing the latest value, not the first one).
72. **Other participants cannot see that rating while the tasting remains open** — inspect network responses for a second participant; only their own `myRating`/`myConfidence`/`myNote` ever appears, never anyone else's.
73. **The host sees aggregate progress only** — "N of M participants have rated at least one bottle" and "N of M possible ratings entered," never an individual participant's rating or note, and no average/ranking before ending.
74. **A late-joining participant** (joins after the host starts tasting) lands on the same seen-tasting list, sees every bottle, and can rate any or all of them; joining after the host ends the tasting instead routes straight to results with no rating controls.
75. **The host ends the tasting** via "End tasting and reveal ratings," confirming the exact modal copy ("End seen tasting?" / the locking warning / "Cancel" / "End tasting and reveal results").
76. **Ratings become locked the instant the session is revealed** — a save attempt still in flight (or retried) at that point is rejected server-side with a clear error, and the rating/confidence/note fields already saved are exactly what's shown in the final report, nothing more.
77. **Final results show the rating ranking, Wine of the Night, and Most Divisive Wine, with no Best Taster, scoring, or identification-accuracy content anywhere on the page.**
78. **A bottle nobody rated shows `averageRating: —` and an empty ratings list** (or every participant showing "No rating"), never a fabricated average or score.
79. **Full blind and course-by-course sessions are unaffected** — create one of each alongside a seen session and confirm both behave exactly as described in their own sections above, with no shared-state leakage between them.
80. **A pre-existing full_blind or course_reveal session still loads and behaves exactly as before** — this feature adds a third allowed `tasting_mode` value without touching the check constraint's existing two options' behaviour.

### Tasting archive

81. **A host creates and completes a full_blind (or any mode) tasting on one browser.** After reveal, visiting `/archive` on that same browser shows it under "Hosted by you" with the correct title, date, mode, bottle count, participant count, and Wine of the Night (or "No group rating recorded" if nothing was rated).
82. **A participant joins and completes that tasting on a different browser/incognito window.** After reveal, `/archive` on the participant's browser shows it under "Joined by you" — and the host's own browser never shows a "Joined by you" duplicate for the same session (it only appears under "Hosted by you" there).
83. **A session still in registration or collecting never appears in either archive tab**, even though a valid token already exists locally for it — revisit `/archive` before and after the host reveals to confirm it appears only afterward.
84. **Clearing/corrupting the `blindCellar.archiveRefs` localStorage key, or a session's host/guest token, removes that session from the archive** on next load without affecting any other stored session's tokens.
85. **"View report" from an archive entry opens `/results/[publicId]?from=archive`**, showing the exact same mode-specific report as visiting the plain results link directly, plus a "FROM THE ARCHIVE" marker and a working "Back to archive" link.
86. **A seen-tasting archive entry and its opened report never show Best Taster or a blind-accuracy figure anywhere**, and the archive summary for a tab containing only seen-tasting entries never shows a "Blind tasting accuracy" figure.
87. **The empty states' actions work**: "Host a tasting" from the empty "Hosted by you" tab reaches `/host/new`; "Join a tasting" from the empty "Joined by you" tab reaches `/join`.

### Accounts

88. **Every anonymous workflow above still works with no sign-in at all** — re-run a few of the checks above (host creation, joining, registering a bottle, guessing, revealing) while signed out; nothing should differ from before this feature existed.
89. **Sending a sign-in code**: on `/account/sign-in`, an invalid email shows a client-side error and never calls Supabase; a valid email shows "A sign-in code has been sent to your email." and moves to the code step, regardless of whether that address has signed in before (no "this email doesn't have an account" type of message ever appears).
90. **Verifying the code**: entering the real 6-digit code from the email (via typing or pasting) redirects to `/account` (or the `redirect` target); entering a wrong or expired code shows "That code is invalid or has expired. Request a new code and try again." without exposing any Supabase error detail.
91. **Resend cooldown**: "Send a new code" is disabled with a visible countdown immediately after a code is sent, and works again once the cooldown ends.
92. **Signing in on a second browser/device** with the same email reaches the same account (same email shown on `/account`), but does **not** show that browser's own `/archive` any sessions from the first device — the archive stays browser-linked, not account-linked, in this phase.
93. **The account display name is independent of tasting display names**: setting a name on `/account` never changes the name already used in an existing joined session, and joining a new tasting still prompts for its own display name regardless of the account name.
94. **An unsafe `redirect` query value is ignored**: visiting `/account/sign-in?redirect=https://example.com` and completing sign-in lands on `/account`, never on the external URL.
95. **Sign out** returns to Home (with a brief "You have signed out." confirmation), and immediately afterward this same browser can still host a new tasting, join a tasting, and see its existing `/archive` entries exactly as before signing in.
96. **A signed-in browser can still do everything an anonymous one can** — host a tasting, join one, register a bottle, submit guesses/ratings, and view a revealed report — confirming the `authenticated`-role grants added alongside Auth didn't narrow anything the app already relied on.
97. **A signed-in user gains no extra access**: knowing you're signed in (with any email) never lets you open another person's host controls, another session's report before it's revealed, or another user's `/account` data — only a valid host/guest token (unchanged) and, for `/account`, only your own session's `auth.uid()` grant that.

## Automated tests

`npm run test` runs Vitest unit tests covering:

- Text normalisation (`lib/normalize.ts`)
- Core/bonus field scoring, grape/blend single-variety and blend-set matching (including order-independence, partial-overlap rejection, mode-mismatch rejection, and legacy-data fallback), NV-vs-year handling, and the 100/20/120-point maximums (`lib/scoring.ts`)
- Wine ranking and Wine-of-the-Night tie-breaking, Best Taster via leaderboard rank, Most Divisive Wine, taster leaderboard multi-key tie-breaking (total points → core points → exact core matches → shared rank), empty-submission states, and the host appearing exactly once in the leaderboard (`lib/results.ts`)
- Country/region reference data: filtering regions by country, the country-change region-reset helper, and grape alias canonicalisation (Syrah/Shiraz, Pinot Gris/Pinot Grigio, Zinfandel/Primitivo) (`lib/wineReferenceData.ts`)
- Structured blend helpers — tokenising/aliasing/deduplicating "other grapes" free text, cross-deduplicating curated picks against free text, alphabetical canonical ordering, and reconstructing curated-picks-vs-free-text from a legacy flattened blend string (`lib/wineReferenceData.ts`)
- Bottle label formatting and the `registration → collecting → revealed` status order (`lib/codes.ts`, `types/tasting.ts`)
- Bottle form validation — controlled country/region selection, grape/blend mode + value requirements, the two-grapes-minimum blend rule (including cross-deduplication so a curated pick can't be double-counted via free text), the four-digit-year-or-"NV" vintage rule, the required-wine-style rule, and the absence of any price-band requirement (`lib/validation.ts`)
- The guess-entry incomplete-blend check used to block final submission on exactly one blend grape (`lib/validation.ts`)
- Blend scoring through the structured picker's derived flattened text — order-independence, alias equivalence, partial-overlap rejection — confirming the existing scoring pipeline needed no changes for this feature (`lib/scoring.ts`)
- The tasting-order move-up/move-down helper — swapping with a neighbour, no-op at either end, no mutation of the input array (`lib/reorder.ts`)
- The wine style constants — the five supported styles and that every one has a display label (`types/tasting.ts`)
- The tasting-mode type guard and the exact required labels/descriptions for all three modes (`lib/validation.ts`, `types/tasting.ts`)
- Building a single revealed bottle's group stats and per-guess score breakdown from the course-reveal RPC's response shape, confirmed to go through the exact same `calculateWineResults` the final report uses (`lib/supabase/mappers.ts`)
- Seen tasting's rating-only pipeline (`lib/seenResults.ts`) — a missing rating shows as `null`/"No rating" rather than a fabricated zero, average/lowest/highest/spread computed only from actual ratings, the four-level bottle-ranking tie-break (average → lower spread → more ratings → shared tie), Wine of the Night and Most Divisive Wine, and that the report never carries any blind-identification/scoring field
- The Tasting Archive's local reference index (`lib/deviceStorage.ts`) — a host/guest token write automatically records an archive reference, references dedupe by `(publicId, role)`, removing a reference never touches the underlying token, corrupt index data is treated as empty rather than throwing, and no raw token is ever serialized into the index
- The Tasting Archive's resolution/authorization logic (`lib/archive.ts`, using fake injected RPC responses — no real Supabase connection needed) — a valid host or guest token on a revealed session produces a "ready" entry with the correct fields; an invalid/rejected token, a session still in registration/collecting, and a guest token that resolves to a session other than the one it was labeled with all correctly produce no visible entry; a session reachable via both a host and a participant reference is shown exactly once, under "Hosted by you"; results are ordered by tasting date then `createdAt` descending; a seen-tasting entry never carries a blind-accuracy figure; the archive summary omits accuracy entirely when no entry has scoring data and never leaks a raw token into a resolved entry; and the request parser enforces the maximum reference-count bound and rejects malformed input
- Account email/OTP-format/display-name validation (`lib/supabase/auth.ts`) — email format acceptance/rejection (including length, whitespace, missing `@`/TLD), exactly-6-digit OTP format acceptance/rejection, display-name trimming/empty-to-null/max-length truncation, and email masking for the "check your email" step
- The sign-in return-path allowlist (`lib/authRedirects.ts`) — a bare internal path (with or without a query string) is accepted; a protocol-relative URL (`//evil.example.com`), a full external URL, a `javascript:` pseudo-URL, a backslash-based bypass, an embedded scheme separator, embedded whitespace/control characters, a missing leading slash, and an oversized string are all rejected and fall back to the safe default destination

These don't require a Supabase project — they test the pure scoring/ranking/validation logic in isolation. Bottle-numbering concurrency, RLS enforcement, the registration/collecting/revealed lifecycle transitions, and the live Supabase Auth OTP send/verify round trip are database- or live-API-level guarantees exercised by the manual test checklist above against a live project, not by this unit-test suite — consistent with how every other RPC-backed workflow in this app has always been verified.
