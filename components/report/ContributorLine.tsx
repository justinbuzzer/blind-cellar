import { formatContributorBottleLabel, wineStyleToContributorBucket } from "@/lib/contributorLabel";
import { WineStyle } from "@/types/tasting";

interface ContributorLineProps {
  contributorName?: string | null;
  wineStyle: WineStyle;
  contributorStyleSequence?: number | null;
}

/**
 * "Ava — Red #1" — the secondary contributor label shown on a revealed
 * bottle's report/result card (see README "Bottle labels"), matching the
 * same bare "{Name} — {Style} #{sequence}" format used on guess-entry
 * headers rather than the old "Contributed by {name}" phrasing. Shared by
 * WineResultCard, RevealedWineIdentity, and SeenBottleResultCard, which
 * previously each duplicated an identical "Contributed by {name}" block.
 * wineStyle is always already present on these post-reveal DTOs, so the
 * bucket is derived client-side rather than carried as a separate field.
 */
export function ContributorLine({ contributorName, wineStyle, contributorStyleSequence }: ContributorLineProps) {
  const label = formatContributorBottleLabel({
    contributorDisplayName: contributorName,
    styleBucket: wineStyleToContributorBucket(wineStyle),
    contributorStyleSequence,
  });
  if (!label) return null;
  return <p className="mt-1 text-sm text-cellar-muted">{label}</p>;
}
