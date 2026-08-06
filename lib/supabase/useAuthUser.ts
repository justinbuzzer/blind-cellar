"use client";

import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./client";

export interface AuthUserState {
  user: User | null;
  /** True until the first getUser() call resolves — lets callers avoid a flash of the wrong (signed-out) state. */
  loading: boolean;
}

/**
 * Reads the current Supabase Auth user on mount and stays in sync via
 * onAuthStateChange (sign-in, sign-out, and token refresh in any tab).
 * Shared by every nav/account surface that needs to know "is someone signed
 * in" — see components/navigation/AccountNav.tsx and ArchiveLink.tsx. This
 * app has no server-rendered personalization anywhere (every page is a
 * Client Component that fetches its own state on mount, same as
 * HostControlsLink/ArchiveLink's existing token reads), so a brief
 * signed-out flash before this resolves is consistent with how the rest of
 * the app already behaves, not a new tradeoff introduced here.
 */
export function useAuthUser(): AuthUserState {
  const [state, setState] = useState<AuthUserState>({ user: null, loading: true });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState({ user: null, loading: false });
      return;
    }

    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) setState({ user: data.user, loading: false });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ user: session?.user ?? null, loading: false });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
