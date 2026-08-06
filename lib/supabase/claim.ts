import { ArchiveRole, ClaimSource } from "@/lib/archive";

export interface ClaimTastingRecordArgs {
  publicId: string;
  role: ArchiveRole;
  token: string;
  claimSource: ClaimSource;
}

/**
 * Thin client wrapper around POST /api/account/claim — used both for the
 * explicit "Add to my tasting record" action (components/archive/ClaimPanel)
 * and for automatic linking right after a signed-in join (see
 * app/join/[publicId]/page.tsx). Always resolves to a plain boolean rather
 * than throwing or exposing the response body: every caller already treats
 * failure the same generic way (see README "Account-linked tasting
 * records"), and the automatic-linking call site must never let a network
 * error surface to the user at all.
 */
export async function claimAccountTastingRecord(
  args: ClaimTastingRecordArgs,
  options?: { keepalive?: boolean }
): Promise<boolean> {
  try {
    const response = await fetch("/api/account/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
      keepalive: options?.keepalive,
    });
    return response.ok;
  } catch {
    return false;
  }
}
