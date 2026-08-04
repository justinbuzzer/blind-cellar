import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { friendlyRpcError, HostSessionResponse } from "@/lib/supabase/types";

interface HostSessionBody {
  publicId: string;
  hostToken: string;
}

/**
 * Re-fetches the host's anonymous-only view of the session (bottle
 * list with wine style + tasting order, guests, status). Used by the host
 * control page to refresh after a realtime `wines` change, since those
 * fields aren't in the narrow anon column grant on `wines` (see
 * supabase/schema.sql) and can only be read back through this RPC.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see SUPABASE_SETUP.md).",
      },
      { status: 500 }
    );
  }

  let body: HostSessionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.publicId || !body.hostToken) {
    return NextResponse.json({ error: "Missing session or host token." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("get_host_session", {
    p_public_id: body.publicId,
    p_host_token: body.hostToken,
  });

  if (error) {
    const status = error.message?.includes("invalid_host_token")
      ? 403
      : error.message?.includes("session_not_found")
        ? 404
        : 500;
    return NextResponse.json({ error: friendlyRpcError(error) }, { status });
  }

  return NextResponse.json(data as HostSessionResponse);
}
