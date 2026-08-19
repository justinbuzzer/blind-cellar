import { useState } from "react";
import { WineGuess } from "@/types/tasting";
import {
  COUNTRY_OPTIONS,
  regionOptionsForCountry,
  resetRegionIfInvalid,
} from "@/lib/wineReferenceData";
import { getAppellations, hasAppellations } from "@/lib/appellations";
import { useGrapeAssistance } from "@/lib/useGrapeAssistance";
import { BlindGuessGrapeOptionsHint, styleFilterKeyForHint } from "@/lib/grapeAssistance";
import { BottleDisplayLabels } from "@/lib/contributorLabel";
import { BettableField, FieldBets } from "@/lib/betting";
import { Card } from "./Card";
import { TextField } from "./TextField";
import { SelectField } from "./SelectField";
import { TextAreaField } from "./TextAreaField";
import { RatingSlider } from "./RatingSlider";
import { VintageField } from "./VintageField";
import { GrapeBlendField, GrapeBlendFormValue } from "./GrapeBlendField";
import { SectionEyebrow } from "./SectionEyebrow";

const WINE_CUVEE_HINT = "Enter the wine name or cuvée.";
const APPELLATION_HINT = "Optional. Select an appellation if you have a specific call.";
const APPELLATION_CLEARED_MESSAGE = "Appellation cleared because the region changed.";

/**
 * Betting sub-mode only (see README "Tasting modes" — "Betting") — a small
 * paired "Bet" number input shown beside a scored field when `bets`/
 * `onBetsChange` are supplied. Deliberately not its own file: used only
 * here, and it's a thin wrapper over a plain number input, not a general-
 * purpose field component.
 */
function BetInput({
  field,
  bets,
  onBetsChange,
  multiplier,
}: {
  field: BettableField;
  bets: FieldBets;
  onBetsChange: (bets: FieldBets) => void;
  /** This field's decimal odds — see README "Tasting modes" — "Betting". Shown beside the "Bet" label so a guesser knows the payout ratio before wagering. Omitted only if the session response hasn't loaded its odds config yet. */
  multiplier?: number;
}) {
  return (
    <label className="flex shrink-0 flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-cellar-gold">
        Bet{typeof multiplier === "number" ? ` (${multiplier}x)` : ""}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={bets[field] ?? ""}
        placeholder="0"
        onChange={(e) => {
          const raw = e.target.value;
          const parsed = raw === "" ? 0 : Math.max(0, Math.trunc(Number(raw)));
          onBetsChange({ ...bets, [field]: Number.isFinite(parsed) ? parsed : 0 });
        }}
        className="w-20 rounded-sm border border-cellar-border bg-white px-2 py-2 text-base text-cellar-text focus:outline-none focus:ring-2 focus:ring-cellar-gold"
        aria-label={`Bet on ${field}`}
      />
    </label>
  );
}

interface WineGuessFormProps {
  /** Primary "Bottle N" + secondary contributor label — see README "Bottle labels". */
  bottleLabels: BottleDisplayLabels;
  /** Screen-reader phrasing spelling out both labels in one sentence — see lib/contributorLabel.ts formatBottleAccessibleLabel. */
  bottleAccessibleLabel: string;
  value: WineGuess;
  onChange: (value: WineGuess) => void;
  ratingError?: string;
  blendError?: string;
  /**
   * Privacy-safe grape-colour hint for this specific bottle (see README
   * "Grape-entry assistance" — "Blind guess forms") — never the bottle's
   * actual wine style itself, which this form must never receive, display,
   * or persist. Optional so an already-locked/reveal-adjacent caller that
   * doesn't have it can omit it, degrading to unfiltered ("all_skins").
   */
  styleHint?: BlindGuessGrapeOptionsHint;
  /**
   * Betting sub-mode only (see README "Tasting modes" — "Betting") —
   * course_reveal + bettingEnabled sessions only. Omitted entirely (the
   * default) for every other caller, including full_blind, which shares
   * this component but never bets. When present, a "Bet" input appears
   * beside every scored field.
   */
  bets?: FieldBets;
  onBetsChange?: (bets: FieldBets) => void;
  /** This session's per-field decimal odds — see README "Tasting modes" — "Betting". Only meaningful alongside bets/onBetsChange; shown beside each "Bet" label. */
  multipliers?: Partial<Record<BettableField, number>>;
}

export function WineGuessForm({
  bottleLabels,
  bottleAccessibleLabel,
  value,
  onChange,
  ratingError,
  blendError,
  styleHint,
  bets,
  onBetsChange,
  multipliers,
}: WineGuessFormProps) {
  const [clearedMessage, setClearedMessage] = useState("");
  const bettingEnabled = bets !== undefined && onBetsChange !== undefined;

  function set<K extends keyof WineGuess>(key: K, fieldValue: WineGuess[K]) {
    onChange({ ...value, [key]: fieldValue });
  }

  function announceAppellationClearedIfNeeded(hadAppellation: string) {
    setClearedMessage(hadAppellation.trim() ? APPELLATION_CLEARED_MESSAGE : "");
  }

  function setCountry(nextCountry: string) {
    const nextRegion = resetRegionIfInvalid(nextCountry, value.region);
    onChange({
      ...value,
      country: nextCountry,
      region: nextRegion,
      appellation: "",
    });
    announceAppellationClearedIfNeeded(value.appellation);
  }

  function setRegion(nextRegion: string) {
    onChange({ ...value, region: nextRegion, appellation: "" });
    announceAppellationClearedIfNeeded(value.appellation);
  }

  function setGrapeBlend(next: GrapeBlendFormValue) {
    onChange({ ...value, ...next });
  }

  // The taster never guesses a wine style (see types/tasting.ts's WineGuess),
  // but the bottle they're guessing has one — styleHint carries a one-way,
  // privacy-safe derivation of it (see supabase/schema.sql's
  // wine_style_grape_options_hint), never the raw style. Converting it back
  // to the same "white"/"red"/"" vocabulary the non-blind forms use lets
  // this feed the identical filtering/assistance code paths unchanged.
  const styleFilterKey = styleFilterKeyForHint(styleHint);
  const { message: grapeAssistanceMessage, handleGrapeBlendChange } = useGrapeAssistance({
    wineStyle: styleFilterKey,
    country: value.country,
    region: value.region,
    appellation: value.appellation,
    grapeBlend: {
      grapeBlendMode: value.grapeBlendMode,
      grapeBlend: value.grapeBlend,
      selectedGrapes: value.selectedGrapes,
      otherGrapesText: value.otherGrapesText,
      otherGrapeSelected: value.otherGrapeSelected,
    },
    onGrapeBlendChange: setGrapeBlend,
  });

  const appellationOptions = getAppellations(value.country, value.region).map((name) => ({
    value: name,
    label: name,
  }));
  const showAppellation = hasAppellations(value.country, value.region);

  return (
    <Card className="flex flex-col gap-0 p-0">
      <h2
        aria-label={bottleAccessibleLabel}
        className="border-b border-cellar-border p-5 font-display text-2xl font-semibold text-cellar-maroon-dark"
      >
        {bottleLabels.tastingOrderLabel}
        {bottleLabels.contributorLabel && (
          <span className="mt-1 block text-sm font-normal text-cellar-muted">
            {bottleLabels.contributorLabel}
          </span>
        )}
      </h2>

      <div className="flex flex-col gap-4 border-b border-cellar-border p-5">
        <SectionEyebrow>Origin</SectionEyebrow>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <SelectField
                label="Country guess"
                value={value.country}
                placeholder="Select country"
                options={COUNTRY_OPTIONS}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full"
              />
            </div>
            {bettingEnabled && (
              <BetInput field="country" bets={bets} onBetsChange={onBetsChange} multiplier={multipliers?.country} />
            )}
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <SelectField
                label="Region guess"
                value={value.region}
                placeholder={value.country ? "Select region" : "Select country first"}
                disabled={!value.country}
                options={regionOptionsForCountry(value.country)}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full"
              />
            </div>
            {bettingEnabled && (
              <BetInput field="region" bets={bets} onBetsChange={onBetsChange} multiplier={multipliers?.region} />
            )}
          </div>
        </div>
        {showAppellation && (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <SelectField
                label="Appellation"
                value={value.appellation}
                hint={APPELLATION_HINT}
                placeholder="Select an appellation"
                options={appellationOptions}
                onChange={(e) => set("appellation", e.target.value)}
                className="w-full"
              />
            </div>
            {bettingEnabled && (
              <BetInput
                field="appellation"
                bets={bets}
                onBetsChange={onBetsChange}
                multiplier={multipliers?.appellation}
              />
            )}
          </div>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {clearedMessage}
        </p>
      </div>

      <div className="flex flex-col gap-4 border-b border-cellar-border p-5">
        <SectionEyebrow>Identity</SectionEyebrow>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <GrapeBlendField
              value={{
                grapeBlendMode: value.grapeBlendMode,
                grapeBlend: value.grapeBlend,
                selectedGrapes: value.selectedGrapes,
                otherGrapesText: value.otherGrapesText,
                otherGrapeSelected: value.otherGrapeSelected,
              }}
              onChange={handleGrapeBlendChange}
              error={blendError}
              wineStyle={styleFilterKey}
            />
          </div>
          {bettingEnabled && (
            <BetInput
              field="grapeBlend"
              bets={bets}
              onBetsChange={onBetsChange}
              multiplier={multipliers?.grapeBlend}
            />
          )}
        </div>
        {grapeAssistanceMessage && (
          <p role="status" aria-live="polite" className="text-xs text-cellar-text/60">
            {grapeAssistanceMessage}
          </p>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <VintageField
              value={value.vintage}
              onChange={(next) => set("vintage", next)}
            />
          </div>
          {bettingEnabled && (
            <BetInput field="vintage" bets={bets} onBetsChange={onBetsChange} multiplier={multipliers?.vintage} />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-b border-cellar-border p-5">
        <SectionEyebrow>Precision calls</SectionEyebrow>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                label="Producer"
                value={value.producer}
                spellCheck={false}
                onChange={(e) => set("producer", e.target.value)}
                className="w-full"
              />
            </div>
            {bettingEnabled && (
              <BetInput field="producer" bets={bets} onBetsChange={onBetsChange} multiplier={multipliers?.producer} />
            )}
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <TextField
                label="Wine / cuvée"
                value={value.wineName}
                hint={WINE_CUVEE_HINT}
                spellCheck={false}
                onChange={(e) => set("wineName", e.target.value)}
                className="w-full"
              />
            </div>
            {bettingEnabled && (
              <BetInput field="wineName" bets={bets} onBetsChange={onBetsChange} multiplier={multipliers?.wineName} />
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <SectionEyebrow>Impression</SectionEyebrow>
        <RatingSlider
          value={value.rating}
          onChange={(rating) => set("rating", rating)}
          error={ratingError}
        />
        <TextAreaField
          label="Tasting note (optional)"
          value={value.note ?? ""}
          onChange={(e) => set("note", e.target.value)}
          placeholder="Nose, palate, anything that stood out"
        />
      </div>
    </Card>
  );
}
