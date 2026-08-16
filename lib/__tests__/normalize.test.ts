import { describe, expect, it } from "vitest";
import {
  isCuveeBlindMatch,
  isNormalizedMatch,
  isProducerBlindMatch,
  normalizeCuveeForBlindMatch,
  normalizeProducerForBlindMatch,
  normalizeText,
} from "@/lib/normalize";

describe("normalizeText", () => {
  it("lowercases and trims", () => {
    expect(normalizeText("  Château  ")).toBe(normalizeText("chateau"));
  });

  it("strips accents", () => {
    expect(normalizeText("Château")).toBe(normalizeText("Chateau"));
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeText("Domaine   de   la   Janasse")).toBe(
      normalizeText("Domaine de la Janasse")
    );
  });

  it("treats hyphens as spaces", () => {
    expect(normalizeText("Chateauneuf-du-Pape")).toBe(
      normalizeText("Chateauneuf du Pape")
    );
  });

  it("drops apostrophes and periods", () => {
    expect(normalizeText("St. Julien's")).toBe(normalizeText("St Juliens"));
  });
});

describe("isNormalizedMatch", () => {
  it("matches equivalent strings after normalisation", () => {
    expect(isNormalizedMatch("Chateauneuf-du-Pape", "Châteauneuf du Pape")).toBe(true);
  });

  it("does not match different words", () => {
    expect(isNormalizedMatch("Barolo", "Barbaresco")).toBe(false);
  });

  it("does not match when either side is empty", () => {
    expect(isNormalizedMatch("", "Barolo")).toBe(false);
    expect(isNormalizedMatch("Barolo", "")).toBe(false);
    expect(isNormalizedMatch("", "")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Producer / Cuvée blind matching (core_v3_appellation_conditional only) —
// deliberately narrower than normalizeText/isNormalizedMatch above: no
// accent-folding, no punctuation stripping, no hyphen-as-space. See README
// "Scoring model".
// ---------------------------------------------------------------------------

describe("normalizeProducerForBlindMatch", () => {
  it("removes a leading 'Domaine' descriptor", () => {
    expect(normalizeProducerForBlindMatch("Domaine Leflaive")).toBe("leflaive");
  });

  it("removes a leading 'Château' descriptor", () => {
    expect(normalizeProducerForBlindMatch("Château Margaux")).toBe("margaux");
  });

  it("removes a leading 'Chateau' (unaccented) descriptor", () => {
    expect(normalizeProducerForBlindMatch("Chateau Margaux")).toBe("margaux");
  });

  it("is case-insensitive for both the descriptor and the remainder", () => {
    expect(normalizeProducerForBlindMatch("DOMAINE LEFLAIVE")).toBe("leflaive");
    expect(normalizeProducerForBlindMatch("CHATEAU MARGAUX")).toBe("margaux");
  });

  it("preserves an apostrophe in the remainder", () => {
    expect(normalizeProducerForBlindMatch("Château d'Yquem")).toBe("d'yquem");
    expect(normalizeProducerForBlindMatch("chateau d'yquem")).toBe("d'yquem");
  });

  it("leaves a value with no leading descriptor untouched apart from case-folding", () => {
    expect(normalizeProducerForBlindMatch("Leflaive")).toBe("leflaive");
    expect(normalizeProducerForBlindMatch("Margaux")).toBe("margaux");
  });

  it("does not strip 'Domaine' alone into an empty remainder", () => {
    expect(normalizeProducerForBlindMatch("Domaine")).toBe("domaine");
  });

  it("does not remove a plural 'Domaines'", () => {
    expect(normalizeProducerForBlindMatch("Domaines Leflaive")).toBe("domaines leflaive");
  });

  it("does not remove a plural 'Chateaux'", () => {
    expect(normalizeProducerForBlindMatch("Chateaux Margaux")).toBe("chateaux margaux");
  });

  it("does not remove the descriptor when it isn't the leading token", () => {
    expect(normalizeProducerForBlindMatch("Le Domaine Leflaive")).toBe("le domaine leflaive");
    expect(normalizeProducerForBlindMatch("Maison du Château Margaux")).toBe(
      "maison du château margaux"
    );
    expect(normalizeProducerForBlindMatch("Clos du Domaine")).toBe("clos du domaine");
  });

  it("removes only one leading descriptor, never a second one behind it", () => {
    expect(normalizeProducerForBlindMatch("Domaine Château Example")).toBe("château example");
  });

  it("does not treat a hyphenated descriptor as a standalone leading token", () => {
    expect(normalizeProducerForBlindMatch("Domaine-Leflaive")).toBe("domaine-leflaive");
    expect(normalizeProducerForBlindMatch("Chateau-Margaux")).toBe("chateau-margaux");
  });

  it("returns null for a blank or missing value", () => {
    expect(normalizeProducerForBlindMatch("")).toBeNull();
    expect(normalizeProducerForBlindMatch("   ")).toBeNull();
    expect(normalizeProducerForBlindMatch(null)).toBeNull();
    expect(normalizeProducerForBlindMatch(undefined)).toBeNull();
  });

  it("does not fold accents outside descriptor removal (Château vs Chateau differ once neither is a leading descriptor)", () => {
    // Both count as the optional leading descriptor, so both strip to the
    // same remainder here — this is descriptor tolerance, not accent
    // folding. Confirmed separately (see isProducerBlindMatch below) that
    // accent differences elsewhere in a name are never folded.
    expect(normalizeProducerForBlindMatch("Château Margaux")).toBe(
      normalizeProducerForBlindMatch("Chateau Margaux")
    );
  });
});

describe("normalizeCuveeForBlindMatch", () => {
  it("case-folds only", () => {
    expect(normalizeCuveeForBlindMatch("LA GRANDE DAME")).toBe("la grande dame");
  });

  it("does not remove a leading Producer descriptor", () => {
    expect(normalizeCuveeForBlindMatch("Domaine Les Pucelles")).toBe("domaine les pucelles");
    expect(normalizeCuveeForBlindMatch("Château Speciale")).toBe("château speciale");
  });

  it("returns null for a blank or missing value", () => {
    expect(normalizeCuveeForBlindMatch("")).toBeNull();
    expect(normalizeCuveeForBlindMatch("   ")).toBeNull();
    expect(normalizeCuveeForBlindMatch(null)).toBeNull();
    expect(normalizeCuveeForBlindMatch(undefined)).toBeNull();
  });
});

describe("isProducerBlindMatch", () => {
  it("matches must-match examples", () => {
    expect(isProducerBlindMatch("Leflaive", "Domaine Leflaive")).toBe(true);
    expect(isProducerBlindMatch("Domaine Leflaive", "Leflaive")).toBe(true);
    expect(isProducerBlindMatch("domaine leflaive", "Domaine Leflaive")).toBe(true);
    expect(isProducerBlindMatch("Margaux", "Château Margaux")).toBe(true);
    expect(isProducerBlindMatch("margaux", "Chateau Margaux")).toBe(true);
    expect(isProducerBlindMatch("Château Margaux", "Margaux")).toBe(true);
    expect(isProducerBlindMatch("d'Yquem", "Château d'Yquem")).toBe(true);
    expect(isProducerBlindMatch("D'YQUEM", "chateau d'yquem")).toBe(true);
  });

  it("rejects must-not-match examples beyond scope", () => {
    expect(isProducerBlindMatch("Maison Leflaive", "Domaine Leflaive")).toBe(false);
    expect(isProducerBlindMatch("Margaux Château", "Château Margaux")).toBe(false);
    expect(isProducerBlindMatch("Leflaive & Fils", "Domaine Leflaive")).toBe(false);
    expect(isProducerBlindMatch("Leflaiv", "Domaine Leflaive")).toBe(false);
    expect(isProducerBlindMatch("Chateau-Margaux", "Château Margaux")).toBe(false);
    expect(isProducerBlindMatch("Chateau Margauxx", "Château Margaux")).toBe(false);
    expect(isProducerBlindMatch("Chateau dYquem", "Château d'Yquem")).toBe(false);
    expect(isProducerBlindMatch("Domaine-Leflaive", "Domaine Leflaive")).toBe(false);
    expect(isProducerBlindMatch("Leflaive", "Le Domaine Leflaive")).toBe(false);
    expect(isProducerBlindMatch("Leflaive", "Domaines Leflaive")).toBe(false);
  });

  it("a blank guess never matches, even against a blank answer", () => {
    expect(isProducerBlindMatch("", "Domaine Leflaive")).toBe(false);
    expect(isProducerBlindMatch("", "")).toBe(false);
  });

  it("does not fold an accent difference that survives descriptor removal", () => {
    // Neither "Corton" nor "Cortôn" is a recognised leading descriptor, so
    // this is a plain accent mismatch — never folded, unlike normalizeText.
    expect(isProducerBlindMatch("Cortôn", "Corton")).toBe(false);
  });
});

describe("isCuveeBlindMatch", () => {
  it("matches with case differences only", () => {
    expect(isCuveeBlindMatch("les pucelles", "Les Pucelles")).toBe(true);
    expect(isCuveeBlindMatch("Clos de la Roche", "CLOS DE LA ROCHE")).toBe(true);
    expect(isCuveeBlindMatch("LA GRANDE DAME", "La Grande Dame")).toBe(true);
  });

  it("never gains Producer-descriptor normalisation", () => {
    expect(isCuveeBlindMatch("Les Pucelles", "Domaine Les Pucelles")).toBe(false);
    expect(isCuveeBlindMatch("Speciale", "Château Speciale")).toBe(false);
    expect(isCuveeBlindMatch("de la Romanée", "Domaine de la Romanée")).toBe(false);
  });

  it("preserves existing exact-match punctuation/accent/whitespace/substring behaviour (no leniency added)", () => {
    expect(isCuveeBlindMatch("La Grande-Dame", "La Grande Dame")).toBe(false);
    expect(isCuveeBlindMatch("Grande Dame", "La Grande Dame")).toBe(false);
    expect(isCuveeBlindMatch("Cortôn", "Corton")).toBe(false);
  });

  it("a blank guess never matches, even against a blank answer", () => {
    expect(isCuveeBlindMatch("", "Les Pucelles")).toBe(false);
    expect(isCuveeBlindMatch("", "")).toBe(false);
  });
});
