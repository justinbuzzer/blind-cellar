import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { pdfColors } from "./pdfTheme";

/**
 * Shared layout primitives for the downloadable tasting-report PDF (see
 * README "Downloadable PDF summary"). @react-pdf/renderer has its own
 * Yoga-flexbox StyleSheet, not Tailwind/DOM CSS, so none of the app's
 * existing Card/Stat/Highlight/MatchBadge components can be reused directly
 * — these are print-appropriate re-implementations of the same information,
 * shared by TastingReportPdfDocument and SeenTastingReportPdfDocument so the
 * two documents share one visual language instead of each inventing their
 * own.
 */
export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    backgroundColor: "#FFFFFF",
    fontFamily: "Helvetica",
    fontSize: 10,
    color: pdfColors.text,
  },
  eyebrow: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: pdfColors.gold,
  },
  title: {
    fontSize: 22,
    fontFamily: "Times-Bold",
    color: pdfColors.maroonDark,
    marginTop: 4,
  },
  supporting: {
    fontSize: 10,
    color: pdfColors.muted,
    marginTop: 3,
    marginBottom: 18,
  },
  sectionHeading: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: pdfColors.gold,
    marginTop: 20,
    marginBottom: 8,
  },
  highlightsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  highlightBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: pdfColors.border,
    borderRadius: 2,
    padding: 10,
    textAlign: "center",
  },
  highlightLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: pdfColors.maroon,
  },
  highlightTitle: {
    fontSize: 13,
    fontFamily: "Times-Bold",
    color: pdfColors.maroonDark,
    marginTop: 4,
  },
  highlightDetail: {
    fontSize: 8.5,
    color: pdfColors.muted,
    marginTop: 2,
  },
  card: {
    borderWidth: 1,
    borderColor: pdfColors.border,
    borderRadius: 2,
    padding: 10,
    marginBottom: 8,
  },
  cardEyebrow: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: pdfColors.gold,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: "Times-Bold",
    color: pdfColors.maroonDark,
    marginTop: 2,
  },
  cardSubtext: {
    fontSize: 9,
    color: pdfColors.muted,
    marginTop: 2,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: pdfColors.bgDeep,
    borderRadius: 2,
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  statCell: {
    flexGrow: 1,
    flexBasis: "20%",
    alignItems: "center",
    paddingVertical: 2,
  },
  statValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: pdfColors.maroonDark,
  },
  statLabel: {
    fontSize: 7,
    color: pdfColors.muted,
    marginTop: 1,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    fontSize: 8,
    color: pdfColors.muted,
    borderTopWidth: 1,
    borderTopColor: pdfColors.border,
    paddingTop: 6,
    textAlign: "center",
  },
});

/** "1st"/"2nd"/"3rd"/"4th"… — kept local to the PDF module rather than exported from an existing report component, matching this codebase's convention of small per-file helpers over a shared-utility import (see e.g. the same helper already duplicated in WineResultCard.tsx/SeenBottleResultCard.tsx). */
export function ordinal(n: number): string {
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

/** "A", "A & B", or "A, B & C" — same join convention already used by TastingReportView/SeenTastingReportView for tied highlight titles. */
export function joinNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function PdfHeader({
  eyebrow,
  title,
  supporting,
}: {
  eyebrow: string;
  title: string;
  supporting: string;
}) {
  return (
    <View>
      <Text style={pdfStyles.eyebrow}>{eyebrow}</Text>
      <Text style={pdfStyles.title}>{title}</Text>
      {supporting ? <Text style={pdfStyles.supporting}>{supporting}</Text> : null}
    </View>
  );
}

export function PdfSectionHeading({ children }: { children: string }) {
  return <Text style={pdfStyles.sectionHeading}>{children}</Text>;
}

export interface PdfHighlightItem {
  label: string;
  title: string;
  detail?: string;
  tie?: boolean;
}

export function PdfHighlightsRow({ items }: { items: PdfHighlightItem[] }) {
  if (items.length === 0) return null;
  return (
    <View style={pdfStyles.highlightsRow}>
      {items.map((item) => (
        <View key={item.label} style={pdfStyles.highlightBox}>
          <Text style={pdfStyles.highlightLabel}>
            {item.label}
            {item.tie ? " (tie)" : ""}
          </Text>
          <Text style={pdfStyles.highlightTitle}>{item.title}</Text>
          {item.detail ? <Text style={pdfStyles.highlightDetail}>{item.detail}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function PdfStatGrid({ stats }: { stats: { label: string; value: string | number }[] }) {
  return (
    <View style={pdfStyles.statGrid}>
      {stats.map((s) => (
        <View key={s.label} style={pdfStyles.statCell}>
          <Text style={pdfStyles.statValue}>{s.value}</Text>
          <Text style={pdfStyles.statLabel}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function PdfMatchIndicator({ correct }: { correct: boolean }) {
  return (
    <Text
      style={{
        fontSize: 8.5,
        fontFamily: "Helvetica-Bold",
        color: correct ? pdfColors.success : pdfColors.danger,
      }}
    >
      {correct ? "Correct" : "Incorrect"}
    </Text>
  );
}

export function PdfFooter() {
  return (
    <Text
      style={pdfStyles.footer}
      fixed
      render={({ pageNumber, totalPages }) => `Blind Cellar · Page ${pageNumber} of ${totalPages}`}
    />
  );
}
