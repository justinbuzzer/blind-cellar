import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ProvisionalLeaderboardResponse } from "@/lib/supabase/types";
import { HostLeaderboardClient } from "@/components/host/HostLeaderboardClient";
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
 * Host-only provisional leaderboard page — see README "Results reveal".
 * Fetches server-side via get_provisional_leaderboard_for_host directly
 * (same pattern as app/host/[publicId]/page.tsx).
 */
export default async function HostLeaderboardPage({ params, searchParams }: PageProps) {
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

  const { data, error } = await supabase.rpc("get_provisional_leaderboard_for_host", {
    p_public_id: params.publicId,
    p_host_token: token,
  });

  if (error || !data) {
    return (
      <UnavailablePage
        title="Leaderboard unavailable"
        message="This host link isn't valid for this tasting, or this tasting's format doesn't support a leaderboard."
        backHref={backHref}
      />
    );
  }

  return (
    <HostLeaderboardClient
      publicId={params.publicId}
      hostToken={token}
      response={data as ProvisionalLeaderboardResponse}
    />
  );
}
