import React, { useState, useEffect } from "react";
import { useStock } from "../../context/StockContext";
import { useCustomers } from "../../context/CustomerContext";
import { supabase } from "../../supabase";
import { useAuth } from "../../context/AuthContext";
import { useProfile } from "../../context/ProfileContext";

export default function StockListMode() {
  const { stock } = useStock();
  const { customers } = useCustomers();
  const { anthropicKey } = useAuth();
  const { isOwner } = useProfile();
  const [consignmentStock, setConsignmentStock] = useState([]);

  useEffect(() => {
    supabase.from("consignment_items").select("*, customers(name)").eq("status", "available")
      .then(({ data }) => setConsignmentStock(data || []));
  }, []); // eslint-disable-line

  const [query, setQuery]           = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult]         = useState(null); // { items, whatsappText }
  const [clientPrice, setClientPrice] = useState("");
  const [copied, setCopied]         = useState(false);
  const [error, setError]           = useState(null);

  const availableStock = stock.filter(s => s.status === "available");
  const allAvailable   = [
    ...availableStock,
    ...consignmentStock.map(c => ({
      ...c,
      brand:      c.brand,
      model:      c.model,
      cost_price: c.trader_price,
      max_price:  c.your_price,
      status:     "available",
      _consignment: true,
      _traderName:  c.customers?.name || "Trader",
    })),
  ];

  async function generateList() {
    if (!query.trim()) return;
    if (!anthropicKey) { setError("Add your Anthropic API key in Settings first."); return; }
    setGenerating(true);
    setResult(null);
    setError(null);
    setClientPrice("");

    const stockLines = allAvailable.map((s, i) =>
      `${i + 1}. [ID:${s.id}] ${s.brand || ""} ${s.model || ""} | ${s.processor || "—"} | ${s.ram || "—"} RAM | ${s.ssd || "—"} SSD | Grade ${s.condition || "—"} | AED ${s.max_price || 0}`
    ).join("\n");

    const prompt = `You are helping a UAE laptop reseller find matching stock for a client request.

Client is asking for: "${query.trim()}"

Available stock (${availableStock.length} items):
${stockLines || "(no stock available)"}

Find all items that match the client's request. Be flexible — if client says "i5 11th gen", match any Core i5 11th generation processor. If they say "MacBook Air M2", match MacBook Air M2 models. If they say "HP Grade A", match HP laptops with Grade A condition.

Return JSON only, no other text:
{
  "items": [
    {"id": "the exact id from the list", "brand": "...", "model": "...", "processor": "...", "ram": "...", "ssd": "...", "condition": "...", "price": 1800}
  ],
  "whatsapp_text": "the formatted WhatsApp message to send to client",
  "count": 3
}

For whatsapp_text format:
- Start with: "Available [device type]:\n\n"  
- Number each item with emoji (1️⃣ 2️⃣ 3️⃣ etc)
- Each item: Brand Model\\nProcessor | RAM | SSD\\nCondition | AED Price
- End with: "\\n---\\nTotal [X] units | Combined price: AED [sum]"
- Do NOT include cost prices. Clean and ready to copy-paste.
- If no items match, return empty items array and explain in whatsapp_text.`;

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
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const raw = data?.content?.[0]?.text || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      // Enrich items with cost_price from local or consignment stock
      const enriched = (parsed.items || []).map(item => {
        const local = allAvailable.find(s => s.id === item.id);
        return { ...item, cost_price: local?.cost_price || 0 };
      });

      setResult({ items: enriched, whatsappText: parsed.whatsapp_text || "" });
    } catch (e) {
      setError("Failed to generate list. Check your API key in Settings.");
    }
    setGenerating(false);
  }

  function copyList() {
    if (!result?.whatsappText) return;
    navigator.clipboard.writeText(result.whatsappText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // Margin calculation
  const clientOffer   = parseFloat(clientPrice) || 0;
  const totalCost     = result ? result.items.reduce((s, i) => s + (i.cost_price || 0), 0) : 0;
  const totalAsking   = result ? result.items.reduce((s, i) => s + (i.price || 0), 0) : 0;
  const profitAtOffer = clientOffer - totalCost;
  const marginAtOffer = clientOffer > 0 ? (profitAtOffer / clientOffer) * 100 : 0;
  const profitAtAsking = totalAsking - totalCost;
  const marginAtAsking = totalAsking > 0 ? (profitAtAsking / totalAsking) * 100 : 0;
  const marginColor = marginAtOffer < 10 ? "#EF4444" : marginAtOffer < 18 ? "#D97706" : "#10B981";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", padding: "14px 12px 100px" }}>

      {/* ── Search input ── */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
          What is the client asking for?
        </div>
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generateList(); } }}
          placeholder={'e.g. "core i5 11th gen" or "MacBook Air M2" or "HP Grade A under 3000"'}
          rows={2}
          style={{
            width: "100%", padding: "11px 12px", borderRadius: 12,
            border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none",
            resize: "none", fontFamily: "inherit", lineHeight: 1.5,
            boxSizing: "border-box", color: "#334155",
          }}
        />
        <button
          onClick={generateList}
          disabled={generating || !query.trim()}
          style={{
            width: "100%", marginTop: 8, padding: "12px 0", borderRadius: 12, border: "none",
            background: generating || !query.trim() ? "#E2E8F0" : "#7C3AED",
            color: generating || !query.trim() ? "#94A3B8" : "#fff",
            fontWeight: 800, fontSize: 14, cursor: generating || !query.trim() ? "not-allowed" : "pointer",
          }}>
          {generating ? "⏳ Searching stock..." : "🔍 Find Matching Stock"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", color: "#EF4444", fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* ── Stock count hint ── */}
      {!result && !generating && (
        <div style={{ padding: "12px 14px", borderRadius: 12, background: "#F8FAFC", border: "1px solid #F1F5F9", fontSize: 12, color: "#94A3B8", textAlign: "center" }}>
          {availableStock.length > 0
            ? `${availableStock.length} items in available stock to search`
            : "No available stock found"}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <>
          {/* Match count */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>
              {result.items.length > 0
                ? `✅ ${result.items.length} item${result.items.length !== 1 ? "s" : ""} found`
                : "❌ No matches found"}
            </span>
            {result.items.length > 0 && (
              <button
                onClick={() => { setResult(null); setQuery(""); setClientPrice(""); }}
                style={{ fontSize: 11, color: "#94A3B8", background: "none", border: "none", cursor: "pointer" }}>
                Clear
              </button>
            )}
          </div>

          {/* Item cards */}
          {result.items.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {result.items.map((item, i) => (
                <div key={item.id || i} style={{
                  padding: "10px 12px", borderRadius: 12, background: "#fff",
                  border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                        {item.brand} {item.model}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                        {[item.processor, item.ram, item.ssd].filter(Boolean).join(" · ")}
                      </div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                        Grade {item.condition}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#534AB7" }}>
                        AED {(item.price || 0).toLocaleString()}
                      </div>
                      {isOwner && item.cost_price > 0 && (
                        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>
                          Cost: AED {(item.cost_price || 0).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Totals row */}
              <div style={{ padding: "10px 12px", borderRadius: 12, background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#534AB7" }}>
                    {result.items.length} units total
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#534AB7" }}>
                    AED {totalAsking.toLocaleString()}
                  </span>
                </div>
                {isOwner && totalCost > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                    <span style={{ fontSize: 11, color: "#7C3AED" }}>Your margin at this price</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981" }}>
                      AED {profitAtAsking.toLocaleString()} ({marginAtAsking.toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* WhatsApp formatted text */}
          {result.whatsappText && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>
                WHATSAPP MESSAGE
              </div>
              <div style={{
                padding: "12px 14px", borderRadius: 12, background: "#F0FDF4",
                border: "1.5px solid #BBF7D0", fontSize: 12, color: "#14532D",
                lineHeight: 1.7, whiteSpace: "pre-line", marginBottom: 8,
              }}>
                {result.whatsappText}
              </div>
              <button
                onClick={copyList}
                style={{
                  width: "100%", padding: "11px 0", borderRadius: 12, border: "none",
                  background: copied ? "#10B981" : "#25D366",
                  color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
                }}>
                {copied ? "✓ Copied!" : "📋 Copy WhatsApp Message"}
              </button>
            </div>
          )}

          {/* ── Margin Calculator ── */}
          {isOwner && result.items.length > 0 && totalCost > 0 && (
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>💰 Margin Calculator</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>Enter what the client is offering</div>
              </div>
              <div style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: "#64748B", flexShrink: 0 }}>Client offers AED</span>
                  <input
                    type="number"
                    value={clientPrice}
                    onChange={e => setClientPrice(e.target.value)}
                    placeholder="e.g. 4500"
                    style={{
                      flex: 1, padding: "9px 11px", borderRadius: 10,
                      border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 700,
                      outline: "none", color: "#0F172A",
                    }}
                  />
                </div>

                {clientOffer > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {/* Comparison row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ padding: "10px 12px", borderRadius: 10, background: "#F8FAFC", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>Your price</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#534AB7" }}>AED {totalAsking.toLocaleString()}</div>
                        <div style={{ fontSize: 10, color: "#10B981", marginTop: 2 }}>Margin {marginAtAsking.toFixed(1)}%</div>
                      </div>
                      <div style={{ padding: "10px 12px", borderRadius: 10, background: clientOffer >= totalAsking ? "#ECFDF5" : "#FEF2F2", textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>Client offers</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: clientOffer >= totalAsking ? "#10B981" : "#EF4444" }}>AED {clientOffer.toLocaleString()}</div>
                        <div style={{ fontSize: 10, color: marginColor, marginTop: 2 }}>Margin {marginAtOffer.toFixed(1)}%</div>
                      </div>
                    </div>

                    {/* Profit breakdown */}
                    <div style={{ padding: "10px 12px", borderRadius: 10, background: profitAtOffer > 0 ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${profitAtOffer > 0 ? "#BBF7D0" : "#FEE2E2"}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#64748B" }}>Your total cost</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>AED {totalCost.toLocaleString()}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "#64748B" }}>Client offers</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>AED {clientOffer.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 1, background: "#E2E8F0", margin: "6px 0" }} />
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: profitAtOffer > 0 ? "#10B981" : "#EF4444" }}>
                          {profitAtOffer > 0 ? "Profit" : "Loss"}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: profitAtOffer > 0 ? "#10B981" : "#EF4444" }}>
                          AED {Math.abs(profitAtOffer).toLocaleString()} ({Math.abs(marginAtOffer).toFixed(1)}%)
                        </span>
                      </div>
                    </div>

                    {/* Verdict */}
                    <div style={{
                      padding: "9px 12px", borderRadius: 10,
                      background: marginAtOffer < 10 ? "#FEF2F2" : marginAtOffer < 18 ? "#FFFBEB" : "#ECFDF5",
                      fontSize: 12, fontWeight: 700,
                      color: marginAtOffer < 10 ? "#EF4444" : marginAtOffer < 18 ? "#D97706" : "#10B981",
                      textAlign: "center",
                    }}>
                      {marginAtOffer < 0
                        ? "❌ Reject — you'd lose money"
                        : marginAtOffer < 10
                        ? "⚠️ Too low — counter-offer or decline"
                        : marginAtOffer < 18
                        ? "🟡 Acceptable — below your usual margin"
                        : "✅ Good deal — accept"}
                    </div>

                    {/* Counter suggestion */}
                    {clientOffer < totalAsking && (
                      <div style={{ padding: "9px 12px", borderRadius: 10, background: "#EEF2FF", fontSize: 12, color: "#534AB7" }}>
                        💡 Counter at AED {Math.round(totalAsking * 0.93).toLocaleString()} for a 7% discount — keeps you at {((totalAsking * 0.93 - totalCost) / (totalAsking * 0.93) * 100).toFixed(1)}% margin
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
