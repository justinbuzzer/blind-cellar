"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextField } from "@/components/TextField";
import { PageHeader } from "@/components/PageHeader";
import { ImageBand } from "@/components/ImageBand";
import { UnavailableScreen } from "@/components/UnavailableScreen";
import { HomeLink } from "@/components/navigation/HomeLink";
import { signInImage } from "@/lib/appImages";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isValidEmail, isValidOtpFormat, maskEmail, OTP_CODE_MAX_LENGTH } from "@/lib/supabase/auth";
import { resolveSafeReturnPath } from "@/lib/authRedirects";

type Step = "email" | "code";

const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Passwordless email sign-in (see README "Accounts"). Deliberately a single
 * page with two steps rather than two routes — the "code" step needs the
 * email address from the previous step in memory, and keeping both steps
 * together avoids re-deriving or round-tripping that through the URL.
 * Never required to use any existing anonymous host/guest/join workflow.
 */
export default function SignInPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [redirectPath, setRedirectPath] = useState("/account");
  const [configured, setConfigured] = useState(true);

  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setConfigured(getSupabaseBrowserClient() !== null);
    const requested = new URLSearchParams(window.location.search).get("redirect");
    setRedirectPath(resolveSafeReturnPath(requested));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
      return;
    }
    cooldownTimer.current = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, [cooldown]);

  async function sendCode(targetEmail: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setSending(true);
    setSubmitError(null);
    setJustSent(false);

    const { error } = await supabase.auth.signInWithOtp({ email: targetEmail });
    setSending(false);

    // Deliberately the same calm message whether Supabase rejected the
    // request or the network failed — never reveal *why*, and never reveal
    // whether this email already has an account (see README "Accounts").
    if (error) {
      setSubmitError("We could not send a sign-in code. Please try again.");
      return;
    }

    setJustSent(true);
    setStep("code");
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;

    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(undefined);
    setEmail(trimmed);
    await sendCode(trimmed);
  }

  async function handleResend() {
    if (sending || cooldown > 0) return;
    await sendCode(email);
  }

  function handleUseDifferentEmail() {
    setStep("email");
    setCode("");
    setCodeError(undefined);
    setSubmitError(null);
    setJustSent(false);
    setCooldown(0);
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (verifying) return;

    const trimmedCode = code.trim();
    if (!isValidOtpFormat(trimmedCode)) {
      setCodeError("Enter the code from your email.");
      return;
    }
    setCodeError(undefined);
    setSubmitError(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setVerifying(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: trimmedCode,
      type: "email",
    });
    setVerifying(false);

    if (error) {
      setSubmitError("That code is invalid or has expired. Request a new code and try again.");
      return;
    }

    router.push(redirectPath);
  }

  if (!configured) {
    return (
      <UnavailableScreen
        title="Supabase isn't configured"
        message="This deployment is missing its Supabase environment variables. See SUPABASE_SETUP.md."
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-12">
      <HomeLink />

      <ImageBand image={signInImage} className="hidden h-28 rounded-sm sm:block" />

      {step === "email" ? (
        <>
          <PageHeader
            eyebrow="Private record"
            title="Keep your tasting record"
            supporting="Sign in with your email to keep a private tasting record across devices. You can still join any tasting without an account."
          />

          <Card>
            <form onSubmit={handleEmailSubmit} noValidate className="flex flex-col gap-4">
              <TextField
                label="Email address"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                error={emailError}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />

              {submitError && (
                <p role="alert" className="rounded-sm border border-cellar-danger/30 bg-cellar-danger/5 px-3 py-2 text-sm text-cellar-danger">
                  {submitError}
                </p>
              )}

              <Button type="submit" fullWidth disabled={sending}>
                {sending ? "Sending…" : "Send sign-in code"}
              </Button>
            </form>
          </Card>
        </>
      ) : (
        <>
          <PageHeader eyebrow="Private record" title="Check your email" />

          <Card className="flex flex-col gap-4">
            {justSent && (
              <p role="status" aria-live="polite" className="text-sm text-cellar-muted">
                A sign-in code has been sent to your email.
              </p>
            )}
            <p className="text-sm text-cellar-muted">
              Enter the code we sent to {maskEmail(email)}.
            </p>

            <form onSubmit={handleCodeSubmit} noValidate className="flex flex-col gap-4">
              <TextField
                label="Verification code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={OTP_CODE_MAX_LENGTH}
                value={code}
                error={codeError}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="123456"
              />

              {submitError && (
                <p role="alert" className="rounded-sm border border-cellar-danger/30 bg-cellar-danger/5 px-3 py-2 text-sm text-cellar-danger">
                  {submitError}
                </p>
              )}

              <Button type="submit" fullWidth disabled={verifying}>
                {verifying ? "Verifying…" : "Verify and continue"}
              </Button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cellar-border pt-4 text-sm">
              <button
                type="button"
                onClick={handleUseDifferentEmail}
                className="min-h-[44px] font-medium text-cellar-muted underline-offset-4 hover:text-cellar-maroon hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
              >
                Use a different email
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={sending || cooldown > 0}
                className="min-h-[44px] font-medium text-cellar-maroon underline-offset-4 hover:text-cellar-maroon-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold disabled:cursor-not-allowed disabled:text-cellar-muted disabled:no-underline"
              >
                {cooldown > 0 ? `Send a new code (${cooldown}s)` : "Send a new code"}
              </button>
            </div>
          </Card>
        </>
      )}
    </main>
  );
}
