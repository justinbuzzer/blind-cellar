import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadTastingReportData } from "@/lib/supabase/reportData";
import { GuestSessionStateResponse, HostSessionResponse } from "@/lib/supabase/types";
import { parseArchiveLookupRequest, resolveArchiveEntries } from "@/lib/archive";

/**
 * The Tasting Archive's only server entry point (see README "Tasting
 * archive"). Deliberately narrow: it accepts nothing but a bounded list of
 * (publicId, role, token) references the browser already holds — never an
 * arbitrary session id with no credential attached — and re-validates every
 * one through the exact same SECURITY DEFINER RPCs (get_host_session /
 * get_guest_session_state) the rest of the app already trusts for host- and
 * guest-token ownership. A rejected or stale token simply results in that
 * one reference being marked invalid; it never surfaces why, and it never
 * affects the other references in the same request. Run from the server
 * (not called directly from the browser) purely to keep tokens out of
 * client-side network-panel inspection, the same reasoning documented on
 * lib/supabase/server.ts — there is no service-role key or elevated
 * privilege involved anywhere in this route.
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const items = parseArchiveLookupRequest(body);
  if (!items) {
    return NextResponse.json({ error: "Invalid archive request." }, { status: 400 });
  }

  const results = await resolveArchiveEntries(items, {
    getHostSession: async (publicId, token) => {
      const { data, error } = await supabase.rpc("get_host_session", {
        p_public_id: publicId,
        p_host_token: token,
      });
      if (error || !data) return null;
      return data as HostSessionResponse;
    },
    getGuestSessionState: async (token) => {
      const { data, error } = await supabase.rpc("get_guest_session_state", {
        p_guest_token: token,
      });
      if (error || !data) return null;
      return data as GuestSessionStateResponse;
    },
    loadReport: (session) => loadTastingReportData(supabase, session),
  });

  return NextResponse.json({ items: results });
}
