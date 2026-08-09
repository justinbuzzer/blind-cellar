import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { HomeLink } from "@/components/navigation/HomeLink";
import { buildProvisionalLeaderboard } from "@/lib/resultsReveal";
import { ProvisionalLeaderboardResponse } from "@/lib/supabase/types";

interface HostLeaderboardClientProps {
  publicId: string;
  hostToken: string;
  response: ProvisionalLeaderboardResponse;
}

/**
 * Host-only provisional leaderboard — see README "Results reveal". Ranking
 * is entirely server-authorized data scoped client-side through the exact
 * same calculateTasterResults pipeline the final /results page uses (see
 * lib/resultsReveal.ts); this component only ever renders numbers it was
 * handed, never computes a rank itself.
 */
export function HostLeaderboardClient({ publicId, hostToken, response }: HostLeaderboardClientProps) {
  const view = buildProvisionalLeaderboard(response);
  const hostControlsHref = `/host/${publicId}?token=${encodeURIComponent(hostToken)}`;

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
          <p className="mt-2 text-sm font-medium text-cellar-gold">
            Provisional leaderboard — revealed bottles only ({view.revealedCount} of {view.totalCount} bottles)
          </p>
        )}
      </div>

      {view.tasterResults.length === 0 ? (
        <Card className="text-sm text-cellar-muted">
          No bottles have been revealed yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {view.tasterResults.map((taster) => (
            <details key={taster.guestId} className="rounded-sm border border-cellar-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm px-3 py-2.5 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
                <span className="flex items-center gap-3">
                  <span className="w-6 shrink-0 font-display text-lg text-cellar-muted">{taster.rank}</span>
                  <span>{taster.guestName}</span>
                </span>
                <span className="text-cellar-maroon-dark">
                  {taster.overallAccuracyPercent.toFixed(1)}%
                </span>
              </summary>
              <div className="flex flex-col gap-1 border-t border-cellar-border px-3 py-2.5 text-sm text-cellar-muted">
                <p>
                  {taster.totalPoints} / {taster.totalPossible} points ·{" "}
                  {taster.submittedGuessCount} bottle{taster.submittedGuessCount === 1 ? "" : "s"} scored
                </p>
              </div>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}
