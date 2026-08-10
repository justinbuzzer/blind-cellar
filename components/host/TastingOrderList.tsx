"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { formatTastingOrderAccessibleLabel, formatTastingOrderContributorLabel } from "@/lib/codes";
import { moveItem } from "@/lib/reorder";
import { HostBottleDTO } from "@/lib/supabase/types";
import { WINE_STYLE_LABELS } from "@/types/tasting";

type SaveState = "idle" | "saving" | "saved" | "error";

interface TastingOrderListProps {
  publicId: string;
  hostToken: string;
  wines: HostBottleDTO[];
  onReordered: (wines: HostBottleDTO[]) => void;
}

/**
 * Host-only reordering of the tasting sequence. Uses Move up/down controls
 * rather than drag-and-drop — five to eight bottles rarely need more than a
 * couple of moves, and this avoids pulling in a drag-and-drop dependency for
 * marginal benefit. Optimistically applies a move, then rolls back if the
 * save fails, keeping the failed order available for one-tap Retry.
 */
export function TastingOrderList({
  publicId,
  hostToken,
  wines,
  onReordered,
}: TastingOrderListProps) {
  const [localWines, setLocalWines] = useState(wines);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [retryOrder, setRetryOrder] = useState<HostBottleDTO[] | null>(null);

  useEffect(() => {
    if (saveState !== "saving") {
      setLocalWines(wines);
    }
  }, [wines, saveState]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = setTimeout(() => setSaveState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [saveState]);

  async function saveOrder(next: HostBottleDTO[], previous: HostBottleDTO[]) {
    setLocalWines(next);
    onReordered(next);
    setSaveState("saving");
    setRetryOrder(null);

    try {
      const response = await fetch("/api/host/reorder-bottles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId, hostToken, wineIds: next.map((w) => w.id) }),
      });
      if (!response.ok) {
        setSaveState("error");
        setRetryOrder(next);
        setLocalWines(previous);
        onReordered(previous);
        return;
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setRetryOrder(next);
      setLocalWines(previous);
      onReordered(previous);
    }
  }

  function move(index: number, direction: "up" | "down") {
    if (saveState === "saving") return;
    const next = moveItem(localWines, index, direction);
    if (next === localWines) return;
    saveOrder(next, localWines);
  }

  function retry() {
    if (retryOrder) saveOrder(retryOrder, localWines);
  }

  return (
    <Card className="flex flex-col gap-3 p-0">
      <div className="flex items-center justify-between gap-2 px-5 pt-5">
        <SectionEyebrow>Order of service</SectionEyebrow>
        <SaveStatus state={saveState} onRetry={retry} />
      </div>
      <p className="px-5 text-sm text-cellar-muted">
        Arrange the order bottles will be tasted in. This locks once the
        tasting starts.
      </p>
      <ol className="flex flex-col divide-y divide-cellar-border">
        {localWines.map((wine, index) => {
          const accessibleLabel = formatTastingOrderAccessibleLabel(
            wine.bottleNumber,
            wine.contributorName
          );
          return (
            <li
              key={wine.id}
              className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center font-display text-lg font-semibold text-cellar-maroon"
                >
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-cellar-text">
                  <span aria-hidden="true">
                    {formatTastingOrderContributorLabel(wine.bottleNumber, wine.contributorName)}
                  </span>
                  <span className="sr-only">{accessibleLabel}</span>
                </span>
                <span className="rounded-full border border-cellar-border px-2 py-0.5 text-xs text-cellar-muted">
                  {WINE_STYLE_LABELS[wine.wineStyle]}
                </span>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  aria-label={`Move ${accessibleLabel}, up`}
                  disabled={index === 0 || saveState === "saving"}
                  onClick={() => move(index, "up")}
                  className="flex h-11 w-11 items-center justify-center rounded-sm border border-cellar-border text-cellar-text transition-colors duration-150 hover:border-cellar-maroon/40 focus:outline-none focus:ring-2 focus:ring-cellar-gold disabled:opacity-30 disabled:hover:border-cellar-border"
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  aria-label={`Move ${accessibleLabel}, down`}
                  disabled={index === localWines.length - 1 || saveState === "saving"}
                  onClick={() => move(index, "down")}
                  className="flex h-11 w-11 items-center justify-center rounded-sm border border-cellar-border text-cellar-text transition-colors duration-150 hover:border-cellar-maroon/40 focus:outline-none focus:ring-2 focus:ring-cellar-gold disabled:opacity-30 disabled:hover:border-cellar-border"
                >
                  <span aria-hidden="true">↓</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="h-1" />
    </Card>
  );
}

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "idle") return null;
  if (state === "saving") {
    return (
      <p role="status" aria-live="polite" className="text-xs font-medium text-cellar-text/50">
        Saving order…
      </p>
    );
  }
  if (state === "saved") {
    return (
      <p role="status" aria-live="polite" className="text-xs font-medium text-cellar-maroon">
        Order saved
      </p>
    );
  }
  return (
    <p role="alert" className="flex items-center gap-1 text-xs font-medium text-cellar-danger">
      Unable to save order —
      <button type="button" onClick={onRetry} className="underline underline-offset-2">
        Retry
      </button>
    </p>
  );
}
