interface MatchBadgeProps {
  correct: boolean;
}

/** A small visual indicator marking a guessed field as correct or incorrect. */
export function MatchBadge({ correct }: MatchBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        correct
          ? "bg-green-100 text-green-800"
          : "bg-red-50 text-red-700"
      }`}
    >
      <span aria-hidden="true">{correct ? "✓" : "✕"}</span>
      {correct ? "Correct" : "Incorrect"}
    </span>
  );
}
