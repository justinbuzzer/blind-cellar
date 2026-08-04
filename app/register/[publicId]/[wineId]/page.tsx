"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BottleForm, BottleFormErrors } from "@/components/registration/BottleForm";
import { Button } from "@/components/Button";
import { HomeLink } from "@/components/navigation/HomeLink";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  bottleFormInputFromDto,
  BottleFormInput,
  getRegistrationState,
  updateBottle,
} from "@/lib/supabase/guestActions";
import { friendlyRpcError } from "@/lib/supabase/types";
import { hasBottleFormErrors, validateBottleForm } from "@/lib/validation";
import { bottleLabel } from "@/lib/codes";
import { getGuestToken } from "@/lib/deviceStorage";

type LoadState = "loading" | "no-config" | "invalid-token" | "not-yours" | "ready";

export default function EditBottlePage() {
  const params = useParams<{ publicId: string; wineId: string }>();
  const router = useRouter();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [bottleNumber, setBottleNumber] = useState<number | null>(null);
  const [value, setValue] = useState<BottleFormInput | null>(null);
  const [initialValue, setInitialValue] = useState<BottleFormInput | null>(null);
  const [errors, setErrors] = useState<BottleFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      const { data, error } = await getRegistrationState(supabase, token);
      if (error || !data) {
        setLoadState("invalid-token");
        return;
      }
      if (data.session.status !== "registration") {
        router.replace(`/register/${params.publicId}`);
        return;
      }
      const bottle = data.myBottles.find((b) => b.id === params.wineId);
      if (!bottle) {
        setLoadState("not-yours");
        return;
      }
      setBottleNumber(bottle.bottleNumber);
      const loaded = bottleFormInputFromDto(bottle);
      setValue(loaded);
      setInitialValue(loaded);
      setLoadState("ready");
    })();
  }, [params.publicId, params.wineId, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !value) return;

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
    const { error } = await updateBottle(supabase, token, params.wineId, value);
    setSubmitting(false);

    if (error) {
      setSubmitError(friendlyRpcError(error));
      return;
    }
    router.push(`/register/${params.publicId}`);
  }

  if (loadState === "loading") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-6">
        <p className="text-sm text-cellar-text/60">Loading bottle…</p>
      </main>
    );
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

  if (loadState === "not-yours") {
    return (
      <UnavailableScreen
        title="Bottle not found"
        message="That bottle doesn't exist, or isn't one of yours to edit."
        actionHref={`/register/${params.publicId}`}
        actionLabel="Back to my bottles"
      />
    );
  }

  if (!value || bottleNumber === null) return null;

  const hasUnsavedChanges =
    initialValue !== null &&
    Object.keys(value).some(
      (key) => value[key as keyof BottleFormInput] !== initialValue[key as keyof BottleFormInput]
    );

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <HomeLink confirmBeforeLeave hasUnsavedChanges={hasUnsavedChanges} />
      <div>
        <h1 className="text-2xl font-semibold text-cellar-maroon-dark">
          Edit {bottleLabel(bottleNumber)}
        </h1>
        <p className="mt-1 text-sm text-cellar-text/70">
          Its bottle number won&rsquo;t change. Only you can see these
          details until reveal.
        </p>
      </div>

      <BottleForm
        value={value}
        errors={errors}
        onChange={setValue}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        submitting={submitting}
        submitError={submitError}
      />
    </main>
  );
}

function UnavailableScreen({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <HomeLink />
      <h1 className="text-xl font-semibold text-cellar-maroon-dark">{title}</h1>
      <p className="text-sm text-cellar-text/70">{message}</p>
      {actionHref && actionLabel && (
        <a href={actionHref}>
          <Button>{actionLabel}</Button>
        </a>
      )}
    </main>
  );
}
