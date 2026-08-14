import { bottleLabel } from "./codes";
import { compactWineLocationLabel } from "./appellations";
import { MyBottleDTO } from "./supabase/types";

/**
 * Display treatment for a bottle on the participant's own "Your contributed
 * bottles" list (see README "Your contributed bottles"). Operates only on
 * `MyBottleDTO` — the existing `get_registration_state` projection, already
 * scoped server-side to the caller's own `contributor_guest_id` — so this
 * carries no authority of its own and never looks anything up by bottle
 * number; it only decides how to *display* already-authorized data.
 */
export interface OwnContributedBottleDisplay {
  primaryLabel: string;
  originLine: string | null;
  grapeLine: string | null;
  bottleNumberLabel: string;
  statusLabel: string;
}

const UNNAMED_WINE = "Unnamed wine";

/**
 * `Producer — Wine/cuvée`, falling back to whichever of the two exists, then
 * to `{vintage} {grape}` built only from other saved fields, then to
 * "Unnamed wine". Producer and wine/cuvée are both required at registration
 * (see `register_bottle` in supabase/schema.sql), so every fallback below
 * the first branch is a safety net for legacy data only — never reachable
 * through the current registration form.
 */
function formatPrimaryLabel(
  bottle: Pick<MyBottleDTO, "producer" | "wineCuvee" | "vintage" | "grapeBlend">
): string {
  const producer = bottle.producer?.trim();
  const wineCuvee = bottle.wineCuvee?.trim();
  if (producer && wineCuvee) return `${producer} — ${wineCuvee}`;
  if (producer) return producer;
  if (wineCuvee) return wineCuvee;

  const grape = bottle.grapeBlend?.trim();
  const vintage = bottle.vintage?.trim();
  if (grape) return vintage ? `${vintage} ${grape}` : grape;

  return UNNAMED_WINE;
}

export function formatOwnContributedBottle(bottle: MyBottleDTO): OwnContributedBottleDisplay {
  const vintage = bottle.vintage?.trim() || "NV";
  const location = compactWineLocationLabel(bottle);
  const originLine = [vintage, location].filter(Boolean).join(" · ") || null;

  return {
    primaryLabel: formatPrimaryLabel(bottle),
    originLine,
    grapeLine: bottle.grapeBlend?.trim() || null,
    bottleNumberLabel: `Registered as ${bottleLabel(bottle.bottleNumber)}`,
    statusLabel: "Details saved",
  };
}
