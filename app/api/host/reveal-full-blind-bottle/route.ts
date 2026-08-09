import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/supabase/types";

interface RevealFullBlindBottleBody {
  publicId: string;
  hostToken: string;
  wineId: string;
}

/**
 * Full_blind's per-bottle equivalent of /api/host/reveal-bottle — see
 * reveal_full_blind_bottle in supabase/schema.sql. Unlike course_reveal's
 * reveal_bottle, this never rejects an out-of-order bottle: full_blind's
 * host can reveal eligible bottles in any order (see README "Results
 * reveal").
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

  let body: RevealFullBlindBottleBody;
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

  const { data, error } = await supabase.rpc("reveal_full_blind_bottle", {
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
            error.message?.includes("session_not_collecting") ||
            error.message?.includes("wine_not_in_session")
          ? 409
          : 500;
    return NextResponse.json({ error: friendlyRpcError(error) }, { status });
  }

  return NextResponse.json(data ?? { sessionRevealed: false });
}
