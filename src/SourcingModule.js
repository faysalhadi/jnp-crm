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
  const [replyOpen,   setReplyOpen]   = useState(false);
  const [replyType,   setReplyType]   = useState("Bid Offer");
  const [replyCtx,    setReplyCtx]    = useState("");
  const [replyLoading,setReplyLoading]= useState(false);
  const [gmailReply,  setGmailReply]  = useState("");
  const [waReply,     setWaReply]     = useState("");
  const [copiedGmail, setCopiedGmail] = useState(false);
  const [copiedWA,    setCopiedWA]    = useState(false);

  // financials
  const [showFin,      setShowFin]      = useState(true);
  const [localRate,    setLocalRate]    = useState(rate);
  const [editRate,     setEditRate]     = useState(false);
  const [rateInput,    setRateInput]    = useState(String(rate));
  const [localShipping,setLocalShipping]= useState(Number(initialDeal.shipping_cost_aed) || 0);
  const [shipInput,    setShipInput]    = useState(String(Number(initialDeal.shipping_cost_aed) || 0));
  const [localRevenue, setLocalRevenue] = useState(Number(initialDeal.expected_revenue_aed) || 0);
  const [revInput,     setRevInput]     = useState(String(Number(initialDeal.expected_revenue_aed) || 0));

  // deal edit
  const [editing,    setEditing]    = useState(false);
  const [editForm,   setEditForm]   = useState({});

  // move to stock
  const [showMove,   setShowMove]   = useState(false);
  const [moveForm,   setMoveForm]   = useState({
    units_arrived: "", actual_shipping: "",
    brand: "", model: "", processor: "", ram: "", ssd: "", condition: "Used",
  });

  const timelineRef = useRef(null);
  const d  = deal;
  const st = STAGE_MAP[d.status] || STAGE_MAP["evaluating"];

  // financials
  const purchaseUSD = Number(d.our_bid_usd || 0) * Number(d.units_bid || 0);
  const purchaseAED = purchaseUSD * localRate;
  const duty        = purchaseAED * DUTY_PCT;
  const landed      = purchaseAED + localShipping + duty;
  const units       = Number(d.units_bid || 0);
  const costPerUnit = units > 0 ? landed / units : 0;
  const profit      = localRevenue > 0 ? localRevenue - landed : null;
  const margin      = profit !== null && localRevenue > 0 ? (profit / localRevenue) * 100 : null;
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

  // when navigating to a different deal, reset local financial inputs
  useEffect(() => {
    const s = Number(initialDeal.shipping_cost_aed) || 0;
    const r = Number(initialDeal.expected_revenue_aed) || 0;
    setLocalShipping(s); setShipInput(String(s));
    setLocalRevenue(r);  setRevInput(String(r));
  }, [initialDeal.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setReplyLoading(true); setGmailReply(""); setWaReply(""); setCopiedGmail(false); setCopiedWA(false);
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
    const units   = Number(moveForm.units_arrived) || Number(d.units_bid) || 1;
    // Use actual shipping if entered in the form, otherwise fall back to the live calculator value
    const ship    = moveForm.actual_shipping !== "" ? Number(moveForm.actual_shipping) : localShipping;
    // Recalculate landed cost with the confirmed unit count + shipping
    const purAED  = Number(d.our_bid_usd || 0) * units * localRate;
    const duty    = purAED * DUTY_PCT;
    const totalL  = purAED + ship + duty;
    const costPer = Math.round(totalL / units);

    const stockRow = {
      brand:      moveForm.brand     || "",
      model:      moveForm.model     || d.lot_name || "",
      processor:  moveForm.processor || "",
      ram:        moveForm.ram       || "",
      ssd:        moveForm.ssd       || "",
      condition:  moveForm.condition || "Used",
      cost_price: costPer,
      min_price:  Math.round(costPer * 1.10),   // 10% above cost
      max_price:  Math.round(costPer * 1.20),   // 20% above cost
      status:     "available",
      notes:      [
        d.lot_name    ? `Lot: ${d.lot_name}`            : null,
        d.supplier_name ? `Supplier: ${d.supplier_name}` : null,
      ].filter(Boolean).join(" | ") || null,
    };

    // Insert N identical rows (one per device unit)
    const rows = Array.from({ length: units }, () => ({ ...stockRow }));

    // Supabase insert handles arrays; split into chunks of 100 to be safe
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from("stock").insert(rows.slice(i, i + CHUNK));
      if (error) { alert("Stock insert failed: " + error.message); return; }
    }

    // Mark deal as in_stock and persist final shipping
    await patchDeal({ status: "in_stock", shipping_cost_aed: ship, landed_cost_aed: totalL });
    setShowMove(false);
    if (onAddToStock) onAddToStock();
    showToast(`✅ ${units} device${units !== 1 ? "s" : ""} added to stock · Cost ${fmtAED(costPer)}/unit`);
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

        {/* ── Move to Stock banner — shown only when arrived ── */}
        {d.status === "arrived" && (
          <div style={{ margin: "10px 0 4px", padding: "14px 16px", borderRadius: 16,
                        background: "linear-gradient(135deg, #0891B2 0%, #0E7490 100%)",
                        boxShadow: "0 4px 14px rgba(8,145,178,0.35)" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", marginBottom: 4 }}>
              📦 Lot arrived — ready to add to stock
            </div>
            <div style={{ fontSize: 11, color: "#A5F3FC", marginBottom: 10 }}>
              {d.units_bid ? `${Number(d.units_bid).toLocaleString()} units` : "—"}
              {costPerUnit > 0 ? ` · est. cost ${fmtAED(costPerUnit)}/unit` : ""}
            </div>
            <button onClick={() => {
              setMoveForm({
                units_arrived:   String(d.units_bid || ""),
                actual_shipping: String(localShipping || d.shipping_cost_aed || ""),
                brand:     "", model:     d.lot_name || "",
                processor: "", ram:       "", ssd: "", condition: "Used",
              });
              setShowMove(true);
            }} style={{
              padding: "9px 20px", borderRadius: 10, border: "2px solid rgba(255,255,255,0.4)",
              background: "rgba(255,255,255,0.15)", color: "#fff",
              fontWeight: 800, fontSize: 13, cursor: "pointer",
            }}>
              Move to Stock →
            </button>
          </div>
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
            LANDED COST CALCULATOR
        ══════════════════════════════════════════════════════════════════ */}
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

        {/* ── Reply Generator (inline) ── */}
        <div style={{ background: "#fff", borderRadius: 16, marginTop: 12,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>

          {/* Header row — always visible */}
          <button onClick={() => { setReplyOpen(v => !v); setGmailReply(""); setWaReply(""); setCopiedGmail(false); setCopiedWA(false); }}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                     padding: "14px 16px", background: "none", border: "none", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>✍️</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>Reply Generator</span>
              <span style={{ fontSize: 11, color: "#94A3B8" }}>Gmail + WhatsApp</span>
            </div>
            <span style={{ fontSize: 18, color: "#94A3B8", lineHeight: 1 }}>
              {replyOpen ? "▲" : "▼"}
            </span>
          </button>

          {replyOpen && (
            <div style={{ padding: "0 16px 18px", borderTop: "1px solid #F1F5F9" }}>

              {/* Deal context chip */}
              <div style={{ margin: "12px 0", padding: "8px 12px", background: "#F8FAFC",
                            borderRadius: 10, fontSize: 12, color: "#475569" }}>
                <strong>{d.supplier_name}</strong>
                {d.lot_name  && <span> · {d.lot_name}</span>}
                {d.units_bid && <span> · {Number(d.units_bid).toLocaleString()} units</span>}
                {d.our_bid_usd && <span> · ${Number(d.our_bid_usd).toLocaleString()}/unit</span>}
              </div>

              {/* Reply type pills */}
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8",
                            letterSpacing: 0.5, marginBottom: 8 }}>REPLY TYPE</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {[
                  "Bid Offer",
                  "Counter Offer",
                  "Request Inventory",
                  "Ask Shipping Quote",
                  "Payment Confirmation",
                  "Chase Tracking",
                  "Custom",
                ].map(t => (
                  <button key={t} onClick={() => setReplyType(t)} style={{
                    padding: "5px 12px", borderRadius: 20, border: "none",
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: replyType === t ? "#6366F1" : "#F1F5F9",
                    color:      replyType === t ? "#fff"    : "#64748B",
                    transition: "all 0.1s",
                  }}>{t}</button>
                ))}
              </div>

              {/* Context input */}
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8",
                            letterSpacing: 0.5, marginBottom: 6 }}>YOUR CONTEXT <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span></div>
              <textarea
                value={replyCtx}
                onChange={e => setReplyCtx(e.target.value)}
                rows={2}
                placeholder={
                  replyType === "Bid Offer"            ? 'e.g. "Bid $85/unit for 50 units, ask for invoice"' :
                  replyType === "Counter Offer"        ? 'e.g. "Counter at $78/unit, max 40 units"' :
                  replyType === "Chase Tracking"       ? 'e.g. "Payment sent 3 days ago, need tracking"' :
                  replyType === "Ask Shipping Quote"   ? 'e.g. "Need quote for air freight to Dubai"' :
                  'Add any extra context here…'
                }
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10,
                         border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none",
                         boxSizing: "border-box", resize: "vertical", fontFamily: "inherit",
                         marginBottom: 14, lineHeight: 1.5 }}
              />

              {/* Generate button */}
              <button onClick={generateReply} disabled={replyLoading} style={{
                width: "100%", padding: 13, borderRadius: 12, border: "none",
                background: replyLoading ? "#E2E8F0" : "#6366F1",
                color: replyLoading ? "#94A3B8" : "#fff",
                fontWeight: 800, fontSize: 14, cursor: replyLoading ? "default" : "pointer",
                marginBottom: (gmailReply || waReply) ? 18 : 0,
                transition: "background 0.15s",
              }}>
                {replyLoading ? "⏳ Generating both versions…" : "⚡ Generate Gmail + WhatsApp"}
              </button>

              {/* ── Gmail version ── */}
              {gmailReply && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                                alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 15 }}>📧</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#DC2626" }}>Gmail — formal</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(gmailReply);
                        setCopiedGmail(true);
                        setTimeout(() => setCopiedGmail(false), 2000);
                      }}
                      style={{
                        padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer",
                        background: copiedGmail ? "#ECFDF5" : "#F1F5F9",
                        color:      copiedGmail ? "#059669" : "#64748B",
                        fontSize: 11, fontWeight: 700, transition: "all 0.15s",
                      }}
                    >
                      {copiedGmail ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                  <div style={{
                    background: "#FEF2F2", border: "1.5px solid #FECACA",
                    borderRadius: 12, padding: "12px 14px",
                    fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap",
                  }}>
                    {gmailReply}
                  </div>
                </div>
              )}

              {/* ── WhatsApp version ── */}
              {waReply && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between",
                                alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 15 }}>💬</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#16A34A" }}>WhatsApp — short</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(waReply);
                        setCopiedWA(true);
                        setTimeout(() => setCopiedWA(false), 2000);
                      }}
                      style={{
                        padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer",
                        background: copiedWA ? "#ECFDF5" : "#F1F5F9",
                        color:      copiedWA ? "#059669" : "#64748B",
                        fontSize: 11, fontWeight: 700, transition: "all 0.15s",
                      }}
                    >
                      {copiedWA ? "✓ Copied!" : "📋 Copy"}
                    </button>
                  </div>
                  <div style={{
                    background: "#F0FDF4", border: "1.5px solid #BBF7D0",
                    borderRadius: 12, padding: "12px 14px",
                    fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap",
                  }}>
                    {waReply}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
          MOVE TO STOCK
      ══════════════════════════════════════════════════════════════════════ */}
      {showMove && (() => {
        // Live cost preview inside the modal
        const mUnits  = Number(moveForm.units_arrived) || Number(d.units_bid) || 1;
        const mShip   = moveForm.actual_shipping !== "" ? Number(moveForm.actual_shipping) : localShipping;
        const mPurAED = Number(d.our_bid_usd || 0) * mUnits * localRate;
        const mDuty   = mPurAED * DUTY_PCT;
        const mLanded = mPurAED + mShip + mDuty;
        const mCostPer= mUnits > 0 ? Math.round(mLanded / mUnits) : 0;

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
            <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 420 }}>

                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>📦 Move to Stock</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{d.supplier_name} · {d.lot_name || "—"}</div>
                  </div>
                  <button onClick={() => setShowMove(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
                </div>

                {/* ── Section 1: Quantity & shipping ── */}
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>QUANTITY & COST</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "UNITS ARRIVED",      key: "units_arrived",   ph: String(d.units_bid || 0), type: "number" },
                    { label: "SHIPPING PAID (AED)", key: "actual_shipping", ph: String(localShipping || 0), type: "number" },
                  ].map(({ label, key, ph, type }) => (
                    <div key={key}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                      <input type={type} value={moveForm[key]}
                        onChange={e => setMoveForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={ph}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    </div>
                  ))}
                </div>

                {/* Live cost preview */}
                <div style={{ background: "#EEF2FF", borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#4338CA" }}>Purchase ({mUnits} units × ${d.our_bid_usd || 0} × {localRate})</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#4338CA" }}>{fmtAED(mPurAED)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#4338CA" }}>Shipping</span>
                    <span style={{ fontSize: 12, color: "#4338CA" }}>{fmtAED(mShip)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: "#4338CA" }}>Import duty (5%)</span>
                    <span style={{ fontSize: 12, color: "#4338CA" }}>{fmtAED(mDuty)}</span>
                  </div>
                  <div style={{ borderTop: "1px solid #C7D2FE", paddingTop: 6,
                                display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#4338CA" }}>Cost per unit</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "#4338CA" }}>{fmtAED(mCostPer)}</span>
                  </div>
                </div>

                {/* ── Section 2: Device specs ── */}
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>DEVICE SPECS (applied to all units)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  {[
                    { label: "BRAND",     key: "brand",     ph: "e.g. Dell" },
                    { label: "MODEL",     key: "model",     ph: "e.g. Latitude 5420" },
                    { label: "PROCESSOR", key: "processor", ph: "e.g. Core i5 11th" },
                    { label: "RAM",       key: "ram",       ph: "e.g. 8GB" },
                    { label: "STORAGE",   key: "ssd",       ph: "e.g. 256GB SSD" },
                  ].map(({ label, key, ph }) => (
                    <div key={key}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                      <input value={moveForm[key]}
                        onChange={e => setMoveForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={ph}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>CONDITION</div>
                    <select value={moveForm.condition}
                      onChange={e => setMoveForm(f => ({ ...f, condition: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", background: "#fff" }}>
                      {["New", "Like New", "Used", "Refurbished"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "9px 12px", marginBottom: 14, fontSize: 11, color: "#64748B" }}>
                  This will create <strong>{mUnits} stock record{mUnits !== 1 ? "s" : ""}</strong> at <strong>{fmtAED(mCostPer)}/unit</strong> and mark this deal as In Stock.
                </div>

                <button onClick={handleMoveToStock} style={{
                  width: "100%", padding: 13, borderRadius: 12, border: "none",
                  background: "#0891B2", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer",
                }}>
                  ✅ Add {mUnits} Device{mUnits !== 1 ? "s" : ""} to Stock
                </button>
              </div>
            </div>
          </div>
        );
      })()}
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
// ── Section toggle bar ────────────────────────────────────────────────────────
function SectionToggle({ section, setSection, deals, suppliers }) {
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
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  SUPPLIER DETAIL
// ══════════════════════════════════════════════════════════════════════════════
function SupplierDetail({ supplier, deals, rate, onBack, onSelectDeal, onUpdate }) {
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
    const { data } = await supabase.from("suppliers").update({ notes }).eq("id", supplier.id).select().single();
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
          {supplier.whatsapp && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>💬</span>
              <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 600 }}>{supplier.whatsapp}</span>
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
function SuppliersList({ suppliers, deals, rate, onSelect, onAdd }) {
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
function AddSupplierModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name: "", email: "", whatsapp: "", location: "", currency: "USD", payment_method: "", notes: "",
  });
  const f = form;

  async function save() {
    if (!f.name.trim()) { alert("Name is required"); return; }
    const { data, error } = await supabase.from("suppliers").insert({
      name:           f.name.trim(),
      email:          f.email.trim()   || null,
      whatsapp:       f.whatsapp.trim()|| null,
      location:       f.location.trim()|| null,
      currency:       f.currency || "USD",
      payment_method: f.payment_method.trim() || null,
      notes:          f.notes.trim()   || null,
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

// ══════════════════════════════════════════════════════════════════════════════
export default function SourcingModule({ anthropicKey, onAddToStock }) {
  const [deals,       setDeals]       = useState([]);
  const [suppliers,   setSuppliers]   = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [section,     setSection]     = useState("deals");   // "deals" | "suppliers"
  const [selected,    setSelected]    = useState(null);      // deal id
  const [selectedSup, setSelectedSup] = useState(null);      // supplier id
  const [showNew,     setShowNew]     = useState(false);
  const [showAddSup,  setShowAddSup]  = useState(false);
  const [showGmail,   setShowGmail]   = useState(false);
  const [rate]                        = useState(DEFAULT_RATE);
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
  const selectedSupplier = suppliers.find(s => s.id === selectedSup);

  // ── deal detail (from either section) ─────────────────────────────────────
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

  // ── supplier detail ────────────────────────────────────────────────────────
  if (selectedSupplier) {
    return (
      <SupplierDetail
        supplier={selectedSupplier}
        deals={deals}
        rate={rate}
        onBack={() => setSelectedSup(null)}
        onSelectDeal={id => setSelected(id)}
        onUpdate={updated => setSuppliers(ss => ss.map(s => s.id === updated.id ? updated : s))}
      />
    );
  }

  // ── suppliers list ─────────────────────────────────────────────────────────
  if (section === "suppliers") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Section toggle header */}
        <SectionToggle section={section} setSection={setSection} deals={deals} suppliers={suppliers} />
        <SuppliersList
          suppliers={suppliers}
          deals={deals}
          rate={rate}
          onSelect={id => setSelectedSup(id)}
          onAdd={() => setShowAddSup(true)}
        />
        {showAddSup && (
          <AddSupplierModal
            onClose={() => setShowAddSup(false)}
            onCreate={s => { setSuppliers(ss => [...ss, s].sort((a,b) => a.name.localeCompare(b.name))); setShowAddSup(false); }}
          />
        )}
      </div>
    );
  }

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
