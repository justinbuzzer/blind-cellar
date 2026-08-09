import { compactWineLocationLabel } from "@/lib/appellations";
import { cellarBottleFormatLabel } from "@/lib/cellar";
import { CellarBottleRow } from "@/lib/supabase/types";
import { CellarBottleStatus } from "@/types/tasting";

// ---------------------------------------------------------------------------
// Grouped cellar display (see README "Personal Cellar" — "Grouped display").
// Pure functions only — no Supabase calls here, same philosophy as the rest
// of lib/cellar.ts. Underlying storage is unchanged: one `cellar_bottles` row
// remains one physical bottle; this module only ever *visually* groups an
// already-fetched, already-owner/status-scoped array of rows for display.
// `CellarBottleRow` has no `owner_user_id` field at all client-side (RLS
// already scopes every fetch to `auth.uid()`), so cross-owner grouping is
// impossible by construction, not by anything checked here.
// ---------------------------------------------------------------------------

/**
 * Deliberately narrower than `normalizeText` (lib/normalize.ts): only trims,
 * collapses internal whitespace, and lowercases. `normalizeText` also strips
 * accents/apostrophes/hyphens/punctuation for lenient guess matching — using
 * that here would be "new wine-data normalization... solely for grouping",
 * which the spec explicitly forbids. Two producers spelled differently should
 * never merge just because grouping normalization was too aggressive.
 */
function normalizeForGroupKey(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Unlikely to appear in real user text; keeps key segments unambiguous even if a field itself contains "|". */
const KEY_SEPARATOR = "";

function blendComponentsKeyPart(row: CellarBottleRow): string {
  const components = row.grape_blend_components;
  if (!components) return "";
  const grapes = [...(components.selectedGrapes ?? [])].map(normalizeForGroupKey).sort();
  return `${grapes.join(",")}||${normalizeForGroupKey(components.otherGrapesText ?? "")}`;
}

/**
 * The canonical group key (see README "Personal Cellar" — "Grouped
 * display"). Two rows share a group only when every one of these fields is
 * identical (after minimal normalization) — status, wine identity, grape/
 * blend, bottle format, and storage location. Personal notes are
 * deliberately excluded (see `groupCellarBottles`). Vintage/NV compare as
 * plain normalized text, so "NV" and "" (never actually possible for a
 * cellar row — vintage is required at insert — but handled safely anyway)
 * can never collide.
 */
export function buildCellarGroupKey(row: CellarBottleRow): string {
  return [
    row.status,
    normalizeForGroupKey(row.producer),
    normalizeForGroupKey(row.wine_cuvee),
    normalizeForGroupKey(row.vintage),
    normalizeForGroupKey(row.country),
    normalizeForGroupKey(row.region),
    normalizeForGroupKey(row.appellation ?? ""),
    row.grape_blend_mode ?? "",
    normalizeForGroupKey(row.grape_blend),
    blendComponentsKeyPart(row),
    row.wine_style,
    row.bottle_format,
    normalizeForGroupKey(row.bottle_format_other ?? ""),
    normalizeForGroupKey(row.storage_location ?? ""),
  ].join(KEY_SEPARATOR);
}

export interface CellarBottleGroup {
  groupKey: string;
  status: CellarBottleStatus;
  bottleCount: number;
  /**
   * The underlying physical rows, in the order they were fetched (already
   * `created_at desc` from both callers' queries). Kept internal to this
   * module's consumers (expansion UI, anchor selection for the atomic add
   * RPC) — never rendered as raw IDs and never sent anywhere beyond what the
   * client already legitimately holds from its own RLS-scoped fetch.
   */
  bottles: CellarBottleRow[];
  /** Display fields — identical across every bottle in the group by construction (that's what the group key guarantees). */
  representative: CellarBottleRow;
}

/**
 * Groups an already-fetched, already-owner/status-scoped list of cellar rows
 * for display. Preserves the input's relative order (first-seen bottle in
 * each group becomes that group's position). Personal notes are never part
 * of the key and are never read here — each underlying row's note is left
 * completely untouched in the database; grouping is purely a display
 * concern, so no note is ever merged, overwritten, or lost.
 */
export function groupCellarBottles(rows: CellarBottleRow[]): CellarBottleGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, CellarBottleRow[]>();

  for (const row of rows) {
    const key = buildCellarGroupKey(row);
    const existing = byKey.get(key);
    if (existing) {
      existing.push(row);
    } else {
      byKey.set(key, [row]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const bottles = byKey.get(key)!;
    return {
      groupKey: key,
      status: bottles[0].status,
      bottleCount: bottles.length,
      bottles,
      representative: bottles[0],
    };
  });
}

/**
 * Deterministic ordering used whenever exactly one physical bottle from a
 * group needs to be resolved (see README "Personal Cellar" — "Grouped
 * display"): oldest `created_at` first, then `id` as a stable tie-breaker.
 * Mirrors the server-side ordering the atomic multi-bottle RPC uses, so
 * client-side previews (if any) never disagree with what the server would
 * actually pick.
 */
export function oldestBottleFirst(bottles: CellarBottleRow[]): CellarBottleRow[] {
  return [...bottles].sort((a, b) => {
    const byCreated = a.created_at.localeCompare(b.created_at);
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });
}

/** "1 bottle" / "{count} bottles" — never "Qty", "x6", "6x", or "6 units". */
export function formatBottleCountLabel(count: number): string {
  return count === 1 ? "1 bottle" : `${count} bottles`;
}

/** "1 bottle available" / "{count} bottles available" — used in the Add-from-cellar picker only. */
export function formatAvailableCountLabel(count: number): string {
  return count === 1 ? "1 bottle available" : `${count} bottles available`;
}

/**
 * The My Cellar grouped status·count line. Reserved/consumed use generic
 * copy ("Reserved for tasting" / "Consumed") rather than naming a specific
 * tasting, since a single grouped entry's bottles could in principle be
 * reserved for or consumed by different sessions — the caller may still
 * show a specific session's context line alongside this when the group has
 * exactly one bottle (unambiguous), exactly as the ungrouped view already
 * did.
 */
export function formatCellarGroupStatusLine(status: CellarBottleStatus, count: number): string {
  const bottles = formatBottleCountLabel(count);
  if (status === "available") return `Available · ${bottles}`;
  if (status === "reserved") return `Reserved for tasting · ${bottles}`;
  return `Consumed · ${bottles}`;
}

/**
 * "Vintage/NV · Appellation, Region · Country" — shared by the My Cellar
 * grouped row and the Add-from-cellar grouped picker row (see README
 * "Personal Cellar" — "Grouped display"). Reuses `compactWineLocationLabel`
 * (with country omitted) for the middle segment so appellation/region
 * de-duplication logic never diverges from the rest of the app.
 */
export function formatCellarOriginLine(row: {
  vintage: string;
  appellation: string | null;
  region: string;
  country: string;
}): string {
  return [row.vintage, compactWineLocationLabel({ appellation: row.appellation, region: row.region }), row.country]
    .filter(Boolean)
    .join(" · ");
}

/** "Format · Storage location" (storage omitted when unset). */
export function formatCellarFormatLine(row: {
  bottle_format: CellarBottleRow["bottle_format"];
  bottle_format_other: string | null;
  storage_location: string | null;
}): string {
  return [cellarBottleFormatLabel(row), row.storage_location].filter(Boolean).join(" · ");
}
