import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { BottleResponseProgressDTO, friendlyRpcError } from "@/lib/supabase/types";

interface BottleProgressBody {
  publicId: string;
  hostToken: string;
  wineId: string;
}

/**
 * Host-only per-bottle response-progress lookup (see README "Host per-bottle
 * response progress"). Called on demand when the host opens the progress
 * popover for one bottle — never eagerly, and never by a participant/guest
 * token, which get_bottle_response_progress itself refuses to accept.
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

  let body: BottleProgressBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.publicId || !body.hostToken || !body.wineId) {
    return NextResponse.json(
      { error: "Missing session, host token, or bottle." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("get_bottle_response_progress", {
    p_public_id: body.publicId,
    p_host_token: body.hostToken,
    p_wine_id: body.wineId,
  });

  if (error) {
    const status = error.message?.includes("invalid_host_token")
      ? 403
      : error.message?.includes("session_not_found")
        ? 404
        : error.message?.includes("invalid_tasting_mode") ||
            error.message?.includes("bottle_not_active") ||
            error.message?.includes("wine_not_in_session")
          ? 409
          : 500;
    return NextResponse.json({ error: friendlyRpcError(error) }, { status });
  }

  return NextResponse.json(data as BottleResponseProgressDTO);
}
