interface MatchBadgeProps {
  correct: boolean;
}

/** A small visual indicator marking a guessed field as correct or incorrect. */
export function MatchBadge({ correct }: MatchBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        correct
          ? "bg-cellar-success/10 text-cellar-success"
          : "bg-cellar-danger/10 text-cellar-danger"
      }`}
    >
      <span aria-hidden="true">{correct ? "✓" : "✕"}</span>
      {correct ? "Correct" : "Incorrect"}
    </span>
  );
}
