"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  cellarBottleFormInputFromRow,
  validateCellarBottleForm,
} from "@/lib/cellar";
import { updateCellarBottle } from "@/lib/supabase/cellarActions";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuthUser } from "@/lib/supabase/useAuthUser";
import { CellarBottleRow, friendlyRpcError } from "@/lib/supabase/types";
import { hasBottleFormErrors } from "@/lib/validation";

type LoadState = "loading" | "no-config" | "not-found" | "not-editable" | "ready";

export default function EditCellarBottlePage() {
  const params = useParams<{ bottleId: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuthUser();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [value, setValue] = useState<CellarBottleFormInput | null>(null);
  const [initialValue, setInitialValue] = useState<CellarBottleFormInput | null>(null);
  const [errors, setErrors] = useState<CellarBottleFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadState("no-config");
      return;
    }
    if (!user) {
      router.replace(`/account/sign-in?redirect=${encodeURIComponent(`/cellar/${params.bottleId}/edit`)}`);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("cellar_bottles")
        .select("*")
        .eq("id", params.bottleId)
        .maybeSingle();

      const row = data as CellarBottleRow | null;
      if (!row) {
        setLoadState("not-found");
        return;
      }
      if (row.status !== "available") {
        setLoadState("not-editable");
        return;
      }

      const loaded = cellarBottleFormInputFromRow(row);
      setValue(loaded);
      setInitialValue(loaded);
      setLoadState("ready");
    })();
  }, [authLoading, user, params.bottleId, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !value) return;

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
    const { error } = await updateCellarBottle(supabase, params.bottleId, value);
    setSubmitting(false);

    if (error) {
      setSubmitError(friendlyRpcError(error));
      return;
    }
    router.push("/cellar");
  }

  if (loadState === "loading" || authLoading) {
    return <LoadingState message="Opening the cellar card…" />;
  }

  if (loadState === "no-config") {
    return (
      <UnavailableScreen
        title="Supabase isn't configured"
        message="This deployment is missing its Supabase environment variables. See SUPABASE_SETUP.md."
      />
    );
  }

  if (loadState === "not-found") {
    return (
      <UnavailableScreen
        title="Bottle not found"
        message="That bottle doesn't exist, or isn't one of yours."
        actionHref="/cellar"
        actionLabel="Back to cellar"
      />
    );
  }

  if (loadState === "not-editable") {
    return (
      <UnavailableScreen
        title="This bottle can't be edited"
        message="This bottle cannot be edited while it is reserved or after it has been consumed."
        actionHref="/cellar"
        actionLabel="Back to cellar"
      />
    );
  }

  if (!value) return null;

  const hasUnsavedChanges =
    initialValue !== null &&
    Object.keys(value).some(
      (key) =>
        value[key as keyof CellarBottleFormInput] !== initialValue[key as keyof CellarBottleFormInput]
    );

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-6 py-10">
      <HomeLink confirmBeforeLeave hasUnsavedChanges={hasUnsavedChanges} />

      <PageHeader eyebrow="Private cellar" title="Edit bottle" supporting="Update this bottle's details." />

      <CellarBottleForm
        mode="edit"
        value={value}
        errors={errors}
        onChange={setValue}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
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
