import { NextRequest, NextResponse } from "next/server";
import { getSupabaseRouteHandlerClient } from "@/lib/supabase/routeHandlerClient";
import { loadProfileData } from "@/lib/supabase/profileData";
import {
  buildLedgerRows,
  deriveLedgerFilterOptions,
  filterLedgerRows,
  modesForScope,
  paginateLedgerRows,
  parseLedgerQuery,
  sortLedgerRows,
} from "@/lib/profile";

/**
 * The Tasted Wines Ledger (see README "Palate Profile"), paginated
 * server-side. `loadProfileData` loads only this signed-in caller's own
 * account-linked revealed sessions (bounded by their own tasting history,
 * never global wine data) — search/filter/sort/pagination are all applied
 * here, before the response is built, so the browser only ever receives one
 * already-narrowed page. Filter option lists are derived from the same
 * already-scoped rows, so they can never reveal a value that exists only in
 * someone else's data.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseRouteHandlerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase isn't configured. See SUPABASE_SETUP.md." },
      { status: 500 }
    );
  }

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Sign in to view your palate profile." }, { status: 401 });
  }

  const { scope, filters, sort, page } = parseLedgerQuery(request.nextUrl.searchParams);

  const { observations } = await loadProfileData(supabase);
  const scopeModes = modesForScope(scope);
  const scopedObservations = observations.filter((o) => scopeModes.includes(o.tastingMode));

  const allRows = buildLedgerRows(scopedObservations);
  const filterOptions = deriveLedgerFilterOptions(allRows);
  const filtered = filterLedgerRows(allRows, filters);
  const sorted = sortLedgerRows(filtered, sort);
  const paginated = paginateLedgerRows(sorted, page);

  return NextResponse.json({
    scope,
    sort,
    filters,
    ...paginated,
    filterOptions,
  });
}
