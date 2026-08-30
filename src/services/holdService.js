import { supabase } from "../supabase";
import { modelKey, buildStockPools, isHoldActive } from "../utils/bulk";

// AuthContext is a React context and cannot be read from a plain module, so we
// read the session Supabase already holds. No new auth mechanism.
async function currentUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user?.id) return data.session.user.id;
  } catch { /* fall through */ }
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  } catch {
    return null;
  }
}

/**
 * Active holds for a set of model keys.
 * Only released_at is filtered server-side — expiry is COMPUTED, so a single
 * client-side isHoldActive decides it everywhere and a row past expires_at
 * reads as released without anything having to write to it.
 */
export async function getHolds(modelKeys) {
  const keys = [...new Set((modelKeys || []).filter(Boolean))];
  if (!keys.length) return { ok: true, holds: [] };
  try {
    const { data, error } = await supabase
      .from("stock_holds")
      .select("*")
      .in("model_key", keys)
      .is("released_at", null);
    if (error) return { ok: false, error: error.message, holds: [] };
    return { ok: true, holds: (data || []).filter(isHoldActive) };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not load holds.", holds: [] };
  }
}

/**
 * Manual only. Nothing in this app may call placeHold on its own — a hold is
 * always something a person chose to place.
 */
export async function placeHold({ brand, model, quantity, dealId, customerId, hours = 48 }) {
  const key = modelKey(brand, model);
  if (!key) return { ok: false, error: "Brand and model are both needed to hold units." };

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "Enter how many units to hold." };

  try {
    const userId = await currentUserId();

    // select("*") on purpose — naming a column that does not exist yet fails
    // the whole query, and stock.quantity may not have been added.
    const { data: rows, error: stockErr } = await supabase.from("stock").select("*");
    if (stockErr) return { ok: false, error: stockErr.message };

    const held = await getHolds([key]);
    if (!held.ok) return { ok: false, error: held.error };

    const pool = buildStockPools(rows || [], held.holds).find(p => p.key === key);
    const free = pool ? pool.free : 0;

    if (qty > free) return { ok: false, insufficient: true, free };

    const now = Date.now();
    const h = Number(hours);
    const span = Number.isFinite(h) && h > 0 ? h : 48;

    const { data, error } = await supabase.from("stock_holds").insert({
      model_key:   key,
      brand:       brand || null,
      model:       model || null,
      quantity:    qty,
      deal_id:     dealId || null,
      customer_id: customerId || null,
      held_by:     userId || null,
      expires_at:  new Date(now + span * 3600000).toISOString(),
    }).select().single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, hold: data };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not place the hold." };
  }
}

export async function releaseHold(holdId) {
  if (!holdId) return { ok: true, skipped: true };
  try {
    const { error } = await supabase
      .from("stock_holds")
      .update({ released_at: new Date().toISOString() })
      .eq("id", holdId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not release the hold." };
  }
}

export async function releaseHoldsForDeal(dealId) {
  if (!dealId) return { ok: true, skipped: true };
  try {
    const { error } = await supabase
      .from("stock_holds")
      .update({ released_at: new Date().toISOString() })
      .eq("deal_id", dealId)
      .is("released_at", null);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not release the holds." };
  }
}

export async function extendHold(holdId, hours = 48) {
  if (!holdId) return { ok: true, skipped: true };
  const h = Number(hours);
  const span = Number.isFinite(h) && h > 0 ? h : 48;
  try {
    const { error } = await supabase
      .from("stock_holds")
      .update({ expires_at: new Date(Date.now() + span * 3600000).toISOString() })
      .eq("id", holdId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not extend the hold." };
  }
}

// profiles is 'name' in this deployment and 'full_name' in the spec, so read
// the whole row and accept either. Cached — this is called per rendered pool.
const holderNameCache = new Map();

export async function getHolderName(userId) {
  if (!userId) return "someone";
  if (holderNameCache.has(userId)) return holderNameCache.get(userId);
  try {
    const { data, error } = await supabase
      .from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) return "someone";           // transient — do not poison the cache
    const name = data?.full_name || data?.name || "someone";
    holderNameCache.set(userId, name);
    return name;
  } catch {
    return "someone";
  }
}
