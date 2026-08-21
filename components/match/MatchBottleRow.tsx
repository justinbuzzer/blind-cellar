import { useId } from "react";
import { RatingSlider } from "@/components/RatingSlider";
import { TextAreaField } from "@/components/TextAreaField";
import { SavingIndicator, SaveState } from "@/components/SavingIndicator";
import { MatchBottleDTO, MatchWineListEntryDTO } from "@/lib/supabase/types";
import { bottleLabel } from "@/lib/codes";

export interface MatchBottleDraft {
  matchedWineId: string | null;
  rating: number | null;
  note: string;
}

interface MatchBottleRowProps {
  bottle: MatchBottleDTO;
  wineList: MatchWineListEntryDTO[];
  saveState: SaveState;
  disabled: boolean;
  onChange: (next: MatchBottleDraft) => void;
}

function wineOptionLabel(wine: MatchWineListEntryDTO): string {
  return [wine.producer, [wine.wineCuvee, wine.vintage].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" — ");
}

/**
 * One glass in a Blind match session — see README "Tasting modes" — "Blind
 * match". Kept tight: the wine picker (the one input that matters most) is
 * always visible; rating and notes are tucked behind a details disclosure
 * (same convention as components/report/BottleParticipantList.tsx) so a
 * page with many glasses doesn't force a full rating slider + textarea open
 * for every one of them by default.
 */
export function MatchBottleRow({ bottle, wineList, saveState, disabled, onChange }: MatchBottleRowProps) {
  const selectId = useId();

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-cellar-text">
          {bottleLabel(bottle.bottleNumber)}
        </span>
        <SavingIndicator state={saveState} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="sr-only">
          Which wine is {bottleLabel(bottle.bottleNumber)}?
        </label>
        <select
          id={selectId}
          disabled={disabled}
          value={bottle.myMatchedWineId ?? ""}
          onChange={(e) =>
            onChange({
              matchedWineId: e.target.value || null,
              rating: bottle.myRating,
              note: bottle.myNote ?? "",
            })
          }
          className="rounded-sm border border-cellar-border bg-white px-3 py-2 text-base text-cellar-text focus:outline-none focus:ring-2 focus:ring-cellar-gold"
        >
          <option value="">Select the wine…</option>
          {wineList.map((wine) => (
            <option key={wine.id} value={wine.id}>
              {wineOptionLabel(wine)}
            </option>
          ))}
        </select>
      </div>

      <details className="rounded-sm border border-cellar-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm font-medium text-cellar-text hover:bg-cellar-bg">
          <span>Score &amp; notes</span>
          <span className="text-cellar-muted">{bottle.myRating ?? "Not yet scored"}</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-cellar-border px-3 py-3">
          <RatingSlider
            value={bottle.myRating}
            disabled={disabled}
            onChange={(rating) =>
              onChange({ matchedWineId: bottle.myMatchedWineId, rating, note: bottle.myNote ?? "" })
            }
          />
          <TextAreaField
            label="Tasting note (optional)"
            rows={2}
            disabled={disabled}
            value={bottle.myNote ?? ""}
            onChange={(e) =>
              onChange({
                matchedWineId: bottle.myMatchedWineId,
                rating: bottle.myRating,
                note: e.target.value,
              })
            }
          />
        </div>
      </details>
    </li>
  );
}
