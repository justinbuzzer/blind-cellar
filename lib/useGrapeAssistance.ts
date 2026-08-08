"use client";

import { useEffect, useRef, useState } from "react";
import {
  evaluateGrapeAssistanceChange,
  GrapeAssistanceGrapeFields,
  GrapeValueSource,
  isGrapeValueEmpty,
} from "./grapeAssistance";

interface UseGrapeAssistanceParams {
  /** "" when the caller's form has no wine-style concept (see WineGuessForm) — assistance then only ever matches on Country + Region (+ Appellation). */
  wineStyle: string;
  country: string;
  region: string;
  appellation: string;
  grapeBlend: GrapeAssistanceGrapeFields;
  onGrapeBlendChange: (next: GrapeAssistanceGrapeFields) => void;
}

interface UseGrapeAssistanceResult {
  /** Transient, neutral feedback (see README "Grape-entry assistance") — "" when nothing was just auto-applied/cleared. */
  message: string;
  /** Pass this as GrapeBlendField's onChange instead of the caller's own setter, so a user edit is tracked as "manual". */
  handleGrapeBlendChange: (next: GrapeAssistanceGrapeFields) => void;
}

/**
 * Thin React wrapper around the pure `evaluateGrapeAssistanceChange` state
 * machine (see lib/grapeAssistance.ts) — re-evaluates whenever wine style,
 * country, region, or appellation changes, and tracks whether the current
 * grape value is empty/auto-applied/manually-entered entirely in local
 * component state (never persisted — see README). Shared by
 * WineIdentityFields (tasting bottle + cellar bottle forms) and
 * WineGuessForm (blind guess entry) so the auto-apply behaviour can never
 * drift between them.
 */
export function useGrapeAssistance({
  wineStyle,
  country,
  region,
  appellation,
  grapeBlend,
  onGrapeBlendChange,
}: UseGrapeAssistanceParams): UseGrapeAssistanceResult {
  const sourceRef = useRef<GrapeValueSource>(isGrapeValueEmpty(grapeBlend) ? "empty" : "manual");
  const prevRef = useRef({ wineStyle, country, region, appellation });
  const [message, setMessage] = useState("");

  useEffect(() => {
    const prev = prevRef.current;
    const current = { wineStyle, country, region, appellation };
    prevRef.current = current;

    const outcome = evaluateGrapeAssistanceChange(prev, { ...current, ...grapeBlend }, sourceRef.current);
    if (!outcome) return;

    sourceRef.current = outcome.source;
    setMessage(outcome.message);
    onGrapeBlendChange(outcome.fields);
    // grapeBlend/onGrapeBlendChange are intentionally excluded — this effect
    // must only react to the four trigger fields changing, never to the
    // grape value itself (which it may just have written), or a user's own
    // edit (routed through handleGrapeBlendChange below, not this effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wineStyle, country, region, appellation]);

  function handleGrapeBlendChange(next: GrapeAssistanceGrapeFields) {
    sourceRef.current = isGrapeValueEmpty(next) ? "empty" : "manual";
    setMessage("");
    onGrapeBlendChange(next);
  }

  return { message, handleGrapeBlendChange };
}
