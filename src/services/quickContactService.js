import { supabase } from "../supabase";

export async function logWhatsAppContact(customerId, messageText, opts = {}) {
  try {
    const now = new Date().toISOString();

    // 1. Log the activity
    await supabase.from("activity_log").insert({
      customer_id: customerId,
      activity_type: "messaged",
      channel: "whatsapp",
      note: messageText.slice(0, 200),
      logged_at: now,
    });

    // 2. Close any pending follow-up
    await supabase
      .from("follow_ups")
      .update({ status: "done", updated_at: now })
      .eq("customer_id", customerId)
      .eq("status", "pending");

    if (!opts.skipFollowUp) {
      // 3. Insert a fresh follow-up 24 hours out
      const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("follow_ups").insert({
        customer_id: customerId,
        due_at: due,
        note: opts.followUpNote || "Follow up on WhatsApp message",
        status: "pending",
        created_at: now,
      });
    }

    // 4. Update last_activity_at
    await supabase
      .from("customers")
      .update({ last_activity_at: now })
      .eq("id", customerId);

    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
