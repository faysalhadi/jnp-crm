import { supabase } from "../supabase";
import { isHoldActive, holdExpiresAt } from "../utils/holds";

// ── holder name cache ────────────────────────────────────────────────────────
// getHolderName is called once per rendered stock row. Without this Map every
// held unit on screen would fire its own profiles query on every render.
const holderNameCache = new Map();

// ── current user ─────────────────────────────────────────────────────────────
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

const HOLD_COLUMNS = {
  status: null, quoted_by: null, quoted_to: null,
  quoted_at: null, quoted_deal_id: null,
};

function clearedHold() {
  return { ...HOLD_COLUMNS, status: "available" };
}

/**
 * Place a 48h soft hold on a unit for a customer.
 * Refuses when the unit is actively held by a DIFFERENT user — that refusal is
 * the whole point of this feature, so it never overwrites.
 * Returns { ok:true, item } | { ok:false, conflict:true, heldBy, heldUntil }
 *       | { ok:false, error }
 */
export async function placeHold(stockId, { customerId, dealId } = {}) {
  if (!stockId) return { ok: false, error: "No stock unit selected." };
  try {
    const userId = await currentUserId();

    const { data: row, error: readErr } = await supabase
      .from("stock").select("*").eq("id", stockId).maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: false, error: "That unit no longer exists." };

    if (isHoldActive(row) && row.quoted_by && row.quoted_by !== userId) {
      const heldBy = await getHolderName(row.quoted_by);
      const expires = holdExpiresAt(row);
      return {
        ok: false, conflict: true, heldBy,
        heldUntil: expires ? new Date(expires).toISOString() : null,
        item: row,
      };
    }

    if (row.status === "sold") {
      return { ok: false, error: "That unit is already sold." };
    }
    if (row.status === "reserved") {
      return { ok: false, error: "That unit is on a hard hold (reserved)." };
    }

    const patch = {
      status:         "quoted",
      quoted_by:      userId || null,
      quoted_to:      customerId || null,
      quoted_at:      new Date().toISOString(),
      quoted_deal_id: dealId || null,
    };
    const { error: upErr } = await supabase
      .from("stock").update(patch).eq("id", stockId);
    if (upErr) return { ok: false, error: upErr.message };

    return { ok: true, item: { ...row, ...patch } };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not place the hold." };
  }
}

/** Drop a soft hold. Never touches a sold or reserved (hard-held) unit. */
export async function releaseHold(stockId) {
  if (!stockId) return { ok: true, skipped: true };
  try {
    const { data: row, error: readErr } = await supabase
      .from("stock").select("id, status").eq("id", stockId).maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: true, skipped: true };

    if (row.status === "sold" || row.status === "reserved") {
      return { ok: true, skipped: true };
    }

    const { error: upErr } = await supabase
      .from("stock").update(clearedHold()).eq("id", stockId);
    if (upErr) return { ok: false, error: upErr.message };

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not release the hold." };
  }
}

/**
 * Soft hold → hard hold. quoted_to and quoted_deal_id stay so we still know who
 * it is for; quoted_at is cleared so no countdown shows on a hard hold.
 */
export async function upgradeToReserved(stockId) {
  if (!stockId) return { ok: true, skipped: true };
  try {
    const { data: row, error: readErr } = await supabase
      .from("stock").select("id, status").eq("id", stockId).maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row)    return { ok: true, skipped: true };
    if (row.status === "sold") return { ok: true, skipped: true };

    const { error: upErr } = await supabase
      .from("stock").update({ status: "reserved", quoted_at: null }).eq("id", stockId);
    if (upErr) return { ok: false, error: upErr.message };

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not reserve the unit." };
  }
}

/** profiles.full_name for a holder. "another agent" when there is no row. */
export async function getHolderName(userId) {
  if (!userId) return "another agent";
  if (holderNameCache.has(userId)) return holderNameCache.get(userId);
  try {
    // select("*") on purpose — this table is 'name' in some deployments and
    // 'full_name' in others, and naming a missing column fails the whole query.
    const { data, error } = await supabase
      .from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) return "another agent";   // transient — do not poison the cache
    const name = data?.full_name || data?.name || "another agent";
    holderNameCache.set(userId, name);
    return name;
  } catch {
    return "another agent";
  }
}

/**
 * Tidy-up only. Clears 'quoted' rows whose hold already expired so the table
 * does not accumulate dead holds. Correctness never depends on this running —
 * effectiveStatus already treats those rows as available.
 */
export async function sweepExpiredHolds(stockRows) {
  const stale = (stockRows || [])
    .filter(s => s?.status === "quoted" && !isHoldActive(s))
    .map(s => s.id);
  if (!stale.length) return { ok: true, cleared: 0 };
  try {
    const { error } = await supabase
      .from("stock").update(clearedHold()).in("id", stale);
    if (error) return { ok: false, error: error.message };
    return { ok: true, cleared: stale.length };
  } catch (e) {
    return { ok: false, error: e?.message || "Sweep failed." };
  }
}
