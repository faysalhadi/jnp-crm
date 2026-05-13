import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

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
const RATE     = 3.67;   // 1 USD = 3.67 AED
const DUTY_PCT = 0.05;   // 5% import duty

// ── Financial helpers ─────────────────────────────────────────────────────────
function calcLanded(d, rate) {
  const r          = rate || RATE;
  const purchaseAED = Number(d.our_bid_usd || 0) * Number(d.units_bid || 0) * r;
  const shipping    = Number(d.shipping_cost_aed || 0);
  const duty        = purchaseAED * DUTY_PCT;
  return purchaseAED + shipping + duty;
}

function calcProfit(d, rate) {
  const landed  = d.landed_cost_aed > 0 ? Number(d.landed_cost_aed) : calcLanded(d, rate);
  const revenue = Number(d.expected_revenue_aed || 0);
  return revenue > 0 ? revenue - landed : null;
}

// ── Formatting ────────────────────────────────────────────────────────────────
function fmtUSD(n) {
  if (!n) return "—";
  return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function fmtAED(n) {
  if (!n && n !== 0) return "—";
  return "AED " + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
function hoursUntil(ts) {
  if (!ts) return null;
  return (new Date(ts) - Date.now()) / 3_600_000;
}
function timeAgo(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (m < 60)  return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

// ── Claude API call ───────────────────────────────────────────────────────────
async function callClaude(apiKey, userPrompt, system) {
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
      max_tokens: 1024,
      system: system || undefined,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text || "";
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StageBadge({ status }) {
  const s = STAGE_MAP[status] || { label: status, color: "#64748B", bg: "#F1F5F9" };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: s.color, background: s.bg,
      padding: "2px 8px", borderRadius: 10, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DEAL CARD
// ══════════════════════════════════════════════════════════════════════════════
function DealCard({ deal, rate, onClick }) {
  const st      = STAGE_MAP[deal.status] || STAGE_MAP["evaluating"];
  const landed  = deal.landed_cost_aed > 0 ? Number(deal.landed_cost_aed) : calcLanded(deal, rate);
  const profit  = calcProfit(deal, rate);
  const dl      = hoursUntil(deal.bid_deadline);
  const dlRed   = dl !== null && dl >= 0 && dl <= 24;
  const totalBid = Number(deal.our_bid_usd || 0) * Number(deal.units_bid || 0);

  return (
    <div onClick={onClick} style={{
      background: "#fff", borderRadius: 14, padding: "12px 14px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.07)", cursor: "pointer",
      borderLeft: `3px solid ${st.color}`, marginBottom: 8,
    }}>
      {/* Row 1 — supplier + source badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 800, color: "#0F172A",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {deal.supplier_name || "—"}
          </div>
          <div style={{
            fontSize: 11, color: "#64748B", marginTop: 2,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {deal.lot_name || "No lot name"}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, flexShrink: 0,
          color:      deal.source === "whatsapp" ? "#16A34A" : "#DC2626",
          background: deal.source === "whatsapp" ? "#F0FDF4"  : "#FEF2F2",
          padding: "2px 7px", borderRadius: 8,
        }}>
          {deal.source === "whatsapp" ? "💬 WA" : "📧 Gmail"}
        </span>
      </div>

      {/* Row 2 — units | bid USD | landed AED */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
        gap: 6, marginTop: 10,
      }}>
        <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "5px 8px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.4 }}>UNITS</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>
            {deal.units_bid ? Number(deal.units_bid).toLocaleString() : "—"}
          </div>
        </div>
        <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "5px 8px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.4 }}>BID (USD)</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>
            {totalBid > 0 ? fmtUSD(totalBid) : deal.our_bid_usd ? `$${deal.our_bid_usd}/u` : "—"}
          </div>
        </div>
        <div style={{ background: "#F8FAFC", borderRadius: 8, padding: "5px 8px" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.4 }}>LANDED</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>
            {landed > 0 ? fmtAED(landed) : "—"}
          </div>
        </div>
      </div>

      {/* Row 3 — profit */}
      {profit !== null && (
        <div style={{
          marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: "#64748B" }}>Expected profit</span>
          <span style={{
            fontSize: 12, fontWeight: 800,
            color: profit >= 0 ? "#059669" : "#DC2626",
          }}>
            {profit >= 0 ? "+" : ""}{fmtAED(profit)}
          </span>
        </div>
      )}

      {/* Deadline warning */}
      {dlRed && (
        <div style={{
          marginTop: 8, padding: "4px 10px", borderRadius: 8,
          background: "#FEF2F2", fontSize: 11, fontWeight: 700, color: "#DC2626",
        }}>
          ⚠️ Bid deadline in {Math.round(dl)}h
        </div>
      )}

      {/* Timestamp */}
      <div style={{ marginTop: 6, fontSize: 10, color: "#CBD5E1", textAlign: "right" }}>
        {timeAgo(deal.created_at)}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DEAL DETAIL
// ══════════════════════════════════════════════════════════════════════════════
function DealDetail({ deal, suppliers, rate, anthropicKey, onBack, onUpdate }) {
  const [messages,     setMessages]    = useState([]);
  const [msgsLoading,  setMsgsLoading] = useState(false);
  const [waText,       setWaText]      = useState("");
  const [waLoading,    setWaLoading]   = useState(false);
  const [showWA,       setShowWA]      = useState(false);
  const [showReply,    setShowReply]   = useState(false);
  const [replyType,    setReplyType]   = useState("Bid Offer");
  const [replyCtx,     setReplyCtx]    = useState("");
  const [replyLoading, setReplyLoading]= useState(false);
  const [gmailReply,   setGmailReply]  = useState("");
  const [waReply,      setWaReply]     = useState("");
  const [showFin,      setShowFin]     = useState(true);
  const [editRate,     setEditRate]    = useState(false);
  const [rateVal,      setRateVal]     = useState(String(rate));
  const [localRate,    setLocalRate]   = useState(rate);
  const [editing,      setEditing]     = useState(false);
  const [editForm,     setEditForm]    = useState({});
  const [showMove,     setShowMove]    = useState(false);
  const [moveForm,     setMoveForm]    = useState({ units_arrived: "", actual_shipping: "", brand: "", model: "" });

  const d  = deal;
  const st = STAGE_MAP[d.status] || STAGE_MAP["evaluating"];
  const purchaseAED = Number(d.our_bid_usd || 0) * Number(d.units_bid || 0) * localRate;
  const shipping    = Number(d.shipping_cost_aed || 0);
  const duty        = purchaseAED * DUTY_PCT;
  const landed      = d.landed_cost_aed > 0 ? Number(d.landed_cost_aed) : purchaseAED + shipping + duty;
  const revenue     = Number(d.expected_revenue_aed || 0);
  const profit      = revenue > 0 ? revenue - landed : null;
  const margin      = profit !== null && revenue > 0 ? (profit / revenue) * 100 : null;
  const dl          = hoursUntil(d.bid_deadline);
  const dlRed       = dl !== null && dl >= 0 && dl <= 24;

  const MILESTONE_MAP = {
    BID_ACCEPTED: "bid_won", PAYMENT_CONFIRMED: "paid",
    TRACKING_RECEIVED: "in_transit", ARRIVED: "arrived",
  };

  useEffect(() => {
    setMsgsLoading(true);
    supabase.from("sourcing_messages").select("*")
      .eq("deal_id", d.id).order("ts", { ascending: true })
      .then(({ data }) => { setMessages(data || []); setMsgsLoading(false); });
  }, [d.id]);

  async function patchDeal(patch) {
    const { data, error } = await supabase.from("sourcing_deals")
      .update(patch).eq("id", d.id).select().single();
    if (error) { alert("Update failed: " + error.message); return; }
    onUpdate(data);
  }

  async function handlePasteWA() {
    if (!waText.trim()) return;
    setWaLoading(true);
    let milestone = null, tracking = null;
    if (anthropicKey) {
      try {
        const raw = await callClaude(anthropicKey,
          `Analyse this WhatsApp message from a laptop supplier. Detect milestone (BID_ACCEPTED, BID_REJECTED, PAYMENT_CONFIRMED, TRACKING_RECEIVED, ARRIVED, INVOICE_RECEIVED, SHIPMENT_DELAYED, OTHER) and extract tracking number if present. Return JSON only: {"milestone":string|null,"tracking":string|null,"summary":string}\n\n${waText}`);
        const p = JSON.parse(raw.replace(/```json|```/g, "").trim());
        milestone = p.milestone !== "OTHER" ? p.milestone : null;
        tracking  = p.tracking;
      } catch {}
    }
    const { data } = await supabase.from("sourcing_messages").insert({
      deal_id: d.id, channel: "whatsapp", direction: "inbound",
      sender: d.supplier_name || "Supplier", content: waText.trim(), milestone,
    }).select().single();
    if (data) setMessages(ms => [...ms, data]);
    const patch = {};
    if (milestone && MILESTONE_MAP[milestone]) patch.status = MILESTONE_MAP[milestone];
    if (tracking) patch.tracking_number = tracking;
    if (Object.keys(patch).length) await patchDeal(patch);
    setWaText(""); setWaLoading(false); setShowWA(false);
  }

  async function handleGmailNote() {
    const note = window.prompt("Paste the Gmail message or note:");
    if (!note?.trim()) return;
    const { data } = await supabase.from("sourcing_messages").insert({
      deal_id: d.id, channel: "gmail", direction: "inbound",
      sender: d.supplier_name || "Supplier", content: note.trim(), milestone: null,
    }).select().single();
    if (data) setMessages(ms => [...ms, data]);
  }

  async function generateReply() {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setReplyLoading(true); setGmailReply(""); setWaReply("");
    const ctx = `Supplier: ${d.supplier_name}\nLot: ${d.lot_name || "—"}\nStatus: ${d.status}\nUnits: ${d.units_bid || "—"}\nBid: $${d.our_bid_usd || "—"} USD/unit\nContext: ${replyCtx || "—"}\nReply type: ${replyType}`;
    try {
      const raw = await callClaude(anthropicKey,
        `${ctx}\n\nWrite TWO reply versions. Return JSON only:\n{"gmail":"formal 3-5 sentence email, sign off: Best regards, Faisal Hadi, Laptop for Less, UAE","whatsapp":"casual 2-3 lines max, 1-2 emojis, no formal signoff"}`,
        "You write supplier communications for Laptop for Less, a UAE laptop reseller in Sharjah. Owner: Faisal Hadi. Be precise about specs and quantities."
      );
      const p = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setGmailReply(p.gmail || ""); setWaReply(p.whatsapp || "");
    } catch { setGmailReply("Error generating — check your API key."); }
    setReplyLoading(false);
  }

  async function handleMoveToStock() {
    const units    = Number(moveForm.units_arrived) || Number(d.units_bid) || 1;
    const shipping = Number(moveForm.actual_shipping) || Number(d.shipping_cost_aed) || 0;
    const pAED     = Number(d.our_bid_usd || 0) * units * localRate;
    const totalLanded = pAED + shipping + pAED * DUTY_PCT;
    const costPer  = Math.round(totalLanded / units);
    const rows     = Array.from({ length: units }, () => ({
      brand: moveForm.brand || "", model: moveForm.model || d.lot_name || "",
      cost_price: costPer, min_price: Math.round(costPer * 1.1),
      max_price: Math.round(costPer * 1.2), status: "available", condition: "Used",
      notes: `Lot: ${d.lot_name || "—"} | Supplier: ${d.supplier_name}`,
    }));
    const { error } = await supabase.from("stock").insert(rows);
    if (error) { alert("Stock insert failed: " + error.message); return; }
    await patchDeal({ status: "in_stock" });
    setShowMove(false);
    alert(`✅ ${units} device${units !== 1 ? "s" : ""} added to stock at AED ${costPer}/unit.`);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10, border: "none",
          background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
          cursor: "pointer", fontSize: 18,
        }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.supplier_name || "—"}
          </div>
          <div style={{ fontSize: 11, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.lot_name || "No lot name"}
          </div>
        </div>
        <StageBadge status={d.status} />
      </div>

      {/* ── Stage selector ── */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>PIPELINE STAGE</div>
        <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
          {STAGES.filter(s => s.id !== "in_stock").map(s => {
            const active = d.status === s.id;
            return (
              <button key={s.id} onClick={() => patchDeal({ status: s.id })} style={{
                flexShrink: 0, padding: "5px 10px", borderRadius: 12, border: "none",
                fontSize: 10, fontWeight: 700, cursor: "pointer",
                background: active ? s.color : s.bg, color: active ? "#fff" : s.color,
              }}>
                {s.emoji} {s.label}
              </button>
            );
          })}
        </div>
        {d.status === "arrived" && (
          <button onClick={() => {
            setMoveForm({ units_arrived: String(d.units_bid || ""), actual_shipping: String(d.shipping_cost_aed || ""), brand: "", model: d.lot_name || "" });
            setShowMove(true);
          }} style={{
            width: "100%", marginTop: 12, padding: 10, borderRadius: 12, border: "none",
            background: "#0891B2", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
          }}>
            📦 Move to Your Stock
          </button>
        )}
      </div>

      {/* ── Deal info ── */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>DEAL INFO</div>
          <button onClick={() => { setEditing(!editing); setEditForm({ ...d }); }} style={{
            padding: "3px 10px", borderRadius: 8, border: "none",
            background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}>
            {editing ? "Cancel" : "✏️ Edit"}
          </button>
        </div>

        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "LOT NAME",         key: "lot_name" },
              { label: "UNITS TOTAL",      key: "units_total",   type: "number" },
              { label: "UNITS BID",        key: "units_bid",     type: "number" },
              { label: "BID (USD/unit)",   key: "our_bid_usd",   type: "number" },
              { label: "TRACKING #",       key: "tracking_number" },
              { label: "ETA DATE",         key: "eta_date",      type: "date" },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                <input type={type || "text"} value={editForm[key] || ""}
                  onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>BID DEADLINE</div>
              <input type="datetime-local" value={editForm.bid_deadline?.slice(0, 16) || ""}
                onChange={e => setEditForm(f => ({ ...f, bid_deadline: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>NOTES</div>
              <textarea value={editForm.notes || ""} rows={2}
                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <button onClick={async () => { await patchDeal(editForm); setEditing(false); }} style={{
              padding: 9, borderRadius: 10, border: "none", background: "#6366F1",
              color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              Save Changes
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "SOURCE",      value: d.source === "whatsapp" ? "💬 WhatsApp" : "📧 Gmail" },
                { label: "UNITS BID",   value: d.units_bid ? Number(d.units_bid).toLocaleString() : "—" },
                { label: "BID/UNIT",    value: d.our_bid_usd ? `$${Number(d.our_bid_usd).toLocaleString()}/u` : "—" },
                { label: "TOTAL BID",   value: d.total_bid_usd ? fmtUSD(d.total_bid_usd) : (d.our_bid_usd && d.units_bid ? fmtUSD(d.our_bid_usd * d.units_bid) : "—") },
                { label: "TRACKING #",  value: d.tracking_number || "—" },
                { label: "ETA",         value: d.eta_date ? new Date(d.eta_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—" },
              ].map((it, i) => (
                <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>{it.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{it.value}</div>
                </div>
              ))}
            </div>
            {d.notes && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "#F8FAFC", borderRadius: 10, fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                {d.notes}
              </div>
            )}
            {dlRed && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>
                  ⚠️ Deadline: {new Date(d.bid_deadline).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })} ({Math.round(dl)}h left)
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Timeline ── */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 10 }}>COMMUNICATION TIMELINE</div>
        {msgsLoading ? (
          <div style={{ textAlign: "center", padding: 20, color: "#94A3B8", fontSize: 12 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "#CBD5E1", fontSize: 12 }}>No messages yet</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map(msg => {
              const isGmail = msg.channel === "gmail";
              const isOut   = msg.direction === "outbound";
              return (
                <div key={msg.id} style={{ display: "flex", gap: 10, paddingBottom: 10, borderBottom: "1px solid #F1F5F9" }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: isGmail ? "#FEF2F2" : "#F0FDF4",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, flexShrink: 0,
                  }}>
                    {isGmail ? "📧" : "💬"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: isGmail ? "#DC2626" : "#16A34A" }}>
                        {isOut ? "You" : (msg.sender || "Supplier")}
                      </span>
                      <span style={{ fontSize: 10, color: "#94A3B8" }}>{timeAgo(msg.ts)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, wordBreak: "break-word" }}>{msg.content}</div>
                    {msg.milestone && (
                      <span style={{
                        display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 700,
                        color: "#059669", background: "#ECFDF5", padding: "2px 8px", borderRadius: 8,
                      }}>
                        ✅ {msg.milestone.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button onClick={() => setShowWA(true)} style={{
            flex: 1, padding: 9, borderRadius: 10,
            border: "1.5px solid #BBF7D0", background: "#F0FDF4",
            color: "#16A34A", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>💬 Paste WhatsApp</button>
          <button onClick={handleGmailNote} style={{
            flex: 1, padding: 9, borderRadius: 10,
            border: "1.5px solid #FECACA", background: "#FEF2F2",
            color: "#DC2626", fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}>📧 Add Gmail Note</button>
        </div>
      </div>

      {/* ── Financials ── */}
      <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showFin ? 12 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>FINANCIALS</div>
          <button onClick={() => setShowFin(v => !v)} style={{
            padding: "3px 10px", borderRadius: 8, border: "none",
            background: "#F1F5F9", color: "#64748B", fontSize: 11, cursor: "pointer",
          }}>
            {showFin ? "Hide" : "Show"}
          </button>
        </div>
        {showFin && (
          <>
            {/* exchange rate */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "7px 12px", background: "#EEF2FF", borderRadius: 10 }}>
              <span style={{ fontSize: 12, color: "#4338CA", fontWeight: 600 }}>1 USD =</span>
              {editRate ? (
                <input value={rateVal} onChange={e => setRateVal(e.target.value)} autoFocus
                  onBlur={() => { const v = parseFloat(rateVal); if (!isNaN(v) && v > 0) setLocalRate(v); setEditRate(false); }}
                  style={{ width: 64, padding: "2px 6px", borderRadius: 6, border: "1.5px solid #6366F1", fontSize: 12, outline: "none" }} />
              ) : (
                <span style={{ fontSize: 12, fontWeight: 800, color: "#4338CA" }}>{localRate} AED</span>
              )}
              <button onClick={() => { setRateVal(String(localRate)); setEditRate(true); }}
                style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 6, border: "none", background: "#C7D2FE", color: "#4338CA", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                Edit
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13 }}>
              <Row label="Purchase" value={purchaseAED > 0 ? `${fmtUSD(d.our_bid_usd * d.units_bid)} = ${fmtAED(purchaseAED)}` : "—"} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#64748B" }}>Shipping (AED)</span>
                <input defaultValue={d.shipping_cost_aed || ""}
                  onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) patchDeal({ shipping_cost_aed: v }); }}
                  placeholder="0"
                  style={{ width: 90, padding: "3px 8px", borderRadius: 6, border: "1.5px solid #E2E8F0", fontSize: 12, textAlign: "right", outline: "none" }} />
              </div>
              <Row label="Import duty (5%)" value={fmtAED(duty)} />
              <div style={{ height: 1, background: "#E2E8F0" }} />
              <Row label="Total landed" value={fmtAED(landed)} bold />
              <Row label="Cost per unit" value={d.units_bid > 0 ? fmtAED(landed / d.units_bid) : "—"} />
              <div style={{ height: 1, background: "#E2E8F0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#64748B" }}>Expected revenue (AED)</span>
                <input defaultValue={d.expected_revenue_aed || ""}
                  onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) patchDeal({ expected_revenue_aed: v }); }}
                  placeholder="0"
                  style={{ width: 90, padding: "3px 8px", borderRadius: 6, border: "1.5px solid #E2E8F0", fontSize: 12, textAlign: "right", outline: "none" }} />
              </div>
              {profit !== null && <>
                <Row label="Gross profit" value={fmtAED(profit)} color={profit >= 0 ? "#059669" : "#DC2626"} bold />
                <Row label="Margin" value={`${margin.toFixed(1)}%`} color={margin >= 15 ? "#059669" : margin >= 5 ? "#D97706" : "#DC2626"} />
              </>}
            </div>
          </>
        )}
      </div>

      {/* Generate reply button */}
      <button onClick={() => { setReplyCtx(""); setReplyType("Bid Offer"); setGmailReply(""); setWaReply(""); setShowReply(true); }}
        style={{ padding: 13, borderRadius: 14, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
        ✍️ Generate Reply
      </button>

      {/* WhatsApp paste modal */}
      {showWA && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>💬 Paste WhatsApp Message</span>
              <button onClick={() => setShowWA(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
            </div>
            <textarea value={waText} onChange={e => setWaText(e.target.value)} rows={5}
              placeholder="Paste the WhatsApp message here…"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 12 }} />
            <button onClick={handlePasteWA} disabled={waLoading || !waText.trim()} style={{
              width: "100%", padding: 12, borderRadius: 12, border: "none",
              background: waLoading || !waText.trim() ? "#E2E8F0" : "#16A34A",
              color: waLoading || !waText.trim() ? "#94A3B8" : "#fff",
              fontWeight: 800, fontSize: 13, cursor: "pointer",
            }}>
              {waLoading ? "⏳ Analysing…" : "Add to Timeline"}
            </button>
          </div>
        </div>
      )}

      {/* Reply generator modal */}
      {showReply && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 16, fontWeight: 800 }}>✍️ Generate Reply</span>
                <button onClick={() => setShowReply(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#475569" }}>
                <strong>{d.supplier_name}</strong> · {d.lot_name || "—"} · {d.units_bid || "—"} units · ${d.our_bid_usd || "—"}/unit
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>REPLY TYPE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {["Bid Offer", "Counter Offer", "Request Inventory List", "Ask Shipping Quote", "Payment Confirmation", "Chase Tracking", "Custom"].map(t => (
                  <button key={t} onClick={() => setReplyType(t)} style={{
                    padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: replyType === t ? "#6366F1" : "#F1F5F9",
                    color:      replyType === t ? "#fff"    : "#64748B",
                  }}>{t}</button>
                ))}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>ADDITIONAL CONTEXT</div>
              <textarea value={replyCtx} onChange={e => setReplyCtx(e.target.value)} rows={2}
                placeholder='e.g. "Accept bid, ask for invoice"'
                style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 14 }} />
              <button onClick={generateReply} disabled={replyLoading} style={{
                width: "100%", padding: 12, borderRadius: 12, border: "none",
                background: replyLoading ? "#E2E8F0" : "#6366F1",
                color: replyLoading ? "#94A3B8" : "#fff",
                fontWeight: 800, fontSize: 14, cursor: "pointer", marginBottom: 16,
              }}>
                {replyLoading ? "⏳ Generating…" : "Generate Both Versions"}
              </button>
              {gmailReply && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", marginBottom: 6 }}>📧 GMAIL VERSION</div>
                  <div style={{ background: "#FEF2F2", borderRadius: 10, padding: 12, fontSize: 12, color: "#0F172A", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 6 }}>{gmailReply}</div>
                  <button onClick={() => navigator.clipboard.writeText(gmailReply)}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#F1F5F9", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    📋 Copy Gmail
                  </button>
                </div>
              )}
              {waReply && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", marginBottom: 6 }}>💬 WHATSAPP VERSION</div>
                  <div style={{ background: "#F0FDF4", borderRadius: 10, padding: 12, fontSize: 12, color: "#0F172A", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 6 }}>{waReply}</div>
                  <button onClick={() => navigator.clipboard.writeText(waReply)}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#F1F5F9", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    📋 Copy WhatsApp
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Move to stock modal */}
      {showMove && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>📦 Move to Stock</span>
              <button onClick={() => setShowMove(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ background: "#EEF2FF", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#4338CA" }}>
              {d.lot_name || "—"} · {d.supplier_name}
            </div>
            {[
              { label: "UNITS ARRIVED",              key: "units_arrived",    ph: "e.g. 50" },
              { label: "ACTUAL SHIPPING PAID (AED)", key: "actual_shipping",  ph: "e.g. 2500" },
              { label: "BRAND",                      key: "brand",            ph: "e.g. Dell" },
              { label: "MODEL",                      key: "model",            ph: "e.g. Latitude 5400" },
            ].map(({ label, key, ph }) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                <input value={moveForm[key]} onChange={e => setMoveForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <button onClick={handleMoveToStock} style={{
              width: "100%", padding: 12, borderRadius: 12, border: "none",
              background: "#0891B2", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
            }}>
              ✅ Confirm & Add to Stock
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// tiny helper for financials rows
function Row({ label, value, bold, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#64748B" }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 600, color: color || "#0F172A" }}>{value}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW DEAL MODAL
// ══════════════════════════════════════════════════════════════════════════════
function NewDealModal({ suppliers, rate, onClose, onCreate }) {
  const empty = { supplier_id: "", supplier_name: "", lot_name: "", source: "gmail",
                  units_total: "", units_bid: "", our_bid_usd: "", bid_deadline: "", notes: "" };
  const [form, setForm] = useState(empty);
  const f = form;
  const totalBid  = Number(f.units_bid) * Number(f.our_bid_usd);
  const estLanded = totalBid * rate * 1.10;

  async function save() {
    const supName = f.supplier_name.trim() || (suppliers.find(s => s.id === f.supplier_id)?.name || "");
    if (!supName) { alert("Supplier name is required"); return; }
    const unitsBid = Number(f.units_bid) || null;
    const ourBid   = Number(f.our_bid_usd) || null;
    const { data, error } = await supabase.from("sourcing_deals").insert({
      supplier_id:   f.supplier_id || null,
      supplier_name: supName,
      lot_name:      f.lot_name.trim() || null,
      source:        f.source,
      status:        "evaluating",
      units_total:   Number(f.units_total) || null,
      units_bid:     unitsBid,
      our_bid_usd:   ourBid,
      total_bid_usd: unitsBid && ourBid ? unitsBid * ourBid : null,
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
            { label: "LOT NAME / REFERENCE",   key: "lot_name",   ph: "e.g. 50× Dell Latitude 5420 i5 8GB" },
            { label: "TOTAL UNITS IN LOT",     key: "units_total",ph: "e.g. 100", type: "number" },
            { label: "UNITS WE'RE BIDDING ON", key: "units_bid",  ph: "e.g. 50",  type: "number" },
            { label: "OUR BID (USD per unit)", key: "our_bid_usd",ph: "e.g. 85",  type: "number" },
          ].map(({ label, key, ph, type }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
              <input type={type || "text"} value={f[key]} onChange={e => setForm(v => ({ ...v, [key]: e.target.value }))} placeholder={ph}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}

          {/* Auto-calc */}
          {f.units_bid && f.our_bid_usd && (
            <div style={{ marginBottom: 12, padding: "10px 14px", background: "#ECFDF5", borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>
                Total bid: {fmtUSD(totalBid)} = {fmtAED(totalBid * rate)}
              </div>
              <div style={{ fontSize: 11, color: "#059669", marginTop: 2 }}>
                Est. landed (+10% shipping & duty): {fmtAED(estLanded)}
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
              {[["gmail", "📧 Gmail"], ["whatsapp", "💬 WhatsApp"], ["other", "Other"]].map(([s, l]) => (
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
            <button onClick={save}    style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Create Deal</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GMAIL SHEET
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
      <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>📧 Check Gmail</span>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ background: "#FFF7ED", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
          ℹ️ Paste a supplier email below — Claude will extract the deal info automatically.
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={6}
          placeholder="Paste supplier email content here…"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 12 }} />
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
            <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>{result.supplier_name || "Unknown supplier"}</div>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 10, lineHeight: 1.5 }}>{result.summary}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {result.units_count && <span style={{ fontSize: 11, color: "#6366F1", background: "#EEF2FF", padding: "2px 8px", borderRadius: 8 }}>{result.units_count} units</span>}
              {result.bid_deadline && <span style={{ fontSize: 11, color: "#D97706", background: "#FFFBEB", padding: "2px 8px", borderRadius: 8 }}>Deadline: {result.bid_deadline}</span>}
              {result.lot_name && <span style={{ fontSize: 11, color: "#475569", background: "#F1F5F9", padding: "2px 8px", borderRadius: 8 }}>{result.lot_name}</span>}
              {result.milestone && <span style={{ fontSize: 11, color: "#059669", background: "#ECFDF5", padding: "2px 8px", borderRadius: 8 }}>✅ {result.milestone}</span>}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6366F1", marginBottom: 10 }}>
              Suggested: {result.suggested_action?.replace(/_/g, " ")}
            </div>
            <button onClick={() => onCreateDeal(result)} style={{
              width: "100%", padding: 11, borderRadius: 12, border: "none",
              background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
            }}>
              Create Deal from This Email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN MODULE
// ══════════════════════════════════════════════════════════════════════════════
export default function SourcingModule({ anthropicKey, onAddToStock }) {
  const [deals,     setDeals]     = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState(null);   // deal id
  const [showNew,   setShowNew]   = useState(false);
  const [showGmail, setShowGmail] = useState(false);
  const [rate,      setRate]      = useState(RATE);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("sourcing_deals")
      .select("*").order("created_at", { ascending: false });
    setDeals(data || []);
    setLoading(false);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setSuppliers(data || []);
  }, []);

  useEffect(() => { loadDeals(); loadSuppliers(); }, [loadDeals, loadSuppliers]);

  const selectedDeal = deals.find(d => d.id === selected);

  // ── deal detail view ───────────────────────────────────────────────────────
  if (selectedDeal) {
    return (
      <DealDetail
        deal={selectedDeal}
        suppliers={suppliers}
        rate={rate}
        anthropicKey={anthropicKey}
        onBack={() => setSelected(null)}
        onUpdate={updated => {
          setDeals(ds => ds.map(d => d.id === updated.id ? updated : d));
          if (updated.status === "in_stock" && onAddToStock) onAddToStock();
        }}
      />
    );
  }

  // ── pipeline list view ─────────────────────────────────────────────────────
  const grouped = Object.fromEntries(STAGES.map(s => [s.id, deals.filter(d => d.status === s.id)]));
  const inStockCount = grouped["in_stock"]?.length || 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Page title */}
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>🌍 Sourcing</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
          {deals.length} deal{deals.length !== 1 ? "s" : ""} · 1 USD = {rate} AED
        </div>
      </div>

      {/* Action bar */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setShowGmail(true)} style={{
          flex: 1, padding: "10px 8px", borderRadius: 12,
          border: "1.5px solid #FECACA", background: "#FEF2F2",
          color: "#DC2626", fontWeight: 700, fontSize: 12, cursor: "pointer",
        }}>📧 Check Gmail</button>
        <button onClick={() => setShowNew(true)} style={{
          flex: 1, padding: "10px 8px", borderRadius: 12,
          border: "none", background: "#6366F1",
          color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer",
        }}>+ New Deal</button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", fontSize: 13 }}>Loading…</div>
      )}

      {/* Empty state */}
      {!loading && deals.length === 0 && (
        <div style={{
          background: "#fff", borderRadius: 16, padding: 36, textAlign: "center",
          color: "#94A3B8", fontSize: 13, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🌍</div>
          No deals yet.<br />Tap <strong>+ New Deal</strong> or <strong>Check Gmail</strong> to start.
        </div>
      )}

      {/* Pipeline — grouped by stage */}
      {!loading && STAGES.filter(st => st.id !== "in_stock" && grouped[st.id]?.length > 0).map(st => (
        <div key={st.id}>
          {/* Stage header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>{st.emoji}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: st.color, letterSpacing: 0.3 }}>
              {st.label.toUpperCase()}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: st.color,
              background: st.bg, padding: "1px 8px", borderRadius: 10,
            }}>
              {grouped[st.id].length}
            </span>
            {st.id === "arrived" && (
              <span style={{ fontSize: 10, color: "#0891B2", fontWeight: 700, marginLeft: "auto" }}>
                → Ready to add to stock
              </span>
            )}
          </div>

          {grouped[st.id].map(deal => (
            <DealCard
              key={deal.id}
              deal={deal}
              rate={rate}
              onClick={() => setSelected(deal.id)}
            />
          ))}
        </div>
      ))}

      {/* In Stock — archived count */}
      {!loading && inStockCount > 0 && (
        <div style={{
          background: "#F8FAFC", borderRadius: 12, padding: "12px 16px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          border: "1px solid #E2E8F0",
        }}>
          <span style={{ fontSize: 12, color: "#64748B" }}>➡️ In Stock (archived)</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B", background: "#F1F5F9", padding: "2px 10px", borderRadius: 10 }}>
            {inStockCount} lot{inStockCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* New Deal modal */}
      {showNew && (
        <NewDealModal
          suppliers={suppliers}
          rate={rate}
          onClose={() => setShowNew(false)}
          onCreate={newDeal => {
            setDeals(ds => [newDeal, ...ds]);
            setShowNew(false);
            setSelected(newDeal.id);
          }}
        />
      )}

      {/* Gmail sheet */}
      {showGmail && (
        <GmailSheet
          anthropicKey={anthropicKey}
          onClose={() => setShowGmail(false)}
          onCreateDeal={extracted => {
            setShowGmail(false);
            setShowNew(true);
          }}
        />
      )}
    </div>
  );
}

// ── Dashboard alerts hook ─────────────────────────────────────────────────────
export function useSourcingAlerts() {
  const [alerts, setAlerts] = useState({ bidsDue: [], inTransit: 0, arrived: 0, paymentDue: 0 });

  useEffect(() => {
    supabase.from("sourcing_deals")
      .select("id, supplier_name, lot_name, status, bid_deadline")
      .then(({ data }) => {
        const rows = data || [];
        const bidsDue = rows.filter(x =>
          x.status === "evaluating" && x.bid_deadline &&
          hoursUntil(x.bid_deadline) <= 24 && hoursUntil(x.bid_deadline) >= 0
        );
        setAlerts({
          bidsDue,
          inTransit:  rows.filter(x => x.status === "in_transit").length,
          arrived:    rows.filter(x => x.status === "arrived").length,
          paymentDue: rows.filter(x => x.status === "payment_due").length,
        });
      });
  }, []);

  return alerts;
}
