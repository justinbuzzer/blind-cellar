import {
  FieldScore,
  WINE_STYLE_LABELS,
  WineResult,
} from "@/types/tasting";
import { compactWineLocationLabel } from "@/lib/appellations";
import { Card } from "@/components/Card";
import { MatchBadge } from "@/components/MatchBadge";
import { Stat } from "@/components/Stat";

const FIELD_LABELS: Record<string, string> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  grapeBlend: "Grape / blend",
  vintage: "Vintage",
  producer: "Producer",
  wineName: "Wine / cuvée",
};

interface WineResultCardProps {
  result: WineResult;
  rank: number;
  totalWines: number;
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function WineResultCard({ result, rank, totalWines }: WineResultCardProps) {
  const { wine } = result;
  const isCoreV3 = result.scoringVersion === "core_v3_appellation_conditional";
  const bottlePossiblePoints = result.guesses[0]?.totalPossiblePoints;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.15em] text-cellar-gold">
          #{rank} · {wine.code}
        </p>
        <h3 className="mt-1 font-display text-lg font-semibold text-cellar-maroon-dark">
          {wine.producer} — {wine.wineName} {wine.vintage}
        </h3>
        <p className="mt-1 text-sm text-cellar-muted">
          {[compactWineLocationLabel(wine), wine.grapeBlend].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-1 text-sm text-cellar-muted">
          Style: {WINE_STYLE_LABELS[wine.wineStyle]} · Served {ordinal(wine.tastingOrder)}{" "}
          (tasting order {wine.tastingOrder} of {totalWines})
        </p>
        {wine.contributorName && (
          <p className="mt-1 text-sm text-cellar-muted">
            Contributed by <span className="font-medium text-cellar-text">{wine.contributorName}</span>
          </p>
        )}
        {wine.hostNotes && (
          <p className="mt-1 text-sm italic text-cellar-muted">
            &ldquo;{wine.hostNotes}&rdquo;
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-sm bg-cellar-bg-deep p-3 text-center sm:grid-cols-4">
        <Stat label="Average" value={result.averageRating ?? "—"} />
        <Stat label="Ratings" value={result.numRatings} />
        <Stat label="Lowest" value={result.lowestRating ?? "—"} />
        <Stat label="Highest" value={result.highestRating ?? "—"} />
      </div>

      {result.topTasters.length > 0 && (
        <p className="text-sm text-cellar-text">
          <span className="font-medium text-cellar-maroon">
            Top taster{result.topTasters.length > 1 ? "s" : ""} for this wine:
          </span>{" "}
          {result.topTasters.map((t) => t.guestName).join(", ")} (
          {result.topTasters[0].totalPoints}
          {bottlePossiblePoints !== undefined ? `/${bottlePossiblePoints}` : ""} pts)
        </p>
      )}

      {result.guesses.length === 0 ? (
        <p className="text-sm text-cellar-muted">
          No guesses submitted for this wine.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {result.guesses.map((guess) => {
            const isTopTaster = result.topTasters.some(
              (t) => t.guestId === guess.guestId
            );
            const coreFields = guess.fieldScores.filter((f) => f.category === "core");
            const bonusFields = guess.fieldScores.filter((f) => f.category === "bonus");
            return (
              <details
                key={guess.guestId}
                className="rounded-sm border border-cellar-border"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
                  <span>
                    {guess.guestName}
                    {isTopTaster && (
                      <span className="ml-2 text-xs font-medium uppercase tracking-[0.1em] text-cellar-maroon">
                        Top taster
                      </span>
                    )}
                  </span>
                  <span className="text-cellar-muted">
                    {guess.totalPoints}/{guess.totalPossiblePoints} pts
                    {guess.rating !== null ? ` · rated ${guess.rating}` : ""}
                  </span>
                </summary>
                <div className="flex flex-col gap-4 border-t border-cellar-border px-3 py-3">
                  <FieldScoreTable
                    heading="Core categories"
                    fields={coreFields}
                  />
                  {!isCoreV3 && (
                    <AppellationComparison
                      guessedAppellation={guess.appellationGuess}
                      actualAppellation={wine.appellation}
                    />
                  )}
                  {!isCoreV3 && (
                    <FieldScoreTable
                      heading="Bonus categories"
                      fields={bonusFields}
                    />
                  )}
                  {isCoreV3 && (
                    <PersonalPrecisionComparison
                      producerGuess={guess.producerGuess}
                      producerAnswer={wine.producer}
                      wineCuveeGuess={guess.wineCuveeGuess}
                      wineCuveeAnswer={wine.wineName}
                    />
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-sm bg-cellar-bg-deep px-3 py-2 text-sm font-medium text-cellar-text">
                    {isCoreV3 ? (
                      <span className="text-cellar-maroon">
                        Total: {guess.totalPoints}/{guess.totalPossiblePoints}
                      </span>
                    ) : (
                      <>
                        <span>
                          Core: {guess.corePoints}/{guess.corePossiblePoints}
                        </span>
                        <span>
                          Bonus: {guess.bonusPoints}/{guess.bonusPossiblePoints}
                        </span>
                        <span className="text-cellar-maroon">
                          Total: {guess.totalPoints}/{guess.totalPossiblePoints}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/**
 * Non-scored appellation comparison — legacy_v1 only (see README "Region and
 * Appellation" — "Blind-guess Appellation"). Under core_v3_appellation_conditional,
 * Appellation is instead a genuine scored FieldScore inside FieldScoreTable.
 * Deliberately outside FieldScoreTable: there is no FieldScore for
 * appellation under legacy_v1 (no correctness, no points, no badge), so this
 * renders as its own small block, hidden entirely when neither side has a
 * value. Shared by the final report (here) and the course_reveal per-bottle
 * reveal screen.
 */
export function AppellationComparison({
  guessedAppellation,
  actualAppellation,
}: {
  guessedAppellation?: string;
  actualAppellation?: string;
}) {
  if (!guessedAppellation && !actualAppellation) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-cellar-muted">
        Appellation
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
        <span className="text-cellar-text">
          Guess: <span className="text-cellar-muted">{guessedAppellation || "—"}</span>
        </span>
        <span className="text-cellar-text">
          Wine: <span className="text-cellar-muted">{actualAppellation || "—"}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Non-scored Producer / Wine-cuvée comparison — core_v3_appellation_conditional
 * only (see README "Scoring model"). There is no bonus category under this
 * model, so these two fields are shown purely for personal-note comparison,
 * never with a correct/incorrect badge or points. Hidden entirely when
 * neither side has any value for either field. Shared by the final report
 * (here) and the course_reveal per-bottle reveal screen.
 */
export function PersonalPrecisionComparison({
  producerGuess,
  producerAnswer,
  wineCuveeGuess,
  wineCuveeAnswer,
}: {
  producerGuess?: string;
  producerAnswer?: string;
  wineCuveeGuess?: string;
  wineCuveeAnswer?: string;
}) {
  const rows = [
    { label: "Producer", guess: producerGuess, answer: producerAnswer },
    { label: "Wine / cuvée", guess: wineCuveeGuess, answer: wineCuveeAnswer },
  ].filter((r) => r.guess || r.answer);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-cellar-muted">
        Personal precision calls
      </p>
      {rows.map((r) => (
        <div key={r.label} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm">
          <span className="w-28 shrink-0 text-cellar-muted">{r.label}</span>
          <span className="text-cellar-text">
            Guess: <span className="text-cellar-muted">{r.guess || "—"}</span>
          </span>
          <span className="text-cellar-text">
            Wine: <span className="text-cellar-muted">{r.answer || "—"}</span>
          </span>
        </div>
      ))}
      <p className="text-xs text-cellar-muted">Not scored under this tasting&rsquo;s scoring model.</p>
    </div>
  );
}

export function FieldScoreTable({
  heading,
  fields,
}: {
  heading: string;
  fields: FieldScore[];
}) {
  if (fields.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-cellar-muted">
        {heading}
      </p>
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 text-xs font-semibold uppercase tracking-wide text-cellar-muted">
        <span>Field</span>
        <span>Guess</span>
        <span>Actual</span>
        <span />
      </div>
      {fields.map((fieldScore) =>
        fieldScore.applicable === false ? (
          <div
            key={fieldScore.field}
            className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 text-sm"
          >
            <span className="text-cellar-muted">{FIELD_LABELS[fieldScore.field]}</span>
            <span className="col-span-2 italic text-cellar-muted">Not applicable</span>
            <span />
          </div>
        ) : (
          <div
            key={fieldScore.field}
            className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 text-sm"
          >
            <span className="text-cellar-muted">
              {FIELD_LABELS[fieldScore.field]}
            </span>
            <span className="truncate text-cellar-text">
              {fieldScore.guessedValue}
            </span>
            <span className="truncate text-cellar-muted">
              {fieldScore.answerValue}
            </span>
            <MatchBadge correct={fieldScore.correct} />
          </div>
        )
      )}
    </div>
  );
}
