"use client";

import { useState } from "react";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { ArchiveRole } from "@/lib/archive";
import { claimAccountTastingRecord } from "@/lib/supabase/claim";

interface ClaimPanelProps {
  publicId: string;
  role: ArchiveRole;
  token: string;
  className?: string;
  /** Called once the claim succeeds, so the caller can refresh its own lists (e.g. move the entry out of "This browser"'s claimable set). */
  onClaimed?: () => void;
}

type ClaimState = "idle" | "claiming" | "success" | "error";

/**
 * The explicit "Add to my tasting record" action (see README "Account-linked
 * tasting records") — shown only where the caller has already confirmed
 * every eligibility rule (signed in, valid local token, revealed, not
 * already linked). This component itself does no eligibility checking; it
 * only performs the claim and reports the result, using the exact required
 * copy. A refined paper panel, not a banner or a modal — the action has no
 * destructive/irreversible quality that would justify one.
 */
export function ClaimPanel({ publicId, role, token, className = "", onClaimed }: ClaimPanelProps) {
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
            onClick={handleClaim}
            disabled={state === "claiming"}
            className="mt-1 self-start"
          >
            {state === "claiming" ? "Adding…" : "Add to my tasting record"}
          </Button>
        </>
      )}
    </Card>
  );
}
