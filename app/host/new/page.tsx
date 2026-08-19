"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { TastingModeField } from "@/components/TastingModeField";
import { PageHeader } from "@/components/PageHeader";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { HomeLink } from "@/components/navigation/HomeLink";
import { setGuestToken, setHostToken } from "@/lib/deviceStorage";
import { TastingMode } from "@/types/tasting";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_STARTING_CREDITS = "100";
function parseStartingCredits(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return value > 0 && value <= 100000 ? value : null;
}

interface FormErrors {
  title?: string;
  hostDisplayName?: string;
  tastingMode?: string;
  startingCredits?: string;
}

export default function HostSetupPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [hostDisplayName, setHostDisplayName] = useState("");
  const [tastingMode, setTastingMode] = useState<TastingMode | "">("full_blind");
  const [bettingEnabled, setBettingEnabled] = useState(false);
  const [startingCredits, setStartingCredits] = useState(DEFAULT_STARTING_CREDITS);
  const [errors, setErrors] = useState<FormErrors | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const bettingActive = tastingMode === "course_reveal" && bettingEnabled;
    const credits = bettingActive ? parseStartingCredits(startingCredits) : null;

    const validation: FormErrors = {
      title: title.trim() ? undefined : "Tasting title is required.",
      hostDisplayName: hostDisplayName.trim()
        ? undefined
        : "Enter a display name to host with.",
      tastingMode: tastingMode ? undefined : "Choose a tasting format.",
      startingCredits:
        bettingActive && credits === null
          ? "Enter a starting credit balance between 1 and 100,000."
          : undefined,
    };
    setErrors(validation);
    setSubmitError(null);
    if (
      validation.title ||
      validation.hostDisplayName ||
      validation.tastingMode ||
      validation.startingCredits
    )
      return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/host/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          date,
          hostDisplayName: hostDisplayName.trim(),
          tastingMode,
          bettingEnabled: bettingActive,
          ...(credits !== null ? { startingCredits: credits } : {}),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setSubmitError(data.error ?? "Something went wrong creating the tasting.");
        setSubmitting(false);
        return;
      }

      setHostToken(data.publicId, data.hostToken);
      // The host is also a participant in their own session — store their
      // participant token in the same slot a regular guest would use, so
      // /register and /tasting need no host-specific branching.
      setGuestToken(data.publicId, data.hostGuestToken);

      const linkFailedParam = data.accountLinkStatus === "failed" ? "&accountLinkFailed=1" : "";
      router.push(
        `/host/${data.publicId}?token=${encodeURIComponent(data.hostToken)}${linkFailedParam}`
      );
    } catch {
      setSubmitError(
        "Couldn't reach the tasting server. Check your connection and try again."
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <HomeLink
        confirmBeforeLeave
        hasUnsavedChanges={Boolean(title.trim() || hostDisplayName.trim())}
      />

      <PageHeader
        title="Create a tasting"
        supporting="Set the table, choose the format, and invite your guests when you are ready."
      />

      <Card className="p-0">
        <form onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-4 border-b border-cellar-border p-5">
            <SectionEyebrow>Occasion</SectionEyebrow>
            <TextField
              label="Tasting title"
              value={title}
              error={errors?.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Friday Night Rhone vs Piedmont"
            />
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-4 border-b border-cellar-border p-5">
            <SectionEyebrow>Host</SectionEyebrow>
            <TextField
              label="Your display name"
              value={hostDisplayName}
              error={errors?.hostDisplayName}
              onChange={(e) => setHostDisplayName(e.target.value)}
              placeholder="e.g. Alice"
              maxLength={60}
            />
          </div>

          <div className="flex flex-col gap-4 p-5">
            <SectionEyebrow>Format</SectionEyebrow>
            <TastingModeField
              value={tastingMode}
              onChange={(mode) => {
                setTastingMode(mode);
                if (mode !== "course_reveal") setBettingEnabled(false);
              }}
              error={errors?.tastingMode}
            />
            {tastingMode === "course_reveal" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-cellar-border bg-white px-4 py-3 transition-colors duration-150 hover:border-cellar-maroon/40">
                <input
                  type="checkbox"
                  checked={bettingEnabled}
                  onChange={(e) => setBettingEnabled(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-cellar-maroon"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-cellar-text">Enable betting</span>
                  <span className="text-sm leading-relaxed text-cellar-muted">
                    Each guest starts with a credit balance they choose at join time and
                    wagers on their guesses. Correct (or close) guesses win credits from
                    whoever brought the bottle; wrong guesses lose credits to them. A
                    credits leaderboard is shown throughout and in the final report.
                  </span>
                </span>
              </label>
            )}
            {tastingMode === "course_reveal" && bettingEnabled && (
              <TextField
                label="Your starting credits"
                type="number"
                inputMode="numeric"
                min={1}
                max={100000}
                value={startingCredits}
                error={errors?.startingCredits}
                onChange={(e) => setStartingCredits(e.target.value)}
                hint="You're also a participant in your own tasting — choose how many credits you'll wager with."
              />
            )}
          </div>

          {submitError && (
            <p
              role="alert"
              className="mx-5 mb-5 rounded-sm border border-cellar-danger/30 bg-cellar-danger/5 px-3 py-2 text-sm text-cellar-danger"
            >
              {submitError}
            </p>
          )}

          <div className="border-t border-cellar-border p-5">
            <Button type="submit" fullWidth disabled={submitting}>
              {submitting ? "Creating tasting…" : "Create private tasting"}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
