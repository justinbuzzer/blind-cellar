import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { friendlyRpcError } from "@/lib/supabase/types";

interface PhotoUploadUrlBody {
  publicId: string;
  guestToken: string;
  mimeType: string;
}

interface AuthorizeBottlePhotoUploadResponse {
  path: string;
  contentType: string;
}

/**
 * Mints a short-lived signed upload URL for a bottle photo (see README
 * "Bottle photos"). The guest token has no Supabase Auth session behind it,
 * so Storage RLS can't authorize the upload directly — instead the anon-key
 * client validates ownership/registration-open status via the SECURITY
 * DEFINER `authorize_bottle_photo_upload` RPC, and only once that succeeds
 * does the service-role client (this app's only use of it) mint the signed
 * URL. The browser PUTs the file bytes straight to Storage from there —
 * never proxying them through this route — since Vercel's request-body cap
 * sits below the photo size limit.
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

  const serviceClient = getSupabaseServiceClient();
  if (!serviceClient) {
    return NextResponse.json(
      {
        error:
          "Photo uploads aren't configured. Set SUPABASE_SERVICE_ROLE_KEY (see SUPABASE_SETUP.md).",
      },
      { status: 500 }
    );
  }

  let body: PhotoUploadUrlBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.publicId || !body.guestToken || !body.mimeType) {
    return NextResponse.json(
      { error: "Missing session, guest token, or photo type." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("authorize_bottle_photo_upload", {
    p_guest_token: body.guestToken,
    p_mime_type: body.mimeType,
  });

  if (error) {
    const status = error.message?.includes("invalid_guest_token")
      ? 403
      : error.message?.includes("registration_closed")
        ? 409
        : error.message?.includes("invalid_photo_mime_type")
          ? 400
          : 500;
    return NextResponse.json({ error: friendlyRpcError(error) }, { status });
  }

  const authorized = data as AuthorizeBottlePhotoUploadResponse;
  const { data: signedUpload, error: signedUrlError } = await serviceClient.storage
    .from("bottle-photos")
    .createSignedUploadUrl(authorized.path);

  if (signedUrlError || !signedUpload) {
    return NextResponse.json(
      { error: "Couldn't prepare the photo upload. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    path: signedUpload.path,
    signedUrl: signedUpload.signedUrl,
    token: signedUpload.token,
  });
}
