import React, { useState } from "react";
import { supabase } from "../../supabase";

// ── Pipeline stages ───────────────────────────────────────────────────────────
const STAGES = [
  { id: "evaluating",  label: "Evaluating",  emoji: "🔵", color: "#6366F1", bg: "#EEF2FF" },
  { id: "bid_sent",    label: "Bid Sent",    emoji: "🟡", color: "#D97706", bg: "#FFFBEB" },
  { id: "bid_won",     label: "Bid Won",     emoji: "✅", color: "#059669", bg: "#ECFDF5" },
  { id: "payment_due", label: "Payment Due", emoji: "💳", color: "#2563EB", bg: "#DBEAFE" },
  { id: "paid",        label: "Paid",        emoji: "💰", color: "#047857", bg: "#D1FAE5" },
  { id: "in_transit",  label: "In Transit",  emoji: "🚚", color: "#7C3AED", bg: "#EDE9FE" },
  { id: "in_customs",  label: "In Customs",  emoji: "🛃", color: "#DB2777", bg: "#FCE7F3" },
  { id: "arrived",     label: "Arrived",     emoji: "📦", color: "#0891B2", bg: "#CFFAFE" },
  { id: "in_stock",    label: "In Stock",    emoji: "➡️", color: "#64748B", bg: "#F1F5F9" },
];
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s]));

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_RATE = 3.67;
const DUTY_PCT     = 0.05;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtUSD = n => n ? "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";
const fmtAED = n => (n || n === 0) ? "AED " + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";

function hoursUntil(ts) {
  if (!ts) return null;
  return (new Date(ts) - Date.now()) / 3_600_000;
}
function timeAgo(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (m < 1)    return "just now";
  if (m < 60)   return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}
function calcLanded(d, rate) {
  const r   = rate || DEFAULT_RATE;
  const pur = Number(d.our_bid_usd || 0) * Number(d.units_bid || 0) * r;
  return pur + Number(d.shipping_cost_aed || 0) + pur * DUTY_PCT;
}
function calcProfit(d, rate) {
  const landed  = Number(d.landed_cost_aed) > 0 ? Number(d.landed_cost_aed) : calcLanded(d, rate);
  const revenue = Number(d.expected_revenue_aed || 0);
  return revenue > 0 ? revenue - landed : null;
}

async function callClaude(apiKey, prompt, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: system || undefined,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text || "";
}

// ══════════════════════════════════════════════════════════════════════════════
//  DEAL CARD (pipeline list)
// ══════════════════════════════════════════════════════════════════════════════
function DealCard({ deal: d, rate, onClick }) {
  const st     = STAGE_MAP[d.status] || STAGE_MAP["evaluating"];
  const landed = Number(d.landed_cost_aed) > 0 ? Number(d.landed_cost_aed) : calcLanded(d, rate);
  const profit = calcProfit(d, rate);
  const dl     = hoursUntil(d.bid_deadline);
  const dlRed  = dl !== null && dl >= 0 && dl <= 24;
  const total  = Number(d.our_bid_usd || 0) * Number(d.units_bid || 0);

  return (
    <div onClick={onClick} style={{
      background: "#fff", borderRadius: 14, padding: "13px 14px",
      boxShadow: "0 1px 5px rgba(0,0,0,0.07)", cursor: "pointer",
      borderLeft: `3px solid ${st.color}`, marginBottom: 8,
    }}>
      {/* supplier + source */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {d.supplier_name || "—"}
          </div>
          <div style={{ fontSize: 11, color: "#64748B", marginTop: 2,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {d.lot_name || "No lot name"}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, flexShrink: 0,
          color:      d.source === "whatsapp" ? "#16A34A" : "#DC2626",
          background: d.source === "whatsapp" ? "#F0FDF4"  : "#FEF2F2",
          padding: "2px 7px", borderRadius: 8,
        }}>
          {d.source === "whatsapp" ? "💬 WA" : "📧 Gmail"}
        </span>
      </div>

      {/* units | bid | landed */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 10 }}>
        {[
          { label: "UNITS",  value: d.units_bid ? Number(d.units_bid).toLocaleString() : "—" },
          { label: "BID USD", value: total > 0 ? fmtUSD(total) : d.our_bid_usd ? `$${d.our_bid_usd}/u` : "—" },
          { label: "LANDED", value: landed > 0 ? fmtAED(landed) : "—" },
        ].map(it => (
          <div key={it.label} style={{ background: "#F8FAFC", borderRadius: 8, padding: "5px 8px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.3 }}>{it.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{it.value}</div>
          </div>
        ))}
      </div>

      {/* profit */}
      {profit !== null && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "#64748B" }}>Expected profit</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: profit >= 0 ? "#059669" : "#DC2626" }}>
            {profit >= 0 ? "+" : ""}{fmtAED(profit)}
          </span>
        </div>
      )}

      {/* deadline warning */}
      {dlRed && (
        <div style={{ marginTop: 8, padding: "4px 10px", borderRadius: 8,
                      background: "#FEF2F2", fontSize: 11, fontWeight: 700, color: "#DC2626" }}>
          ⚠️ Bid deadline in {Math.round(dl)}h
        </div>
      )}
      <div style={{ marginTop: 6, fontSize: 10, color: "#CBD5E1", textAlign: "right" }}>
        {timeAgo(d.created_at)}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  NEW DEAL MODAL
// ══════════════════════════════════════════════════════════════════════════════
function NewDealModal({ suppliers, rate, onClose, onCreate }) {
  const [form, setForm] = useState({
    supplier_id: "", supplier_name: "", lot_name: "", source: "gmail",
    units_total: "", units_bid: "", our_bid_usd: "", bid_deadline: "", notes: "",
  });
  const f = form;
  const total  = Number(f.units_bid) * Number(f.our_bid_usd);
  const estL   = total * rate * 1.10;

  async function save() {
    const name = f.supplier_name.trim() || (suppliers.find(s => s.id === f.supplier_id)?.name || "");
    if (!name) { alert("Supplier name is required"); return; }
    const { data, error } = await supabase.from("sourcing_deals").insert({
      supplier_id:   f.supplier_id || null,
      supplier_name: name,
      lot_name:      f.lot_name.trim() || null,
      source:        f.source,
      status:        "evaluating",
      units_total:   Number(f.units_total) || null,
      units_bid:     Number(f.units_bid) || null,
      our_bid_usd:   Number(f.our_bid_usd) || null,
      total_bid_usd: total || null,
      bid_deadline:  f.bid_deadline || null,
      notes:         f.notes.trim() || null,
    }).select().single();
    if (error) { alert("Failed: " + error.message); return; }
    onCreate(data);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
      <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 440 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>New Sourcing Deal</span>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
          </div>

          {/* Supplier */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>SUPPLIER</div>
            {suppliers.length > 0 && (
              <select value={f.supplier_id} onChange={e => {
                const s = suppliers.find(x => x.id === e.target.value);
                setForm(v => ({ ...v, supplier_id: e.target.value, supplier_name: s?.name || "" }));
              }} style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", background: "#fff", marginBottom: 6 }}>
                <option value="">— Select supplier —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <input value={f.supplier_name} onChange={e => setForm(v => ({ ...v, supplier_name: e.target.value, supplier_id: "" }))}
              placeholder="Or type supplier name"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>

          {[
            { label: "LOT NAME / REFERENCE",    key: "lot_name",   ph: "e.g. 50× Dell Latitude 5420 i5 8GB" },
            { label: "TOTAL UNITS IN LOT",      key: "units_total",ph: "e.g. 100", type: "number" },
            { label: "UNITS WE'RE BIDDING ON",  key: "units_bid",  ph: "e.g. 50",  type: "number" },
            { label: "OUR BID (USD per unit)",  key: "our_bid_usd",ph: "e.g. 85",  type: "number" },
          ].map(({ label, key, ph, type }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
              <input type={type || "text"} value={f[key]} onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))} placeholder={ph}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}

          {f.units_bid && f.our_bid_usd && (
            <div style={{ marginBottom: 12, padding: "10px 14px", background: "#ECFDF5", borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>
                Total: {fmtUSD(total)} = {fmtAED(total * rate)}
              </div>
              <div style={{ fontSize: 11, color: "#059669", marginTop: 2 }}>
                Est. landed (+10%): {fmtAED(estL)}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>BID DEADLINE</div>
            <input type="datetime-local" value={f.bid_deadline} onChange={e => setForm(v => ({ ...v, bid_deadline: e.target.value }))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>SOURCE</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[["gmail","📧 Gmail"],["whatsapp","💬 WhatsApp"],["other","Other"]].map(([s,l]) => (
                <button key={s} onClick={() => setForm(v => ({ ...v, source: s }))} style={{
                  flex: 1, padding: "7px 0", borderRadius: 10, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: f.source === s ? "#6366F1" : "#F1F5F9",
                  color:      f.source === s ? "#fff"    : "#64748B",
                }}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>NOTES</div>
            <textarea value={f.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))} rows={2}
              placeholder="Any extra context…"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={save}   style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Create Deal</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  GMAIL SHEET
// ══════════════════════════════════════════════════════════════════════════════
function GmailSheet({ anthropicKey, onClose, onCreateDeal }) {
  const [text,    setText]    = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState("");

  async function analyse() {
    if (!text.trim() || !anthropicKey) return;
    setLoading(true); setResult(null); setError("");
    try {
      const raw = await callClaude(anthropicKey,
        `Analyse this supplier email for a UAE laptop reseller. Return JSON only:\n{"supplier_name":string,"lot_name":string|null,"units_count":number|null,"bid_deadline":ISO string|null,"summary":"2-3 sentences","suggested_action":"review_list"|"send_bid"|"follow_up"|"track_shipment","milestone":"BID_ACCEPTED"|"INVOICE_RECEIVED"|"TRACKING_RECEIVED"|null}\n\nEmail:\n${text}`);
      setResult(JSON.parse(raw.replace(/```json|```/g, "").trim()));
    } catch { setError("Could not analyse email. Check your API key."); }
    setLoading(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "flex-end" }}>
      <div style={{ background: "#fff", borderRadius: "22px 22px 0 0", padding: 20, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>📧 Check Gmail</div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Paste email — Claude extracts deal info</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
          placeholder="Paste supplier email content here…"
          style={{ width: "100%", padding: "11px 13px", borderRadius: 14, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 12 }} />
        <button onClick={analyse} disabled={loading || !text.trim() || !anthropicKey} style={{
          width: "100%", padding: 12, borderRadius: 12, border: "none", marginBottom: result ? 16 : 0,
          background: loading || !text.trim() ? "#E2E8F0" : "#6366F1",
          color: loading || !text.trim() ? "#94A3B8" : "#fff",
          fontWeight: 800, fontSize: 13, cursor: "pointer",
        }}>
          {loading ? "⏳ Analysing…" : "Analyse with Claude"}
        </button>
        {error && <div style={{ marginTop: 10, background: "#FEF2F2", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#DC2626" }}>{error}</div>}
        {result && (
          <div style={{ background: "#F8FAFC", borderRadius: 14, padding: 14, border: "1px solid #E2E8F0" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>{result.supplier_name || "Unknown"}</div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10, lineHeight: 1.5 }}>{result.summary}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {result.lot_name && <span style={{ fontSize: 11, color: "#475569", background: "#F1F5F9", padding: "2px 8px", borderRadius: 8 }}>{result.lot_name}</span>}
              {result.units_count && <span style={{ fontSize: 11, color: "#6366F1", background: "#EEF2FF", padding: "2px 8px", borderRadius: 8 }}>{result.units_count} units</span>}
              {result.bid_deadline && <span style={{ fontSize: 11, color: "#D97706", background: "#FFFBEB", padding: "2px 8px", borderRadius: 8 }}>Deadline: {result.bid_deadline}</span>}
              {result.milestone && <span style={{ fontSize: 11, color: "#059669", background: "#ECFDF5", padding: "2px 8px", borderRadius: 8 }}>✅ {result.milestone}</span>}
            </div>
            <button onClick={() => onCreateDeal(result)} style={{
              width: "100%", padding: 11, borderRadius: 12, border: "none",
              background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
            }}>
              Create Deal from This Email →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SOURCING DEAL LIST — deals pipeline extracted from SourcingModule
// ══════════════════════════════════════════════════════════════════════════════
export default function SourcingDealList({
  deals,
  loading,
  rate,
  setSelected,
  showNew,
  setShowNew,
  showGmail,
  setShowGmail,
  setPrefillForm,
  prefillForm,
  anthropicKey,
  suppliers,
  setDeals,
}) {
  // ── deals pipeline ─────────────────────────────────────────────────────────
  const grouped      = Object.fromEntries(STAGES.map(s => [s.id, deals.filter(d => d.status === s.id)]));
  const inStockCount = grouped["in_stock"]?.length || 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 14 }}>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setShowGmail(true)} style={{
          flex: 1, padding: "10px 8px", borderRadius: 12,
          border: "1.5px solid #FECACA", background: "#FEF2F2",
          color: "#DC2626", fontWeight: 700, fontSize: 12, cursor: "pointer",
        }}>📧 Check Gmail</button>
        <button onClick={() => { setPrefillForm(null); setShowNew(true); }} style={{
          flex: 1, padding: "10px 8px", borderRadius: 12,
          border: "none", background: "#6366F1",
          color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer",
        }}>+ New Deal</button>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", fontSize: 13 }}>Loading…</div>}

      {!loading && deals.length === 0 && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 36, textAlign: "center",
                      color: "#94A3B8", fontSize: 13, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🌍</div>
          No deals yet.<br />
          <span style={{ fontSize: 12 }}>Tap <strong>+ New Deal</strong> or <strong>Check Gmail</strong> to start.</span>
        </div>
      )}

      {!loading && STAGES.filter(s => s.id !== "in_stock" && grouped[s.id]?.length > 0).map(st => (
        <div key={st.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>{st.emoji}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: st.color, letterSpacing: 0.3 }}>
              {st.label.toUpperCase()}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: st.color,
                           background: st.bg, padding: "1px 8px", borderRadius: 10 }}>
              {grouped[st.id].length}
            </span>
            {st.id === "arrived" && (
              <span style={{ fontSize: 10, color: "#0891B2", fontWeight: 700, marginLeft: "auto" }}>
                Tap to move to stock →
              </span>
            )}
          </div>
          {grouped[st.id].map(deal => (
            <DealCard key={deal.id} deal={deal} rate={rate} onClick={() => setSelected(deal.id)} />
          ))}
        </div>
      ))}

      {!loading && inStockCount > 0 && (
        <div style={{ background: "#F8FAFC", borderRadius: 12, padding: "12px 16px",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      border: "1px solid #E2E8F0" }}>
          <span style={{ fontSize: 12, color: "#64748B" }}>➡️ In Stock (archived)</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B",
                         background: "#F1F5F9", padding: "2px 10px", borderRadius: 10 }}>
            {inStockCount} lot{inStockCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {showNew && (
        <NewDealModal
          suppliers={suppliers}
          rate={rate}
          onClose={() => { setShowNew(false); setPrefillForm(null); }}
          onCreate={newDeal => {
            setDeals(ds => [newDeal, ...ds]);
            setShowNew(false); setPrefillForm(null);
            setSelected(newDeal.id);
          }}
        />
      )}

      {showGmail && (
        <GmailSheet
          anthropicKey={anthropicKey}
          onClose={() => setShowGmail(false)}
          onCreateDeal={extracted => {
            setPrefillForm(extracted);
            setShowGmail(false);
            setShowNew(true);
          }}
        />
      )}
    </div>
  );
}
