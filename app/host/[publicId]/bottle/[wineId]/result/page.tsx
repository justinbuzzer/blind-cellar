import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { BottleResultForHostResponse } from "@/lib/supabase/types";
import { HostBottleResultClient } from "@/components/host/HostBottleResultClient";
import { Button } from "@/components/Button";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { publicId: string; wineId: string };
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
 * Host-only per-bottle results page — see README "Results reveal". Fetches
 * server-side via get_bottle_result_for_host directly (same pattern as
 * app/host/[publicId]/page.tsx), so an invalid host token or an unrevealed
 * bottle never reaches the client at all.
 */
export default async function HostBottleResultPage({ params, searchParams }: PageProps) {
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

  const { data, error } = await supabase.rpc("get_bottle_result_for_host", {
    p_public_id: params.publicId,
    p_host_token: token,
    p_wine_id: params.wineId,
  });

  if (error || !data) {
    const notRevealed = error?.message?.includes("bottle_not_revealed");
    return (
      <UnavailablePage
        title={notRevealed ? "Not revealed yet" : "Results unavailable"}
        message={
          notRevealed
            ? "This bottle hasn't been revealed yet — reveal it from Host Controls first."
            : "This host link isn't valid for this tasting, or this bottle couldn't be found."
        }
        backHref={backHref}
      />
    );
  }

  return (
    <HostBottleResultClient
      publicId={params.publicId}
      hostToken={token}
      response={data as BottleResultForHostResponse}
    />
  );
}
