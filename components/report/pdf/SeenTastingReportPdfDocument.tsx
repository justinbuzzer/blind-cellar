import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { SeenBottleResult, SeenTastingReport, WINE_STYLE_LABELS } from "@/types/tasting";
import { compactWineLocationLabel } from "@/lib/appellations";
import { formatContributorBottleLabel, wineStyleToContributorBucket } from "@/lib/contributorLabel";
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
  summaryCell: { flexGrow: 1, flexBasis: "33%", alignItems: "center" },
  summaryValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: pdfColors.maroonDark },
  summaryLabel: { fontSize: 7.5, color: pdfColors.muted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  ratingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

interface SeenTastingReportPdfDocumentProps {
  report: SeenTastingReport;
  title: string;
  dateLabel: string;
  modeLabel: string;
}

/**
 * Downloadable PDF mirror of SeenTastingReportView (Seen tasting report) —
 * see README "Downloadable PDF summary". Rating-focused, not
 * guessing-focused: no leaderboard, no scoring, matching the web view it
 * mirrors. Built from the same SeenTastingReport already loaded on
 * /results/[publicId] — no new fetch.
 */
export function SeenTastingReportPdfDocument({
  report,
  title,
  dateLabel,
  modeLabel,
}: SeenTastingReportPdfDocumentProps) {
  const { wineOfTheNight, mostDivisiveWine, bottleResults, totalRatings, totalRaters, totalBottles } = report;

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
            <Text style={localStyles.summaryValue}>{totalRaters}</Text>
            <Text style={localStyles.summaryLabel}>Raters</Text>
          </View>
          <View style={localStyles.summaryCell}>
            <Text style={localStyles.summaryValue}>{totalRatings}</Text>
            <Text style={localStyles.summaryLabel}>Ratings</Text>
          </View>
        </View>

        <PdfSectionHeading>Wine ranking</PdfSectionHeading>
        {bottleResults.map((result) => (
          <SeenBottleBlock key={result.wine.id} result={result} totalWines={bottleResults.length} />
        ))}

        <PdfFooter />
      </Page>
    </Document>
  );
}

function SeenBottleBlock({ result, totalWines }: { result: SeenBottleResult; totalWines: number }) {
  const { wine } = result;
  const contributorLabel = formatContributorBottleLabel({
    contributorDisplayName: wine.contributorName,
    styleBucket: wineStyleToContributorBucket(wine.wineStyle),
    contributorStyleSequence: wine.contributorStyleSequence,
  });

  return (
    <View style={pdfStyles.card} wrap={false}>
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

      <PdfStatGrid
        stats={[
          { label: "Average", value: result.averageRating ?? "—" },
          { label: "Ratings", value: result.numRatings },
          { label: "Lowest", value: result.lowestRating ?? "—" },
          { label: "Highest", value: result.highestRating ?? "—" },
          { label: "Spread", value: result.ratingSpread ?? "—" },
        ]}
      />

      <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, color: pdfColors.muted, marginTop: 4 }}>
        Everyone&rsquo;s ratings
      </Text>
      {result.participantRatings.map((p) => (
        <View key={p.guestId} style={{ borderTopWidth: 0.5, borderTopColor: pdfColors.border, paddingVertical: 3 }}>
          <View style={localStyles.ratingRow}>
            <Text style={{ fontSize: 8.5 }}>{p.guestName}</Text>
            <Text
              style={{
                fontSize: 8.5,
                fontFamily: p.rating !== null ? "Helvetica-Bold" : "Helvetica",
                color: p.rating !== null ? pdfColors.maroon : pdfColors.muted,
              }}
            >
              {p.rating !== null ? p.rating : "No rating"}
            </Text>
          </View>
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
