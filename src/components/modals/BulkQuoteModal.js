import React, { useState } from "react";
import { useStock } from "../../context/StockContext";
import { useCustomers } from "../../context/CustomerContext";
import { useProfile } from "../../context/ProfileContext";
import { effectiveStatus } from "../../utils/holds";

// Checks if a stock item matches generation requirement
function matchesSpec(item, specText) {
  if (!specText.trim()) return true;
  const s = specText.toLowerCase();
  const p = (item.processor || "").toLowerCase();
  const m = (item.model || "").toLowerCase();
  const b = (item.brand || "").toLowerCase();

  // Parse "8th gen and above" style
  const genMatch = s.match(/(\d+)(th|st|nd|rd)\s*gen.*above/i) ||
                   s.match(/(\d+)(th|st|nd|rd)\s*gen\s*\+/i) ||
                   s.match(/(\d+)(th|st|nd|rd)\s*gen\s*and\s*up/i);
  if (genMatch) {
    const minGen = parseInt(genMatch[1]);
    // Extract gen from processor string
    const procGenMatch = p.match(/(\d+)(th|st|nd|rd)\s*gen/i) ||
                         p.match(/i[357]-(\d{4,5})/i) ||
                         p.match(/(\d{4,5})[uh]/i);
    if (procGenMatch) {
      // Try to get gen from explicit mention
      const explicitGen = p.match(/(\d+)(th|st|nd|rd)\s*gen/i);
      if (explicitGen) {
        if (parseInt(explicitGen[1]) < minGen) return false;
      } else {
        // Infer gen from model number: 8xxx = 8th, 9xxx = 9th, 10xxx = 10th etc
        const modelNum = p.match(/i[357]-(\d{4,5})/i);
        if (modelNum) {
          const num = modelNum[1];
          const inferredGen = num.length === 5 ? parseInt(num.slice(0, 2)) : parseInt(num[0]);
          if (inferredGen < minGen) return false;
        }
      }
    }
  }

  // Check brand/model keywords
  const words = s.replace(/\b(and|above|gen|generation|\+|or|\/)\b/gi, " ")
                  .split(/[\s,]+/).filter(w => w.length > 1 &&
                  !w.match(/^\d+(th|st|nd|rd)?$/));
  for (const word of words) {
    if (!p.includes(word) && !m.includes(word) && !b.includes(word)) return false;
  }
  return true;
}

function fmtAED(n) { return "AED " + Number(Math.round(n)).toLocaleString(); }

export default function BulkQuoteModal({ onClose }) {
  const { stock } = useStock();
  const { activeCustomer } = useCustomers();
  const { myWhatsApp } = useProfile();

  const [qty, setQty]             = useState("");
  const [spec, setSpec]           = useState("");
  const [condition, setCondition] = useState("Grade A");
  const [profit, setProfit]       = useState("");
  const [matches, setMatches]     = useState(null);
  const [copied, setCopied]       = useState(false);

  const available = stock.filter(s => effectiveStatus(s) === "available");

  function findMatches() {
    const q = parseInt(qty);
    if (!q || q < 1) return;

    const found = available.filter(item => {
      const condMatch = !condition || (item.condition || "").toLowerCase().includes(condition.toLowerCase().replace("grade ", "").trim());
      const specMatch = matchesSpec(item, spec);
      return condMatch && specMatch;
    });

    setMatches(found);
    setCopied(false);
  }

  const targetQty    = parseInt(qty) || 0;
  const profitTarget = parseFloat(profit) || 0;
  const useDevices   = matches ? matches.slice(0, targetQty) : [];
  const totalCost    = useDevices.reduce((s, d) => s + (d.cost_price || 0), 0);
  const clientTotal  = totalCost + profitTarget;
  const perDevice    = useDevices.length > 0 ? clientTotal / useDevices.length : 0;
  const margin       = clientTotal > 0 ? (profitTarget / clientTotal) * 100 : 0;
  const hasEnough    = matches && matches.length >= targetQty;
  const shortfall    = targetQty - (matches?.length || 0);

  function buildQuote() {
    const deviceList = useDevices.map((d, i) =>
      `${i + 1}. ${d.brand || ""} ${d.model || ""}\n   ${[d.processor, d.ram, d.ssd, d.condition].filter(Boolean).join(" · ")}`
    ).join("\n\n");

    return `💼 *Bulk Deal Quote*
${activeCustomer?.name ? `For: ${activeCustomer.name}` : ""}

*${targetQty}x Laptops — ${spec || "Mixed Spec"}*
Condition: ${condition}

${deviceList}

─────────────────────
Per device:  ${fmtAED(perDevice)}
Total (${useDevices.length} units):  *${fmtAED(clientTotal)}*

📍 Sharjah, UAE
📱 ${myWhatsApp}`;
  }

  function copyQuote() {
    navigator.clipboard.writeText(buildQuote());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 400, display: "flex", alignItems: "flex-end" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Handle */}
        <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "12px auto 0" }} />

        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>💼 Bulk Quote</div>
            {activeCustomer && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{activeCustomer.name}</div>}
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 14, color: "#64748B" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px 28px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Requirements */}
          <div style={{ background: "#F8FAFC", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 10 }}>REQUIREMENTS</div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 3 }}>QTY</div>
              <input type="number" value={qty} onChange={e => { setQty(e.target.value); setMatches(null); }}
                placeholder="e.g. 15"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 3 }}>SPEC / REQUIREMENT</div>
              <input value={spec} onChange={e => { setSpec(e.target.value); setMatches(null); }}
                placeholder="e.g. Core i5/i7 8th gen and above"
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 6 }}>CONDITION</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["Grade A", "Grade B", "Any"].map(g => (
                  <button key={g} onClick={() => { setCondition(g === "Any" ? "" : g); setMatches(null); }}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 10, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                      background: (condition === g || (g === "Any" && condition === "")) ? "#6366F1" : "#F1F5F9",
                      color:      (condition === g || (g === "Any" && condition === "")) ? "#fff"    : "#64748B" }}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Profit target */}
          <div style={{ background: "#F8FAFC", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>YOUR PROFIT TARGET</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "#64748B", flexShrink: 0 }}>AED</span>
              <input type="number" value={profit} onChange={e => setProfit(e.target.value)}
                placeholder="e.g. 7500"
                style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 15, fontWeight: 700, outline: "none" }} />
            </div>
          </div>

          {/* Find button */}
          <button onClick={findMatches} disabled={!qty || !spec}
            style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", fontSize: 14, fontWeight: 800, cursor: !qty || !spec ? "not-allowed" : "pointer",
              background: !qty || !spec ? "#E2E8F0" : "#6366F1", color: !qty || !spec ? "#94A3B8" : "#fff" }}>
            🔍 Find Matching Stock
          </button>

          {/* Results */}
          {matches !== null && (
            <>
              {/* Availability */}
              <div style={{
                padding: "12px 14px", borderRadius: 12,
                background: hasEnough ? "#ECFDF5" : "#FFFBEB",
                border: `1px solid ${hasEnough ? "#BBF7D0" : "#FDE68A"}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: hasEnough ? "#059669" : "#D97706" }}>
                  {hasEnough
                    ? `✅ ${matches.length} matching devices found — enough for ${targetQty}`
                    : `⚠️ Only ${matches.length} matching — need ${shortfall} more to source`}
                </div>
                {!hasEnough && (
                  <div style={{ fontSize: 11, color: "#D97706", marginTop: 3 }}>
                    Quote will cover {matches.length} devices. Source {shortfall} more to complete the deal.
                  </div>
                )}
              </div>

              {/* Matched devices list */}
              {useDevices.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #F1F5F9", overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>
                      Devices in Quote ({useDevices.length})
                    </span>
                  </div>
                  <div style={{ maxHeight: 180, overflowY: "auto" }}>
                    {useDevices.map((d, i) => (
                      <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 14px", borderBottom: i < useDevices.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{d.brand} {d.model}</div>
                          <div style={{ fontSize: 10, color: "#94A3B8" }}>{[d.processor, d.ram, d.ssd, d.condition].filter(Boolean).join(" · ")}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "#64748B", flexShrink: 0, marginLeft: 8 }}>
                          cost {fmtAED(d.cost_price || 0)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pricing breakdown */}
              {useDevices.length > 0 && (
                <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #F1F5F9", overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>Pricing Breakdown</span>
                  </div>
                  <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {[
                      { label: "Your total cost",      val: fmtAED(totalCost),    color: "#64748B" },
                      { label: "Your profit target",   val: `+ ${fmtAED(profitTarget)}`, color: "#6366F1" },
                      { label: "Charge client (total)", val: fmtAED(clientTotal),  color: "#0F172A", big: true },
                      { label: `Per device (${useDevices.length} units)`, val: fmtAED(perDevice), color: "#0F172A" },
                      { label: "Profit margin",        val: `${margin.toFixed(1)}%`, color: margin >= 20 ? "#10B981" : margin >= 12 ? "#D97706" : "#EF4444" },
                    ].map((row, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "5px 0", borderBottom: i < 4 ? "1px solid #F8FAFC" : "none" }}>
                        <span style={{ fontSize: 12, color: "#64748B" }}>{row.label}</span>
                        <span style={{ fontSize: row.big ? 15 : 12, fontWeight: row.big ? 800 : 600, color: row.color }}>{row.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verdict */}
              {useDevices.length > 0 && profitTarget > 0 && (
                <div style={{
                  padding: "10px 14px", borderRadius: 12, textAlign: "center", fontSize: 12, fontWeight: 800,
                  background: margin < 10 ? "#FEF2F2" : margin < 18 ? "#FFFBEB" : "#ECFDF5",
                  color:      margin < 10 ? "#EF4444" : margin < 18 ? "#D97706" : "#10B981",
                }}>
                  {margin < 10 ? "⚠️ Low margin — consider raising your price"
                   : margin < 18 ? "🟡 Acceptable margin"
                   : "✅ Good margin — proceed with confidence"}
                </div>
              )}

              {/* Quote preview + copy */}
              {useDevices.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>WHATSAPP QUOTE PREVIEW</div>
                  <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 12, padding: "12px 14px",
                    fontSize: 11, color: "#14532D", lineHeight: 1.8, whiteSpace: "pre-line", marginBottom: 8 }}>
                    {buildQuote()}
                  </div>
                  <button onClick={copyQuote}
                    style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer",
                      background: copied ? "#10B981" : "#25D366", color: "#fff" }}>
                    {copied ? "✓ Copied to clipboard!" : "📋 Copy WhatsApp Quote"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
