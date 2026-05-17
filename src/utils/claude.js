import { supabase } from "../supabase";
import { SYSTEM_PROMPT, STAGES } from "../constants";

export async function callClaude(apiKey, messages, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text || "";
}

export function buildSystemPromptFromCache(cachedStock) {
  if (!cachedStock?.length) return SYSTEM_PROMPT;
  const cap = v => v ? v.charAt(0).toUpperCase() + v.slice(1) : null;
  const lines = cachedStock.map((s, i) => {
    const parts = [
      [s.brand, s.model].filter(Boolean).join(" ") || "Unknown",
      s.processor, s.ram, s.ssd, s.screen || null, s.condition,
      s.charger ? `Charger: ${cap(s.charger)}` : null,
      s.box ? `Box: ${cap(s.box)}` : null,
      s.brand === "MacBook" && s.activation_lock && s.activation_lock !== "unknown"
        ? `Activation Lock: ${s.activation_lock === "yes" ? "Yes" : "No"}` : null,
      s.max_price
        ? `AED ${Number(s.max_price).toLocaleString()}${s.min_price ? ` (min: AED ${Number(s.min_price).toLocaleString()})` : ""}`
        : null,
    ].filter(Boolean);
    return `${i + 1}. ${parts.join(" | ")}`;
  }).join("\n");
  return SYSTEM_PROMPT + `\n\nCURRENT STOCK INVENTORY (${cachedStock.length} items available):\n${lines}`;
}

export async function buildOwnerContext() {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const age = ts => ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) : 0;

  const [{ data: allStock }, { data: allCustomers }] = await Promise.all([
    supabase.from("stock").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("*, deals(*)").order("last_active", { ascending: false }),
  ]);
  const stocks = allStock || [];
  const custs = allCustomers || [];

  const available = stocks.filter(s => s.status === "available");
  const sold = stocks.filter(s => s.status === "sold");
  const soldValue = sold.reduce((n, s) => n + (s.max_price || 0), 0);

  const availLines = available.length
    ? available.map((s, i) => {
        const p = [[s.brand, s.model].filter(Boolean).join(" ") || "Unknown",
          s.processor, s.ram, s.ssd, s.screen, s.condition,
          s.cost_price != null ? `Cost: ${s.cost_price}` : null,
          s.min_price != null ? `Min: ${s.min_price}` : null,
          s.max_price != null ? `Max: ${s.max_price}` : null,
          `Days in stock: ${age(s.created_at)}`].filter(Boolean);
        return `${i + 1}. ${p.join(" | ")}`;
      }).join("\n")
    : "(none)";

  const openDeals = custs.reduce((n, c) => n + (c.deals||[]).filter(d => d.stage!=="closed"&&d.stage!=="lost").length, 0);
  const urgent = custs.filter(c => c.urgent).length;
  const cold = custs.filter(c => age(c.last_active)>=3 && (c.deals||[]).some(d=>d.stage!=="closed"&&d.stage!=="lost")).length;

  const stageCounts = Object.fromEntries(STAGES.map(s=>[s.id,0]));
  custs.forEach(c=>(c.deals||[]).forEach(d=>{ if(stageCounts[d.stage]!==undefined) stageCounts[d.stage]++; }));

  let monthRev = 0, closedThisMonth = 0;
  custs.forEach(c=>(c.deals||[]).forEach(d=>{
    if(d.stage==="closed"&&d.closed_at&&new Date(d.closed_at)>=new Date(monthStart)){
      monthRev += (d.value||0); closedThisMonth++;
    }
  }));

  const followUps = custs
    .filter(c => age(c.last_active)>=1 && (c.deals||[]).some(d=>d.stage!=="closed"&&d.stage!=="lost"))
    .sort((a,b) => age(b.last_active)-age(a.last_active))
    .slice(0,15)
    .map(c => {
      const d = (c.deals||[]).find(deal=>deal.stage!=="closed"&&deal.stage!=="lost");
      const device = d ? [d.brand,d.model].filter(Boolean).join(" ")||"Unknown" : "Unknown";
      const stage = STAGES.find(s=>s.id===d?.stage)?.label || d?.stage || "";
      return `- ${c.name} | ${device} | ${age(c.last_active)} days silent | ${stage}`;
    }).join("\n");

  return `OWNER DASHBOARD CONTEXT:
Date: ${dateStr}

STOCK INVENTORY:
Available (${available.length} items):
${availLines}
Total sold: ${sold.length} items | Approx. value: AED ${soldValue.toLocaleString()}

CLIENTS SUMMARY:
Total clients: ${custs.length}
Open deals: ${openDeals}
Urgent: ${urgent}
Cold (3+ days silent): ${cold}

DEALS BY STAGE:
New Inquiry: ${stageCounts["new_inquiry"]||0}
Requirement Noted: ${stageCounts["requirement_noted"]||0}
Searching: ${stageCounts["searching"]||0}
Device Found: ${stageCounts["device_found"]||0}
Negotiation: ${stageCounts["negotiation"]||0}
Closed this month: ${closedThisMonth}
Lost: ${stageCounts["lost"]||0}

REVENUE:
This month: AED ${monthRev.toLocaleString()}
Closed deals this month: ${closedThisMonth}

FOLLOW UPS DUE:
${followUps||"(none due)"}`;
}
