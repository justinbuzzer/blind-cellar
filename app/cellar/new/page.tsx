"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/Button";
import { PageHeader } from "@/components/PageHeader";
import { LoadingState } from "@/components/LoadingState";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { CellarBottleForm } from "@/components/cellar/CellarBottleForm";
import {
  CellarBottleFormErrors,
  CellarBottleFormInput,
  EMPTY_CELLAR_BOTTLE,
  validateCellarBottleForm,
} from "@/lib/cellar";
import { addCellarBottle } from "@/lib/supabase/cellarActions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import { friendlyRpcError } from "@/lib/supabase/types";
import { hasBottleFormErrors } from "@/lib/validation";
import { scrollToFirstInvalidField } from "@/lib/formFocus";

type LoadState = "checking" | "no-config" | "ready";

export default function AddCellarBottlePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();

  const [loadState, setLoadState] = useState<LoadState>("checking");
  const [value, setValue] = useState<CellarBottleFormInput>(EMPTY_CELLAR_BOTTLE);
  const [errors, setErrors] = useState<CellarBottleFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }
    setLoadState("ready");
  }, []);

  useEffect(() => {
    if (authLoading || loadState !== "ready" || user) return;
    router.replace("/account/sign-in?redirect=/cellar/new");
  }, [authLoading, loadState, user, router]);

  useEffect(() => {
    if (hasBottleFormErrors(errors)) scrollToFirstInvalidField();
  }, [errors]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const validation = validateCellarBottleForm(value);
    setErrors(validation);
    setSubmitError(null);
    if (hasBottleFormErrors(validation)) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setSubmitError("Supabase isn't configured for this app yet.");
      return;
    }

    setSubmitting(true);
    const { data, error } = await addCellarBottle(supabase, value);
    setSubmitting(false);

    if (error) {
      setSubmitError(friendlyRpcError(error));
      return;
    }

    // `added` carries the created count so /cellar can show the correctly
    // pluralized confirmation ("Bottle added…" vs "N bottles added…") — see
    // README "Personal Cellar" — "Quantity". Falls back to the submitted
    // quantity if the response is ever missing it for some reason.
    router.push(`/cellar?added=${data?.count ?? value.quantity}`);
  }

  if (loadState === "no-config") {
    return (
      <UnavailableScreen
        title="Supabase isn't configured"
        message="This deployment is missing its Supabase environment variables. See SUPABASE_SETUP.md."
      />
    );
  }

  if (loadState !== "ready" || authLoading || !user) {
    return <LoadingState message="Opening your cellar…" />;
  }

  const hasUnsavedChanges = (Object.keys(value) as (keyof CellarBottleFormInput)[]).some(
    (key) => value[key] !== EMPTY_CELLAR_BOTTLE[key]
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <HomeLink confirmBeforeLeave hasUnsavedChanges={hasUnsavedChanges} />

      <PageHeader
        eyebrow="Private cellar"
        title="Add a bottle"
        supporting="Record a bottle you have on hand."
      />

      <CellarBottleForm
        mode="add"
        value={value}
        errors={errors}
        onChange={setValue}
        onSubmit={handleSubmit}
        submitLabel="Add to cellar"
        submitting={submitting}
        submitError={submitError}
        secondaryAction={
          <Link href="/cellar">
            <Button type="button" variant="secondary" fullWidth>
              Back to cellar
            </Button>
          </Link>
        }
      />
    </main>
  );
}
