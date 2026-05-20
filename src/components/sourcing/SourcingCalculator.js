import React, { useState, useEffect } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_RATE = 3.67;
const DUTY_PCT     = 0.05;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtUSD = n => n ? "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";
const fmtAED = n => (n || n === 0) ? "AED " + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";

function Row({ label, value, bold, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#64748B" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: color || "#0F172A" }}>{value}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SOURCING CALCULATOR — Landed Cost Calculator extracted from DealDetail
// ══════════════════════════════════════════════════════════════════════════════
export default function SourcingCalculator({ deal: d, rate, patchDeal }) {
  const [showFin,       setShowFin]       = useState(true);
  const [localRate,     setLocalRate]     = useState(rate);
  const [editRate,      setEditRate]      = useState(false);
  const [rateInput,     setRateInput]     = useState(String(rate));
  const [localShipping, setLocalShipping] = useState(Number(d.shipping_cost_aed) || 0);
  const [shipInput,     setShipInput]     = useState(String(Number(d.shipping_cost_aed) || 0));
  const [localRevenue,  setLocalRevenue]  = useState(Number(d.expected_revenue_aed) || 0);
  const [revInput,      setRevInput]      = useState(String(Number(d.expected_revenue_aed) || 0));

  useEffect(() => {
    setLocalShipping(Number(d.shipping_cost_aed) || 0);
    setShipInput(String(Number(d.shipping_cost_aed) || 0));
    setLocalRevenue(Number(d.expected_revenue_aed) || 0);
    setRevInput(String(Number(d.expected_revenue_aed) || 0));
  }, [d.id]);

  // Computed values
  const purchaseUSD = Number(d.our_bid_usd || 0) * Number(d.units_bid || 0);
  const purchaseAED = purchaseUSD * localRate;
  const duty        = purchaseAED * DUTY_PCT;
  const landed      = purchaseAED + localShipping + duty;
  const units       = Number(d.units_bid || 0);
  const costPerUnit = units > 0 ? landed / units : 0;
  const profit      = localRevenue > 0 ? localRevenue - landed : null;
  const margin      = profit !== null && localRevenue > 0 ? (profit / localRevenue) * 100 : null;

  return (
    /* ══════════════════════════════════════════════════════════════════
        LANDED COST CALCULATOR
    ══════════════════════════════════════════════════════════════════ */
    <div style={{ background: "#fff", borderRadius: 16, marginTop: 12,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>

      {/* Header */}
      <button onClick={() => setShowFin(v => !v)} style={{
        width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "14px 16px", background: "none", border: "none", cursor: "pointer",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>💰</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>Landed Cost Calculator</span>
        </div>
        <span style={{ fontSize: 18, color: "#94A3B8" }}>{showFin ? "▲" : "▼"}</span>
      </button>

      {showFin && (
        <div style={{ padding: "0 16px 18px", borderTop: "1px solid #F1F5F9" }}>

          {/* Exchange rate pill */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0",
                        padding: "8px 14px", background: "#EEF2FF", borderRadius: 10 }}>
            <span style={{ fontSize: 12, color: "#4338CA", fontWeight: 700 }}>Exchange rate:</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#4338CA" }}>1 USD =</span>
            {editRate ? (
              <input value={rateInput}
                onChange={e => setRateInput(e.target.value)}
                autoFocus
                onBlur={() => {
                  const v = parseFloat(rateInput);
                  if (!isNaN(v) && v > 0) setLocalRate(v);
                  setEditRate(false);
                }}
                style={{ width: 60, padding: "3px 8px", borderRadius: 6,
                         border: "1.5px solid #6366F1", fontSize: 13,
                         fontWeight: 800, outline: "none", color: "#4338CA" }} />
            ) : (
              <span style={{ fontSize: 13, fontWeight: 800, color: "#4338CA" }}>{localRate} AED</span>
            )}
            <button onClick={() => { setRateInput(String(localRate)); setEditRate(true); }}
              style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 8, border: "none",
                       background: "#C7D2FE", color: "#4338CA", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
              Edit rate
            </button>
          </div>

          {/* ── PURCHASE block ── */}
          <div style={{ background: "#F8FAFC", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>PURCHASE</div>
            {purchaseUSD > 0 ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
                  {fmtUSD(purchaseUSD)} <span style={{ color: "#94A3B8", fontSize: 13, fontWeight: 400 }}>×</span> {localRate} <span style={{ color: "#94A3B8", fontSize: 13, fontWeight: 400 }}>=</span> <span style={{ color: "#6366F1" }}>{fmtAED(purchaseAED)}</span>
                </div>
                {d.units_bid && d.our_bid_usd && (
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>
                    {Number(d.units_bid).toLocaleString()} units × ${Number(d.our_bid_usd).toLocaleString()}/unit
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#CBD5E1" }}>Set bid amount to calculate</div>
            )}
          </div>

          {/* ── Additions ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0,
                        border: "1.5px solid #E2E8F0", borderRadius: 12, overflow: "hidden",
                        marginBottom: 10 }}>

            {/* Shipping row — editable */}
            <div style={{ display: "flex", alignItems: "center", padding: "10px 14px",
                          borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#374151" }}>+ Shipping cost</div>
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>Enter actual amount paid</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#94A3B8" }}>AED</span>
                <input
                  value={shipInput}
                  onChange={e => {
                    setShipInput(e.target.value);
                    const v = parseFloat(e.target.value);
                    setLocalShipping(isNaN(v) ? 0 : v);
                  }}
                  onBlur={() => {
                    const v = parseFloat(shipInput);
                    const val = isNaN(v) ? 0 : v;
                    setLocalShipping(val);
                    setShipInput(String(val));
                    patchDeal({ shipping_cost_aed: val });
                  }}
                  placeholder="0"
                  style={{ width: 80, padding: "5px 8px", borderRadius: 8,
                           border: "1.5px solid #6366F1", fontSize: 13, fontWeight: 700,
                           textAlign: "right", outline: "none", color: "#0F172A" }}
                />
              </div>
            </div>

            {/* Import duty row — auto */}
            <div style={{ display: "flex", alignItems: "center", padding: "10px 14px",
                          background: "#FAFAFA" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "#374151" }}>+ Import duty <span style={{ fontSize: 11, color: "#94A3B8" }}>(5% of purchase)</span></div>
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>Auto-calculated</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
                AED {duty > 0 ? Math.round(duty).toLocaleString() : "0"}
              </span>
            </div>
          </div>

          {/* ── TOTAL LANDED ── */}
          <div style={{ background: landed > 0 ? "#EEF2FF" : "#F8FAFC", borderRadius: 12,
                        padding: "12px 14px", marginBottom: 14,
                        border: landed > 0 ? "1.5px solid #C7D2FE" : "1.5px solid #E2E8F0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#4338CA" }}>= Total landed</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: "#4338CA" }}>
                {landed > 0 ? fmtAED(landed) : "—"}
              </span>
            </div>
            {costPerUnit > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                            marginTop: 6, paddingTop: 6, borderTop: "1px solid #C7D2FE" }}>
                <span style={{ fontSize: 12, color: "#6366F1" }}>
                  Cost per unit <span style={{ color: "#94A3B8", fontSize: 11 }}>({Number(d.units_bid).toLocaleString()} units)</span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "#6366F1" }}>
                  {fmtAED(costPerUnit)}
                </span>
              </div>
            )}
          </div>

          {/* ── EXPECTED REVENUE ── */}
          <div style={{ border: "1.5px solid #E2E8F0", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", padding: "10px 14px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>Expected revenue</div>
                <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>Total selling price of all units</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#94A3B8" }}>AED</span>
                <input
                  value={revInput}
                  onChange={e => {
                    setRevInput(e.target.value);
                    const v = parseFloat(e.target.value);
                    setLocalRevenue(isNaN(v) ? 0 : v);
                  }}
                  onBlur={() => {
                    const v = parseFloat(revInput);
                    const val = isNaN(v) ? 0 : v;
                    setLocalRevenue(val);
                    setRevInput(String(val));
                    patchDeal({ expected_revenue_aed: val });
                  }}
                  placeholder="0"
                  style={{ width: 80, padding: "5px 8px", borderRadius: 8,
                           border: "1.5px solid #10B981", fontSize: 13, fontWeight: 700,
                           textAlign: "right", outline: "none", color: "#0F172A" }}
                />
              </div>
            </div>
          </div>

          {/* ── PROFIT / MARGIN ── */}
          {profit !== null && (
            <div style={{
              borderRadius: 12, padding: "12px 14px",
              background: profit >= 0 ? "#ECFDF5" : "#FEF2F2",
              border: `1.5px solid ${profit >= 0 ? "#6EE7B7" : "#FECACA"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                            marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800,
                               color: profit >= 0 ? "#059669" : "#DC2626" }}>
                  {profit >= 0 ? "✅ Gross profit" : "❌ Loss"}
                </span>
                <span style={{ fontSize: 18, fontWeight: 800,
                               color: profit >= 0 ? "#059669" : "#DC2626" }}>
                  {profit >= 0 ? "+" : ""}{fmtAED(profit)}
                </span>
              </div>

              {/* Margin bar */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                              alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: profit >= 0 ? "#059669" : "#DC2626", fontWeight: 600 }}>
                    Margin
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800,
                                 color: margin >= 20 ? "#059669" : margin >= 10 ? "#D97706" : "#DC2626" }}>
                    {margin.toFixed(1)}%
                  </span>
                </div>
                <div style={{ height: 6, background: profit >= 0 ? "#D1FAE5" : "#FEE2E2",
                              borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 3, transition: "width 0.3s",
                    width: `${Math.min(Math.max(margin, 0), 40) / 40 * 100}%`,
                    background: margin >= 20 ? "#059669" : margin >= 10 ? "#D97706" : "#DC2626",
                  }} />
                </div>
              </div>

              {/* Per-unit breakdown */}
              {costPerUnit > 0 && localRevenue > 0 && d.units_bid > 0 && (
                <div style={{ fontSize: 11, color: profit >= 0 ? "#059669" : "#DC2626",
                              paddingTop: 8, borderTop: `1px solid ${profit >= 0 ? "#6EE7B7" : "#FECACA"}` }}>
                  {fmtAED(localRevenue / d.units_bid)} revenue − {fmtAED(costPerUnit)} cost = <strong>{fmtAED((localRevenue - landed) / d.units_bid)}/unit</strong>
                </div>
              )}
            </div>
          )}

          {/* prompt to fill in revenue if not set */}
          {profit === null && landed > 0 && (
            <div style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", padding: "4px 0" }}>
              ↑ Enter expected revenue to see profit
            </div>
          )}
        </div>
      )}
    </div>
  );
}
