import Link from "next/link";
import { Button } from "@/components/Button";
import { HostBottleDTO } from "@/lib/supabase/types";
import {
  formatCourseBottleRowLabel,
  formatReleaseBottleAriaLabel,
  isCourseBottleReleasable,
} from "@/lib/courseRelease";

interface CourseHostBottleRowProps {
  wine: HostBottleDTO;
  /** Whether this wine is the session's current released (but not yet revealed) bottle. */
  isActive: boolean;
  /** tasting_sessions.active_wine_id — null when no Course bottle is currently active. */
  activeWineId: string | null;
  publicId: string;
  hostToken: string;
  onReleaseClick: (wineId: string) => void;
}

/**
 * One Host Controls row for a course_reveal bottle's host-selected,
 * non-sequential release (see README "Course-by-course host-selected
 * release") — modeled directly on FullBlindHostBottleRow, but release is
 * only ever available for one bottle at a time (unlike full_blind's
 * always-available-in-any-order reveal), and this row never itself reveals
 * a bottle — release and reveal are deliberately separate actions.
 */
export function CourseHostBottleRow({
  wine,
  isActive,
  activeWineId,
  publicId,
  hostToken,
  onReleaseClick,
}: CourseHostBottleRowProps) {
  const revealed = wine.revealedAt !== null;
  const releasable = isCourseBottleReleasable(wine, activeWineId);

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-gold">
          {wine.anonymousCode}
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold text-cellar-maroon-dark">
          {formatCourseBottleRowLabel(wine.bottleNumber, wine.contributorName)}
        </h3>
        <p className="mt-1 text-sm text-cellar-muted">
          {revealed ? "Revealed" : isActive ? "Current bottle" : "Unrevealed"}
        </p>
      </div>

      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        {revealed && (
          <Link
            href={`/host/${publicId}/bottle/${wine.id}/result?token=${encodeURIComponent(hostToken)}`}
          >
            <Button variant="secondary">View results</Button>
          </Link>
        )}
        {releasable && (
          <Button
            variant="secondary"
            onClick={() => onReleaseClick(wine.id)}
            aria-label={formatReleaseBottleAriaLabel(wine.bottleNumber, wine.contributorName)}
          >
            Release this bottle
          </Button>
        )}
      </div>
    </li>
  );
}
