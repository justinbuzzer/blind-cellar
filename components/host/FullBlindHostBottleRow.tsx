import Link from "next/link";
import { Button } from "@/components/Button";
import { BottleProgressControl } from "@/components/host/BottleProgressControl";
import { HostBottleDTO } from "@/lib/supabase/types";
import { bottleLabel, formatBlindBottleLabel } from "@/lib/codes";
import { formatGuessProgressTitle, formatProgressAccessibleLabel } from "@/lib/hostProgress";

interface FullBlindHostBottleRowProps {
  wine: HostBottleDTO;
  publicId: string;
  hostToken: string;
  onRevealClick: (wineId: string) => void;
}

/**
 * One Host Controls row for a full_blind bottle's results reveal (see
 * README "Results reveal") — modeled directly on SeenHostBottleRow, but
 * full_blind never shows wine identity here (unlike Seen, where identity is
 * visible to everyone from the start): only the safe bottle number/
 * contributor label and reveal state, exactly like guess-entry already
 * shows. Reveal is independent per bottle and can happen in any order.
 */
export function FullBlindHostBottleRow({
  wine,
  publicId,
  hostToken,
  onRevealClick,
}: FullBlindHostBottleRowProps) {
  const revealed = wine.revealedAt !== null;

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-gold">
          {wine.anonymousCode}
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold text-cellar-maroon-dark">
          {formatBlindBottleLabel(wine.bottleNumber, wine.contributorName)}
        </h3>
        <p className="mt-1 text-sm text-cellar-muted">
          {revealed ? "Revealed" : "Unrevealed"}
        </p>
      </div>

      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        <BottleProgressControl
          publicId={publicId}
          hostToken={hostToken}
          wineId={wine.id}
          responseKind="guess"
          title={formatGuessProgressTitle(wine.bottleNumber)}
          accessibleLabel={formatProgressAccessibleLabel("guess", {
            bottleNumber: wine.bottleNumber,
          })}
        />
        {revealed ? (
          <Link href={`/host/${publicId}/bottle/${wine.id}/result?token=${encodeURIComponent(hostToken)}`}>
            <Button variant="secondary">View results</Button>
          </Link>
        ) : (
          <Button
            variant="secondary"
            onClick={() => onRevealClick(wine.id)}
            aria-label={`Reveal results for ${bottleLabel(wine.bottleNumber)}`}
          >
            Reveal results
          </Button>
        )}
      </div>
    </li>
  );
}
