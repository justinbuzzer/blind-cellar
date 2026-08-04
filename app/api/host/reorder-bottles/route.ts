import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { friendlyRpcError } from "@/lib/supabase/types";

interface ReorderBottlesBody {
  publicId: string;
  hostToken: string;
  wineIds: string[];
}

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

  let body: ReorderBottlesBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.publicId || !body.hostToken || !Array.isArray(body.wineIds)) {
    return NextResponse.json({ error: "Missing session, host token, or bottle order." }, { status: 400 });
  }

  const { error } = await supabase.rpc("reorder_wines", {
    p_public_id: body.publicId,
    p_host_token: body.hostToken,
    p_wine_ids: body.wineIds,
  });

  if (error) {
    const status = error.message?.includes("invalid_host_token")
      ? 403
      : error.message?.includes("session_not_found")
        ? 404
        : error.message?.includes("registration_closed")
          ? 409
          : error.message?.includes("invalid_reorder_payload")
            ? 400
            : 500;
    return NextResponse.json({ error: friendlyRpcError(error) }, { status });
  }

  return NextResponse.json({ ok: true });
}
