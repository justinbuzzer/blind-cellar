/**
 * Bottle-photo constants and pure helpers (see README "Bottle photos").
 * `MAX_PHOTO_BYTES`/`ALLOWED_PHOTO_MIME_TYPES` mirror the `bottle-photos`
 * Storage bucket's own `file_size_limit`/`allowed_mime_types` (see
 * supabase/schema.sql) — that server-side enforcement is the real boundary;
 * the client-side check here only exists for fast feedback before a user
 * waits on an upload that Storage would reject anyway.
 */

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type AllowedPhotoMimeType = (typeof ALLOWED_PHOTO_MIME_TYPES)[number];

function isAllowedPhotoMimeType(type: string): type is AllowedPhotoMimeType {
  return (ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(type);
}

/**
 * Fast client-side validation before ever starting an upload. Takes a
 * minimal `{size, type}` shape rather than the DOM `File` type so this stays
 * trivially unit-testable without a browser/jsdom environment. Returns a
 * user-facing error message, or null when the file is fine to upload.
 */
export function validatePhotoFile(file: { size: number; type: string }): string | null {
  if (!isAllowedPhotoMimeType(file.type)) {
    return "Photos must be a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return "Photo must be smaller than 8MB.";
  }
  return null;
}

/**
 * Builds a tasting bottle's public photo URL from its stored object path —
 * the one place that knows the `bottle-photos` bucket's public-object URL
 * shape, consumed identically by every web display component and both PDF
 * documents (see components/report/pdf/*.tsx). Pure/explicit-param rather
 * than reading env internally, so it's cleanly testable; real call sites
 * pass `getSupabaseEnv()?.url`. Returns null when there's no photo — never
 * fabricates a URL for a bottle that has none, and never called at all for
 * an unrevealed bottle, since the server already nulls the path out in that
 * case (see guest_visible_wines and every reveal-gated RPC in schema.sql).
 */
export function tastingBottlePhotoUrl(
  path: string | null | undefined,
  supabaseUrl: string | null | undefined
): string | null {
  if (!path || !supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/bottle-photos/${path}`;
}
