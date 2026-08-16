import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { bottleLabel } from "@/lib/codes";
import { formatContributorBottleLabel } from "@/lib/contributorLabel";
import { RevealedBottleSummaryDTO } from "@/lib/supabase/types";

interface ResultsHubListProps {
  bottles: RevealedBottleSummaryDTO[];
  allRevealed: boolean;
  resultHref: (wineId: string) => string;
  /** The new dedicated final-leaderboard page (rank/name/percentage only) — see README "Final leaderboard and tasting recap". */
  leaderboardHref: string;
  /** The new in-app tasting recap page. */
  recapHref: string;
}

/**
 * Participant results hub — see README "Results reveal". Shared by
 * full_blind (/tasting/[publicId]/results) and course_reveal
 * (/session/[publicId]/results), which differ only in the fetch/redirect
 * wrapper around this presentational list. Bottle number and contributor
 * name are shown for every bottle (never secret — see README "Bottle-order
 * contributor labels"); only actual wine identity requires a reveal, so an
 * unrevealed row simply has no "View results" action.
 */
export function ResultsHubList({ bottles, allRevealed, resultHref, leaderboardHref, recapHref }: ResultsHubListProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="p-0">
        <ol className="divide-y divide-cellar-border">
          {bottles.map((bottle) => {
            // Style/sequence come back null for a still-unrevealed bottle
            // (see get_revealed_bottles_summary in supabase/schema.sql) — the
            // contributor's name alone (never secret) still comes through,
            // so this naturally falls back to the bare name for those rows.
            const contributorLabel = formatContributorBottleLabel({
              contributorDisplayName: bottle.contributorName,
              styleBucket: bottle.contributorStyleBucket,
              contributorStyleSequence: bottle.contributorStyleSequence,
            });
            return (
              <li key={bottle.wineId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-cellar-text">{bottleLabel(bottle.bottleNumber)}</p>
                  {contributorLabel && <p className="text-xs text-cellar-muted">{contributorLabel}</p>}
                  <p className="text-xs text-cellar-muted">
                    {bottle.isRevealed ? "Revealed" : "Unrevealed"}
                  </p>
                </div>
                {bottle.isRevealed && (
                  <Link href={resultHref(bottle.wineId)}>
                    <Button variant="secondary">View results</Button>
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </Card>

      {allRevealed ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={recapHref} className="flex-1">
            <Button fullWidth>View tasting recap</Button>
          </Link>
          <Link href={leaderboardHref} className="flex-1">
            <Button variant="secondary" fullWidth>
              View final leaderboard
            </Button>
          </Link>
        </div>
      ) : (
        <Card className="text-sm text-cellar-muted">
          The final leaderboard will be available after all results are revealed.
        </Card>
      )}
    </div>
  );
}
