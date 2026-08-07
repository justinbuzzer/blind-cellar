import { SupabaseClient } from "@supabase/supabase-js";
import { CellarBottleFormInput, cellarBottleRpcArgs } from "@/lib/cellar";
import { AddCellarBottleResponse, RegisterBottleFromCellarResponse } from "./types";

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

export async function returnCellarBottleToAvailable(supabase: SupabaseClient, cellarBottleId: string) {
  return supabase.rpc("return_cellar_bottle_to_available", { p_cellar_bottle_id: cellarBottleId });
}

export async function markCellarBottleConsumed(supabase: SupabaseClient, cellarBottleId: string) {
  return supabase.rpc("mark_cellar_bottle_consumed", { p_cellar_bottle_id: cellarBottleId });
}
