import {
  FieldScore,
  WINE_STYLE_LABELS,
  WineResult,
} from "@/types/tasting";
import { compactWineLocationLabel, wineDisplayName } from "@/lib/appellations";
import { FieldBets } from "@/lib/betting";
import { Card } from "@/components/Card";
import { MatchBadge } from "@/components/MatchBadge";
import { Stat } from "@/components/Stat";
import { BottlePhoto } from "@/components/BottlePhoto";
import { ContributorLine } from "./ContributorLine";

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
  /**
   * Show each participant's final saved tasting note alongside their guess
   * (see README "Results reveal" — the completed-tasting shared report).
   * Deliberately opt-in and false by default: the host's existing report
   * view must render byte-identical output to before this field existed, so
   * only the participant-role caller passes true. Every ScoredGuess already
   * carries `note` regardless of this flag — this only controls rendering,
   * never what's fetched.
   */
  showNotes?: boolean;
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

export function WineResultCard({ result, rank, totalWines, showNotes = false }: WineResultCardProps) {
  const { wine } = result;
  // True for core_v3_appellation_conditional and core_v4_partial_credit alike
  // — both share the same no-bonus-tier, percentage-first-ranking display
  // shape; only legacy_v1 differs.
  const isPercentageBased = result.scoringVersion !== "legacy_v1";
  const bottlePossiblePoints = result.guesses[0]?.totalPossiblePoints;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <BottlePhoto photoPath={wine.photoPath} alt={`${wine.producer} — ${wine.wineName}`} size={72} />
        <div>
          <h3 className="font-display text-lg font-semibold text-cellar-maroon-dark">
            #{rank} · {wineDisplayName(wine)}
          </h3>
          <p className="mt-1 text-sm text-cellar-muted">
            {[compactWineLocationLabel(wine), wine.grapeBlend].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-sm text-cellar-muted">
            Style: {WINE_STYLE_LABELS[wine.wineStyle]} · Served {ordinal(wine.tastingOrder)}{" "}
            (tasting order {wine.tastingOrder} of {totalWines})
          </p>
          <ContributorLine
            contributorName={wine.contributorName}
            wineStyle={wine.wineStyle}
            contributorStyleSequence={wine.contributorStyleSequence}
          />
          {wine.hostNotes && (
            <p className="mt-1 text-sm italic text-cellar-muted">
              &ldquo;{wine.hostNotes}&rdquo;
            </p>
          )}
        </div>
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
                  {!isPercentageBased && (
                    <AppellationComparison
                      guessedAppellation={guess.appellationGuess}
                      actualAppellation={wine.appellation}
                    />
                  )}
                  {!isPercentageBased && (
                    <FieldScoreTable
                      heading="Bonus categories"
                      fields={bonusFields}
                    />
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-sm bg-cellar-bg-deep px-3 py-2 text-sm font-medium text-cellar-text">
                    {isPercentageBased ? (
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
                  {showNotes && guess.note && (
                    <p className="text-sm italic text-cellar-muted">
                      &ldquo;{guess.note}&rdquo;
                    </p>
                  )}
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

export function FieldScoreTable({
  heading,
  fields,
  bets,
}: {
  heading: string;
  fields: FieldScore[];
  /**
   * Betting sub-mode only (see README "Tasting modes" — "Betting") — when
   * provided, adds a "Bet" column showing how many credits this participant
   * wagered on each field. Omitted entirely by every non-betting call site,
   * which renders exactly as it did before this prop existed.
   */
  bets?: FieldBets;
}) {
  if (fields.length === 0) return null;
  const gridColsClass = bets
    ? "grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
    : "grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_auto]";
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-cellar-muted">
        {heading}
      </p>
      <div className={`grid ${gridColsClass} gap-2 text-xs font-semibold uppercase tracking-wide text-cellar-muted`}>
        <span>Field</span>
        <span>Guess</span>
        <span>Actual</span>
        {bets && <span>Bet</span>}
        <span />
      </div>
      {fields.map((fieldScore) =>
        fieldScore.applicable === false ? (
          <div
            key={fieldScore.field}
            className={`grid ${gridColsClass} items-center gap-2 text-sm`}
          >
            <span className="text-cellar-muted">{FIELD_LABELS[fieldScore.field]}</span>
            <span className="col-span-2 italic text-cellar-muted">Not applicable</span>
            {bets && <span />}
            <span />
          </div>
        ) : (
          <div
            key={fieldScore.field}
            className={`grid ${gridColsClass} items-center gap-2 text-sm`}
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
            {bets && (
              <span className="text-cellar-muted">
                {bets[fieldScore.field] ? `${bets[fieldScore.field]} cr` : "—"}
              </span>
            )}
            <MatchBadge correct={fieldScore.correct} points={fieldScore.points} pointsAvailable={fieldScore.pointsAvailable} />
          </div>
        )
      )}
    </div>
  );
}
