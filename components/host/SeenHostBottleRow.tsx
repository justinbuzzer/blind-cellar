import { Button } from "@/components/Button";
import { BottleProgressControl } from "@/components/host/BottleProgressControl";
import { HostBottleDTO } from "@/lib/supabase/types";
import {
  formatSeenGroupRating,
  formatSeenRatingStatus,
  formatSeenWineIdentity,
  formatSeenWineSecondaryLine,
} from "@/lib/seenHostControls";
import { RATING_PROGRESS_TITLE, formatProgressAccessibleLabel } from "@/lib/hostProgress";

interface SeenHostBottleRowProps {
  wine: HostBottleDTO;
  publicId: string;
  hostToken: string;
  onRevealClick: (wineId: string) => void;
}

/**
 * One Host Controls row for a Seen-tasting bottle (see README "Seen Host
 * Controls") — wine identity is the primary display, the bottle's existing
 * anonymous label is kept only as small operational context, and rating
 * status/reveal state are easy to scan without charts, colour-only status,
 * or participant names. Reveal is independent per bottle: this row never
 * knows or cares whether any other bottle has been revealed.
 *
 * Only ever rendered for a bottle whose `seen` field is populated — see
 * HostBottleDTO, populated by get_host_session only for seen-mode sessions.
 */
export function SeenHostBottleRow({ wine, publicId, hostToken, onRevealClick }: SeenHostBottleRowProps) {
  const seen = wine.seen;
  if (!seen) return null;

  const revealed = seen.ratingsRevealedAt !== null;
  const identity = formatSeenWineIdentity(seen);

  const progressControl = (
    <BottleProgressControl
      publicId={publicId}
      hostToken={hostToken}
      wineId={wine.id}
      responseKind="rating"
      title={RATING_PROGRESS_TITLE}
      subtitle={identity}
      accessibleLabel={formatProgressAccessibleLabel("rating", { wineIdentityLabel: identity })}
    />
  );

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-gold">
          {wine.anonymousCode}
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold text-cellar-maroon-dark">
          {identity}
        </h3>
        <p className="mt-1 text-sm text-cellar-muted">{formatSeenWineSecondaryLine(seen)}</p>
      </div>

      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        {revealed ? (
          <>
            <p className="text-sm font-medium text-cellar-text">Ratings revealed</p>
            <p className="text-sm text-cellar-text">{formatSeenGroupRating(seen.groupRating)}</p>
            <div className="flex items-center gap-2">
              <p className="text-sm text-cellar-muted">
                {formatSeenRatingStatus(seen.ratedCount, seen.eligibleCount)}
              </p>
              {progressControl}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <p className="text-sm text-cellar-muted">
                {formatSeenRatingStatus(seen.ratedCount, seen.eligibleCount)}
              </p>
              {progressControl}
            </div>
            <Button
              variant="secondary"
              onClick={() => onRevealClick(wine.id)}
              aria-label={`Reveal ratings for ${identity}`}
            >
              Reveal ratings
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
