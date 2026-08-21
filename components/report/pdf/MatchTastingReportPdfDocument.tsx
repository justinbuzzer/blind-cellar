import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { MatchBottleResult, MatchTasterResult, MatchTastingReport, WINE_STYLE_LABELS } from "@/types/tasting";
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
  PdfSectionHeading,
  PdfStatGrid,
  pdfStyles,
} from "./pdfShared";
import { pdfColors } from "./pdfTheme";

const localStyles = StyleSheet.create({
  summaryCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: pdfColors.border,
    borderRadius: 2,
    paddingVertical: 8,
    marginBottom: 4,
  },
  summaryCell: { flexGrow: 1, flexBasis: "25%", alignItems: "center" },
  summaryValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: pdfColors.maroonDark },
  summaryLabel: { fontSize: 7.5, color: pdfColors.muted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  pickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardHeaderRow: { flexDirection: "row", gap: 8 },
  cardPhoto: { width: 48, height: 48, borderRadius: 2, objectFit: "cover" },
  leaderboardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: pdfColors.border,
    borderRadius: 2,
    padding: 8,
    marginBottom: 4,
  },
});

interface MatchTastingReportPdfDocumentProps {
  report: MatchTastingReport;
  title: string;
  dateLabel: string;
  modeLabel: string;
}

/**
 * Downloadable PDF mirror of MatchTastingReportView (Blind match report) —
 * see README "Downloadable PDF summary". Who picked which wine for which
 * glass, with a plain correct/incorrect mark, plus the correct-count taster
 * leaderboard. Built from the same MatchTastingReport already loaded on
 * /results/[publicId] — no new fetch.
 */
export function MatchTastingReportPdfDocument({
  report,
  title,
  dateLabel,
  modeLabel,
}: MatchTastingReportPdfDocumentProps) {
  const {
    wineOfTheNight,
    mostDivisiveWine,
    bottleResults,
    tasterResults,
    totalRatings,
    totalRaters,
    totalBottles,
    totalParticipants,
  } = report;

  const highlights: PdfHighlightItem[] = [];
  if (wineOfTheNight.length > 0 && wineOfTheNight[0].averageRating !== null) {
    highlights.push({
      label: "Wine of the Night",
      title: joinNames(wineOfTheNight.map((w) => w.wine.code)),
      detail: `Avg rating ${wineOfTheNight[0].averageRating}`,
      tie: wineOfTheNight.length > 1,
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

        <View style={localStyles.summaryCard}>
          <View style={localStyles.summaryCell}>
            <Text style={localStyles.summaryValue}>{totalBottles}</Text>
            <Text style={localStyles.summaryLabel}>Bottles</Text>
          </View>
          <View style={localStyles.summaryCell}>
            <Text style={localStyles.summaryValue}>{totalParticipants}</Text>
            <Text style={localStyles.summaryLabel}>Participants</Text>
          </View>
          <View style={localStyles.summaryCell}>
            <Text style={localStyles.summaryValue}>{totalRaters}</Text>
            <Text style={localStyles.summaryLabel}>Raters</Text>
          </View>
          <View style={localStyles.summaryCell}>
            <Text style={localStyles.summaryValue}>{totalRatings}</Text>
            <Text style={localStyles.summaryLabel}>Ratings</Text>
          </View>
        </View>

        <PdfSectionHeading>Taster leaderboard</PdfSectionHeading>
        {tasterResults.map((taster) => (
          <MatchTasterRow key={taster.guestId} taster={taster} />
        ))}

        <PdfSectionHeading>Wine ranking</PdfSectionHeading>
        {bottleResults.map((result) => (
          <MatchBottleBlock key={result.wine.id} result={result} totalWines={bottleResults.length} />
        ))}

        <PdfFooter />
      </Page>
    </Document>
  );
}

function MatchTasterRow({ taster }: { taster: MatchTasterResult }) {
  return (
    <View style={localStyles.leaderboardRow}>
      <Text style={{ fontSize: 9.5 }}>
        {taster.rank}. {taster.guestName}
      </Text>
      <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", color: pdfColors.maroonDark }}>
        {taster.correctCount} of {taster.totalBottles} correct · {taster.accuracyPercent}%
      </Text>
    </View>
  );
}

function MatchBottleBlock({ result, totalWines }: { result: MatchBottleResult; totalWines: number }) {
  const { wine } = result;
  const contributorLabel = formatContributorBottleLabel({
    contributorDisplayName: wine.contributorName,
    styleBucket: wineStyleToContributorBucket(wine.wineStyle),
    contributorStyleSequence: wine.contributorStyleSequence,
  });
  const photoUrl = tastingBottlePhotoUrl(wine.photoPath, getSupabaseEnv()?.url);

  return (
    <View style={pdfStyles.card} wrap={false}>
      <View style={localStyles.cardHeaderRow}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image has no alt concept; this isn't a DOM img */}
        {photoUrl ? <Image src={photoUrl} style={localStyles.cardPhoto} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={pdfStyles.cardEyebrow}>
            #{result.rank} · {wine.code}
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
        </View>
      </View>

      <PdfStatGrid
        stats={[
          { label: "Matched", value: `${result.correctCount}/${result.totalPicks}` },
          { label: "Average", value: result.averageRating ?? "—" },
          { label: "Ratings", value: result.numRatings },
          { label: "Lowest", value: result.lowestRating ?? "—" },
          { label: "Highest", value: result.highestRating ?? "—" },
          { label: "Spread", value: result.ratingSpread ?? "—" },
        ]}
      />

      <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, color: pdfColors.muted, marginTop: 4 }}>
        Everyone&rsquo;s picks
      </Text>
      {result.participantPicks.map((p) => (
        <View key={p.guestId} style={{ borderTopWidth: 0.5, borderTopColor: pdfColors.border, paddingVertical: 3 }}>
          <View style={localStyles.pickRow}>
            <Text style={{ fontSize: 8.5 }}>{p.guestName}</Text>
            <Text
              style={{
                fontSize: 8.5,
                fontFamily: "Helvetica-Bold",
                color: p.pickedWine ? (p.correct ? pdfColors.success : pdfColors.danger) : pdfColors.muted,
              }}
            >
              {p.pickedWine
                ? `${p.correct ? "Correct" : "Incorrect"} — ${p.pickedWine.producer} ${p.pickedWine.vintage}`
                : "No pick"}
            </Text>
          </View>
          {p.rating !== null ? (
            <Text style={{ fontSize: 8, color: pdfColors.muted, marginTop: 1 }}>Rated {p.rating}</Text>
          ) : null}
          {p.note ? (
            <Text style={{ fontSize: 8, fontFamily: "Helvetica-Oblique", color: pdfColors.muted, marginTop: 1 }}>
              &ldquo;{p.note}&rdquo;
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
