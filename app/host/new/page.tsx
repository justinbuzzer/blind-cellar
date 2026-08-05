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

interface FormErrors {
  title?: string;
  hostDisplayName?: string;
  tastingMode?: string;
}

export default function HostSetupPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [hostDisplayName, setHostDisplayName] = useState("");
  const [tastingMode, setTastingMode] = useState<TastingMode | "">("full_blind");
  const [errors, setErrors] = useState<FormErrors | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const validation: FormErrors = {
      title: title.trim() ? undefined : "Tasting title is required.",
      hostDisplayName: hostDisplayName.trim()
        ? undefined
        : "Enter a display name to host with.",
      tastingMode: tastingMode ? undefined : "Choose a tasting format.",
    };
    setErrors(validation);
    setSubmitError(null);
    if (validation.title || validation.hostDisplayName || validation.tastingMode) return;

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
      router.push(`/host/${data.publicId}?token=${encodeURIComponent(data.hostToken)}`);
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
              onChange={setTastingMode}
              error={errors?.tastingMode}
            />
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
