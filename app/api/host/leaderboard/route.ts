import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/supabase/types";

interface LeaderboardBody {
  publicId: string;
  hostToken: string;
}

/**
 * Host-only provisional leaderboard data source — every currently-revealed
 * bottle's answer key plus every guest's guess for those bottles only, see
 * get_provisional_leaderboard_for_host in supabase/schema.sql. Ranking math
 * itself is computed client-side by lib/resultsReveal.ts, reusing the exact
 * same pipeline the final /results page already uses — this route never
 * returns a rank.
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

  let body: LeaderboardBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.publicId || !body.hostToken) {
    return NextResponse.json({ error: "Missing session or host token." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("get_provisional_leaderboard_for_host", {
    p_public_id: body.publicId,
    p_host_token: body.hostToken,
  });

  if (error) {
    const status = error.message?.includes("invalid_host_token")
      ? 403
      : error.message?.includes("session_not_found")
        ? 404
        : error.message?.includes("invalid_tasting_mode")
          ? 409
          : 500;
    return NextResponse.json({ error: friendlyRpcError(error) }, { status });
  }

  return NextResponse.json(data);
}
