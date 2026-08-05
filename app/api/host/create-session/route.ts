import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { CreateSessionRpcResult, friendlyRpcError } from "@/lib/supabase/types";
import { generateSessionCode } from "@/lib/codes";
import { generateSecureToken, hashToken } from "@/lib/tokens";
import { isValidTastingMode } from "@/lib/validation";

interface CreateSessionBody {
  title: string;
  date: string;
  hostDisplayName: string;
  tastingMode: string;
}

const MAX_JOIN_CODE_ATTEMPTS = 8;

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

  let body: CreateSessionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const date = typeof body.date === "string" ? body.date : "";
  const hostDisplayName =
    typeof body.hostDisplayName === "string" ? body.hostDisplayName.trim() : "";
  const tastingModeRaw = typeof body.tastingMode === "string" ? body.tastingMode : "";

  if (!title) {
    return NextResponse.json({ error: "A tasting title is required." }, { status: 400 });
  }
  if (!date) {
    return NextResponse.json({ error: "A tasting date is required." }, { status: 400 });
  }
  if (!hostDisplayName) {
    return NextResponse.json({ error: "Enter a display name to host with." }, { status: 400 });
  }
  if (hostDisplayName.length > 60) {
    return NextResponse.json(
      { error: "That name is too long — please shorten it." },
      { status: 400 }
    );
  }
  if (!isValidTastingMode(tastingModeRaw)) {
    return NextResponse.json({ error: "Choose a tasting format." }, { status: 400 });
  }
  const tastingMode = tastingModeRaw;

  const hostToken = generateSecureToken();
  const hostTokenHash = hashToken(hostToken);

  let lastError: { message?: string; code?: string } | null = null;

  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
    const joinCode = generateSessionCode();

    const { data, error } = await supabase.rpc("create_tasting_session", {
      p_title: title,
      p_tasting_date: date,
      p_join_code: joinCode,
      p_host_token_hash: hostTokenHash,
      p_host_display_name: hostDisplayName,
      p_tasting_mode: tastingMode,
    });

    if (!error && data) {
      const row = (Array.isArray(data) ? data[0] : data) as CreateSessionRpcResult;
      return NextResponse.json({
        publicId: row.public_id,
        joinCode: row.join_code,
        hostToken,
        hostGuestToken: row.host_guest_token,
      });
    }

    lastError = error;
    if (error?.code !== "23505") {
      break;
    }
    // 23505 = unique_violation, almost certainly the join_code collision — retry with a new code.
  }

  return NextResponse.json({ error: friendlyRpcError(lastError) }, { status: 500 });
}
