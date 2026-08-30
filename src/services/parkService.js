import { supabase } from "../supabase";
import { releaseHoldsForDeal } from "./holdService";
import { PARK_REASON_LABEL } from "../constants";

/**
 * A deal is never lost — it is parked, and stays alive for the next round.
 * Parked deals never hold inventory and never carry a pending follow-up.
 */
export async function parkDeal(dealId, { reason, targetUnitPrice, note } = {}) {
  if (!dealId) return { ok: false, error: "No deal to park." };
  try {
    const { data: deal, error: readErr } = await supabase
      .from("deals").select("id, customer_id").eq("id", dealId).maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!deal)   return { ok: false, error: "That deal no longer exists." };

    const now = new Date().toISOString();
    const priced = Number(targetUnitPrice);
    const hasPrice = targetUnitPrice !== undefined && targetUnitPrice !== null
      && targetUnitPrice !== "" && Number.isFinite(priced);

    // 1. the deal itself
    const { error: upErr } = await supabase.from("deals").update({
      stage:         "parked",
      parked_reason: reason || null,
      parked_at:     now,
      ...(hasPrice ? { target_unit_price: priced } : {}),
    }).eq("id", dealId);
    if (upErr) return { ok: false, error: upErr.message };

    // 2. parked deals never hold inventory
    await releaseHoldsForDeal(dealId);

    // 3. no pending follow-up survives a park — it is a wait, not a task
    if (deal.customer_id) {
      await supabase.from("follow_ups")
        .update({ status: "done", updated_at: now })
        .eq("customer_id", deal.customer_id)
        .eq("status", "pending");
    }

    // 4. leave a trail
    if (deal.customer_id) {
      const label = PARK_REASON_LABEL[reason] || reason || "no reason given";
      const text = `Parked: ${label}`
        + (hasPrice ? ` — offered AED ${priced.toLocaleString()}/unit` : "")
        + (note ? ` · ${note}` : "");
      await supabase.from("activity_log").insert({
        customer_id:   deal.customer_id,
        activity_type: "note",
        note:          text,
        logged_at:     now,
      });
      await supabase.from("customers")
        .update({ last_activity_at: now }).eq("id", deal.customer_id);
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not park the deal." };
  }
}

/** target_unit_price deliberately survives — that number stays useful history. */
export async function unparkDeal(dealId, newStage = "new_inquiry") {
  if (!dealId) return { ok: false, error: "No deal to un-park." };
  try {
    const { error } = await supabase.from("deals").update({
      stage:         newStage,
      parked_reason: null,
      parked_at:     null,
      ...(newStage === "sourcing" ? { sourcing_started_at: new Date().toISOString() } : {}),
    }).eq("id", dealId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || "Could not un-park the deal." };
  }
}
