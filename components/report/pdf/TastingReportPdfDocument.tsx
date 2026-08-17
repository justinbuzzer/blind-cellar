import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  FieldScore,
  ScoredGuess,
  ScoringVersion,
  TastingReport,
  TasterResult,
  WINE_STYLE_LABELS,
  WineAnswerKey,
  WineResult,
} from "@/types/tasting";
import { compactWineLocationLabel } from "@/lib/appellations";
import { formatContributorBottleLabel, wineStyleToContributorBucket } from "@/lib/contributorLabel";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { tastingBottlePhotoUrl } from "@/lib/photoUrl";
import {
  joinNames,
  ordinal,
  PdfFooter,
  PdfHeader,
  PdfHighlightItem,
  PdfHighlightsRow,
  PdfMatchIndicator,
  PdfSectionHeading,
  PdfStatGrid,
  pdfStyles,
} from "./pdfShared";
import { pdfColors } from "./pdfTheme";

/** Mirrors WineResultCard.tsx's FIELD_LABELS — see that file for why field-score display names live beside their renderer rather than in the shared types module. */
const FIELD_LABELS: Record<string, string> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  grapeBlend: "Grape / blend",
  vintage: "Vintage",
  producer: "Producer",
  wineName: "Wine / cuvée",
};

const localStyles = StyleSheet.create({
  fieldHeaderRow: { flexDirection: "row", marginTop: 4, marginBottom: 1 },
  fieldHeaderCell: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: pdfColors.muted,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 2,
    borderTopWidth: 0.5,
    borderTopColor: pdfColors.border,
  },
  colField: { flexBasis: "26%", fontSize: 8.5, color: pdfColors.muted, paddingRight: 4 },
  colGuess: { flexBasis: "28%", fontSize: 8.5, paddingRight: 4 },
  colActual: { flexBasis: "28%", fontSize: 8.5, color: pdfColors.muted, paddingRight: 4 },
  colResult: { flexBasis: "18%" },
  notApplicable: { flexBasis: "56%", fontSize: 8.5, fontFamily: "Helvetica-Oblique", color: pdfColors.muted },
  guessCard: {
    borderWidth: 1,
    borderColor: pdfColors.border,
    borderRadius: 2,
    marginTop: 6,
    padding: 8,
  },
  guessHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  totalsRow: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: pdfColors.bgDeep,
    borderRadius: 2,
    padding: 6,
    marginTop: 4,
  },
  lbHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: pdfColors.border,
    paddingBottom: 3,
    marginBottom: 2,
  },
  lbRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderTopWidth: 0.5,
    borderTopColor: pdfColors.border,
  },
  cardHeaderRow: { flexDirection: "row", gap: 8 },
  cardPhoto: { width: 48, height: 48, borderRadius: 2, objectFit: "cover" },
});

interface TastingReportPdfDocumentProps {
  report: TastingReport;
  title: string;
  dateLabel: string;
  modeLabel: string;
  /** See WineResultCard's showNotes — only true for the participant-role viewer who downloaded this PDF. */
  showNotes: boolean;
}

/**
 * Downloadable PDF mirror of TastingReportView (full_blind/course_reveal
 * report) — see README "Downloadable PDF summary". Built from the exact same
 * `TastingReport` already loaded on /results/[publicId], so this never
 * fetches anything the viewer wasn't already authorized to see.
 */
export function TastingReportPdfDocument({
  report,
  title,
  dateLabel,
  modeLabel,
  showNotes,
}: TastingReportPdfDocumentProps) {
  const { wineOfTheNight, bestTaster, mostDivisiveWine, wineResults, tasterResults, scoringVersion } = report;

  const highlights: PdfHighlightItem[] = [];
  if (wineOfTheNight.length > 0) {
    highlights.push({
      label: "Wine of the Night",
      title: joinNames(wineOfTheNight.map((w) => w.wine.code)),
      detail: `Avg rating ${wineOfTheNight[0].averageRating}`,
      tie: wineOfTheNight.length > 1,
    });
  }
  if (bestTaster.length > 0) {
    highlights.push({
      label: "Best Taster",
      title: joinNames(bestTaster.map((t) => t.guestName)),
      detail:
        scoringVersion === "core_v3_appellation_conditional"
          ? `${bestTaster[0].overallAccuracyPercent.toFixed(1)}% accuracy · ${bestTaster[0].totalPoints} / ${bestTaster[0].totalPossible} points`
          : `${bestTaster[0].totalPoints} / ${bestTaster[0].totalPossible} total points, including ${bestTaster[0].bonusPoints} bonus points`,
      tie: bestTaster.length > 1,
    });
  }
  if (mostDivisiveWine.length > 0 && mostDivisiveWine[0].ratingSpread) {
    highlights.push({
      label: "Most Divisive Wine",
      title: joinNames(mostDivisiveWine.map((w) => w.wine.code)),
      detail: `Spread of ${mostDivisiveWine[0].ratingSpread} points`,
      tie: mostDivisiveWine.length > 1,
    });
  }

  return (
    <Document title={title}>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeader
          eyebrow="The tasting report"
          title={title}
          supporting={[dateLabel, modeLabel].filter(Boolean).join(" · ")}
        />
        <PdfHighlightsRow items={highlights} />

        <PdfSectionHeading>The tasting ledger</PdfSectionHeading>
        {wineResults.map((result, index) => (
          <WineResultBlock
            key={result.wine.id}
            result={result}
            rank={index + 1}
            totalWines={wineResults.length}
            showNotes={showNotes}
          />
        ))}

        <PdfSectionHeading>Taster leaderboard</PdfSectionHeading>
        <LeaderboardTable results={tasterResults} scoringVersion={scoringVersion} />

        <PdfFooter />
      </Page>
    </Document>
  );
}

function WineResultBlock({
  result,
  rank,
  totalWines,
  showNotes,
}: {
  result: WineResult;
  rank: number;
  totalWines: number;
  showNotes: boolean;
}) {
  const { wine } = result;
  const isCoreV3 = result.scoringVersion === "core_v3_appellation_conditional";
  const bottlePossiblePoints = result.guesses[0]?.totalPossiblePoints;
  const contributorLabel = formatContributorBottleLabel({
    contributorDisplayName: wine.contributorName,
    styleBucket: wineStyleToContributorBucket(wine.wineStyle),
    contributorStyleSequence: wine.contributorStyleSequence,
  });
  const photoUrl = tastingBottlePhotoUrl(wine.photoPath, getSupabaseEnv()?.url);

  return (
    <View style={pdfStyles.card}>
      <View style={localStyles.cardHeaderRow}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt concept; this isn't a DOM img */}
        {photoUrl ? <Image src={photoUrl} style={localStyles.cardPhoto} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={pdfStyles.cardEyebrow}>
            #{rank} · {wine.code}
          </Text>
          <Text style={pdfStyles.cardTitle}>
            {wine.producer} — {wine.wineName} {wine.vintage}
          </Text>
          <Text style={pdfStyles.cardSubtext}>
            {[compactWineLocationLabel(wine), wine.grapeBlend].filter(Boolean).join(" · ")}
          </Text>
          <Text style={pdfStyles.cardSubtext}>
            Style: {WINE_STYLE_LABELS[wine.wineStyle]} · Served {ordinal(wine.tastingOrder)} (tasting order{" "}
            {wine.tastingOrder} of {totalWines})
          </Text>
          {contributorLabel ? <Text style={pdfStyles.cardSubtext}>{contributorLabel}</Text> : null}
          {wine.hostNotes ? (
            <Text style={[pdfStyles.cardSubtext, { fontFamily: "Helvetica-Oblique" }]}>&ldquo;{wine.hostNotes}&rdquo;</Text>
          ) : null}
        </View>
      </View>

      <PdfStatGrid
        stats={[
          { label: "Average", value: result.averageRating ?? "—" },
          { label: "Ratings", value: result.numRatings },
          { label: "Lowest", value: result.lowestRating ?? "—" },
          { label: "Highest", value: result.highestRating ?? "—" },
        ]}
      />

      {result.topTasters.length > 0 && (
        <Text style={{ fontSize: 9, marginBottom: 4 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", color: pdfColors.maroon }}>
            Top taster{result.topTasters.length > 1 ? "s" : ""}:{" "}
          </Text>
          {result.topTasters.map((t) => t.guestName).join(", ")} ({result.topTasters[0].totalPoints}
          {bottlePossiblePoints !== undefined ? `/${bottlePossiblePoints}` : ""} pts)
        </Text>
      )}

      {result.guesses.length === 0 ? (
        <Text style={{ fontSize: 9, color: pdfColors.muted, marginTop: 4 }}>
          No guesses submitted for this wine.
        </Text>
      ) : (
        result.guesses.map((guess) => (
          <GuessDetail
            key={guess.guestId}
            guess={guess}
            wine={wine}
            isCoreV3={isCoreV3}
            isTopTaster={result.topTasters.some((t) => t.guestId === guess.guestId)}
            showNotes={showNotes}
          />
        ))
      )}
    </View>
  );
}

function GuessDetail({
  guess,
  wine,
  isCoreV3,
  isTopTaster,
  showNotes,
}: {
  guess: ScoredGuess;
  wine: WineAnswerKey;
  isCoreV3: boolean;
  isTopTaster: boolean;
  showNotes: boolean;
}) {
  const coreFields = guess.fieldScores.filter((f) => f.category === "core");
  const bonusFields = guess.fieldScores.filter((f) => f.category === "bonus");

  return (
    <View style={localStyles.guessCard} wrap={false}>
      <View style={localStyles.guessHeaderRow}>
        <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold" }}>
          {guess.guestName}
          {isTopTaster ? "  ·  TOP TASTER" : ""}
        </Text>
        <Text style={{ fontSize: 9, color: pdfColors.muted }}>
          {guess.totalPoints}/{guess.totalPossiblePoints} pts
          {guess.rating !== null ? ` · rated ${guess.rating}` : ""}
        </Text>
      </View>

      <FieldScoreTable heading="Core categories" fields={coreFields} />
      {!isCoreV3 && (
        <AppellationComparisonPdf guessedAppellation={guess.appellationGuess} actualAppellation={wine.appellation} />
      )}
      {!isCoreV3 && <FieldScoreTable heading="Bonus categories" fields={bonusFields} />}

      <View style={localStyles.totalsRow}>
        {isCoreV3 ? (
          <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: pdfColors.maroon }}>
            Total: {guess.totalPoints}/{guess.totalPossiblePoints}
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: 9 }}>
              Core: {guess.corePoints}/{guess.corePossiblePoints}
            </Text>
            <Text style={{ fontSize: 9 }}>
              Bonus: {guess.bonusPoints}/{guess.bonusPossiblePoints}
            </Text>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: pdfColors.maroon }}>
              Total: {guess.totalPoints}/{guess.totalPossiblePoints}
            </Text>
          </>
        )}
      </View>

      {showNotes && guess.note ? (
        <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Oblique", color: pdfColors.muted, marginTop: 4 }}>
          &ldquo;{guess.note}&rdquo;
        </Text>
      ) : null}
    </View>
  );
}

function FieldScoreTable({ heading, fields }: { heading: string; fields: FieldScore[] }) {
  if (fields.length === 0) return null;
  return (
    <View>
      <View style={localStyles.fieldHeaderRow}>
        <Text style={[localStyles.fieldHeaderCell, { flexBasis: "26%" }]}>{heading}</Text>
        <Text style={[localStyles.fieldHeaderCell, { flexBasis: "28%" }]}>Guess</Text>
        <Text style={[localStyles.fieldHeaderCell, { flexBasis: "28%" }]}>Actual</Text>
        <Text style={[localStyles.fieldHeaderCell, { flexBasis: "18%" }]}>Result</Text>
      </View>
      {fields.map((fieldScore) => (
        <View key={fieldScore.field} style={localStyles.fieldRow}>
          <Text style={localStyles.colField}>{FIELD_LABELS[fieldScore.field]}</Text>
          {fieldScore.applicable === false ? (
            <Text style={localStyles.notApplicable}>Not applicable</Text>
          ) : (
            <>
              <Text style={localStyles.colGuess}>{fieldScore.guessedValue || "—"}</Text>
              <Text style={localStyles.colActual}>{fieldScore.answerValue || "—"}</Text>
              <View style={localStyles.colResult}>
                <PdfMatchIndicator correct={fieldScore.correct} />
              </View>
            </>
          )}
        </View>
      ))}
    </View>
  );
}

function AppellationComparisonPdf({
  guessedAppellation,
  actualAppellation,
}: {
  guessedAppellation?: string;
  actualAppellation?: string;
}) {
  if (!guessedAppellation && !actualAppellation) return null;
  return (
    <View style={{ marginTop: 4 }}>
      <Text style={[localStyles.fieldHeaderCell, { marginBottom: 2 }]}>Appellation</Text>
      <Text style={{ fontSize: 8.5 }}>
        Guess: {guessedAppellation || "—"}    Wine: {actualAppellation || "—"}
      </Text>
    </View>
  );
}

function LeaderboardTable({ results, scoringVersion }: { results: TasterResult[]; scoringVersion: ScoringVersion }) {
  const isCoreV3 = scoringVersion === "core_v3_appellation_conditional";
  if (results.length === 0) {
    return <Text style={{ fontSize: 9, color: pdfColors.muted }}>No guests submitted entries for this tasting.</Text>;
  }
  return (
    <View>
      <View style={localStyles.lbHeaderRow}>
        <Text style={[localStyles.fieldHeaderCell, { flexBasis: "6%" }]}>#</Text>
        <Text style={[localStyles.fieldHeaderCell, { flexBasis: "28%" }]}>Taster</Text>
        {isCoreV3 ? (
          <>
            <Text style={[localStyles.fieldHeaderCell, { flexBasis: "16%" }]}>Accuracy</Text>
            <Text style={[localStyles.fieldHeaderCell, { flexBasis: "16%" }]}>Points</Text>
          </>
        ) : (
          <>
            <Text style={[localStyles.fieldHeaderCell, { flexBasis: "13%" }]}>Core</Text>
            <Text style={[localStyles.fieldHeaderCell, { flexBasis: "13%" }]}>Bonus</Text>
            <Text style={[localStyles.fieldHeaderCell, { flexBasis: "13%" }]}>Total</Text>
          </>
        )}
        <Text style={[localStyles.fieldHeaderCell, { flexBasis: "16%" }]}>Exact core</Text>
        <Text style={[localStyles.fieldHeaderCell, { flexBasis: "16%" }]}>Avg rating</Text>
      </View>
      {results.map((taster) => (
        <View key={taster.guestId} style={localStyles.lbRow}>
          <Text style={{ flexBasis: "6%", fontSize: 8.5 }}>{taster.rank}</Text>
          <Text style={{ flexBasis: "28%", fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>{taster.guestName}</Text>
          {isCoreV3 ? (
            <>
              <Text style={{ flexBasis: "16%", fontSize: 8.5 }}>{taster.overallAccuracyPercent.toFixed(1)}%</Text>
              <Text style={{ flexBasis: "16%", fontSize: 8.5 }}>
                {taster.totalPoints}/{taster.totalPossible}
              </Text>
            </>
          ) : (
            <>
              <Text style={{ flexBasis: "13%", fontSize: 8.5 }}>
                {taster.corePoints}/{taster.corePossible}
              </Text>
              <Text style={{ flexBasis: "13%", fontSize: 8.5 }}>
                {taster.bonusPoints}/{taster.bonusPossible}
              </Text>
              <Text style={{ flexBasis: "13%", fontSize: 8.5 }}>
                {taster.totalPoints}/{taster.totalPossible}
              </Text>
            </>
          )}
          <Text style={{ flexBasis: "16%", fontSize: 8.5 }}>{taster.exactCoreMatches}</Text>
          <Text style={{ flexBasis: "16%", fontSize: 8.5 }}>{taster.averageRatingGiven ?? "—"}</Text>
        </View>
      ))}
    </View>
  );
}
