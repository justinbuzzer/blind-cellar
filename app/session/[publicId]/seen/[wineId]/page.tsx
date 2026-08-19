"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { BottlePhoto } from "@/components/BottlePhoto";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { RatingSlider } from "@/components/RatingSlider";
import { TextAreaField } from "@/components/TextAreaField";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSeenTastingState, upsertSeenRating } from "@/lib/supabase/guestActions";
import { friendlyRpcError, SeenBottleDTO } from "@/lib/supabase/types";
import { formatSeenGroupRating } from "@/lib/seenHostControls";
import { formatContributorBottleLabel, wineStyleToContributorBucket } from "@/lib/contributorLabel";
import { WINE_STYLE_LABELS } from "@/types/tasting";
import { getGuestToken } from "@/lib/deviceStorage";

type LoadState = "loading" | "no-config" | "invalid-token" | "not-found" | "ready";

/**
 * Rating entry for one bottle in a seen tasting (see README "Tasting modes").
 * Unlike full_blind/course_reveal's autosave-as-you-type guess forms, saving
 * here is an explicit action — there is no identification guess to draft,
 * just a rating (plus an optional note) that stays freely editable
 * until the host ends the tasting.
 */
export default function SeenBottleRatingPage() {
  const params = useParams<{ publicId: string; wineId: string }>();
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [bottle, setBottle] = useState<SeenBottleDTO | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);

  useEffect(() => {
    const token = getGuestToken(params.publicId);
    if (!token) {
      router.replace(`/join/${params.publicId}`);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }

    (async () => {
      const { data, error } = await getSeenTastingState(supabase, token);
      if (error || !data) {
        setLoadState("invalid-token");
        return;
      }
      if (data.session.status === "revealed") {
        router.replace(`/results/${params.publicId}`);
        return;
      }
      if (data.session.tastingMode !== "seen") {
        router.replace(`/tasting/${params.publicId}`);
        return;
      }

      const found = data.bottles.find((b) => b.id === params.wineId);
      if (!found) {
        setLoadState("not-found");
        return;
      }

      setBottle(found);
      setRating(found.myRating);
      setNote(found.myNote ?? "");
      setLoadState("ready");
    })();
  }, [params.publicId, params.wineId, router]);

  const ratingsRevealed = bottle?.ratingsRevealedAt !== null && bottle?.ratingsRevealedAt !== undefined;

  async function handleSave() {
    if (ratingsRevealed) return;
    if (rating === null) {
      setRatingError("A rating is required.");
      return;
    }
    setRatingError(null);
    setSaveError(null);
    setSavedJustNow(false);
    setSaving(true);

    const token = getGuestToken(params.publicId);
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !token || !bottle) {
      setSaveError("Supabase isn't configured for this app yet.");
      setSaving(false);
      return;
    }

    const { error } = await upsertSeenRating(
      supabase,
      token,
      bottle.id,
      rating,
      note
    );
    setSaving(false);
    if (error) {
      // Form state (rating/note) is deliberately left exactly as the
      // participant entered it — a network hiccup or a since-ended tasting
      // should never silently discard what they typed.
      setSaveError(friendlyRpcError(error));
      return;
    }
    setBottle({ ...bottle, myRating: rating });
    setSavedJustNow(true);
  }

  if (loadState === "loading") {
    return <LoadingState message="Opening the tasting book…" />;
  }

  if (loadState === "no-config") {
    return (
      <UnavailableScreen
        title="Supabase isn't configured"
        message="This deployment is missing its Supabase environment variables. See SUPABASE_SETUP.md."
      />
    );
  }

  if (loadState === "invalid-token") {
    return (
      <UnavailableScreen
        title="Your guest session isn't valid"
        message="We couldn't find your place in this tasting on this device. Try joining again."
        actionHref={`/join/${params.publicId}`}
        actionLabel="Join this tasting"
      />
    );
  }

  if (loadState === "not-found" || !bottle) {
    return (
      <UnavailableScreen
        title="Bottle not found"
        message="We couldn't find that bottle in this tasting."
        actionHref={`/session/${params.publicId}/seen`}
        actionLabel="Back to all bottles"
      />
    );
  }

  const contributorLabel = formatContributorBottleLabel({
    contributorDisplayName: bottle.contributorName,
    styleBucket: wineStyleToContributorBucket(bottle.wineStyle),
    contributorStyleSequence: bottle.contributorStyleSequence,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink />
        <HostControlsLink sessionPublicId={params.publicId} />
      </div>

      <Card className="flex flex-col gap-5">
        <div className="flex items-start gap-4 border-b border-cellar-border pb-4">
          <BottlePhoto photoPath={bottle.photoPath} alt={`${bottle.producer} — ${bottle.wineCuvee}`} size={80} />
          <div>
            <SectionEyebrow>
              {bottle.anonymousCode} · {bottle.position} of {bottle.totalBottles}
            </SectionEyebrow>
            <h1 className="mt-1.5 font-display text-xl font-semibold text-cellar-maroon-dark">
              {bottle.producer} — {bottle.wineCuvee} {bottle.vintage}
            </h1>
            <p className="mt-1 text-sm text-cellar-muted">
              {[bottle.country, bottle.region, bottle.grapeBlend].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1 text-sm text-cellar-muted">
              Style: {WINE_STYLE_LABELS[bottle.wineStyle]}
              {contributorLabel && <> · {contributorLabel}</>}
            </p>
          </div>
        </div>

        {ratingsRevealed && (
          <div className="flex flex-col gap-1 rounded-sm bg-cellar-bg p-3">
            <p className="text-sm font-medium text-cellar-text">Ratings revealed</p>
            <p className="text-sm text-cellar-text">{formatSeenGroupRating(bottle.groupRating)}</p>
          </div>
        )}

        <RatingSlider
          value={rating}
          onChange={(next) => {
            setRating(next);
            setRatingError(null);
            setSavedJustNow(false);
          }}
          error={ratingError ?? undefined}
          disabled={ratingsRevealed}
        />

        <div className="flex flex-col gap-4 border-t border-cellar-border pt-4">
          <TextAreaField
            label="Tasting note (optional)"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSavedJustNow(false);
            }}
            placeholder="Nose, palate, anything that stood out"
            disabled={ratingsRevealed}
          />
        </div>

        <p className="border-t border-cellar-border pt-3 text-xs text-cellar-muted">
          {ratingsRevealed
            ? "The host has revealed this wine's group rating, so ratings for it are now locked."
            : "You may revise this rating until the host ends the tasting."}
        </p>
      </Card>

      {savedJustNow && (
        <p role="status" aria-live="polite" className="text-sm font-medium text-cellar-maroon">
          Rating saved. You may revise it until the host ends the tasting.
        </p>
      )}

      {saveError && (
        <p role="alert" className="rounded-sm border border-cellar-danger/30 bg-cellar-danger/5 px-3 py-2 text-sm text-cellar-danger">
          {saveError}
        </p>
      )}

      <div className="flex gap-3">
        <Link href={`/session/${params.publicId}/seen`} className="w-1/2">
          <Button type="button" variant="secondary" fullWidth>
            Back to all bottles
          </Button>
        </Link>
        {!ratingsRevealed && (
          <div className="w-1/2">
            <Button type="button" fullWidth onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save rating"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
