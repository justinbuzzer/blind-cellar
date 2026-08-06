import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { HostSessionResponse } from "@/lib/supabase/types";
import { HostControlClient } from "@/components/host/HostControlClient";
import { Button } from "@/components/Button";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { publicId: string };
  searchParams: { token?: string; accountLinkFailed?: string };
}

function UnavailablePage({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold text-cellar-maroon-dark">{title}</h1>
      <p className="text-sm text-cellar-text/70">{message}</p>
      <Link href="/">
        <Button variant="secondary">Back to home</Button>
      </Link>
    </main>
  );
}

export default async function HostControlPage({ params, searchParams }: PageProps) {
  const token = searchParams.token;

  if (!token) {
    return (
      <UnavailablePage
        title="Host access unavailable"
        message="This page needs the host link with your management token, e.g. the one you got right after creating the tasting. Check the link you used to get here."
      />
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return (
      <UnavailablePage
        title="Supabase isn't configured"
        message="This deployment is missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. See SUPABASE_SETUP.md."
      />
    );
  }

  const { data, error } = await supabase.rpc("get_host_session", {
    p_public_id: params.publicId,
    p_host_token: token,
  });

  if (error || !data) {
    const notFound = error?.message?.includes("session_not_found");
    return (
      <UnavailablePage
        title={notFound ? "Tasting not found" : "Host access unavailable"}
        message={
          notFound
            ? "We couldn't find a tasting at this link. Double-check the URL, or start a new tasting."
            : "This host link isn't valid for this tasting — the token is missing or incorrect. Private wine details are never shown without a valid host link."
        }
      />
    );
  }

  return (
    <HostControlClient
      publicId={params.publicId}
      hostToken={token}
      initialData={data as HostSessionResponse}
      accountLinkFailed={searchParams.accountLinkFailed === "1"}
    />
  );
}
