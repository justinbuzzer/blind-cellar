import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Stat } from "@/components/Stat";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { HomeLink } from "@/components/navigation/HomeLink";
import { RevealedWineIdentity } from "@/components/report/RevealedWineIdentity";
import {
  buildHostRecapBottleSummaries,
  buildProvisionalLeaderboard,
  formatHostRecapBottleLine,
} from "@/lib/resultsReveal";
import { HostSessionResponse, ProvisionalLeaderboardResponse } from "@/lib/supabase/types";
import { TASTING_MODE_LABELS } from "@/types/tasting";

interface HostRecapClientProps {
  publicId: string;
  hostToken: string;
  session: HostSessionResponse;
  leaderboard: ProvisionalLeaderboardResponse;
}

/**
 * Host-only tasting recap — see README "Final leaderboard and tasting
 * recap". Reuses the exact same get_provisional_leaderboard_for_host
 * payload and buildProvisionalLeaderboard/buildHostRecapBottleSummaries
 * pipeline the host leaderboard page already uses — no second scoring pass,
 * only a different presentation of the same server-authorized data. Session
 * metadata (title, date, mode, bottle/guest counts) comes from the existing
 * get_host_session response already used by Host Controls.
 */
export function HostRecapClient({ publicId, hostToken, session, leaderboard }: HostRecapClientProps) {
  const view = buildProvisionalLeaderboard(leaderboard);
  const bottleSummaries = buildHostRecapBottleSummaries(view.wineResults);
  const scoredGuessCount = view.wineResults.reduce((sum, wr) => sum + wr.guesses.length, 0);
  const hostControlsHref = `/host/${publicId}?token=${encodeURIComponent(hostToken)}`;
  const leaderboardHref = `/host/${publicId}/leaderboard?token=${encodeURIComponent(hostToken)}`;

  const dateLabel = session.session.tastingDate
    ? new Date(session.session.tastingDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <Link href={hostControlsHref}>
          <Button variant="ghost">Host Controls</Button>
        </Link>
      </div>

      <div>
        <SectionEyebrow>Tasting recap</SectionEyebrow>
        <h1 className="mt-1.5 font-display text-3xl font-semibold text-cellar-maroon-dark">
          {session.session.title}
        </h1>
        <p className="mt-2 text-sm text-cellar-muted">
          {[dateLabel, TASTING_MODE_LABELS[session.session.tastingMode]].filter(Boolean).join(" · ")}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-cellar-maroon-dark">Session summary</h2>
        <Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Bottles" value={session.wines.length} />
            <Stat label="Participants" value={session.guests.length} />
            <Stat label="Scored guesses" value={scoredGuessCount} />
            <Stat label="Status" value={view.allRevealed ? "Revealed" : "In progress"} />
          </div>
          {!view.allRevealed && (
            <p className="mt-3 text-xs font-medium text-cellar-gold">
              Provisional · {view.revealedCount} of {view.totalCount} bottles revealed
            </p>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold text-cellar-maroon-dark">Bottle overview</h2>
        {bottleSummaries.length === 0 ? (
          <Card className="text-sm text-cellar-muted">No bottles have been revealed yet.</Card>
        ) : (
          <div className="flex flex-col gap-3">
            {bottleSummaries.map((summary) => (
              <Card key={summary.wine.id} className="flex flex-col gap-2">
                <div>
                  <SectionEyebrow>{summary.wine.code}</SectionEyebrow>
                  <div className="mt-1">
                    <RevealedWineIdentity wine={summary.wine} />
                  </div>
                </div>
                <p className="text-sm text-cellar-muted">{formatHostRecapBottleLine(summary)}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-semibold text-cellar-maroon-dark">Participant scores</h2>
        <p className="text-sm text-cellar-muted">
          Rankings and each participant&rsquo;s per-bottle totals are on the leaderboard page.
        </p>
        <Link href={leaderboardHref}>
          <Button variant="secondary" fullWidth>
            {view.allRevealed ? "View final leaderboard" : "View provisional leaderboard"}
          </Button>
        </Link>
      </section>
    </main>
  );
}
