"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { SectionEyebrow } from "@/components/SectionEyebrow";
import { SegmentedControl } from "@/components/SegmentedControl";
import { BottleForm, BottleFormErrors } from "@/components/registration/BottleForm";
import { CellarBottleSelector } from "@/components/registration/CellarBottleSelector";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState } from "@/components/LoadingState";
import { HomeLink } from "@/components/navigation/HomeLink";
import { HostControlsLink } from "@/components/navigation/HostControlsLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { BottleFormInput, registerBottle } from "@/lib/supabase/guestActions";
import { registerBottleFromCellar } from "@/lib/supabase/cellarActions";
import { cellarBottleFormatLabel, cellarWineIdentityLabel } from "@/lib/cellar";
import { compactWineLocationLabel } from "@/lib/appellations";
import { CellarBottleRow, friendlyRpcError } from "@/lib/supabase/types";
import { hasBottleFormErrors, validateBottleForm } from "@/lib/validation";
import { bottleLabel } from "@/lib/codes";
import { getGuestToken } from "@/lib/deviceStorage";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import { WINE_STYLE_LABELS } from "@/types/tasting";

const EMPTY_BOTTLE: BottleFormInput = {
  country: "",
  region: "",
  appellation: "",
  grapeBlendMode: "single",
  grapeBlend: "",
  selectedGrapes: [],
  otherGrapesText: "",
  producer: "",
  wineName: "",
  vintage: "",
  wineStyle: "",
  notes: "",
};

type Source = "manual" | "cellar";
type CellarLoadState = "idle" | "loading" | "ready" | "unavailable";

export default function AddBottlePage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();

  const [value, setValue] = useState<BottleFormInput>(EMPTY_BOTTLE);
  const [errors, setErrors] = useState<BottleFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registeredNumber, setRegisteredNumber] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const [source, setSource] = useState<Source>("manual");
  const [cellarLoadState, setCellarLoadState] = useState<CellarLoadState>("idle");
  const [availableCellarBottles, setAvailableCellarBottles] = useState<CellarBottleRow[]>([]);
  const [selectedCellarBottle, setSelectedCellarBottle] = useState<CellarBottleRow | null>(null);
  const [cellarSubmitting, setCellarSubmitting] = useState(false);
  const [cellarSubmitError, setCellarSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const token = getGuestToken(params.publicId);
    if (!token) {
      router.replace(`/join/${params.publicId}`);
      return;
    }
    setReady(true);
  }, [params.publicId, router]);

  const loadCellarBottles = useCallback(async () => {
    if (!user) return;
    setCellarLoadState("loading");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setCellarLoadState("unavailable");
      return;
    }
    const { data, error } = await supabase
      .from("cellar_bottles")
      .select("*")
      .eq("status", "available")
      .order("created_at", { ascending: false })
      .limit(300);

    if (error || !data) {
      setCellarLoadState("unavailable");
      return;
    }
    setAvailableCellarBottles(data as CellarBottleRow[]);
    setCellarLoadState("ready");
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) loadCellarBottles();
  }, [authLoading, user, loadCellarBottles]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const validation = validateBottleForm(value);
    setErrors(validation);
    setSubmitError(null);
    if (hasBottleFormErrors(validation)) return;

    const token = getGuestToken(params.publicId);
    const supabase = getSupabaseBrowserClient();
    if (!token || !supabase) {
      setSubmitError("Supabase isn't configured for this app yet.");
      return;
    }

    setSubmitting(true);
    const { data, error } = await registerBottle(supabase, token, value);
    setSubmitting(false);

    if (error || !data) {
      setSubmitError(friendlyRpcError(error));
      return;
    }

    setRegisteredNumber(data.bottleNumber);
  }

  async function handleUseThisBottle() {
    if (!selectedCellarBottle || cellarSubmitting) return;
    const token = getGuestToken(params.publicId);
    const supabase = getSupabaseBrowserClient();
    if (!token || !supabase) {
      setCellarSubmitError("Supabase isn't configured for this app yet.");
      return;
    }

    setCellarSubmitting(true);
    setCellarSubmitError(null);
    const { data, error } = await registerBottleFromCellar(supabase, token, selectedCellarBottle.id);
    setCellarSubmitting(false);

    if (error || !data) {
      setCellarSubmitError(friendlyRpcError(error));
      return;
    }

    setRegisteredNumber(data.bottleNumber);
  }

  function resetForAnotherBottle() {
    setValue(EMPTY_BOTTLE);
    setErrors({});
    setSubmitError(null);
    setSource("manual");
    setSelectedCellarBottle(null);
    setCellarSubmitError(null);
    setRegisteredNumber(null);
    if (user) loadCellarBottles();
  }

  if (!ready) {
    return <LoadingState message="Preparing the table…" />;
  }

  if (registeredNumber !== null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <HomeLink />
        <div className="w-full border-t border-cellar-gold/40 pt-5">
          <h1 className="font-display text-2xl font-semibold text-cellar-maroon-dark">
            Registered as {bottleLabel(registeredNumber)}
          </h1>
          <p className="mt-2 text-sm text-cellar-muted">
            Your wine has been registered as {bottleLabel(registeredNumber)}. Keep
            its identity secret until reveal.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button fullWidth onClick={resetForAnotherBottle}>
            Add another bottle
          </Button>
          <Button
            fullWidth
            variant="secondary"
            onClick={() => router.push(`/register/${params.publicId}`)}
          >
            Back to my bottles
          </Button>
          <HostControlsLink
            sessionPublicId={params.publicId}
            className="self-center"
          />
        </div>
      </main>
    );
  }

  const hasUnsavedChanges =
    selectedCellarBottle !== null ||
    (Object.keys(value) as (keyof BottleFormInput)[]).some((key) => value[key] !== EMPTY_BOTTLE[key]);

  const showSourceChoice = Boolean(user) && cellarLoadState === "ready" && availableCellarBottles.length > 0;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-2">
        <HomeLink confirmBeforeLeave hasUnsavedChanges={hasUnsavedChanges} />
        <HostControlsLink
          sessionPublicId={params.publicId}
          confirmBeforeLeave
          hasUnsavedChanges={hasUnsavedChanges}
        />
      </div>

      <PageHeader
        title="Register a bottle"
        supporting="These details remain private until reveal."
      />

      {showSourceChoice && (
        <SegmentedControl
          label="Where is this bottle from?"
          value={source}
          onChange={(next) => {
            setSource(next);
            if (next === "manual") setSelectedCellarBottle(null);
          }}
          options={[
            { value: "manual", label: "Add a new bottle" },
            { value: "cellar", label: "Add from my cellar" },
          ]}
        />
      )}

      {!user && !authLoading && (
        <a
          href={`/account/sign-in?redirect=${encodeURIComponent(`/register/${params.publicId}/new`)}`}
          className="text-sm font-medium text-cellar-maroon underline-offset-4 hover:text-cellar-maroon-dark hover:underline"
        >
          Sign in to select from your cellar
        </a>
      )}

      {user && cellarLoadState === "ready" && availableCellarBottles.length === 0 && (
        <p className="text-sm text-cellar-muted">
          Your cellar has no available bottles. Add a new bottle for this tasting.
        </p>
      )}

      {source === "manual" || !showSourceChoice ? (
        <BottleForm
          value={value}
          errors={errors}
          onChange={setValue}
          onSubmit={handleSubmit}
          submitLabel="Register bottle"
          submitting={submitting}
          submitError={submitError}
        />
      ) : selectedCellarBottle ? (
        <Card className="flex flex-col gap-3">
          <SectionEyebrow>Selected from your cellar</SectionEyebrow>
          <h3 className="font-display text-xl font-semibold text-cellar-maroon-dark">
            {cellarWineIdentityLabel(selectedCellarBottle)}
          </h3>
          <p className="text-sm text-cellar-muted">
            {compactWineLocationLabel(selectedCellarBottle)} ·{" "}
            {WINE_STYLE_LABELS[selectedCellarBottle.wine_style]} · {cellarBottleFormatLabel(selectedCellarBottle)}
          </p>
          <p className="text-sm text-cellar-text">
            This bottle will be reserved for this tasting until it is used or returned.
          </p>

          {cellarSubmitError && (
            <p
              role="alert"
              className="rounded-sm border border-cellar-danger/30 bg-cellar-danger/5 px-3 py-2 text-sm text-cellar-danger"
            >
              {cellarSubmitError}
            </p>
          )}

          <div className="mt-1 flex flex-col gap-2">
            <Button type="button" onClick={handleUseThisBottle} disabled={cellarSubmitting}>
              {cellarSubmitting ? "Reserving…" : "Use this bottle"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelectedCellarBottle(null)}
              disabled={cellarSubmitting}
            >
              Choose another bottle
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSource("manual");
                setSelectedCellarBottle(null);
              }}
              disabled={cellarSubmitting}
            >
              Add a new bottle instead
            </Button>
          </div>
        </Card>
      ) : (
        <CellarBottleSelector bottles={availableCellarBottles} onSelect={setSelectedCellarBottle} />
      )}
    </main>
  );
}
