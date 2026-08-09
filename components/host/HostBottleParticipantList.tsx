import { Card } from "@/components/Card";
import { FieldScoreTable } from "@/components/report/WineResultCard";
import { HostBottleParticipantScore } from "@/lib/resultsReveal";

/**
 * Host-only per-participant score breakdown for one revealed bottle — see
 * README "Results reveal". Uses native `<details>`/`<summary>` disclosure
 * rows (same convention as WineResultCard's per-guest breakdown) rather than
 * a separate desktop-table/mobile-card implementation: the total is always
 * visible in the summary line, the browser handles aria-expanded and
 * keyboard interaction natively, and it reads cleanly at any width without
 * horizontal scrolling. Never rendered for participants.
 */
export function HostBottleParticipantList({
  participants,
}: {
  participants: HostBottleParticipantScore[];
}) {
  if (participants.length === 0) {
    return <Card className="text-sm text-cellar-muted">No eligible participants for this bottle.</Card>;
  }

  return (
    <div className="flex flex-col gap-2">
      {participants.map((participant) => (
        <details key={participant.guestName} className="rounded-sm border border-cellar-border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
            <span>{participant.guestName}</span>
            <span className="text-cellar-muted">
              {participant.submitted && participant.score
                ? `${participant.score.totalPoints}/${participant.score.totalPossiblePoints} pts`
                : "No submitted guess"}
            </span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-cellar-border px-3 py-3">
            {participant.submitted && participant.score ? (
              <FieldScoreTable
                heading="Score breakdown"
                fields={participant.score.fieldScores.filter((f) => f.category === "core")}
              />
            ) : (
              <p className="text-sm text-cellar-muted">No submitted guess for this bottle.</p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
