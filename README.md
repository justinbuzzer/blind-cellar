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

- **Host setup**: the host enters just a title, date, and their own display name (no wines up front). This creates the session and a normal participant record for the host — the host is a participant like anyone else, and appears exactly once in the leaderboard.
- **Registration**: the host gets a management link (`/host/[publicId]?token=...`) with a QR code, join link/code, live bottle count, and a "Start tasting" action. Every participant — including the host, via "Register my bottle" — can privately register any number of bottles using controlled dropdowns for country and region (region filtered by country), a grape/blend selector for single variety **or a structured multi-select blend picker** (see "Structured grape/blend" below), a year picker or NV toggle for vintage, a required **wine style** (Bubbles/White/Red/Sweet/Other), and free-text producer/wine-cuvée (with guidance to add the specific wine name, vineyard, cru, or appellation where relevant)/optional private note. Each bottle gets a permanent, sequential anonymous number (`Bottle 1`, `Bottle 2`, …) the moment it's registered; numbers are never reused, even after a delete. The host can also arrange a separate **tasting order** for the bottles (see "Bottle number vs. tasting order" below) from a "Tasting order" panel on the host page, using Move up/down controls; this locks the moment tasting starts. Participants can edit or delete only their own bottles, and only during registration. No one — including the host — can see another contributor's bottle details or identity at this stage; the host sees only each bottle's anonymous number, wine style, and tasting-order position, never country/region/producer/vintage/notes or who contributed it.
- **Collecting**: the host starts tasting once at least one bottle is registered; this locks bottle registration, numbering, and the tasting order. Every participant (including the host and a bottle's own contributor) guesses every bottle **in the host's tasting order** (progress shown as e.g. `Bottle 4 — 1 of 5`), one at a time (Previous/Next, autosaved as they go), using the same controlled country/region/vintage/grape-blend inputs as registration, rates it 50–100, and sets a confidence level. Wine style stays hidden from other participants until reveal. Guesses lock permanently on final submission.
- **Revealed**: the host reveals via a confirmation modal (irreversible), which unlocks the shared report for everyone in real time. The report shows each bottle's full answer key, its **wine style** and **served position** (e.g. "Style: Red · Served 1st"), **and its contributor's name**, alongside Wine of the Night, Best Taster, Most Divisive Wine (with tie handling), per-bottle guess breakdowns (core vs. bonus categories), and the taster leaderboard.
- **Scoring** is a 120-point-per-wine model: a 100-point **core** score (country 20, region 30, grape/blend 30, vintage 20 — exact, case/whitespace/accent-lenient matching) plus a 20-point **bonus** score (producer 10, wine/cuvée 10, exact normalised match). Price band is never scored, and no points are awarded or deducted for contributing a bottle. The leaderboard ranks by total points, then core points, then exact core-category matches, with ties sharing a rank. See "Scoring model" below for full details.
- A **"See a demo report"** link on the home page (`/demo`) renders a canned 3-bottle, 3-taster report (including contributor names) entirely client-side, for a quick look without creating a real tasting. It's explicitly labeled as a local-only demo and isn't saved anywhere.

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

Sessions live in Supabase Postgres. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for the full setup, the bottle-numbering concurrency approach, and the security model (host/guest tokens, Row Level Security, and why there's no service-role key or user accounts anywhere in this app). In short:

- The browser only keeps two things locally: the **host token** for tastings this device hosts, and the **guest token** for tastings this device has joined (`lib/deviceStorage.ts`) — the host's own participant token is stored in the same slot a regular guest's would be, so registration/tasting pages need no host-specific branching. Everything else — session, bottles, guesses — is fetched live from Supabase.
- Host-only mutations (create session, start tasting, reveal) go through Next.js Route Handlers (`app/api/host/*`), which validate the host token server-side.
- Participant actions (join, register/edit/delete a bottle, autosave a guess, final submit) call `SECURITY DEFINER` Postgres functions directly from the browser using the public anon key; the functions validate the guest token and bottle ownership inside Postgres.
- Supabase Realtime pushes live status/bottle-count/submission-count updates to the host and registration pages, and reveal transitions to the tasting/results pages.

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

## Recommended next features

- Real user accounts (host/guest authentication) instead of bearer tokens
- Token expiry/revocation and rate limiting on the participant RPC functions
- Partial-credit scoring rules (e.g. close vintage, correct country but wrong region)
- Historical performance analytics across multiple tastings per guest
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

These don't require a Supabase project — they test the pure scoring/ranking/validation logic in isolation. Bottle-numbering concurrency, RLS enforcement, and the registration/collecting/revealed lifecycle transitions are database-level guarantees exercised by the manual test checklist above against a live project, not by this unit-test suite.
