import { useState } from "react";
import { supabase } from "../supabase";
import { useCustomers } from "../context/CustomerContext";
import { useAuth } from "../context/AuthContext";
import { useImportContext } from "../context/ImportContext";
import { saveImportedMessages } from "../utils/whatsapp";
import { cleanWhatsAppText } from "../utils/helpers";

export function useImport() {
  const { anthropicKey } = useAuth();
  const { loadCustomers, activeCustomerId, activeDealId } = useCustomers();
  const {
    importText, setImportText,
    importing, setImporting,
    importResult, setImportResult,
    importingMultiple, setImportingMultiple,
    importMultipleProgress, setImportMultipleProgress,
    importMultipleResult, setImportMultipleResult,
    exporting, setExporting,
  } = useImportContext();

  async function importChatFile(file) {
    const text = cleanWhatsAppText(await file.text());

    // Extract customer identity from chat content — not filename
    let customerName = "";
    let customerPhone = "";

    // Parse lines to find first non-owner sender
    const lines = text.split("\n");
    for (const line of lines) {
      // Match WhatsApp format: [DD/MM/YYYY, H:MM:SS AM/PM] SenderName: message
      const m = line.match(/\[\d{1,2}\/\d{1,2}\/\d{4}[^\]]+\]\s+~?([^:]+):/);
      if (m) {
        const sender = m[1].replace(/^~/, "").trim();
        if (
          sender.toLowerCase() !== "laptop for less" &&
          sender.toLowerCase() !== "laptop for less " &&
          !sender.toLowerCase().includes("laptop for less")
        ) {
          customerName = sender;
          break;
        }
      }
    }

    // Try to find phone number in chat content
    for (const line of lines) {
      // Look for lines that are just a phone number or contain phone patterns
      const phoneMatch = line.match(/(\+?\d[\d\s\-()]{8,14}\d)/);
      if (phoneMatch && !line.includes(":")) {
        customerPhone = phoneMatch[1].replace(/[\s\-()]/g, "");
        break;
      }
      // Also check sender patterns with phone numbers
      const senderPhone = line.match(/\[\d{1,2}\/\d{1,2}\/\d{4}[^\]]+\]\s+(\+\d[\d\s]{8,14}):/);
      if (senderPhone) {
        customerPhone = senderPhone[1].replace(/[\s\-()]/g, "");
        break;
      }
    }

    if (!customerName) customerName = "Unknown Customer";

    const chatPrompt = `Analyze this WhatsApp chat between 'Laptop For Less' (a UAE laptop reseller) and a customer.

PARSING:
- 'Laptop For Less' = the owner/seller (ignore for customer profile, read for context)
- All other senders = the customer
- Strip ~ from sender names
- English + Urdu/Arabic mix is normal

EXTRACT:
- intent: 'buying' or 'selling'
- brand: MacBook/Dell/HP/Lenovo/Other/Unknown
- model: specific model (e.g. 'Dell 5420', 'MacBook Air M1') or empty
- processor: e.g. 'Core i5 11th Gen' / 'Apple M1' or empty
- ram: e.g. '8GB' or empty
- storage: e.g. '256GB' or empty
- condition: New/Like New/Used/Unknown
- quantity: units wanted (default 1)
- budget: price in AED if mentioned (number only, null if not)
- urgency: true if said urgent/today/asap/need now
- stage: 'new_inquiry'|'sourcing'|'device_found'|'negotiation'|'closed'|'parked'
- notes: important context
- phone: extract phone number of the customer if visible in the chat, else empty string

SHORTHAND: '8/256'=8GB RAM/256GB SSD. '16/512'=16GB/512GB. 'i5 11th'=Core i5 11th Gen. '750aed'=AED 750.

Return ONLY valid JSON (no markdown):
{"intent":"buying","brand":"Unknown","model":"","processor":"","ram":"","storage":"","condition":"Unknown","quantity":1,"budget":null,"urgency":false,"stage":"new_inquiry","notes":"","phone":""}

Chat:
${text.slice(0, 12000)}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, messages: [{ role: "user", content: chatPrompt }] }),
      });
      const data = await res.json();
      const raw = (data?.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
      let info; try { info = JSON.parse(raw); } catch { info = {}; }

      // Use phone from AI extraction if regex didn't find one
      const finalPhone = customerPhone || info.phone || "";

      // Check if customer already exists — phone first, then name
      let existingCustomer = null;
      if (finalPhone) {
        const { data: byPhone } = await supabase
          .from("customers")
          .select("id, name")
          .eq("number", finalPhone)
          .maybeSingle();
        existingCustomer = byPhone;
      }
      if (!existingCustomer && customerName && customerName !== "Unknown Customer") {
        const { data: byName } = await supabase
          .from("customers")
          .select("id, name")
          .ilike("name", customerName.trim())
          .maybeSingle();
        existingCustomer = byName;
      }

      let customer = existingCustomer;

      if (!existingCustomer) {
        // New customer — create with deal
        const { data: newCustomer } = await supabase.from("customers").insert({
          name: customerName,
          number: finalPhone,
          notes: info.notes || "",
          tier: "cold",
          urgent: info.urgency || false,
          contact_type: "client",
          last_activity_at: new Date().toISOString(),
          last_active: new Date().toISOString(),
        }).select().single();
        if (!newCustomer) return null;
        customer = newCustomer;

        await supabase.from("deals").insert({
          customer_id: customer.id,
          brand: info.brand && info.brand !== "Unknown" ? info.brand : "",
          model: info.model || "",
          ram: info.ram || "",
          storage: info.storage || "",
          condition: info.condition && info.condition !== "Unknown" ? info.condition : "",
          budget: info.budget || null,
          stage: info.stage || "new_inquiry",
        });
      }

      // Get most recent deal for this customer
      const { data: deal } = await supabase
        .from("deals")
        .select("id")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (deal) {
        // Get existing message contents to avoid duplicates
        const { data: existingMsgs } = await supabase
          .from("messages")
          .select("content")
          .eq("deal_id", deal.id);
        const existingContents = new Set((existingMsgs || []).map(m => (m.content || "").trim()));
        await saveImportedMessages(deal.id, text, existingContents);
      }

      // Update last_activity_at
      await supabase.from("customers")
        .update({ last_activity_at: new Date().toISOString(), last_active: new Date().toISOString() })
        .eq("id", customer.id);

      return customer;
    } catch (e) {
      console.error("importChatFile error:", e);
      return null;
    }
  }

  async function importSingleChatFile(file) {
    if (!anthropicKey) { alert("Add Anthropic API key in Settings first."); return; }
    setImporting(true); setImportResult(null);
    const customer = await importChatFile(file);
    await loadCustomers();
    if (customer) setImportResult({ success: true, message: `✅ Imported ${customer.name} successfully!` });
    else setImportResult({ success: false, message: "❌ Import failed. Check your API key." });
    setImporting(false);
  }

  async function importMultipleChatFiles(files) {
    if (!anthropicKey) { alert("Add Anthropic API key in Settings first."); return; }
    setImportingMultiple(true); setImportMultipleResult(null);
    let created = 0; let failed = 0;
    for (let i = 0; i < files.length; i++) {
      setImportMultipleProgress({ current: i + 1, total: files.length });
      const result = await importChatFile(files[i]);
      if (result) created++; else failed++;
    }
    await loadCustomers();
    setImportMultipleResult({ created, failed, total: files.length });
    setImportingMultiple(false);
    setImportMultipleProgress({ current: 0, total: 0 });
  }

  async function importWhatsAppChat() {
    if (!importText.trim() || !anthropicKey) return;
    setImporting(true); setImportResult(null);

    const prompt = `You are analyzing a WhatsApp chat export for a UAE laptop reselling business called "Laptop for Less".

WHATSAPP FORMAT: Lines start with [DD/MM/YYYY, H:MM:SS AM/PM] SenderName: message
- Strip ~ from sender names (e.g. ~Kunchana → Kunchana)
- "Laptop For Less" = the business owner — read their messages for context but do NOT create a record for them
- Skip system messages and media omissions ("image omitted" etc.)

YOUR TASK: Extract EVERY non-owner person as a customer. Do NOT skip anyone even if they only sent 1 message.

SHORTHAND SPECS:
- "8/256" = RAM:8GB, Storage:256GB  |  "16/512" = RAM:16GB, Storage:512GB
- "i5 11th" or "i5/11gen" = Processor: Core i5 11th Gen
- "i7 12th" = Core i7 12th Gen  |  "i3 10th" = Core i3 10th Gen
- "m1","m2","m3" = Apple Silicon  |  "ryzen 5","r5" = Ryzen 5
- Numbers like "620", "1250 aed" = budget

STAGE RULES:
- new_inquiry: asked if something is available, no price/specs discussed
- new_inquiry: client asked for a device, looking for it
- negotiation: back-and-forth on price happened
- closed: deal confirmed ("confirmed", "done", "I'll take it", "ok done")
- lost: said no, or no reply after price given

Return ONLY a JSON array — no markdown, no explanation:
[{
  "name": "customer name (strip ~)",
  "number": "phone number from filename like +971 55 539 0642 or empty",
  "intent": "buying or selling or unknown",
  "brand": "MacBook or Dell or HP or Lenovo or Other or unknown",
  "model": "model number/name or empty",
  "processor": "Core i5 11th Gen or Apple M1 etc or empty",
  "ram": "8GB or empty",
  "storage": "256GB or empty",
  "condition": "New or Like New or Used or Refurbished or unknown",
  "budget": price as number or null,
  "quantity": units wanted as number or null,
  "urgent": true or false,
  "notes": "key context from the conversation",
  "stage": "new_inquiry or device_found or negotiation or closed or lost"
}]

CRITICAL RULES:
- Include EVERY customer even if they only sent 1 message
- Include even if intent is not clear — set intent to "unknown"
- Merge multiple appearances of same person into one entry
- Never skip a contact just because the conversation is brief
- Return ONLY the JSON array

WhatsApp Chat:
${cleanWhatsAppText(importText).slice(0, 12000)}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      const raw = data?.content?.[0]?.text || "[]";
      const clean = raw.replace(/\`\`\`json|\`\`\`/g, "").trim();
      let contacts;
      try { contacts = JSON.parse(clean); } catch { contacts = []; }

      if (!contacts.length) {
        setImportResult({ success: false, message: "No contacts extracted. Try a longer chat or check the format." });
        setImporting(false); return;
      }

      // Create customers and deals in Supabase
      let created = 0;
      for (const c of contacts) {
        if (!c.name) continue;
        const { data: customer } = await supabase.from("customers").insert({
          name: c.name, number: c.number || "", notes: c.notes || "",
          tier: "cold", urgent: c.urgent || false,
        }).select().single();
        if (!customer) continue;
        const { data: deal } = await supabase.from("deals").insert({
          customer_id: customer.id,
          brand: c.brand && c.brand !== "unknown" ? c.brand : "",
          model: c.model || "",
          ram: c.ram || "",
          storage: c.storage || "",
          condition: c.condition && c.condition !== "unknown" ? c.condition : "",
          budget: c.budget || null,
          stage: c.stage || "new_inquiry",
        }).select().single();
        if (deal) await saveImportedMessages(deal.id, cleanWhatsAppText(importText));
        created++;
      }

      await loadCustomers();
      setImportResult({ success: true, message: `✅ Imported ${created} customer${created !== 1 ? "s" : ""} successfully!` });
      setImportText("");
    } catch (e) {
      setImportResult({ success: false, message: "Error importing. Check your API key." });
    }
    setImporting(false);
  }

  async function exportData() {
    setExporting(true);
    try {
      const { data: allCustomers } = await supabase.from("customers").select("*, deals(*)").order("last_active", { ascending: false });
      const exportObj = {
        exported_at: new Date().toISOString(),
        business: "Laptop for Less",
        total_customers: allCustomers?.length || 0,
        customers: allCustomers || [],
      };
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `jnp-crm-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click(); URL.revokeObjectURL(url);

      // Also export as CSV
      const rows = [["Name", "Number", "Tier", "Urgent", "Brand", "Model", "Stage", "Budget (AED)", "Value (AED)", "Last Active", "Notes"]];
      (allCustomers || []).forEach(c => {
        const deal = (c.deals || [])[0] || {};
        rows.push([
          c.name, c.number || "", c.tier, c.urgent ? "Yes" : "No",
          deal.brand || "", deal.model || "", deal.stage || "",
          deal.budget || "", deal.value || "",
          c.last_active ? new Date(c.last_active).toLocaleDateString() : "",
          c.notes || "",
        ]);
      });
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
      const csvBlob = new Blob([csv], { type: "text/csv" });
      const csvUrl = URL.createObjectURL(csvBlob);
      const b = document.createElement("a");
      b.href = csvUrl; b.download = `jnp-crm-export-${new Date().toISOString().slice(0,10)}.csv`;
      setTimeout(() => { b.click(); URL.revokeObjectURL(csvUrl); }, 500);
    } catch (e) {
      alert("Export failed. Please try again.");
    }
    setExporting(false);
  }

  return { importChatFile, importSingleChatFile, importMultipleChatFiles, importWhatsAppChat, exportData };
}
