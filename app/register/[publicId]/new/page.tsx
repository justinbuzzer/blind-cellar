"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { BottleForm, BottleFormErrors } from "@/components/registration/BottleForm";
import { HomeLink } from "@/components/navigation/HomeLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { BottleFormInput, registerBottle } from "@/lib/supabase/guestActions";
import { friendlyRpcError } from "@/lib/supabase/types";
import { hasBottleFormErrors, validateBottleForm } from "@/lib/validation";
import { bottleLabel } from "@/lib/codes";
import { getGuestToken } from "@/lib/deviceStorage";

const EMPTY_BOTTLE: BottleFormInput = {
  country: "",
  region: "",
  grapeBlendMode: "single",
  grapeBlend: "",
  producer: "",
  wineName: "",
  vintage: "",
  notes: "",
};

export default function AddBottlePage() {
  const params = useParams<{ publicId: string }>();
  const router = useRouter();

  const [value, setValue] = useState<BottleFormInput>(EMPTY_BOTTLE);
  const [errors, setErrors] = useState<BottleFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registeredNumber, setRegisteredNumber] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getGuestToken(params.publicId);
    if (!token) {
      router.replace(`/join/${params.publicId}`);
      return;
    }
    setReady(true);
  }, [params.publicId, router]);

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

  if (!ready) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6">
        <p className="text-sm text-cellar-text/60">Loading…</p>
      </main>
    );
  }

  if (registeredNumber !== null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <HomeLink />
        <div className="text-4xl" aria-hidden="true">
          🍾
        </div>
        <h1 className="text-2xl font-semibold text-cellar-maroon-dark">
          Registered as {bottleLabel(registeredNumber)}
        </h1>
        <p className="text-sm text-cellar-text/70">
          Your wine has been registered as {bottleLabel(registeredNumber)}. Keep
          its identity secret until reveal.
        </p>
        <div className="flex w-full flex-col gap-2">
          <Button
            fullWidth
            onClick={() => {
              setValue(EMPTY_BOTTLE);
              setErrors({});
              setRegisteredNumber(null);
            }}
          >
            Add another bottle
          </Button>
          <Button
            fullWidth
            variant="secondary"
            onClick={() => router.push(`/register/${params.publicId}`)}
          >
            Back to my bottles
          </Button>
        </div>
      </main>
    );
  }

  const hasUnsavedChanges = (
    Object.keys(value) as (keyof BottleFormInput)[]
  ).some((key) => value[key] !== EMPTY_BOTTLE[key]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <HomeLink confirmBeforeLeave hasUnsavedChanges={hasUnsavedChanges} />
      <div>
        <h1 className="text-2xl font-semibold text-cellar-maroon-dark">
          Register a bottle
        </h1>
        <p className="mt-1 text-sm text-cellar-text/70">
          Enter the real details privately. Only you can see them until the
          host reveals the tasting.
        </p>
      </div>

      <BottleForm
        value={value}
        errors={errors}
        onChange={setValue}
        onSubmit={handleSubmit}
        submitLabel="Register bottle"
        submitting={submitting}
        submitError={submitError}
      />
    </main>
  );
}
