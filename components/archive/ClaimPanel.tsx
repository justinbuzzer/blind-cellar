"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { ArchiveRole } from "@/lib/archive";
import { claimAccountTastingRecord } from "@/lib/supabase/claim";

interface ClaimPanelProps {
  publicId: string;
  role: ArchiveRole;
  token: string;
  className?: string;
  /** Shown in the confirmation prompt for a participant claim, per README
   * "Session rejoin" — "Optional account claim". Not always available at
   * every call site today; falls back to a generic "your account" phrasing
   * rather than fabricating a name. */
  displayName?: string;
  /** Called once the claim succeeds, so the caller can refresh its own lists (e.g. move the entry out of "This browser"'s claimable set). */
  onClaimed?: () => void;
}

type ClaimState = "idle" | "confirming" | "claiming" | "success" | "error";

/**
 * The explicit "Add to my tasting record" action (see README "Account-linked
 * tasting records" and "Session rejoin" — "Optional account claim") — shown
 * only where the caller has already confirmed every eligibility rule
 * (signed in, valid local token, revealed, not already linked). This
 * component itself does no eligibility checking; it only shows an explicit
 * confirmation, then performs the claim and reports the result. For a
 * participant claim, this is also what links guests.user_id (see
 * claim_account_tasting_record in supabase/schema.sql) — proof of guest
 * identity is the same locally-held guest_token this panel already required
 * before this feature existed, which the RPC re-validates itself.
 */
export function ClaimPanel({
  publicId,
  role,
  token,
  className = "",
  displayName,
  onClaimed,
}: ClaimPanelProps) {
  const [state, setState] = useState<ClaimState>("idle");

  async function handleClaim() {
    if (state === "claiming") return;
    setState("claiming");
    const ok = await claimAccountTastingRecord({
      publicId,
      role,
      token,
      claimSource: "browser_claim",
    });
    if (ok) {
      setState("success");
      onClaimed?.();
    } else {
      setState("error");
    }
  }

  return (
    <Card className={`flex flex-col gap-2 ${className}`}>
      <SectionEyebrow>Private record</SectionEyebrow>
      <h3 className="font-display text-lg font-semibold text-cellar-maroon-dark">
        Keep this evening in your record
      </h3>

      {state === "success" ? (
        <div className="mt-1">
          <p role="status" aria-live="polite" className="text-sm font-medium text-cellar-success">
            Added to your record
          </p>
          <p className="mt-1 text-sm text-cellar-muted">
            This tasting is now available whenever you sign in.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-cellar-muted">
            You are signed in on this browser. Add this completed tasting to
            your account to view it whenever you sign in.
          </p>

          {state === "error" && (
            <p role="alert" className="rounded-sm border border-cellar-danger/30 bg-cellar-danger/5 px-3 py-2 text-sm text-cellar-danger">
              This tasting could not be added to your record. Your existing
              access has not changed.
            </p>
          )}

          <Button
            type="button"
            onClick={() => setState("confirming")}
            disabled={state === "claiming"}
            className="mt-1 self-start"
          >
            Add to my tasting record
          </Button>
        </>
      )}

      {(state === "confirming" || state === "claiming") && (
        <Modal
          title="Add to your record"
          onClose={() => state !== "claiming" && setState("idle")}
        >
          <p>
            {role === "participant"
              ? `Link this tasting participation to ${displayName ? displayName : "your account"}?`
              : "Add this hosted tasting to your account?"}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setState("idle")}
              disabled={state === "claiming"}
            >
              Cancel
            </Button>
            <Button onClick={handleClaim} disabled={state === "claiming"}>
              {state === "claiming" ? "Adding…" : "Confirm"}
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
