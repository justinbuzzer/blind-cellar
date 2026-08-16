import { CONTRIBUTOR_STYLE_BUCKET_LABELS, ContributorStyleBucket, WineStyle } from "@/types/tasting";
import { bottleLabel } from "@/lib/codes";

/**
 * Maps the canonical five-value WineStyle to the coarser bucket used for
 * contributor bottle labels (see README "Bottle labels") — sweet and other
 * both collapse into "other", matching the server-side bucketing used to
 * compute contributor_style_sequence (see register_bottle in
 * supabase/schema.sql). Only ever called where wineStyle is already safe to
 * read (post-reveal, Seen mode, or host views) — never used to derive a
 * pre-reveal bucket, which the server computes and sends directly instead
 * (see ActiveBottleDTO.contributorStyleBucket / GuestSessionWineDTO.contributorStyleBucket).
 */
export function wineStyleToContributorBucket(style: WineStyle): ContributorStyleBucket {
  switch (style) {
    case "red":
    case "white":
    case "bubbles":
      return style;
    default:
      return "other";
  }
}

/** The two-line bottle header shape used on guess-entry/owner-view headers (see README "Bottle labels") — tastingOrderLabel ("Bottle 3") stays primary, contributorLabel ("Ava — Red #1") is secondary and may be null. */
export interface BottleDisplayLabels {
  tastingOrderLabel: string;
  contributorLabel: string | null;
}

export interface ContributorBottleLabelInput {
  contributorDisplayName: string | null | undefined;
  styleBucket: ContributorStyleBucket | null | undefined;
  contributorStyleSequence: number | null | undefined;
}

/**
 * "{Name} — {Red|White|Bubbles|Other} #{sequence}" — the secondary
 * contributor label shown under the primary "Bottle N" tasting-order label
 * (see README "Bottle labels"). Returns null when there's no contributor
 * name at all (a bottle with no recorded contributor_guest_id) — the caller
 * simply omits the secondary line in that case, same as the old
 * "Contributed by {name}" blocks did. A name with no style bucket/sequence
 * yet available (should not happen for any bottle registered after this
 * feature shipped, but covers a legacy row this app can't safely derive a
 * sequence for) falls back to the bare name, never a fabricated "#0" or a
 * dangling "— undefined".
 */
export function formatContributorBottleLabel(input: ContributorBottleLabelInput): string | null {
  const name = input.contributorDisplayName?.trim();
  if (!name) return null;
  if (input.styleBucket && input.contributorStyleSequence != null) {
    return `${name} — ${CONTRIBUTOR_STYLE_BUCKET_LABELS[input.styleBucket]} #${input.contributorStyleSequence}`;
  }
  return name;
}

/** Builds the two-line header shape from a bottle number + contributor-label input in one call — see BottleDisplayLabels. */
export function buildBottleDisplayLabels(
  bottleNumber: number,
  input: ContributorBottleLabelInput
): BottleDisplayLabels {
  return {
    tastingOrderLabel: bottleLabel(bottleNumber),
    contributorLabel: formatContributorBottleLabel(input),
  };
}

/**
 * "Bottle 3. Contributed by Ava, Red bottle 1." — the accessible-name
 * counterpart to formatContributorBottleLabel, spelling out both the
 * tasting-order number and the contributor label in one sentence rather
 * than relying on visual hierarchy alone (see README "Bottle labels" —
 * accessibility). Mirrors lib/codes.ts formatTastingOrderAccessibleLabel's
 * existing "spell it out in words" convention.
 */
export function formatBottleAccessibleLabel(
  bottleNumber: number,
  input: ContributorBottleLabelInput
): string {
  const name = input.contributorDisplayName?.trim();
  if (!name) return `Bottle ${bottleNumber}.`;
  if (input.styleBucket && input.contributorStyleSequence != null) {
    const styleLabel = CONTRIBUTOR_STYLE_BUCKET_LABELS[input.styleBucket];
    return `Bottle ${bottleNumber}. Contributed by ${name}, ${styleLabel} bottle ${input.contributorStyleSequence}.`;
  }
  return `Bottle ${bottleNumber}. Contributed by ${name}.`;
}
