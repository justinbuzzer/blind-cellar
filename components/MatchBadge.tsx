interface MatchBadgeProps {
  correct: boolean;
  points: number;
  pointsAvailable: number;
}

/**
 * A small visual indicator marking a guessed field as correct, partially
 * correct, or incorrect. `correct` decides green/red exactly as before this
 * app had partial credit (core_v3_appellation_conditional and legacy_v1
 * fields are always all-or-nothing, so `points` is always either `0` or
 * `pointsAvailable` for them — this amber state is only ever reachable for a
 * core_v4_partial_credit field). The glyph/label pair (not colour alone)
 * carries the distinction, matching this component's existing accessibility
 * approach.
 */
export function MatchBadge({ correct, points, pointsAvailable }: MatchBadgeProps) {
  const partial = !correct && points > 0;
  const toneClasses = correct
    ? "bg-cellar-success/10 text-cellar-success"
    : partial
      ? "bg-cellar-warning/10 text-cellar-warning"
      : "bg-cellar-danger/10 text-cellar-danger";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses}`}
    >
      <span aria-hidden="true">{correct ? "✓" : partial ? "◐" : "✕"}</span>
      {correct ? "Correct" : partial ? `Partial (${points}/${pointsAvailable})` : "Incorrect"}
    </span>
  );
}
