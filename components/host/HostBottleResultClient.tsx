import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { Stat } from "@/components/Stat";
import { HomeLink } from "@/components/navigation/HomeLink";
import { RevealedWineIdentity } from "@/components/report/RevealedWineIdentity";
import { BottleParticipantList } from "@/components/report/BottleParticipantList";
import { CreditsLeaderboard } from "@/components/report/CreditsLeaderboard";
import { bottleLabel } from "@/lib/codes";
import { buildBottleResultView, formatBottleAggregateSummary } from "@/lib/resultsReveal";
import { CreditLedgerEntry } from "@/lib/betting";
import { BottleResultForHostResponse } from "@/lib/supabase/types";

interface HostBottleResultClientProps {
  publicId: string;
  hostToken: string;
  response: BottleResultForHostResponse;
  /** Betting sub-mode only (see README "Tasting modes" — "Betting") — undefined for a non-betting session, which never renders the credits section at all. */
  creditEntries?: CreditLedgerEntry[];
}

/** Host-only per-bottle results view — see README "Results reveal". */
export function HostBottleResultClient({
  publicId,
  hostToken,
  response,
  creditEntries,
}: HostBottleResultClientProps) {
  const view = buildBottleResultView(response);
  const hostControlsHref = `/host/${publicId}?token=${encodeURIComponent(hostToken)}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <Link href={hostControlsHref}>
          <Button variant="ghost">Host Controls</Button>
        </Link>
      </div>

      <div className="border-b border-cellar-gold/40 pb-6">
        <SectionEyebrow>
          {bottleLabel(response.wine.bottleNumber)} · Results
        </SectionEyebrow>
        <div className="mt-2">
          <RevealedWineIdentity wine={view.wine} />
        </div>
        <p className="mt-2 text-xs text-cellar-muted">
          Bottle {response.wine.position} of {response.wine.totalBottles}
        </p>
      </div>

      <Card className="flex flex-col gap-3">
        <SectionEyebrow>Score summary</SectionEyebrow>
        {view.aggregate.submittedCount === 0 ? (
          <p className="text-sm text-cellar-muted">{formatBottleAggregateSummary(view.aggregate)}</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 rounded-sm bg-cellar-bg-deep p-3 text-center">
            <Stat
              label="Submitted"
              value={`${view.aggregate.submittedCount} / ${view.aggregate.eligibleCount}`}
            />
            <Stat
              label="Average score"
              value={`${view.aggregate.averageScore} / ${view.aggregate.totalPossiblePoints}`}
            />
            <Stat
              label="Highest score"
              value={`${view.aggregate.highestScore} / ${view.aggregate.totalPossiblePoints}`}
            />
          </div>
        )}
      </Card>

      <section className="flex flex-col gap-2">
        <SectionEyebrow>Participant breakdown</SectionEyebrow>
        <BottleParticipantList participants={view.participants} />
      </section>

      {creditEntries && (
        <section className="flex flex-col gap-2">
          <SectionEyebrow>Credits leaderboard</SectionEyebrow>
          <CreditsLeaderboard entries={creditEntries} />
        </section>
      )}

      <Link href={hostControlsHref}>
        <Button fullWidth>Reveal another bottle</Button>
      </Link>
    </main>
  );
}
