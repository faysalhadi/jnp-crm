import { supabase } from "../supabase";

export async function moveStage(dealId, newStage, customerId) {
  await supabase.from("deals")
    .update({ stage: newStage })
    .eq("id", dealId);
  await supabase.from("customers")
    .update({ last_active: new Date().toISOString() })
    .eq("id", customerId);
}

export async function closeDeal(dealId, value, paymentMethod) {
  await supabase.from("deals").update({
    stage: "closed",
    closed_at: new Date().toISOString(),
    value: value || null,
    payment_method: paymentMethod || "Cash",
    payment_status: "received",
  }).eq("id", dealId);
}

export function buildReceiptText(deal, customer) {
  const num = `LFL-${new Date().getFullYear()}-${
    Math.floor(1000 + Math.random() * 9000)}`;
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric"
  });
  return `━━━━━━━━━━━━━━━━━━━━━━
    LAPTOP FOR LESS
    UAE | laptopforless.ae
━━━━━━━━━━━━━━━━━━━━━━
RECEIPT #: ${num}
Date: ${date}

SOLD TO:
${customer?.name || "Customer"}
${customer?.number ? `WhatsApp: ${customer.number}` : ""}

DEVICE:
${[deal?.brand, deal?.model].filter(Boolean).join(" ") || "Device"}
${deal?.ram ? `RAM: ${deal.ram}` : ""}
${deal?.storage ? `Storage: ${deal.storage}` : ""}

PAYMENT:
Amount: AED ${Number(deal?.value || 0).toLocaleString()}
Method: ${deal?.payment_method || "Cash"}

Thank you for your purchase! 🙏
━━━━━━━━━━━━━━━━━━━━━━`;
}

export async function saveReceiptNumber(dealId, receiptNum) {
  await supabase.from("deals")
    .update({ receipt_number: receiptNum })
    .eq("id", dealId);
}
