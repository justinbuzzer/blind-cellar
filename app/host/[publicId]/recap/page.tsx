import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { HostSessionResponse, ProvisionalLeaderboardResponse } from "@/lib/supabase/types";
import { HostRecapClient } from "@/components/host/HostRecapClient";
import { Button } from "@/components/Button";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { publicId: string };
  searchParams: { token?: string };
}

function UnavailablePage({
  title,
  message,
  backHref,
}: {
  title: string;
  message: string;
  backHref: string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold text-cellar-maroon-dark">{title}</h1>
      <p className="text-sm text-cellar-text/70">{message}</p>
      <Link href={backHref}>
        <Button variant="secondary">Back to Host Controls</Button>
      </Link>
    </main>
  );
}

/**
 * Host-only tasting recap page — see README "Final leaderboard and tasting
 * recap". Fetches server-side via get_host_session (session metadata) and
 * get_provisional_leaderboard_for_host (revealed-bottle scoring data) in
 * parallel, same pattern as the other host pages.
 */
export default async function HostRecapPage({ params, searchParams }: PageProps) {
  const token = searchParams.token;
  const backHref = token
    ? `/host/${params.publicId}?token=${encodeURIComponent(token)}`
    : "/";

  if (!token) {
    return (
      <UnavailablePage
        title="Host access unavailable"
        message="This page needs the host link with your management token."
        backHref={backHref}
      />
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return (
      <UnavailablePage
        title="Supabase isn't configured"
        message="This deployment is missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. See SUPABASE_SETUP.md."
        backHref={backHref}
      />
    );
  }

  const [sessionResult, leaderboardResult] = await Promise.all([
    supabase.rpc("get_host_session", { p_public_id: params.publicId, p_host_token: token }),
    supabase.rpc("get_provisional_leaderboard_for_host", {
      p_public_id: params.publicId,
      p_host_token: token,
    }),
  ]);

  if (sessionResult.error || !sessionResult.data || leaderboardResult.error || !leaderboardResult.data) {
    return (
      <UnavailablePage
        title="Recap unavailable"
        message="This host link isn't valid for this tasting, or this tasting's format doesn't support a recap."
        backHref={backHref}
      />
    );
  }

  return (
    <HostRecapClient
      publicId={params.publicId}
      hostToken={token}
      session={sessionResult.data as HostSessionResponse}
      leaderboard={leaderboardResult.data as ProvisionalLeaderboardResponse}
    />
  );
}
