import { useState, useEffect, useCallback, useRef } from "react";
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

// ── The 4 milestones Claude detects ──────────────────────────────────────────
const MILESTONES = {
  BID_ACCEPTED:      { label: "Bid Accepted",       icon: "✅", color: "#059669", bg: "#ECFDF5", nextStatus: "bid_won"     },
  PAYMENT_CONFIRMED: { label: "Payment Confirmed",  icon: "💳", color: "#2563EB", bg: "#DBEAFE", nextStatus: "paid"        },
  TRACKING_RECEIVED: { label: "Tracking Received",  icon: "🚚", color: "#7C3AED", bg: "#EDE9FE", nextStatus: "in_transit"  },
  ARRIVED:           { label: "Arrived",            icon: "📦", color: "#0891B2", bg: "#CFFAFE", nextStatus: "arrived"     },
};

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
function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
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

// ── Small shared components ───────────────────────────────────────────────────
function StageBadge({ status }) {
  const s = STAGE_MAP[status] || { label: status, color: "#64748B", bg: "#F1F5F9", emoji: "" };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg,
                   padding: "3px 10px", borderRadius: 10, whiteSpace: "nowrap" }}>
      {s.emoji} {s.label}
    </span>
  );
}

function MilestoneBadge({ milestone }) {
  const m = MILESTONES[milestone];
  if (!m) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5,
                  marginTop: 6, padding: "4px 10px", borderRadius: 20,
                  background: m.bg, border: `1px solid ${m.color}30` }}>
      <span style={{ fontSize: 13 }}>{m.icon}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color: m.color }}>{m.label}</span>
    </div>
  );
}

// ── Row helper for financials ─────────────────────────────────────────────────
function Row({ label, value, bold, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#64748B" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: color || "#0F172A" }}>{value}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  DEAL DETAIL — timeline + milestone detection
// ══════════════════════════════════════════════════════════════════════════════
function DealDetail({ deal: initialDeal, suppliers, rate, anthropicKey, onBack, onUpdate }) {
  const [deal,       setDeal]       = useState(initialDeal);
  const [messages,   setMessages]   = useState([]);
  const [msgsLoaded, setMsgsLoaded] = useState(false);

  // WhatsApp paste sheet
  const [showPaste,  setShowPaste]  = useState(false);
  const [pasteText,  setPasteText]  = useState("");
  const [pasteStep,  setPasteStep]  = useState("input");   // "input" | "analysing" | "confirm"
  const [detected,   setDetected]   = useState(null);      // { milestone, tracking, summary }

  // stage-update toast
  const [toast,      setToast]      = useState(null);      // string message

  // reply generator
  const [showReply,   setShowReply]   = useState(false);
  const [replyType,   setReplyType]   = useState("Bid Offer");
  const [replyCtx,    setReplyCtx]    = useState("");
  const [replyLoading,setReplyLoading]= useState(false);
  const [gmailReply,  setGmailReply]  = useState("");
  const [waReply,     setWaReply]     = useState("");

  // financials
  const [showFin,    setShowFin]    = useState(true);
  const [localRate,  setLocalRate]  = useState(rate);
  const [editRate,   setEditRate]   = useState(false);
  const [rateInput,  setRateInput]  = useState(String(rate));

  // deal edit
  const [editing,    setEditing]    = useState(false);
  const [editForm,   setEditForm]   = useState({});

  // move to stock
  const [showMove,   setShowMove]   = useState(false);
  const [moveForm,   setMoveForm]   = useState({ units_arrived: "", actual_shipping: "", brand: "", model: "" });

  const timelineRef = useRef(null);
  const d  = deal;
  const st = STAGE_MAP[d.status] || STAGE_MAP["evaluating"];

  // financials
  const purchaseAED = Number(d.our_bid_usd || 0) * Number(d.units_bid || 0) * localRate;
  const shipping    = Number(d.shipping_cost_aed || 0);
  const duty        = purchaseAED * DUTY_PCT;
  const landed      = Number(d.landed_cost_aed) > 0 ? Number(d.landed_cost_aed) : purchaseAED + shipping + duty;
  const revenue     = Number(d.expected_revenue_aed || 0);
  const profit      = revenue > 0 ? revenue - landed : null;
  const margin      = profit !== null && revenue > 0 ? (profit / revenue) * 100 : null;
  const dl          = hoursUntil(d.bid_deadline);
  const dlRed       = dl !== null && dl >= 0 && dl <= 24;

  // load messages
  useEffect(() => {
    supabase.from("sourcing_messages").select("*")
      .eq("deal_id", d.id).order("ts", { ascending: true })
      .then(({ data }) => { setMessages(data || []); setMsgsLoaded(true); });
  }, [d.id]);

  // scroll timeline to bottom when new message added
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [messages]);

  // sync deal from parent when it changes (e.g. stage update)
  useEffect(() => { setDeal(initialDeal); }, [initialDeal]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // ── patch deal in DB + local state ────────────────────────────────────────
  async function patchDeal(patch) {
    const { data, error } = await supabase.from("sourcing_deals")
      .update(patch).eq("id", d.id).select().single();
    if (error) { alert("Update failed: " + error.message); return null; }
    setDeal(data);
    onUpdate(data);
    return data;
  }

  // ── add a message row to sourcing_messages ────────────────────────────────
  async function insertMessage(fields) {
    const { data, error } = await supabase.from("sourcing_messages")
      .insert({ deal_id: d.id, ...fields }).select().single();
    if (error) { alert("Failed to save message: " + error.message); return null; }
    setMessages(ms => [...ms, data]);
    return data;
  }

  // ── STEP 1: user hits "Analyse" ───────────────────────────────────────────
  async function analyseWA() {
    if (!pasteText.trim()) return;
    setPasteStep("analysing");
    if (!anthropicKey) {
      // no key — skip analysis, just add as plain message
      setDetected({ milestone: null, tracking: null, summary: "" });
      setPasteStep("confirm");
      return;
    }
    try {
      const raw = await callClaude(
        anthropicKey,
        `You are analysing a WhatsApp message from a laptop parts supplier.

Detect if the message signals one of these milestones (return exactly these strings or null):
- BID_ACCEPTED  — supplier confirms/accepts our bid
- PAYMENT_CONFIRMED — supplier confirms payment received
- TRACKING_RECEIVED — supplier shares a tracking number or says shipment is dispatched
- ARRIVED — supplier or freight agent says goods have arrived / cleared customs

Also extract tracking number if present.

Message:
"""
${pasteText.trim()}
"""

Return JSON only, no markdown:
{"milestone": "BID_ACCEPTED"|"PAYMENT_CONFIRMED"|"TRACKING_RECEIVED"|"ARRIVED"|null, "tracking": string|null, "summary": "one sentence"}`,
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setDetected(parsed);
    } catch {
      setDetected({ milestone: null, tracking: null, summary: "" });
    }
    setPasteStep("confirm");
  }

  // ── STEP 2: user confirms → save message + update stage ───────────────────
  async function confirmAndAdd() {
    const milestone = detected?.milestone || null;
    const tracking  = detected?.tracking  || null;

    // save message
    await insertMessage({
      channel:   "whatsapp",
      direction: "inbound",
      sender:    d.supplier_name || "Supplier",
      content:   pasteText.trim(),
      milestone,
    });

    // auto-update stage if milestone matches
    const m = milestone ? MILESTONES[milestone] : null;
    if (m) {
      await patchDeal({
        status:           m.nextStatus,
        ...(tracking ? { tracking_number: tracking } : {}),
      });
      showToast(`${m.icon} Stage updated to "${STAGE_MAP[m.nextStatus]?.label}"`);
    } else if (tracking) {
      await patchDeal({ tracking_number: tracking });
      showToast("🚚 Tracking number saved");
    }

    // reset paste sheet
    setPasteText(""); setDetected(null); setPasteStep("input"); setShowPaste(false);
  }

  // ── add Gmail note ────────────────────────────────────────────────────────
  async function addGmailNote() {
    const note = window.prompt("Paste the Gmail message / note:");
    if (!note?.trim()) return;
    await insertMessage({ channel: "gmail", direction: "inbound",
                          sender: d.supplier_name || "Supplier", content: note.trim(), milestone: null });
  }

  // ── generate reply ────────────────────────────────────────────────────────
  async function generateReply() {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setReplyLoading(true); setGmailReply(""); setWaReply("");
    try {
      const raw = await callClaude(
        anthropicKey,
        `Supplier: ${d.supplier_name}\nLot: ${d.lot_name || "—"}\nStatus: ${d.status}\nUnits: ${d.units_bid || "—"}\nBid: $${d.our_bid_usd || "—"}/unit\nContext: ${replyCtx || "—"}\nReply type: ${replyType}

Write TWO reply versions. Return JSON only:
{"gmail":"formal 3-5 sentence email — end with: Best regards, Faisal Hadi, Laptop for Less, UAE","whatsapp":"casual 2-3 lines, max 2 emojis, no signoff"}`,
        "You write supplier communications for Laptop for Less, a UAE laptop reseller in Sharjah. Owner: Faisal Hadi.",
      );
      const p = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setGmailReply(p.gmail || ""); setWaReply(p.whatsapp || "");
    } catch { setGmailReply("Error — check your API key."); }
    setReplyLoading(false);
  }

  // ── move to stock ────────────────────────────────────────────────────────
  async function handleMoveToStock() {
    const units    = Number(moveForm.units_arrived) || Number(d.units_bid) || 1;
    const ship     = Number(moveForm.actual_shipping) || Number(d.shipping_cost_aed) || 0;
    const purAED   = Number(d.our_bid_usd || 0) * units * localRate;
    const totalL   = purAED + ship + purAED * DUTY_PCT;
    const costPer  = Math.round(totalL / units);
    const rows     = Array.from({ length: units }, () => ({
      brand: moveForm.brand || "", model: moveForm.model || d.lot_name || "",
      cost_price: costPer, min_price: Math.round(costPer * 1.1), max_price: Math.round(costPer * 1.2),
      status: "available", condition: "Used",
      notes: `Lot: ${d.lot_name || "—"} | Supplier: ${d.supplier_name}`,
    }));
    const { error } = await supabase.from("stock").insert(rows);
    if (error) { alert("Stock insert failed: " + error.message); return; }
    await patchDeal({ status: "in_stock" });
    setShowMove(false);
    showToast(`✅ ${units} device${units !== 1 ? "s" : ""} added to stock at ${fmtAED(costPer)}/unit`);
  }

  // ── timeline: split messages by channel for rendering ─────────────────────
  const gmailMsgs = messages.filter(m => m.channel === "gmail");
  const waMsgs    = messages.filter(m => m.channel === "whatsapp");

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Fixed header ── */}
      <div style={{ padding: "12px 12px 0", background: "#F8FAFC" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <button onClick={onBack} style={{
            width: 36, height: 36, borderRadius: 10, border: "none",
            background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
            cursor: "pointer", fontSize: 18, flexShrink: 0,
          }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d.supplier_name || "—"}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {d.lot_name || "No lot name"}
            </div>
          </div>
          <StageBadge status={d.status} />
        </div>

        {/* Stage selector */}
        <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10 }}>
          {STAGES.filter(s => s.id !== "in_stock").map(s => {
            const active = d.status === s.id;
            return (
              <button key={s.id} onClick={() => patchDeal({ status: s.id })} style={{
                flexShrink: 0, padding: "5px 11px", borderRadius: 12, border: "none",
                fontSize: 10, fontWeight: 700, cursor: "pointer",
                background: active ? s.color : s.bg, color: active ? "#fff" : s.color,
                boxShadow: active ? `0 2px 6px ${s.color}50` : "none",
                transition: "all 0.15s",
              }}>
                {s.emoji} {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 100px" }}>

        {/* Deadline warning */}
        {dlRed && (
          <div style={{ margin: "10px 0", padding: "9px 14px", borderRadius: 12,
                        background: "#FEF2F2", border: "1px solid #FECACA" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>
              ⚠️ Bid deadline in {Math.round(dl)}h — {new Date(d.bid_deadline).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}
            </span>
          </div>
        )}

        {/* Move to stock banner */}
        {d.status === "arrived" && (
          <button onClick={() => {
            setMoveForm({ units_arrived: String(d.units_bid || ""), actual_shipping: String(d.shipping_cost_aed || ""), brand: "", model: d.lot_name || "" });
            setShowMove(true);
          }} style={{
            width: "100%", margin: "10px 0", padding: "11px",
            borderRadius: 12, border: "none", background: "#0891B2",
            color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
          }}>
            📦 Move to Your Stock →
          </button>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TIMELINE
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ background: "#fff", borderRadius: 16, marginTop: 10,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>

          {/* Timeline header */}
          <div style={{ padding: "13px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>
              TIMELINE
            </div>
            {/* channel counts */}
            <div style={{ display: "flex", gap: 6 }}>
              {gmailMsgs.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", background: "#FEF2F2", padding: "2px 7px", borderRadius: 8 }}>
                  📧 {gmailMsgs.length}
                </span>
              )}
              {waMsgs.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", padding: "2px 7px", borderRadius: 8 }}>
                  💬 {waMsgs.length}
                </span>
              )}
            </div>
          </div>

          {/* Messages list */}
          <div ref={timelineRef} style={{ maxHeight: 380, overflowY: "auto", padding: "10px 12px" }}>
            {!msgsLoaded ? (
              <div style={{ textAlign: "center", padding: 24, color: "#94A3B8", fontSize: 12 }}>Loading…</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: "center", padding: 28, color: "#CBD5E1", fontSize: 13 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                No messages yet.<br />
                <span style={{ fontSize: 12 }}>Paste a WhatsApp message or add a Gmail note below.</span>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isGmail  = msg.channel === "gmail";
                const isOut    = msg.direction === "outbound";
                const prevMsg  = messages[idx - 1];
                const showDate = !prevMsg || new Date(msg.ts).toDateString() !== new Date(prevMsg.ts).toDateString();

                return (
                  <div key={msg.id}>
                    {/* Date separator */}
                    {showDate && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 8px" }}>
                        <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", flexShrink: 0 }}>
                          {new Date(msg.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                        <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
                      </div>
                    )}

                    {/* Message bubble */}
                    <div style={{
                      display: "flex", gap: 9, marginBottom: 12,
                      flexDirection: isOut ? "row-reverse" : "row",
                    }}>
                      {/* Channel icon */}
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                        background: isGmail ? "#FEF2F2" : "#F0FDF4",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, alignSelf: "flex-start",
                        border: `2px solid ${isGmail ? "#FECACA" : "#BBF7D0"}`,
                      }}>
                        {isGmail ? "📧" : "💬"}
                      </div>

                      {/* Bubble content */}
                      <div style={{ maxWidth: "82%", minWidth: 0 }}>
                        {/* sender + time */}
                        <div style={{
                          display: "flex", gap: 6, alignItems: "baseline", marginBottom: 4,
                          flexDirection: isOut ? "row-reverse" : "row",
                        }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: isGmail ? "#DC2626" : "#16A34A",
                          }}>
                            {isOut ? "You" : (msg.sender || "Supplier")}
                          </span>
                          <span style={{ fontSize: 10, color: "#94A3B8" }}>{timeAgo(msg.ts)}</span>
                        </div>

                        {/* bubble */}
                        <div style={{
                          padding: "9px 12px", borderRadius: isOut ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                          background: isGmail
                            ? (isOut ? "#FEF2F2" : "#fff")
                            : (isOut ? "#F0FDF4" : "#fff"),
                          border: `1.5px solid ${isGmail ? "#FECACA" : "#BBF7D0"}`,
                          fontSize: 13, color: "#1E293B", lineHeight: 1.55,
                          wordBreak: "break-word",
                        }}>
                          {msg.content}
                        </div>

                        {/* Milestone badge */}
                        {msg.milestone && MILESTONES[msg.milestone] && (
                          <MilestoneBadge milestone={msg.milestone} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Add message actions */}
          <div style={{ display: "flex", gap: 0, borderTop: "1px solid #F1F5F9" }}>
            <button onClick={() => { setPasteText(""); setPasteStep("input"); setDetected(null); setShowPaste(true); }}
              style={{
                flex: 1, padding: "12px 8px", border: "none", borderRight: "1px solid #F1F5F9",
                background: "#F0FDF4", color: "#16A34A", fontWeight: 700, fontSize: 12, cursor: "pointer",
                borderRadius: "0 0 0 16px",
              }}>
              💬 Paste WhatsApp
            </button>
            <button onClick={addGmailNote}
              style={{
                flex: 1, padding: "12px 8px", border: "none",
                background: "#FEF2F2", color: "#DC2626", fontWeight: 700, fontSize: 12, cursor: "pointer",
                borderRadius: "0 0 16px 0",
              }}>
              📧 Add Gmail Note
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            DEAL INFO (collapsible edit)
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 14, marginTop: 12,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>DEAL INFO</div>
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
                { label: "LOT NAME",        key: "lot_name" },
                { label: "UNITS TOTAL",     key: "units_total",   type: "number" },
                { label: "UNITS BID",       key: "units_bid",     type: "number" },
                { label: "BID (USD/unit)",  key: "our_bid_usd",   type: "number" },
                { label: "TRACKING #",      key: "tracking_number" },
                { label: "ETA DATE",        key: "eta_date",      type: "date" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                  <input type={type || "text"} value={editForm[key] || ""}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 8,
                             border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>BID DEADLINE</div>
                <input type="datetime-local" value={editForm.bid_deadline?.slice(0, 16) || ""}
                  onChange={e => setEditForm(f => ({ ...f, bid_deadline: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8,
                           border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>NOTES</div>
                <textarea value={editForm.notes || ""} rows={2}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8,
                           border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none",
                           boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
              </div>
              <button onClick={async () => { await patchDeal(editForm); setEditing(false); }}
                style={{ padding: 9, borderRadius: 10, border: "none",
                         background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Save Changes
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "SOURCE",     value: d.source === "whatsapp" ? "💬 WhatsApp" : "📧 Gmail" },
                { label: "UNITS BID",  value: d.units_bid ? Number(d.units_bid).toLocaleString() : "—" },
                { label: "BID/UNIT",   value: d.our_bid_usd ? `$${Number(d.our_bid_usd).toLocaleString()}` : "—" },
                { label: "TOTAL BID",  value: d.our_bid_usd && d.units_bid ? fmtUSD(d.our_bid_usd * d.units_bid) : "—" },
                { label: "TRACKING #", value: d.tracking_number || "—" },
                { label: "ETA",        value: d.eta_date ? new Date(d.eta_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—" },
              ].map((it, i) => (
                <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>{it.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{it.value}</div>
                </div>
              ))}
              {d.notes && (
                <div style={{ gridColumn: "1 / -1", padding: "8px 10px", background: "#FFFBEB",
                              borderRadius: 10, fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                  {d.notes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            FINANCIALS
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 14, marginTop: 12,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginBottom: showFin ? 14 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>FINANCIALS</div>
            <button onClick={() => setShowFin(v => !v)} style={{
              padding: "3px 10px", borderRadius: 8, border: "none",
              background: "#F1F5F9", color: "#64748B", fontSize: 11, cursor: "pointer",
            }}>
              {showFin ? "Hide" : "Show"}
            </button>
          </div>
          {showFin && (
            <>
              {/* Exchange rate */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
                            padding: "8px 12px", background: "#EEF2FF", borderRadius: 10 }}>
                <span style={{ fontSize: 12, color: "#4338CA", fontWeight: 600 }}>1 USD =</span>
                {editRate ? (
                  <input value={rateInput} onChange={e => setRateInput(e.target.value)} autoFocus
                    onBlur={() => { const v = parseFloat(rateInput); if (!isNaN(v) && v > 0) setLocalRate(v); setEditRate(false); }}
                    style={{ width: 64, padding: "3px 8px", borderRadius: 6,
                             border: "1.5px solid #6366F1", fontSize: 12, outline: "none" }} />
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#4338CA" }}>{localRate} AED</span>
                )}
                <button onClick={() => { setRateInput(String(localRate)); setEditRate(true); }}
                  style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 6, border: "none",
                           background: "#C7D2FE", color: "#4338CA", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                  Edit
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Row label="Purchase" value={purchaseAED > 0 ? `${fmtUSD(d.our_bid_usd * d.units_bid)} = ${fmtAED(purchaseAED)}` : "—"} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#64748B" }}>Shipping (AED)</span>
                  <input defaultValue={d.shipping_cost_aed || ""}
                    onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) patchDeal({ shipping_cost_aed: v }); }}
                    placeholder="0"
                    style={{ width: 90, padding: "3px 8px", borderRadius: 6,
                             border: "1.5px solid #E2E8F0", fontSize: 12, textAlign: "right", outline: "none" }} />
                </div>
                <Row label="Import duty (5%)" value={fmtAED(duty)} />
                <div style={{ height: 1, background: "#E2E8F0" }} />
                <Row label="Total landed"  value={fmtAED(landed)} bold />
                <Row label="Cost per unit" value={d.units_bid > 0 ? fmtAED(landed / d.units_bid) : "—"} />
                <div style={{ height: 1, background: "#E2E8F0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#64748B" }}>Expected revenue (AED)</span>
                  <input defaultValue={d.expected_revenue_aed || ""}
                    onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) patchDeal({ expected_revenue_aed: v }); }}
                    placeholder="0"
                    style={{ width: 90, padding: "3px 8px", borderRadius: 6,
                             border: "1.5px solid #E2E8F0", fontSize: 12, textAlign: "right", outline: "none" }} />
                </div>
                {profit !== null && <>
                  <Row label="Gross profit" value={fmtAED(profit)} bold color={profit >= 0 ? "#059669" : "#DC2626"} />
                  <Row label="Margin" value={`${margin.toFixed(1)}%`}
                       color={margin >= 15 ? "#059669" : margin >= 5 ? "#D97706" : "#DC2626"} />
                </>}
              </div>
            </>
          )}
        </div>

        {/* Generate Reply button */}
        <button onClick={() => { setReplyCtx(""); setReplyType("Bid Offer"); setGmailReply(""); setWaReply(""); setShowReply(true); }}
          style={{ width: "100%", marginTop: 12, padding: 13, borderRadius: 14, border: "none",
                   background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
          ✍️ Generate Reply
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TOAST NOTIFICATION
      ══════════════════════════════════════════════════════════════════════ */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)",
          background: "#0F172A", color: "#fff", padding: "10px 20px",
          borderRadius: 30, fontSize: 13, fontWeight: 700, zIndex: 999,
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)", whiteSpace: "nowrap",
        }}>
          {toast}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          WHATSAPP PASTE SHEET — 2-step: input → confirm
      ══════════════════════════════════════════════════════════════════════ */}
      {showPaste && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300,
                      display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", borderRadius: "22px 22px 0 0", padding: "20px 20px 32px",
                        width: "100%", maxHeight: "85vh", overflowY: "auto" }}>

            {pasteStep === "input" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>💬 Paste WhatsApp</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Claude will detect milestone &amp; auto-update stage</div>
                  </div>
                  <button onClick={() => setShowPaste(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
                </div>

                {/* Milestone legend */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {Object.entries(MILESTONES).map(([key, m]) => (
                    <span key={key} style={{ fontSize: 10, fontWeight: 700, color: m.color,
                                            background: m.bg, padding: "3px 9px", borderRadius: 10 }}>
                      {m.icon} {m.label}
                    </span>
                  ))}
                </div>

                <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
                  autoFocus rows={6}
                  placeholder="Paste the WhatsApp message from the supplier here…"
                  style={{ width: "100%", padding: "11px 13px", borderRadius: 14,
                           border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none",
                           boxSizing: "border-box", resize: "vertical", fontFamily: "inherit",
                           marginBottom: 12, lineHeight: 1.5 }} />

                <button onClick={analyseWA} disabled={!pasteText.trim()} style={{
                  width: "100%", padding: 13, borderRadius: 14, border: "none",
                  background: !pasteText.trim() ? "#E2E8F0" : "#16A34A",
                  color: !pasteText.trim() ? "#94A3B8" : "#fff",
                  fontWeight: 800, fontSize: 14, cursor: "pointer",
                }}>
                  Analyse &amp; Detect Milestone →
                </button>
              </>
            )}

            {pasteStep === "analysing" && (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>Analysing message…</div>
                <div style={{ fontSize: 12, color: "#94A3B8" }}>Claude is detecting milestones</div>
              </div>
            )}

            {pasteStep === "confirm" && detected && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>Analysis Result</div>
                  <button onClick={() => { setShowPaste(false); setPasteStep("input"); }} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
                </div>

                {/* Message preview */}
                <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 14,
                              padding: "10px 14px", marginBottom: 14, fontSize: 13,
                              color: "#1E293B", lineHeight: 1.5, maxHeight: 120, overflowY: "auto" }}>
                  {pasteText}
                </div>

                {/* Milestone detected */}
                {detected.milestone ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>MILESTONE DETECTED</div>
                    <MilestoneBadge milestone={detected.milestone} />
                    <div style={{ marginTop: 10, padding: "9px 12px", background: "#EEF2FF", borderRadius: 10,
                                  fontSize: 12, color: "#4338CA", fontWeight: 600 }}>
                      → Deal stage will update to <strong>{STAGE_MAP[MILESTONES[detected.milestone].nextStatus]?.label}</strong>
                    </div>
                    {detected.tracking && (
                      <div style={{ marginTop: 8, padding: "7px 12px", background: "#EDE9FE", borderRadius: 10,
                                    fontSize: 12, color: "#7C3AED" }}>
                        🚚 Tracking number: <strong>{detected.tracking}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ marginBottom: 14, padding: "10px 14px", background: "#F8FAFC",
                                borderRadius: 12, fontSize: 12, color: "#64748B" }}>
                    No milestone detected — message will be added to timeline as-is.
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setPasteStep("input")} style={{
                    flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E2E8F0",
                    background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer",
                  }}>← Back</button>
                  <button onClick={confirmAndAdd} style={{
                    flex: 2, padding: 12, borderRadius: 12, border: "none",
                    background: "#16A34A", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer",
                  }}>
                    Add to Timeline ✓
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          REPLY GENERATOR
      ══════════════════════════════════════════════════════════════════════ */}
      {showReply && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>✍️ Generate Reply</span>
                <button onClick={() => setShowReply(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>

              <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#475569" }}>
                <strong>{d.supplier_name}</strong> · {d.lot_name || "—"} · {d.units_bid || "—"} units · ${d.our_bid_usd || "—"}/unit
              </div>

              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>REPLY TYPE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {["Bid Offer","Counter Offer","Request Inventory List","Ask Shipping Quote","Payment Confirmation","Chase Tracking","Custom"].map(t => (
                  <button key={t} onClick={() => setReplyType(t)} style={{
                    padding: "5px 12px", borderRadius: 20, border: "none",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: replyType === t ? "#6366F1" : "#F1F5F9",
                    color:      replyType === t ? "#fff"    : "#64748B",
                  }}>{t}</button>
                ))}
              </div>

              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>ADDITIONAL CONTEXT</div>
              <textarea value={replyCtx} onChange={e => setReplyCtx(e.target.value)} rows={2}
                placeholder='e.g. "Counter at $80/unit, ask about shipping cost"'
                style={{ width: "100%", padding: "9px 11px", borderRadius: 10, border: "1.5px solid #E2E8F0",
                         fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical",
                         fontFamily: "inherit", marginBottom: 14 }} />

              <button onClick={generateReply} disabled={replyLoading} style={{
                width: "100%", padding: 12, borderRadius: 12, border: "none", marginBottom: 16,
                background: replyLoading ? "#E2E8F0" : "#6366F1",
                color: replyLoading ? "#94A3B8" : "#fff",
                fontWeight: 800, fontSize: 14, cursor: "pointer",
              }}>
                {replyLoading ? "⏳ Generating…" : "Generate Gmail + WhatsApp"}
              </button>

              {gmailReply && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", marginBottom: 6 }}>📧 GMAIL VERSION</div>
                  <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12,
                                padding: 13, fontSize: 12, color: "#1E293B", lineHeight: 1.65,
                                whiteSpace: "pre-wrap", marginBottom: 8 }}>{gmailReply}</div>
                  <button onClick={() => navigator.clipboard.writeText(gmailReply)} style={{
                    padding: "6px 14px", borderRadius: 8, border: "none",
                    background: "#F1F5F9", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}>📋 Copy Gmail</button>
                </div>
              )}
              {waReply && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", marginBottom: 6 }}>💬 WHATSAPP VERSION</div>
                  <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 12,
                                padding: 13, fontSize: 12, color: "#1E293B", lineHeight: 1.65,
                                whiteSpace: "pre-wrap", marginBottom: 8 }}>{waReply}</div>
                  <button onClick={() => navigator.clipboard.writeText(waReply)} style={{
                    padding: "6px 14px", borderRadius: 8, border: "none",
                    background: "#F1F5F9", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}>📋 Copy WhatsApp</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MOVE TO STOCK
      ══════════════════════════════════════════════════════════════════════ */}
      {showMove && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300,
                      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 400 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>📦 Move to Stock</span>
              <button onClick={() => setShowMove(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ background: "#CFFAFE", borderRadius: 10, padding: "9px 14px", marginBottom: 14, fontSize: 12, color: "#0891B2", fontWeight: 600 }}>
              {d.lot_name || "—"} · {d.supplier_name}
            </div>
            {[
              { label: "UNITS ARRIVED",               key: "units_arrived",   ph: `e.g. ${d.units_bid || 50}` },
              { label: "ACTUAL SHIPPING PAID (AED)",  key: "actual_shipping", ph: "e.g. 2500" },
              { label: "BRAND",                       key: "brand",           ph: "e.g. Dell" },
              { label: "MODEL",                       key: "model",           ph: "e.g. Latitude 5420" },
            ].map(({ label, key, ph }) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                <input value={moveForm[key]} onChange={e => setMoveForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <button onClick={handleMoveToStock} style={{
              width: "100%", padding: 13, borderRadius: 12, border: "none",
              background: "#0891B2", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
            }}>
              ✅ Confirm &amp; Add to Stock
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
//  MAIN MODULE
// ══════════════════════════════════════════════════════════════════════════════
export default function SourcingModule({ anthropicKey, onAddToStock }) {
  const [deals,     setDeals]     = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [showNew,   setShowNew]   = useState(false);
  const [showGmail, setShowGmail] = useState(false);
  const [rate]                    = useState(DEFAULT_RATE);
  const [prefillForm, setPrefillForm] = useState(null);

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

  const grouped      = Object.fromEntries(STAGES.map(s => [s.id, deals.filter(d => d.status === s.id)]));
  const inStockCount = grouped["in_stock"]?.length || 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 14 }}>

      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>🌍 Sourcing</div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
          {deals.length} deal{deals.length !== 1 ? "s" : ""} · 1 USD = {rate} AED
        </div>
      </div>

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

// ── Dashboard alerts hook ─────────────────────────────────────────────────────
export function useSourcingAlerts() {
  const [alerts, setAlerts] = useState({ bidsDue: [], inTransit: 0, arrived: 0, paymentDue: 0 });
  useEffect(() => {
    supabase.from("sourcing_deals")
      .select("id, supplier_name, lot_name, status, bid_deadline")
      .then(({ data }) => {
        const rows = data || [];
        setAlerts({
          bidsDue:    rows.filter(x => x.status === "evaluating" && x.bid_deadline &&
                                       hoursUntil(x.bid_deadline) <= 24 && hoursUntil(x.bid_deadline) >= 0),
          inTransit:  rows.filter(x => x.status === "in_transit").length,
          arrived:    rows.filter(x => x.status === "arrived").length,
          paymentDue: rows.filter(x => x.status === "payment_due").length,
        });
      });
  }, []);
  return alerts;
}
