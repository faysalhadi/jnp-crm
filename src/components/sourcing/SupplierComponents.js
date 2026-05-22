import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import {
  STAGES, STAGE_MAP, DEFAULT_RATE, DUTY_PCT,
  fmtUSD, fmtAED, timeAgo, calcLanded, calcProfit,
  callClaude, StageBadge, Row
} from "./SourcingHelpers";

// ══════════════════════════════════════════════════════════════════════════════
//  DEAL CARD (pipeline list)
// ══════════════════════════════════════════════════════════════════════════════
export function DealCard({ deal: d, rate, onClick }) {
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

function hoursUntil(ts) {
  if (!ts) return null;
  return (new Date(ts) - Date.now()) / 3_600_000;
}

// ══════════════════════════════════════════════════════════════════════════════
//  NEW DEAL MODAL
// ══════════════════════════════════════════════════════════════════════════════
export function NewDealModal({ suppliers, rate, onClose, onCreate }) {
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
export function GmailSheet({ anthropicKey, onClose, onCreateDeal }) {
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
//  MAIN MODULE
// ══════════════════════════════════════════════════════════════════════════════
// ── Section toggle bar ────────────────────────────────────────────────────────
export function SectionToggle({ section, setSection, deals, suppliers }) {
  return (
    <div style={{ padding: "12px 12px 0", background: "#F8FAFC" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={() => setSection("deals")} style={{
          flex: 1, padding: "10px 8px", borderRadius: 12, border: "none",
          fontWeight: 700, fontSize: 12, cursor: "pointer",
          background: section === "deals" ? "#6366F1" : "#F1F5F9",
          color:      section === "deals" ? "#fff"    : "#64748B",
        }}>
          📋 Deals
          <span style={{
            marginLeft: 6, fontSize: 11,
            background: section === "deals" ? "rgba(255,255,255,0.25)" : "#E2E8F0",
            color:      section === "deals" ? "#fff" : "#64748B",
            padding: "1px 7px", borderRadius: 10,
          }}>
            {deals.filter(d => d.status !== "in_stock").length}
          </span>
        </button>
        <button onClick={() => setSection("suppliers")} style={{
          flex: 1, padding: "10px 8px", borderRadius: 12, border: "none",
          fontWeight: 700, fontSize: 12, cursor: "pointer",
          background: section === "suppliers" ? "#6366F1" : "#F1F5F9",
          color:      section === "suppliers" ? "#fff"    : "#64748B",
        }}>
          👥 Suppliers
          <span style={{
            marginLeft: 6, fontSize: 11,
            background: section === "suppliers" ? "rgba(255,255,255,0.25)" : "#E2E8F0",
            color:      section === "suppliers" ? "#fff" : "#64748B",
            padding: "1px 7px", borderRadius: 10,
          }}>
            {suppliers.length}
          </span>
        </button>
        <button onClick={() => setSection("analyze")} style={{
          flex: 1, padding: "10px 8px", borderRadius: 12, border: "none",
          fontWeight: 700, fontSize: 12, cursor: "pointer",
          background: section === "analyze" ? "#6366F1" : "#F1F5F9",
          color:      section === "analyze" ? "#fff"    : "#64748B",
        }}>
          📊 Analyze
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUPPLIER DETAIL
// ══════════════════════════════════════════════════════════════════════════════
export function SupplierDetail({ supplier, deals, rate, onBack, onSelectDeal, onUpdate }) {
  const [notes,    setNotes]    = useState(supplier.notes || "");
  const [savingNote, setSaving] = useState(false);
  const supDeals = deals.filter(d =>
    d.supplier_id === supplier.id || d.supplier_name === supplier.name
  );
  const wonDeal  = supDeals.filter(d =>
    ["bid_won","payment_due","paid","in_transit","in_customs","arrived","in_stock"].includes(d.status)
  ).length;
  const totalUSD = supDeals.reduce((s, d) => s + (Number(d.our_bid_usd||0) * Number(d.units_bid||0)), 0);
  const totalAED = totalUSD * rate;

  async function saveNotes() {
    setSaving(true);
    const { data } = await supabase.from("customers").update({ notes }).eq("id", supplier.id).select().single();
    if (data) onUpdate(data);
    setSaving(false);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10, border: "none",
          background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", cursor: "pointer", fontSize: 18,
        }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{supplier.name}</div>
          <div style={{ fontSize: 11, color: "#94A3B8" }}>{supplier.location || "—"} · {supplier.currency || "USD"}</div>
        </div>
      </div>

      {/* Contact info */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 10 }}>CONTACT</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {supplier.email && (
            <a href={`mailto:${supplier.email}`} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>📧</span>
              <span style={{ fontSize: 13, color: "#DC2626", fontWeight: 600 }}>{supplier.email}</span>
            </a>
          )}
          {supplier.number && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>💬</span>
              <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 600 }}>{supplier.number}</span>
            </div>
          )}
          {[
            { label: "Location",  value: supplier.location },
            { label: "Currency",  value: supplier.currency },
            { label: "Payment",   value: supplier.payment_method },
          ].filter(it => it.value).map(it => (
            <div key={it.label} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: "#94A3B8" }}>{it.label}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{it.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {[
          { label: "Total deals",  value: supDeals.length, color: "#6366F1", bg: "#EEF2FF" },
          { label: "Won / closed", value: wonDeal,         color: "#059669", bg: "#ECFDF5" },
          { label: "Total value",  value: totalAED >= 1000 ? `AED ${(totalAED/1000).toFixed(0)}k` : `AED ${Math.round(totalAED)}`, color: "#D97706", bg: "#FFFBEB" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color: s.color, opacity: 0.8, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Notes (editable) */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>NOTES / PAYMENT TERMS</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Payment terms, bid schedule, reliability notes…"
          style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0",
                   fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical",
                   fontFamily: "inherit", lineHeight: 1.5 }}
        />
        {notes !== (supplier.notes || "") && (
          <button onClick={saveNotes} disabled={savingNote} style={{
            marginTop: 8, padding: "6px 16px", borderRadius: 8, border: "none",
            background: savingNote ? "#E2E8F0" : "#6366F1",
            color: savingNote ? "#94A3B8" : "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>
            {savingNote ? "Saving…" : "Save Notes"}
          </button>
        )}
      </div>

      {/* Deal history */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>
        DEAL HISTORY ({supDeals.length})
      </div>

      {supDeals.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: 28, textAlign: "center",
                      color: "#CBD5E1", fontSize: 13, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          No deals with this supplier yet
        </div>
      ) : (
        supDeals.map(d => {
          const st     = STAGE_MAP[d.status] || STAGE_MAP["evaluating"];
          const purUSD = Number(d.our_bid_usd||0) * Number(d.units_bid||0);
          return (
            <div key={d.id} onClick={() => onSelectDeal(d.id)}
              style={{ background: "#fff", borderRadius: 14, padding: "12px 14px",
                       boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer",
                       borderLeft: `3px solid ${st.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.lot_name || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                    {d.units_bid ? `${Number(d.units_bid).toLocaleString()} units` : "—"}
                    {purUSD > 0 ? ` · ${fmtUSD(purUSD)}` : ""}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: st.color, background: st.bg,
                               padding: "2px 8px", borderRadius: 8, whiteSpace: "nowrap" }}>
                  {st.emoji} {st.label}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#CBD5E1", textAlign: "right" }}>{timeAgo(d.created_at)}</div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUPPLIERS LIST
// ══════════════════════════════════════════════════════════════════════════════
export function SuppliersList({ suppliers, deals, rate, onSelect, onAdd }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 12 }}>

      <button onClick={onAdd} style={{
        padding: "11px 16px", borderRadius: 12, border: "1.5px dashed #C7D2FE",
        background: "#EEF2FF", color: "#6366F1", fontWeight: 700, fontSize: 13, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>+</span> Add Supplier
      </button>

      {suppliers.length === 0 ? (
        <div style={{ background: "#fff", borderRadius: 16, padding: 36, textAlign: "center",
                      color: "#CBD5E1", fontSize: 13, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>👥</div>
          No suppliers yet.<br />
          <span style={{ fontSize: 12 }}>Run the setup SQL or tap Add Supplier.</span>
        </div>
      ) : (
        suppliers.map(s => {
          const supDeals = deals.filter(d => d.supplier_id === s.id || d.supplier_name === s.name);
          const active   = supDeals.filter(d => !["in_stock","evaluating"].includes(d.status)).length;
          const won      = supDeals.filter(d => ["bid_won","payment_due","paid","in_transit","in_customs","arrived","in_stock"].includes(d.status)).length;
          const totalUSD = supDeals.reduce((acc, d) => acc + Number(d.our_bid_usd||0)*Number(d.units_bid||0), 0);
          const lastDeal = [...supDeals].sort((a,b) => new Date(b.created_at)-new Date(a.created_at))[0];

          return (
            <div key={s.id} onClick={() => onSelect(s.id)} style={{
              background: "#fff", borderRadius: 16, padding: 14,
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer",
            }}>
              {/* Name + location */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                    {s.location || "—"} · {s.currency || "USD"}
                  </div>
                </div>
                {active > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", background: "#EEF2FF",
                                 padding: "2px 8px", borderRadius: 8, flexShrink: 0 }}>
                    {active} active
                  </span>
                )}
              </div>

              {/* Email */}
              {s.email && (
                <div style={{ fontSize: 11, color: "#DC2626", marginBottom: 6,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  📧 {s.email}
                </div>
              )}

              {/* Stats row */}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <div style={{ flex: 1, background: "#F8FAFC", borderRadius: 8, padding: "5px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{supDeals.length}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8" }}>DEALS</div>
                </div>
                <div style={{ flex: 1, background: "#F8FAFC", borderRadius: 8, padding: "5px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#059669" }}>{won}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8" }}>WON</div>
                </div>
                <div style={{ flex: 2, background: "#F8FAFC", borderRadius: 8, padding: "5px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#D97706" }}>
                    {totalUSD > 0 ? `$${totalUSD >= 1000 ? (totalUSD/1000).toFixed(0)+"k" : Math.round(totalUSD)}` : "—"}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8" }}>TOTAL SOURCED</div>
                </div>
                {lastDeal && (
                  <div style={{ flex: 2, background: "#F8FAFC", borderRadius: 8, padding: "5px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B" }}>{timeAgo(lastDeal.created_at)}</div>
                    <div style={{ fontSize: 9, fontWeight: 600, color: "#94A3B8" }}>LAST DEAL</div>
                  </div>
                )}
              </div>

              {s.notes && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#64748B", lineHeight: 1.4,
                              overflow: "hidden", display: "-webkit-box",
                              WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {s.notes}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  ADD SUPPLIER MODAL
// ══════════════════════════════════════════════════════════════════════════════
export function AddSupplierModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name: "", email: "", whatsapp: "", location: "", currency: "USD", payment_method: "", notes: "",
  });
  const f = form;

  async function save() {
    if (!f.name.trim()) { alert("Name is required"); return; }
    const notesVal = [f.notes.trim(), f.payment_method.trim() ? `Payment: ${f.payment_method.trim()}` : ""].filter(Boolean).join("\n") || null;
    const { data, error } = await supabase.from("customers").insert({
      name:         f.name.trim(),
      email:        f.email.trim()    || null,
      number:       f.whatsapp.trim() || null,
      location:     f.location.trim() || null,
      currency:     f.currency || "USD",
      notes:        notesVal,
      contact_type: "supplier",
    }).select().single();
    if (error) { alert("Failed: " + error.message); return; }
    onCreate(data);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
      <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 440 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>Add Supplier</span>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
          </div>

          {[
            { label: "NAME *",          key: "name",           ph: "e.g. Electro Computer Warehouse" },
            { label: "EMAIL",           key: "email",          ph: "e.g. sobia@example.com" },
            { label: "WHATSAPP",        key: "whatsapp",       ph: "e.g. +1 555 000 0000" },
            { label: "LOCATION",        key: "location",       ph: "e.g. Texas, USA" },
            { label: "PAYMENT METHOD",  key: "payment_method", ph: "e.g. Wire transfer, PayPal" },
          ].map(({ label, key, ph }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
              <input value={f[key]} onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))} placeholder={ph}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>CURRENCY</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["USD", "GBP", "EUR", "AED"].map(c => (
                <button key={c} onClick={() => setForm(v => ({ ...v, currency: c }))} style={{
                  flex: 1, padding: "7px 0", borderRadius: 10, border: "none",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: f.currency === c ? "#6366F1" : "#F1F5F9",
                  color:      f.currency === c ? "#fff"    : "#64748B",
                }}>{c}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>NOTES / PAYMENT TERMS</div>
            <textarea value={f.notes} onChange={e => setForm(v => ({ ...v, notes: e.target.value }))} rows={3}
              placeholder="e.g. Wire transfer before release. Bid deadline Mondays 12PM CDT."
              style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={save}   style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Add Supplier</button>
          </div>
        </div>
      </div>
    </div>
  );
}
