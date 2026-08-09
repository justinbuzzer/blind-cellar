import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { HomeLink } from "@/components/navigation/HomeLink";
import {
  buildParticipantBottleTotals,
  buildProvisionalLeaderboard,
} from "@/lib/resultsReveal";
import { ProvisionalLeaderboardResponse } from "@/lib/supabase/types";

interface HostLeaderboardClientProps {
  publicId: string;
  hostToken: string;
  response: ProvisionalLeaderboardResponse;
}

/**
 * Host-only provisional/final leaderboard — see README "Final leaderboard
 * and tasting recap". Ranking is entirely server-authorized data scoped
 * client-side through the exact same calculateTasterResults pipeline the
 * participant final leaderboard and the /results page use (see
 * lib/resultsReveal.ts); this component only ever renders numbers it was
 * handed, never computes a rank itself.
 */
export function HostLeaderboardClient({ publicId, hostToken, response }: HostLeaderboardClientProps) {
  const view = buildProvisionalLeaderboard(response);
  const hostControlsHref = `/host/${publicId}?token=${encodeURIComponent(hostToken)}`;
  const recapHref = `/host/${publicId}/recap?token=${encodeURIComponent(hostToken)}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <Link href={hostControlsHref}>
          <Button variant="ghost">Host Controls</Button>
        </Link>
      </div>

      <div>
        <SectionEyebrow>Leaderboard</SectionEyebrow>
        <h1 className="mt-1.5 font-display text-3xl font-semibold text-cellar-maroon-dark">
          {view.allRevealed ? "Final leaderboard" : "Provisional leaderboard"}
        </h1>
        {!view.allRevealed && (
          <>
            <p className="mt-2 text-sm font-medium text-cellar-gold">
              Provisional leaderboard · revealed bottles only
            </p>
            <p className="mt-1 text-xs text-cellar-muted">
              {view.revealedCount} of {view.totalCount} bottles revealed
            </p>
          </>
        )}
      </div>

      {view.tasterResults.length === 0 ? (
        <Card className="text-sm text-cellar-muted">
          No bottles have been revealed yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {view.tasterResults.map((taster) => {
            const bottleTotals = buildParticipantBottleTotals(view.wineResults, taster.guestId);
            return (
              <details key={taster.guestId} className="rounded-sm border border-cellar-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm px-3 py-2.5 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="sr-only">Rank</span>
                    <span aria-hidden="true" className="w-6 shrink-0 text-right font-display text-lg text-cellar-muted">
                      {taster.rank}
                    </span>
                    <span className="truncate">{taster.guestName}</span>
                  </span>
                  <span className="shrink-0 text-right text-cellar-maroon-dark">
                    <span className="font-semibold">{taster.overallAccuracyPercent.toFixed(1)}%</span>
                    <span className="ml-1.5 text-xs text-cellar-muted">
                      · {taster.totalPoints} / {taster.totalPossible}
                    </span>
                  </span>
                </summary>
                <div className="flex flex-col gap-2 border-t border-cellar-border px-3 py-2.5 text-sm text-cellar-muted">
                  <p>{taster.submittedGuessCount} bottle{taster.submittedGuessCount === 1 ? "" : "s"} scored</p>
                  <ul className="flex flex-col gap-1">
                    {bottleTotals.map((bt) => (
                      <li key={bt.code} className="flex items-center justify-between gap-3">
                        <span>{bt.code}</span>
                        <span className="text-cellar-text">
                          {bt.guess ? `${bt.guess.totalPoints} / ${bt.guess.totalPossiblePoints}` : "No submitted guess"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>
      )}

      <Link href={recapHref}>
        <Button variant="secondary" fullWidth>
          View tasting recap
        </Button>
      </Link>
    </main>
  );
}
