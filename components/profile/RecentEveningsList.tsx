import Link from "next/link";
import { CombinedRole, RecentEvening } from "@/lib/profile";
import { TASTING_MODE_LABELS } from "@/types/tasting";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function roleLabel(role: CombinedRole): string {
  if (role === "host_and_participant") return "Host and participant";
  return role === "host" ? "Host" : "Participant";
}

/** See README "Palate Profile" — "Recent evenings". Renders nothing when empty; the At a glance/ledger empty states already cover "nothing yet". */
export function RecentEveningsList({ evenings }: { evenings: RecentEvening[] }) {
  if (evenings.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-semibold text-cellar-maroon-dark">Recent evenings</h2>
      <ul className="divide-y divide-cellar-border">
        {evenings.map((evening) => (
          <li key={evening.publicId} className="flex flex-col gap-1.5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-cellar-maroon-dark">{evening.title}</h3>
              <span className="text-xs uppercase tracking-[0.1em] text-cellar-muted">
                {TASTING_MODE_LABELS[evening.tastingMode]}
              </span>
            </div>
            <p className="text-sm text-cellar-muted">
              {formatDate(evening.tastingDate)} · {evening.bottleCount}{" "}
              {evening.bottleCount === 1 ? "bottle" : "bottles"} · {roleLabel(evening.role)}
            </p>
            <Link
              href={`/results/${evening.publicId}?from=account`}
              className="inline-flex min-h-[44px] w-fit items-center text-sm font-medium text-cellar-maroon underline-offset-4 hover:text-cellar-maroon-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
            >
              View report <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
