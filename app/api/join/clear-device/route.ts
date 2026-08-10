import { NextRequest, NextResponse } from "next/server";
import { participantCookieName, participantCookieClearOptions } from "@/lib/participantCookie";

/**
 * "This isn't me" — see README "Session rejoin". Clears only this browser's
 * device-credential cookie for one session; never calls Postgres, never
 * revokes the server-side credential (matching the spec's explicit "does
 * not revoke server credential by default"), and never creates a
 * participant record.
 */
export async function POST(request: NextRequest) {
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

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(
    participantCookieName(publicId),
    "",
    participantCookieClearOptions()
  );
  return response;
}
