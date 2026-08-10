import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/routeHandlerClient";
import { JoinResolutionResponse, friendlyRpcError } from "@/lib/supabase/types";
import { hashToken } from "@/lib/tokens";
import { participantCookieName } from "@/lib/participantCookie";

/**
 * Read-only identity resolution for the public join route — see README
 * "Session rejoin" — "QR join precedence". Never mutates guest_token or a
 * guests row; only ever reads the caller's Supabase Auth state and this
 * session's device-credential cookie (never a client-supplied identity of
 * any kind), then asks Postgres which participant(s) those two things
 * resolve to.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseRouteHandlerClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see SUPABASE_SETUP.md).",
      },
      { status: 500 }
    );
  }

  let body: { publicId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const publicId = typeof body.publicId === "string" ? body.publicId : "";
  if (!publicId) {
    return NextResponse.json({ error: "Missing tasting." }, { status: 400 });
  }

  const deviceToken = cookies().get(participantCookieName(publicId))?.value ?? null;
  const deviceTokenHash = deviceToken ? hashToken(deviceToken) : null;

  const { data, error } = await supabase.rpc("resolve_join_identity", {
    p_public_id: publicId,
    p_device_token_hash: deviceTokenHash,
  });

  if (error) {
    const status = error.message?.includes("session_not_found") ? 404 : 500;
    return NextResponse.json(
      { error: friendlyRpcError(error) },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.json(data as JoinResolutionResponse, {
    headers: { "Cache-Control": "no-store" },
  });
}
