import { AtAGlance } from "@/lib/profile";
import { MetricStrip } from "./MetricStrip";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** See README "Palate Profile" — "At a glance". No charts here; figures only. */
export function AtAGlanceStrip({ data }: { data: AtAGlance }) {
  const figures = [
    { label: "Tastings attended", value: String(data.tastingsAttended) },
    { label: "Bottles tasted", value: String(data.bottlesTasted) },
    { label: "Unique wines tasted", value: String(data.uniqueWinesTasted) },
    { label: "Ratings submitted", value: String(data.ratingsSubmitted) },
    {
      label: "Average personal rating",
      value: data.averagePersonalRating !== null ? data.averagePersonalRating.toFixed(1) : "No ratings recorded",
    },
    { label: "First tasting", value: formatDate(data.firstTastingDate) },
    { label: "Latest tasting", value: formatDate(data.latestTastingDate) },
  ];

  return (
    <div className="flex flex-col gap-2">
      <MetricStrip figures={figures} />
      <p className="text-xs text-cellar-muted">Best-effort wine matching based on recorded wine details.</p>
    </div>
  );
}
