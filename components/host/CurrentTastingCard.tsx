import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import {
  formatAllSubmittedMessage,
  formatGroupProgressLine,
  NO_ELIGIBLE_PARTICIPANTS_MESSAGE,
} from "@/lib/hostProgress";
import { HostCurrentTastingState } from "@/lib/hostCurrentTasting";

interface CurrentTastingCardProps {
  state: HostCurrentTastingState;
  leaderboardHref: string;
  recapHref: string;
  resultsHref: string;
  /** Opens the correct existing confirmation — the same one the detailed per-bottle/active-bottle controls already use. */
  onRevealClick: (wineId: string) => void;
  onEndSeenTastingClick: () => void;
  /** Polite live-region text for a progress change; empty string announces nothing. */
  announcement: string;
}

function bottleDisplayLabel(bottle: { label: string; courseLabel?: string }): string {
  return bottle.courseLabel ? `${bottle.courseLabel} · ${bottle.label}` : bottle.label;
}

/**
 * The compact, state-aware summary at the top of Host Controls — see README
 * "Current tasting". Purely presentational: every action it renders calls
 * back into HostControlClient.tsx's existing handlers/confirmation modals,
 * never a second reveal/end-tasting path.
 */
export function CurrentTastingCard({
  state,
  leaderboardHref,
  recapHref,
  resultsHref,
  onRevealClick,
  onEndSeenTastingClick,
  announcement,
}: CurrentTastingCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <SectionEyebrow>Current tasting</SectionEyebrow>

      {state.kind === "no_eligible_bottles" && (
        <p className="text-sm text-cellar-muted">No bottles are registered for this tasting.</p>
      )}

      {state.kind === "awaiting_responses" && (
        <AwaitingResponses
          state={state}
          onRevealClick={onRevealClick}
          onEndSeenTastingClick={onEndSeenTastingClick}
        />
      )}

      {state.kind === "choose_next_bottle" && (
        <>
          {state.lastRevealedBottle && (
            <p className="font-display text-xl font-semibold text-cellar-maroon-dark">
              {bottleDisplayLabel(state.lastRevealedBottle)} revealed
            </p>
          )}
          <p className="text-sm text-cellar-muted">Choose the next bottle from the list below.</p>
        </>
      )}

      {state.kind === "complete" && (
        <>
          <p className="text-sm text-cellar-muted">
            {state.primaryAction?.type === "view_results"
              ? "All ratings are revealed."
              : "All bottle results are revealed."}
          </p>
          {state.primaryAction?.type === "view_final_leaderboard" && (
            <Link href={leaderboardHref}>
              <Button fullWidth>{state.primaryAction.label}</Button>
            </Link>
          )}
          {state.primaryAction?.type === "view_results" && (
            <Link href={resultsHref}>
              <Button fullWidth>{state.primaryAction.label}</Button>
            </Link>
          )}
          {state.secondaryAction && (
            <Link
              href={recapHref}
              className="min-h-[44px] text-center text-sm font-medium text-cellar-maroon underline-offset-2 hover:underline"
            >
              {state.secondaryAction.label}
            </Link>
          )}
        </>
      )}
    </Card>
  );
}

function AwaitingResponses({
  state,
  onRevealClick,
  onEndSeenTastingClick,
}: {
  state: Extract<HostCurrentTastingState, { kind: "awaiting_responses" }>;
  onRevealClick: (wineId: string) => void;
  onEndSeenTastingClick: () => void;
}) {
  const progressKind = state.progress?.noun === "rated" ? "rating" : "guess";

  return (
    <>
      {state.currentBottle && (
        <p className="font-display text-xl font-semibold text-cellar-maroon-dark">
          {bottleDisplayLabel(state.currentBottle)}
        </p>
      )}
      {state.progress && (
        <p className="text-sm text-cellar-muted">
          {state.progress.eligibleCount === 0
            ? NO_ELIGIBLE_PARTICIPANTS_MESSAGE
            : formatGroupProgressLine(
                state.progress.completedCount,
                state.progress.eligibleCount,
                progressKind
              )}
        </p>
      )}
      {state.allComplete && (
        <p className="text-sm text-cellar-muted">{formatAllSubmittedMessage(progressKind)}</p>
      )}
      {state.primaryAction && (
        <Button
          fullWidth
          onClick={() => {
            if (state.primaryAction?.type === "reveal_results" && state.primaryAction.wineId) {
              onRevealClick(state.primaryAction.wineId);
            } else if (state.primaryAction?.type === "end_seen_tasting") {
              onEndSeenTastingClick();
            }
          }}
          aria-label={
            state.currentBottle
              ? `Reveal results for ${bottleDisplayLabel(state.currentBottle)}`
              : state.primaryAction.label
          }
        >
          {state.primaryAction.label}
        </Button>
      )}
    </>
  );
}
