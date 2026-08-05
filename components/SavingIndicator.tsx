export type SaveState = "idle" | "saving" | "saved" | "error";

const LABELS: Record<SaveState, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  error: "Unable to save — check your connection",
};

const COLORS: Record<SaveState, string> = {
  idle: "",
  saving: "text-cellar-text/50",
  saved: "text-cellar-maroon",
  error: "text-cellar-danger",
};

export function SavingIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <p role="status" aria-live="polite" className={`text-xs font-medium ${COLORS[state]}`}>
      {LABELS[state]}
    </p>
  );
}
