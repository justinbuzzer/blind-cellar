import { SupabaseClient } from "@supabase/supabase-js";
import { CellarBottleFormInput, cellarBottleRpcArgs } from "@/lib/cellar";
import {
  AddCellarBottleResponse,
  RegisterBottleFromCellarResponse,
  RegisterBottlesFromCellarGroupResponse,
} from "./types";

/**
 * Thin RPC wrappers for Personal Cellar v1 (see README "Personal Cellar") —
 * mirrors the style of guestActions.ts. Every mutation here goes through a
 * SECURITY DEFINER RPC (see supabase/schema.sql); there is no direct
 * insert/update grant on `cellar_bottles` to fall back to.
 */

export async function addCellarBottle(supabase: SupabaseClient, input: CellarBottleFormInput) {
  // p_quantity is add-only — deliberately not part of the shared
  // cellarBottleRpcArgs (update_cellar_bottle has no such parameter and
  // editing never changes how many rows exist; see README "Personal
  // Cellar" — "Quantity").
  const { data, error } = await supabase.rpc("add_cellar_bottle", {
    ...cellarBottleRpcArgs(input),
    p_quantity: input.quantity,
  });
  return { data: data as AddCellarBottleResponse | null, error };
}

export async function updateCellarBottle(
  supabase: SupabaseClient,
  cellarBottleId: string,
  input: CellarBottleFormInput
) {
  return supabase.rpc("update_cellar_bottle", {
    p_cellar_bottle_id: cellarBottleId,
    ...cellarBottleRpcArgs(input),
  });
}

export async function registerBottleFromCellar(
  supabase: SupabaseClient,
  guestToken: string,
  cellarBottleId: string
) {
  const { data, error } = await supabase.rpc("register_bottle_from_cellar", {
    p_guest_token: guestToken,
    p_cellar_bottle_id: cellarBottleId,
  });
  return { data: data as RegisterBottleFromCellarResponse | null, error };
}

/**
 * Grouped cellar display (see README "Personal Cellar" — "Grouped
 * display"): the atomic multi-bottle add, used only when the selected
 * grouped Add-from-cellar entry has more than one available bottle. A
 * one-bottle group still goes through `registerBottleFromCellar` above
 * unchanged. `cellarBottleId` is only an anchor — the RPC recomputes the
 * whole matching group and its current stock server-side; nothing about
 * which specific physical bottles get reserved is ever decided client-side.
 */
export async function registerBottlesFromCellarGroup(
  supabase: SupabaseClient,
  guestToken: string,
  cellarBottleId: string,
  quantity: number
) {
  const { data, error } = await supabase.rpc("register_bottles_from_cellar_group", {
    p_guest_token: guestToken,
    p_cellar_bottle_id: cellarBottleId,
    p_quantity: quantity,
  });
  return { data: data as RegisterBottlesFromCellarGroupResponse | null, error };
}

export async function returnCellarBottleToAvailable(supabase: SupabaseClient, cellarBottleId: string) {
  return supabase.rpc("return_cellar_bottle_to_available", { p_cellar_bottle_id: cellarBottleId });
}

export async function markCellarBottleConsumed(supabase: SupabaseClient, cellarBottleId: string) {
  return supabase.rpc("mark_cellar_bottle_consumed", { p_cellar_bottle_id: cellarBottleId });
}

/**
 * Permanently deletes an Available cellar bottle (see README "Personal
 * Cellar" — "Deleting a bottle"). delete_cellar_bottle re-validates
 * ownership and status = 'available' itself — this wrapper trusts nothing
 * about the caller's local state, exactly like the other cellar RPC calls.
 */
export async function deleteCellarBottle(supabase: SupabaseClient, cellarBottleId: string) {
  return supabase.rpc("delete_cellar_bottle", { p_cellar_bottle_id: cellarBottleId });
}
