import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/supabase/types";

interface ReleaseCourseBottleBody {
  publicId: string;
  hostToken: string;
  wineId: string;
}

/**
 * Host: explicitly release any eligible unrevealed course_reveal bottle as
 * the session's single current active bottle — see README "Course-by-course
 * host-selected release". Replaces the old implicit "earliest unrevealed by
 * tasting_order" auto-selection; the server (release_course_bottle) is the
 * sole authority on eligibility, never this route or the client.
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

  let body: ReleaseCourseBottleBody;
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

  const { data, error } = await supabase.rpc("release_course_bottle", {
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
            error.message?.includes("bottle_already_active") ||
            error.message?.includes("bottle_already_revealed") ||
            error.message?.includes("wine_not_in_session")
          ? 409
          : 500;
    return NextResponse.json({ error: friendlyRpcError(error) }, { status });
  }

  return NextResponse.json(data);
}
