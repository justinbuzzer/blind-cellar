import { CreditLedgerEntry } from "@/lib/betting";
import { Card } from "@/components/Card";

interface CreditsLeaderboardProps {
  entries: CreditLedgerEntry[];
  /** For "(you)" row-marking — see lib/resultsReveal.ts's withYouSuffix convention. Omit when the caller has no notion of "you" (e.g. the host). */
  myGuestId?: string;
}

/**
 * Betting sub-mode only (see README "Tasting modes" — "Betting") — the one
 * component every credits-leaderboard surface renders (post-reveal screens,
 * the stand-alone leaderboard pages, the final report, and the host's
 * equivalents), fed by lib/betting.ts's buildCreditLedger. Deliberately
 * shown *alongside* the existing accuracy-based TasterLeaderboard, never
 * replacing it — see README "Tasting modes" — "Betting".
 */
export function CreditsLeaderboard({ entries, myGuestId }: CreditsLeaderboardProps) {
  if (entries.length === 0) {
    return (
      <Card className="text-center text-sm text-cellar-muted">
        No participants have a credit balance yet.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-cellar-muted">
        Credits won and lost betting on guesses, starting from each participant&rsquo;s chosen balance.
      </p>
      {entries.map((entry) => {
        const isYou = entry.guestId === myGuestId;
        const delta = entry.currentBalance - entry.startingCredits;
        return (
          <Card key={entry.guestId} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-6 shrink-0 font-display text-lg text-cellar-muted">
                {entry.rank}
              </span>
              <p className="font-medium text-cellar-text">
                {entry.guestName}
                {isYou && " (you)"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-semibold text-cellar-maroon-dark">
                {entry.currentBalance}
              </p>
              <p
                className={`text-xs ${
                  delta > 0
                    ? "text-cellar-success"
                    : delta < 0
                      ? "text-cellar-danger"
                      : "text-cellar-muted"
                }`}
              >
                {delta > 0 ? "+" : ""}
                {delta} from {entry.startingCredits} starting
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
