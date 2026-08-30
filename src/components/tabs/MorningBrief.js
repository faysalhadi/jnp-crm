import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabase";
import { useAuth } from "../../context/AuthContext";
import { useCustomers } from "../../context/CustomerContext";
import { useStock } from "../../context/StockContext";
import { useUI } from "../../context/UIContext";

export default function MorningBrief() {
  const { anthropicKey } = useAuth();
  const { customers } = useCustomers();
  const { stock } = useStock();
  const { setActiveTab } = useUI();

  const [brief, setBrief]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [lastGenerated, setLastGenerated] = useState(null);

  // Load cached brief from today — never auto-call API
  useEffect(() => {
    const stored = localStorage.getItem("morning_brief");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const genDate = new Date(parsed.date).toDateString();
        if (genDate === new Date().toDateString()) {
          setBrief(parsed.brief);
          setLastGenerated(parsed.date);
        }
      } catch {} // eslint-disable-line
    }
  }, []); // eslint-disable-line

  const generate = useCallback(async () => {
    if (!anthropicKey || loading) return;
    setLoading(true);

    // Gather data
    const now = new Date();
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const { data: followUps } = await supabase
      .from("follow_ups")
      .select("*, customers(id, name)")
      .eq("status", "pending")
      .lte("due_at", todayEnd.toISOString())
      .order("due_at", { ascending: true });

    const overdueFollowUps = (followUps || []).filter(f => new Date(f.due_at) < now);
    const todayFollowUps   = (followUps || []).filter(f => new Date(f.due_at) >= now);

    const availableStock = stock.filter(s => s.status === "available");
    const slowStock = availableStock.filter(s => {
      const days = Math.floor((Date.now() - new Date(s.created_at)) / 86400000);
      return days >= 7;
    });

    const openDeals = customers
      .filter(c => !c.contact_type || c.contact_type === "client" || c.contact_type === "walkin")
      .flatMap(c => (c.deals || [])
        .filter(d => d.stage !== "closed" && d.stage !== "parked")
        .map(d => ({ customer: c, deal: d, daysSilent: Math.floor((Date.now() - new Date(c.last_active || 0)) / 86400000) }))
      );

    const silentDeals = openDeals.filter(x => x.daysSilent >= 3);
    const urgentClients = customers.filter(c => c.urgent);

    const prompt = `You are a business assistant for Faisal Hadi who runs "Laptop for Less" in Sharjah, UAE.

Today is ${now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}.

Here is his current business snapshot:

OVERDUE FOLLOW-UPS (${overdueFollowUps.length}):
${overdueFollowUps.slice(0, 5).map(f => `- ${f.customers?.name}: ${f.note || "No note"}`).join("\n") || "None"}

TODAY'S FOLLOW-UPS (${todayFollowUps.length}):
${todayFollowUps.slice(0, 3).map(f => `- ${f.customers?.name}: ${f.note || "No note"}`).join("\n") || "None"}

URGENT CLIENTS (${urgentClients.length}):
${urgentClients.slice(0, 3).map(c => c.name).join(", ") || "None"}

SILENT 3+ DAYS WITH OPEN DEAL (${silentDeals.length}):
${silentDeals.slice(0, 5).map(x => `- ${x.customer.name}: ${[x.deal.brand, x.deal.model].filter(Boolean).join(" ") || "open deal"}, ${x.daysSilent}d silent`).join("\n") || "None"}

SLOW MOVING STOCK (7+ days, ${slowStock.length} items):
${slowStock.slice(0, 3).map(s => `- ${s.brand} ${s.model}: ${Math.floor((Date.now() - new Date(s.created_at)) / 86400000)}d, AED ${s.max_price}`).join("\n") || "None"}

AVAILABLE STOCK: ${availableStock.length} items

Write a brief morning summary in this exact JSON format. Be specific, actionable, and concise. Max 3 items per section:
{
  "greeting": "One warm sentence greeting (mention day/date)",
  "priority": [
    {"emoji": "🔴", "text": "specific action item", "urgency": "high|medium"}
  ],
  "stockAlert": "One sentence about slow stock or stock opportunity, or null",
  "insight": "One useful business insight based on the data, or null"
}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const raw = data?.content?.[0]?.text || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const now2 = new Date().toISOString();
      setBrief(parsed);
      setLastGenerated(now2);
      localStorage.setItem("morning_brief", JSON.stringify({ brief: parsed, date: now2 }));
    } catch (e) {
      console.error("Morning brief error:", e);
      setLoading(false);
      return;
    }
    setLoading(false);
  }, [anthropicKey, customers, stock, loading]); // eslint-disable-line

  if (!anthropicKey) return (
    <div style={{ background: "#F8FAFC", borderRadius: 16, padding: "12px 16px", border: "1px dashed #E2E8F0", textAlign: "center" }}>
      <div style={{ fontSize: 12, color: "#94A3B8" }}>🤖 Add your Anthropic API key in Settings to enable Morning Brief</div>
    </div>
  );

  return (
    <div style={{ background: "linear-gradient(135deg, #534AB7 0%, #7C3AED 100%)", borderRadius: 20, padding: 16, color: "#fff", boxShadow: "0 4px 20px rgba(83,74,183,0.3)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: collapsed ? 0 : 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.3 }}>Morning Brief</span>
          {lastGenerated && (
            <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 400 }}>
              {new Date(lastGenerated).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={generate} disabled={loading}
            style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>
            {loading ? "⏳" : "↺ Refresh"}
          </button>
          <button onClick={() => setCollapsed(v => !v)}
            style={{ fontSize: 12, background: "transparent", border: "none", color: "#fff", cursor: "pointer", opacity: 0.7 }}>
            {collapsed ? "▼" : "▲"}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {loading && (
            <div style={{ fontSize: 12, opacity: 0.8, padding: "8px 0" }}>Analysing your day...</div>
          )}

          {!loading && !brief && (
            <div style={{ fontSize: 12, opacity: 0.7 }}>Tap ↺ Refresh to generate your morning brief</div>
          )}

          {!loading && brief && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Greeting */}
              <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.5 }}>{brief.greeting}</div>

              {/* Priority items */}
              {(brief.priority || []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(brief.priority || []).map((item, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      padding: "8px 10px", borderRadius: 10,
                      background: item.urgency === "high" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.1)",
                      border: `1px solid ${item.urgency === "high" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.15)"}`,
                    }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{item.emoji}</span>
                      <span style={{ fontSize: 12, lineHeight: 1.5 }}>{item.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Stock alert */}
              {brief.stockAlert && (
                <div style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.3)", fontSize: 12, lineHeight: 1.5 }}>
                  📦 {brief.stockAlert}
                </div>
              )}

              {/* Insight */}
              {brief.insight && (
                <div style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.1)", fontSize: 12, lineHeight: 1.5, fontStyle: "italic", opacity: 0.85 }}>
                  💡 {brief.insight}
                </div>
              )}

              {/* Quick action buttons */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                <button onClick={() => { setActiveTab("customers"); }}
                  style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  👥 Clients
                </button>
                <button onClick={() => { setActiveTab("ask"); }}
                  style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  🤖 Ask Claude
                </button>
                <button onClick={() => { setActiveTab("stock"); }}
                  style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  📦 Stock
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
