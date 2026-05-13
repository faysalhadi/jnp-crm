import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

const STATUSES = [
  { id: "evaluating",   label: "Evaluating",   icon: "🔵", color: "#6366F1", bg: "#EEF2FF" },
  { id: "bid_sent",     label: "Bid Sent",      icon: "🟡", color: "#F59E0B", bg: "#FFFBEB" },
  { id: "bid_won",      label: "Bid Won",        icon: "✅", color: "#10B981", bg: "#ECFDF5" },
  { id: "payment_due",  label: "Payment Due",   icon: "💳", color: "#3B82F6", bg: "#DBEAFE" },
  { id: "paid",         label: "Paid",           icon: "💰", color: "#059669", bg: "#D1FAE5" },
  { id: "in_transit",   label: "In Transit",    icon: "🚚", color: "#8B5CF6", bg: "#EDE9FE" },
  { id: "in_customs",   label: "In Customs",    icon: "🛃", color: "#EC4899", bg: "#FDF2F8" },
  { id: "arrived",      label: "Arrived",        icon: "📦", color: "#06B6D4", bg: "#CFFAFE" },
  { id: "in_stock",     label: "In Stock",       icon: "➡️", color: "#94A3B8", bg: "#F8FAFC" },
];

const STATUS_MAP = Object.fromEntries(STATUSES.map(s => [s.id, s]));

const MILESTONE_TO_STATUS = {
  BID_ACCEPTED: "bid_won",
  PAYMENT_CONFIRMED: "paid",
  TRACKING_RECEIVED: "in_transit",
  ARRIVED: "arrived",
};

const DEFAULT_RATE = 3.67;
const DEFAULT_DUTY = 0.05;

function fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function timeAgo(ts) {
  if (!ts) return "—";
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function hoursUntil(ts) {
  if (!ts) return null;
  return (new Date(ts).getTime() - Date.now()) / 3600000;
}

function StatusPill({ status, small }) {
  const s = STATUS_MAP[status] || { label: status, color: "#64748B", bg: "#F1F5F9", icon: "" };
  return (
    <span style={{ fontSize: small ? 10 : 11, fontWeight: 700, color: s.color, background: s.bg, padding: small ? "2px 6px" : "3px 10px", borderRadius: 10, whiteSpace: "nowrap" }}>
      {s.icon} {s.label}
    </span>
  );
}

function calcFinancials(deal, rate) {
  const r = rate || DEFAULT_RATE;
  const purchaseUSD = Number(deal.our_bid_usd || deal.total_bid_usd || 0);
  const purchaseAED = purchaseUSD * r;
  const shipping = Number(deal.shipping_cost_aed || 0);
  const dutyPct = Number(deal.import_duty_pct != null ? deal.import_duty_pct : DEFAULT_DUTY);
  const duty = purchaseAED * dutyPct;
  const landed = purchaseAED + shipping + duty;
  const units = Number(deal.units_bid || deal.units_total || 1);
  const costPerUnit = units > 0 ? landed / units : 0;
  const revenue = Number(deal.expected_revenue_aed || 0);
  const profit = revenue - landed;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { purchaseUSD, purchaseAED, shipping, duty, landed, units, costPerUnit, revenue, profit, margin };
}

async function callClaude(apiKey, prompt, systemPrompt) {
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
      max_tokens: 1500,
      system: systemPrompt || undefined,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text || "";
}

// ─── MAIN MODULE ─────────────────────────────────────────────────────────────

export default function SourcingModule({ anthropicKey, onAddToStock }) {
  const [section, setSection] = useState("deals");
  const [deals, setDeals] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedDealId, setSelectedDealId] = useState(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);

  const [dealMessages, setDealMessages] = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(false);

  const [exchangeRate, setExchangeRate] = useState(DEFAULT_RATE);
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState(String(DEFAULT_RATE));

  // Modals
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [showReplyGen, setShowReplyGen] = useState(false);
  const [showGmail, setShowGmail] = useState(false);
  const [showMoveStock, setShowMoveStock] = useState(false);
  const [showPasteWA, setShowPasteWA] = useState(false);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [showFinancials, setShowFinancials] = useState(true);

  // New deal form
  const [dealForm, setDealForm] = useState({
    supplier_id: "", supplier_name: "", lot_name: "", source: "gmail",
    units_total: "", units_bid: "", our_bid_usd: "", bid_deadline: "", notes: "",
  });

  // WhatsApp paste
  const [waText, setWaText] = useState("");
  const [waLoading, setWaLoading] = useState(false);

  // Reply generator
  const [replyContext, setReplyContext] = useState("");
  const [replyType, setReplyType] = useState("Bid Offer");
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyGmail, setReplyGmail] = useState("");
  const [replyWA, setReplyWA] = useState("");

  // Gmail
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailResults, setGmailResults] = useState([]);
  const [gmailError, setGmailError] = useState("");
  const [gmailPasteText, setGmailPasteText] = useState("");
  const [gmailPasteMode, setGmailPasteMode] = useState(false);

  // Move to stock
  const [moveForm, setMoveForm] = useState({ units_arrived: "", actual_shipping_aed: "", brand: "", model: "" });

  // Supplier form
  const [supplierForm, setSupplierForm] = useState({ name: "", email: "", whatsapp: "", location: "", currency: "USD", notes: "" });

  // Deal edit
  const [editingDeal, setEditingDeal] = useState(false);
  const [dealEditForm, setDealEditForm] = useState({});

  // ── data loading ─────────────────────────────────────────────────────────

  const loadDeals = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("sourcing_deals").select("*").order("created_at", { ascending: false });
    setDeals(data || []);
    setLoading(false);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setSuppliers(data || []);
  }, []);

  useEffect(() => { loadDeals(); loadSuppliers(); }, [loadDeals, loadSuppliers]);

  useEffect(() => {
    if (!selectedDealId) { setDealMessages([]); return; }
    setMsgsLoading(true);
    supabase.from("sourcing_messages").select("*").eq("deal_id", selectedDealId).order("ts", { ascending: true })
      .then(({ data }) => { setDealMessages(data || []); setMsgsLoading(false); });
  }, [selectedDealId]);

  // ── helpers ───────────────────────────────────────────────────────────────

  const selectedDeal = deals.find(d => d.id === selectedDealId);
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

  async function patchDeal(id, patch) {
    const { data, error } = await supabase.from("sourcing_deals").update(patch).eq("id", id).select().single();
    if (error) { alert("Update failed: " + error.message); return; }
    setDeals(ds => ds.map(d => d.id === id ? data : d));
    return data;
  }

  async function addMessage(dealId, fields) {
    const { data, error } = await supabase.from("sourcing_messages").insert({ deal_id: dealId, ...fields }).select().single();
    if (error) { alert("Failed to add message: " + error.message); return; }
    setDealMessages(ms => [...ms, data]);
    return data;
  }

  // ── create deal ──────────────────────────────────────────────────────────

  async function createDeal() {
    const f = dealForm;
    if (!f.supplier_name.trim() && !f.supplier_id) { alert("Supplier is required"); return; }
    const supName = f.supplier_name.trim() || (suppliers.find(s => s.id === f.supplier_id)?.name || "");
    const unitsBid = Number(f.units_bid) || null;
    const ourBid = Number(f.our_bid_usd) || null;
    const total = unitsBid && ourBid ? unitsBid * ourBid : null;
    const { data, error } = await supabase.from("sourcing_deals").insert({
      supplier_id: f.supplier_id || null,
      supplier_name: supName,
      lot_name: f.lot_name.trim() || null,
      source: f.source,
      status: "evaluating",
      units_total: Number(f.units_total) || null,
      units_bid: unitsBid,
      our_bid_usd: ourBid,
      total_bid_usd: total,
      bid_deadline: f.bid_deadline || null,
      notes: f.notes.trim() || null,
    }).select().single();
    if (error) { alert("Failed to create deal: " + error.message); return; }
    setDeals(ds => [data, ...ds]);
    setDealForm({ supplier_id: "", supplier_name: "", lot_name: "", source: "gmail", units_total: "", units_bid: "", our_bid_usd: "", bid_deadline: "", notes: "" });
    setShowNewDeal(false);
    setSelectedDealId(data.id);
  }

  // ── paste whatsapp ────────────────────────────────────────────────────────

  async function handlePasteWA() {
    if (!waText.trim() || !selectedDeal) return;
    setWaLoading(true);
    let milestone = null, tracking = null;
    if (anthropicKey) {
      try {
        const raw = await callClaude(anthropicKey,
          `Analyze this WhatsApp message from a laptop supplier. Detect if it contains any of these milestones: BID_ACCEPTED, BID_REJECTED, PAYMENT_CONFIRMED, TRACKING_RECEIVED, ARRIVED, INVOICE_RECEIVED, SHIPMENT_DELAYED, OTHER. Also extract tracking number if present. Return JSON only: {"milestone": string or null, "tracking": string or null, "summary": string}`,
        );
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        milestone = parsed.milestone !== "OTHER" ? parsed.milestone : null;
        tracking = parsed.tracking;
      } catch {}
    }
    await addMessage(selectedDeal.id, {
      channel: "whatsapp", direction: "inbound", sender: selectedDeal.supplier_name || "Supplier",
      content: waText.trim(), milestone,
    });
    const patch = {};
    if (milestone && MILESTONE_TO_STATUS[milestone]) patch.status = MILESTONE_TO_STATUS[milestone];
    if (tracking) patch.tracking_number = tracking;
    if (Object.keys(patch).length) await patchDeal(selectedDeal.id, patch);
    setWaText(""); setWaLoading(false); setShowPasteWA(false);
  }

  // ── reply generator ───────────────────────────────────────────────────────

  async function generateReply() {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    if (!selectedDeal) return;
    setReplyLoading(true);
    setReplyGmail(""); setReplyWA("");
    const d = selectedDeal;
    const fin = calcFinancials(d, exchangeRate);
    const context = `Supplier: ${d.supplier_name || "—"}\nLot: ${d.lot_name || "—"}\nStatus: ${d.status}\nUnits bidding: ${d.units_bid || "—"}\nOur bid: $${d.our_bid_usd || "—"} USD\nAdditional context: ${replyContext || "—"}\nReply type: ${replyType}`;
    const system = `You are writing professional supplier communications for Laptop for Less, a UAE laptop reseller based in Sharjah. The owner is Faisal Hadi. Write concise, professional messages. Always mention device specs and quantities precisely.`;
    const prompt = `${context}\n\nGenerate TWO versions. Return JSON only:\n{"gmail": "formal 3-5 sentence email ending with Best regards, Faisal Hadi, Laptop for Less, UAE", "whatsapp": "short casual 2-3 lines max, 1-2 emojis, no formal signoff"}`;
    try {
      const raw = await callClaude(anthropicKey, prompt, system);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setReplyGmail(parsed.gmail || ""); setReplyWA(parsed.whatsapp || "");
    } catch (e) {
      setReplyGmail("Error generating. Check your API key and try again.");
    }
    setReplyLoading(false);
  }

  // ── check gmail ───────────────────────────────────────────────────────────

  async function handleCheckGmail() {
    if (gmailPasteMode) {
      if (!gmailPasteText.trim() || !anthropicKey) return;
      setGmailLoading(true);
      try {
        const raw = await callClaude(anthropicKey,
          `Analyze this supplier email for a UAE laptop reseller. Extract: {"supplier_name": string, "lot_name": string or null, "units_count": number or null, "bid_deadline": ISO date string or null, "summary": string, "suggested_action": "review_list" or "send_bid" or "follow_up" or "track_shipment", "milestone": "BID_ACCEPTED" or "INVOICE_RECEIVED" or "TRACKING_RECEIVED" or null}. Return only JSON.\n\nEmail:\n${gmailPasteText}`,
        );
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        setGmailResults([{ id: Date.now(), subject: "Pasted email", date: new Date().toLocaleDateString(), ...parsed, raw: gmailPasteText }]);
      } catch {
        setGmailError("Could not analyze email. Check API key.");
      }
      setGmailLoading(false);
      return;
    }
    setGmailError("Gmail API not connected. Use 'Paste Email' to analyze email content manually.");
  }

  // ── move to stock ─────────────────────────────────────────────────────────

  async function handleMoveToStock() {
    if (!selectedDeal) return;
    const units = Number(moveForm.units_arrived) || Number(selectedDeal.units_bid) || 1;
    const shipping = Number(moveForm.actual_shipping_aed) || Number(selectedDeal.shipping_cost_aed) || 0;
    const patchedDeal = { ...selectedDeal, shipping_cost_aed: shipping };
    const fin = calcFinancials(patchedDeal, exchangeRate);
    const costPerUnit = units > 0 ? fin.landed / units : fin.landed;
    const stockItems = Array.from({ length: 1 }, () => ({
      brand: moveForm.brand || "",
      model: moveForm.model || selectedDeal.lot_name || "",
      cost_price: Math.round(costPerUnit),
      min_price: Math.round(costPerUnit * 1.1),
      max_price: Math.round(costPerUnit * 1.2),
      status: "available",
      notes: `Lot: ${selectedDeal.lot_name || "—"} | Supplier: ${selectedDeal.supplier_name || "—"}`,
      condition: "Used",
    }));
    const { error } = await supabase.from("stock").insert(
      Array.from({ length: units }, () => ({ ...stockItems[0] }))
    );
    if (error) { alert("Failed to add to stock: " + error.message); return; }
    await patchDeal(selectedDeal.id, { status: "in_stock" });
    if (onAddToStock) onAddToStock(units);
    setShowMoveStock(false);
    alert(`✅ ${units} device${units !== 1 ? "s" : ""} added to stock!`);
  }

  // ── create supplier ───────────────────────────────────────────────────────

  async function createSupplier() {
    if (!supplierForm.name.trim()) { alert("Name is required"); return; }
    const { data, error } = await supabase.from("suppliers").insert(supplierForm).select().single();
    if (error) { alert("Failed: " + error.message); return; }
    setSuppliers(ss => [...ss, data]);
    setSupplierForm({ name: "", email: "", whatsapp: "", location: "", currency: "USD", notes: "" });
    setShowAddSupplier(false);
  }

  // ── render helpers ────────────────────────────────────────────────────────

  const sectionBtns = [
    { id: "deals", label: "📋 Deals" },
    { id: "suppliers", label: "👥 Suppliers" },
    { id: "analytics", label: "📊 Analytics" },
  ];

  // ── DEAL DETAIL ───────────────────────────────────────────────────────────

  if (selectedDeal) {
    const d = selectedDeal;
    const fin = calcFinancials(d, exchangeRate);
    const deadline = d.bid_deadline ? hoursUntil(d.bid_deadline) : null;
    const deadlineRed = deadline !== null && deadline <= 24 && deadline >= 0;
    const supplierInfo = suppliers.find(s => s.id === d.supplier_id);

    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => { setSelectedDealId(null); setEditingDeal(false); setShowReplyGen(false); }}
            style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer", fontSize: 18 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.supplier_name || "—"}</div>
            <div style={{ fontSize: 11, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.lot_name || "No lot name"}</div>
          </div>
          <StatusPill status={d.status} />
        </div>

        {/* Section A — Deal Info */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>DEAL INFO</div>
            <button onClick={() => { setEditingDeal(!editingDeal); setDealEditForm({ ...d }); }}
              style={{ padding: "3px 10px", borderRadius: 8, border: "none", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {editingDeal ? "Cancel" : "✏️ Edit"}
            </button>
          </div>

          {editingDeal ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "LOT NAME", key: "lot_name" },
                { label: "UNITS TOTAL", key: "units_total", type: "number" },
                { label: "UNITS BID", key: "units_bid", type: "number" },
                { label: "OUR BID (USD)", key: "our_bid_usd", type: "number" },
                { label: "TRACKING #", key: "tracking_number" },
                { label: "ETA DATE", key: "eta_date", type: "date" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                  <input type={type || "text"} value={dealEditForm[key] || ""}
                    onChange={e => setDealEditForm(f => ({ ...f, [key]: e.target.value }))}
                    style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>BID DEADLINE</div>
                <input type="datetime-local" value={dealEditForm.bid_deadline?.slice(0, 16) || ""}
                  onChange={e => setDealEditForm(f => ({ ...f, bid_deadline: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>NOTES</div>
                <textarea value={dealEditForm.notes || ""} onChange={e => setDealEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
              </div>
              <button onClick={async () => { await patchDeal(d.id, dealEditForm); setEditingDeal(false); }}
                style={{ padding: "9px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Save Changes
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "SOURCE", value: d.source === "gmail" ? "📧 Gmail" : d.source === "whatsapp" ? "💬 WhatsApp" : d.source || "—" },
                { label: "UNITS TOTAL", value: d.units_total || "—" },
                { label: "UNITS BID", value: d.units_bid || "—" },
                { label: "OUR BID", value: d.our_bid_usd ? `$${fmt(d.our_bid_usd)} USD` : "—" },
                { label: "TOTAL BID", value: d.total_bid_usd ? `$${fmt(d.total_bid_usd)} USD` : "—" },
                { label: "TRACKING #", value: d.tracking_number || "—" },
              ].map((it, i) => (
                <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 3 }}>{it.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{it.value}</div>
                </div>
              ))}
            </div>
          )}

          {d.bid_deadline && (
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: deadlineRed ? "#FEF2F2" : "#F8FAFC", border: `1px solid ${deadlineRed ? "#FECACA" : "#E2E8F0"}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: deadlineRed ? "#EF4444" : "#64748B" }}>
                {deadlineRed ? "⚠️" : "🕐"} Deadline: {new Date(d.bid_deadline).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}
                {deadline !== null && deadline >= 0 && ` (${Math.round(deadline)}h left)`}
              </span>
            </div>
          )}
        </div>

        {/* Stage changer */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>PIPELINE STAGE</div>
          <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 2 }}>
            {STATUSES.filter(s => s.id !== "in_stock").map(s => {
              const active = d.status === s.id;
              return (
                <button key={s.id} onClick={() => patchDeal(d.id, { status: s.id })}
                  style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 14, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer",
                    background: active ? s.color : s.bg, color: active ? "#fff" : s.color }}>
                  {s.icon} {s.label}
                </button>
              );
            })}
          </div>
          {d.status === "arrived" && (
            <button onClick={() => { setMoveForm({ units_arrived: String(d.units_bid || ""), actual_shipping_aed: String(d.shipping_cost_aed || ""), brand: "", model: d.lot_name || "" }); setShowMoveStock(true); }}
              style={{ width: "100%", marginTop: 12, padding: "10px", borderRadius: 12, border: "none", background: "#06B6D4", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              📦 Move to Your Stock
            </button>
          )}
        </div>

        {/* Section B — Timeline */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 10 }}>COMMUNICATION TIMELINE</div>
          {msgsLoading ? (
            <div style={{ textAlign: "center", padding: 20, color: "#94A3B8", fontSize: 12 }}>Loading...</div>
          ) : dealMessages.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: "#94A3B8", fontSize: 12 }}>No messages yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {dealMessages.map(msg => {
                const isGmail = msg.channel === "gmail";
                const isOut = msg.direction === "outbound";
                return (
                  <div key={msg.id} style={{ display: "flex", gap: 10, paddingBottom: 10, borderBottom: "1px solid #F1F5F9" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: isGmail ? "#FEF2F2" : "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
                      {isGmail ? "📧" : "💬"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3, gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: isGmail ? "#EA4335" : "#16A34A" }}>
                          {isOut ? "You" : msg.sender || "Supplier"}
                        </span>
                        <span style={{ fontSize: 10, color: "#94A3B8" }}>{timeAgo(msg.ts)}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, wordBreak: "break-word" }}>{msg.content}</div>
                      {msg.milestone && (
                        <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, fontWeight: 700, color: "#10B981", background: "#ECFDF5", padding: "2px 8px", borderRadius: 8 }}>
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
            <button onClick={() => setShowPasteWA(true)}
              style={{ flex: 1, padding: "9px", borderRadius: 10, border: "1.5px solid #DCF8C6", background: "#F0FDF4", color: "#16A34A", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              💬 Paste WhatsApp
            </button>
            <button onClick={async () => {
              const note = prompt("Add Gmail note:");
              if (!note?.trim()) return;
              await addMessage(d.id, { channel: "gmail", direction: "inbound", sender: d.supplier_name || "Supplier", content: note.trim() });
            }}
              style={{ flex: 1, padding: "9px", borderRadius: 10, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#EA4335", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              📧 Add Gmail Note
            </button>
          </div>
        </div>

        {/* Section C — Financials */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showFinancials ? 12 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>FINANCIALS</div>
            <button onClick={() => setShowFinancials(v => !v)}
              style={{ padding: "3px 10px", borderRadius: 8, border: "none", background: "#F1F5F9", color: "#64748B", fontSize: 11, cursor: "pointer" }}>
              {showFinancials ? "Collapse" : "Expand"}
            </button>
          </div>

          {showFinancials && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 12px", background: "#EEF2FF", borderRadius: 10 }}>
                <span style={{ fontSize: 12, color: "#4338CA", fontWeight: 600 }}>1 USD =</span>
                {editingRate ? (
                  <input value={rateInput} onChange={e => setRateInput(e.target.value)} autoFocus
                    onBlur={() => { const v = parseFloat(rateInput); if (!isNaN(v) && v > 0) setExchangeRate(v); setEditingRate(false); }}
                    style={{ width: 70, padding: "3px 8px", borderRadius: 6, border: "1.5px solid #6366F1", fontSize: 12, outline: "none" }} />
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#4338CA" }}>{exchangeRate} AED</span>
                )}
                <button onClick={() => { setRateInput(String(exchangeRate)); setEditingRate(true); }}
                  style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 6, border: "none", background: "#C7D2FE", color: "#4338CA", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Edit</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748B" }}>Purchase</span>
                  <span style={{ fontWeight: 700, color: "#0F172A" }}>
                    {fin.purchaseUSD > 0 ? `$${fmt(fin.purchaseUSD)} = AED ${fmt(fin.purchaseAED)}` : "—"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748B" }}>Shipping</span>
                  <input defaultValue={d.shipping_cost_aed || ""}
                    onBlur={e => { const v = parseFloat(e.target.value); patchDeal(d.id, { shipping_cost_aed: isNaN(v) ? 0 : v }); }}
                    placeholder="AED 0"
                    style={{ width: 100, padding: "3px 8px", borderRadius: 6, border: "1.5px solid #E2E8F0", fontSize: 12, textAlign: "right", outline: "none" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748B" }}>Import duty (5%)</span>
                  <span style={{ color: "#0F172A" }}>AED {fmt(fin.duty)}</span>
                </div>
                <div style={{ height: 1, background: "#E2E8F0", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#0F172A", fontWeight: 700 }}>Total landed</span>
                  <span style={{ fontWeight: 800, color: "#0F172A" }}>AED {fmt(fin.landed)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748B" }}>Cost per unit</span>
                  <span style={{ color: "#0F172A" }}>AED {fmt(fin.costPerUnit)}</span>
                </div>
                <div style={{ height: 1, background: "#E2E8F0", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748B" }}>Expected revenue</span>
                  <input defaultValue={d.expected_revenue_aed || ""}
                    onBlur={e => { const v = parseFloat(e.target.value); patchDeal(d.id, { expected_revenue_aed: isNaN(v) ? null : v }); }}
                    placeholder="AED 0"
                    style={{ width: 100, padding: "3px 8px", borderRadius: 6, border: "1.5px solid #E2E8F0", fontSize: 12, textAlign: "right", outline: "none" }} />
                </div>
                {fin.revenue > 0 && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748B" }}>Gross profit</span>
                      <span style={{ fontWeight: 700, color: fin.profit >= 0 ? "#10B981" : "#EF4444" }}>AED {fmt(fin.profit)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#64748B" }}>Margin</span>
                      <span style={{ fontWeight: 700, color: fin.margin >= 15 ? "#10B981" : fin.margin >= 5 ? "#F59E0B" : "#EF4444" }}>{fin.margin.toFixed(1)}%</span>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Reply Generator button */}
        <button onClick={() => { setReplyContext(""); setReplyType("Bid Offer"); setReplyGmail(""); setReplyWA(""); setShowReplyGen(true); }}
          style={{ padding: "12px", borderRadius: 14, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
          ✍️ Generate Reply
        </button>

        {/* Paste WhatsApp Modal */}
        {showPasteWA && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxWidth: 500 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>💬 Paste WhatsApp Message</span>
                <button onClick={() => setShowPasteWA(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>
              <textarea value={waText} onChange={e => setWaText(e.target.value)} placeholder="Paste the WhatsApp message here..."
                rows={5} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 12 }} />
              <button onClick={handlePasteWA} disabled={waLoading || !waText.trim()}
                style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: waLoading || !waText.trim() ? "#E2E8F0" : "#16A34A", color: waLoading || !waText.trim() ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                {waLoading ? "⏳ Analyzing..." : "Add to Timeline"}
              </button>
            </div>
          </div>
        )}

        {/* Reply Generator Modal */}
        {showReplyGen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, overflowY: "auto" }}>
            <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>✍️ Generate Reply</span>
                  <button onClick={() => setShowReplyGen(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
                </div>

                <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#475569" }}>
                  <strong>{d.supplier_name}</strong> · {d.lot_name || "—"} · {d.units_bid || "—"} units · ${d.our_bid_usd || "—"} USD
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>REPLY TYPE</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {["Bid Offer", "Counter Offer", "Request Inventory List", "Ask Shipping Quote", "Payment Confirmation", "Chase Tracking", "Custom"].map(t => (
                      <button key={t} onClick={() => setReplyType(t)}
                        style={{ padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                          background: replyType === t ? "#6366F1" : "#F1F5F9", color: replyType === t ? "#fff" : "#64748B" }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>ADDITIONAL CONTEXT</div>
                  <textarea value={replyContext} onChange={e => setReplyContext(e.target.value)} rows={2}
                    placeholder={`e.g. "Accept bid, ask for invoice"`}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
                </div>

                <button onClick={generateReply} disabled={replyLoading}
                  style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: replyLoading ? "#E2E8F0" : "#6366F1", color: replyLoading ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", marginBottom: 16 }}>
                  {replyLoading ? "⏳ Generating..." : "Generate Both Versions"}
                </button>

                {(replyGmail || replyWA) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {replyGmail && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#EA4335", marginBottom: 6 }}>📧 GMAIL VERSION</div>
                        <div style={{ background: "#FEF2F2", borderRadius: 10, padding: 12, fontSize: 12, color: "#0F172A", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 6 }}>{replyGmail}</div>
                        <button onClick={() => navigator.clipboard.writeText(replyGmail)}
                          style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#F1F5F9", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📋 Copy Gmail Version</button>
                      </div>
                    )}
                    {replyWA && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", marginBottom: 6 }}>💬 WHATSAPP VERSION</div>
                        <div style={{ background: "#F0FDF4", borderRadius: 10, padding: 12, fontSize: 12, color: "#0F172A", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 6 }}>{replyWA}</div>
                        <button onClick={() => navigator.clipboard.writeText(replyWA)}
                          style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#F1F5F9", color: "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>📋 Copy WhatsApp Version</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Move to Stock Modal */}
        {showMoveStock && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 400 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>📦 Move to Stock</span>
                <button onClick={() => setShowMoveStock(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ background: "#EEF2FF", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#4338CA" }}>
                {d.lot_name || "—"} · {d.supplier_name}
              </div>
              {[
                { label: "UNITS ARRIVED", key: "units_arrived", placeholder: "e.g. 50" },
                { label: "ACTUAL SHIPPING PAID (AED)", key: "actual_shipping_aed", placeholder: "e.g. 2500" },
                { label: "BRAND", key: "brand", placeholder: "e.g. Dell" },
                { label: "MODEL", key: "model", placeholder: "e.g. Latitude 5400" },
              ].map(({ label, key, placeholder }) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                  <input value={moveForm[key]} onChange={e => setMoveForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <button onClick={handleMoveToStock}
                style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: "#06B6D4", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                ✅ Confirm & Add to Stock
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── SUPPLIER DETAIL ────────────────────────────────────────────────────────

  if (selectedSupplier) {
    const s = selectedSupplier;
    const supplierDeals = deals.filter(d => d.supplier_id === s.id || d.supplier_name === s.name);
    const totalValue = supplierDeals.reduce((n, d) => n + (d.total_bid_usd || 0), 0);
    const wonDeals = supplierDeals.filter(d => ["bid_won","payment_due","paid","in_transit","in_customs","arrived","in_stock"].includes(d.status)).length;

    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setSelectedSupplierId(null)}
            style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer", fontSize: 18 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{s.name}</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>{s.location || "—"}</div>
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          {[
            { label: "EMAIL", value: s.email || "—" },
            { label: "WHATSAPP", value: s.whatsapp || "—" },
            { label: "CURRENCY", value: s.currency || "USD" },
            { label: "PAYMENT", value: s.payment_method || "—" },
            { label: "TOTAL DEALS", value: supplierDeals.length },
            { label: "WON DEALS", value: wonDeals },
            { label: "TOTAL SOURCED", value: totalValue > 0 ? `$${fmt(totalValue)} USD` : "—" },
          ].map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, marginBottom: 8, borderBottom: i < 6 ? "1px solid #F1F5F9" : "none" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8" }}>{it.label}</span>
              <span style={{ fontSize: 12, color: "#0F172A", fontWeight: 600 }}>{it.value}</span>
            </div>
          ))}
          {s.notes && (
            <div style={{ marginTop: 8, padding: "10px 12px", background: "#F8FAFC", borderRadius: 10, fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
              {s.notes}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginTop: 4 }}>DEALS</div>
        {supplierDeals.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, textAlign: "center", color: "#94A3B8", fontSize: 13, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>No deals yet</div>
        ) : supplierDeals.map(d => (
          <div key={d.id} onClick={() => { setSelectedSupplierId(null); setSelectedDealId(d.id); }}
            style={{ background: "#fff", borderRadius: 14, padding: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{d.lot_name || "—"}</div>
              <StatusPill status={d.status} small />
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>
              {d.units_bid ? `${d.units_bid} units` : "—"}{d.our_bid_usd ? ` · $${fmt(d.our_bid_usd)} USD` : ""}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── DEALS SECTION ──────────────────────────────────────────────────────────

  if (section === "deals") {
    const grouped = {};
    STATUSES.forEach(s => { grouped[s.id] = deals.filter(d => d.status === s.id); });
    const activePipeline = STATUSES.filter(s => s.id !== "in_stock");
    const inStockCount = grouped["in_stock"]?.length || 0;

    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Section pills */}
        <div style={{ display: "flex", gap: 6 }}>
          {sectionBtns.map(b => (
            <button key={b.id} onClick={() => setSection(b.id)}
              style={{ flex: 1, padding: "8px 4px", borderRadius: 12, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: section === b.id ? "#6366F1" : "#F1F5F9", color: section === b.id ? "#fff" : "#64748B" }}>
              {b.label}
            </button>
          ))}
        </div>

        {/* Action bar */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { setGmailResults([]); setGmailError(""); setGmailPasteText(""); setGmailPasteMode(false); setShowGmail(true); }}
            style={{ flex: 1, padding: "10px", borderRadius: 12, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#EA4335", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            📧 Check Gmail
          </button>
          <button onClick={() => setShowNewDeal(true)}
            style={{ flex: 1, padding: "10px", borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
            + New Deal
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 30, color: "#94A3B8", fontSize: 13 }}>Loading...</div>
        ) : deals.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 16, padding: 30, textAlign: "center", color: "#94A3B8", fontSize: 13, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            No deals yet. Tap + New Deal to start.
          </div>
        ) : (
          <>
            {activePipeline.map(st => {
              const stageDeals = grouped[st.id] || [];
              if (stageDeals.length === 0) return null;
              return (
                <div key={st.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>{st.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{st.label.toUpperCase()}</span>
                    <span style={{ fontSize: 11, color: "#94A3B8" }}>({stageDeals.length})</span>
                  </div>
                  {stageDeals.map(d => {
                    const fin = calcFinancials(d, exchangeRate);
                    const deadline = d.bid_deadline ? hoursUntil(d.bid_deadline) : null;
                    const deadlineRed = deadline !== null && deadline <= 24 && deadline >= 0;
                    const profitPct = fin.revenue > 0 && fin.landed > 0 ? ((fin.profit / fin.revenue) * 100).toFixed(0) : null;
                    return (
                      <div key={d.id} onClick={() => setSelectedDealId(d.id)}
                        style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", marginBottom: 8, borderLeft: `3px solid ${st.color}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.supplier_name || "—"}</div>
                            <div style={{ fontSize: 11, color: "#64748B", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.lot_name || "—"}</div>
                          </div>
                          <span style={{ fontSize: 10, color: d.source === "gmail" ? "#EA4335" : "#16A34A", fontWeight: 700, background: d.source === "gmail" ? "#FEF2F2" : "#F0FDF4", padding: "2px 6px", borderRadius: 8, flexShrink: 0 }}>
                            {d.source === "gmail" ? "📧" : "💬"}
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
                          <div style={{ fontSize: 11, color: "#94A3B8" }}>{d.units_bid ? `${d.units_bid} units` : "—"}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#10B981", textAlign: "center" }}>{d.our_bid_usd ? `$${fmt(d.our_bid_usd)}` : "—"}</div>
                          <div style={{ fontSize: 11, color: "#64748B", textAlign: "right" }}>{fin.landed > 0 ? `AED ${fmt(fin.landed)}` : "—"}</div>
                        </div>
                        {profitPct && (
                          <div style={{ fontSize: 11, color: parseInt(profitPct) >= 15 ? "#10B981" : "#F59E0B", fontWeight: 700, marginTop: 4 }}>
                            Margin: {profitPct}%
                          </div>
                        )}
                        {deadlineRed && (
                          <div style={{ marginTop: 6, padding: "4px 8px", background: "#FEF2F2", borderRadius: 6, fontSize: 11, color: "#EF4444", fontWeight: 700 }}>
                            ⚠️ Deadline in {Math.round(deadline)}h
                          </div>
                        )}
                        <div style={{ marginTop: 6, fontSize: 10, color: "#94A3B8", textAlign: "right" }}>{timeAgo(d.created_at)}</div>
                        {st.id === "arrived" && (
                          <button onClick={e => { e.stopPropagation(); setSelectedDealId(d.id); setMoveForm({ units_arrived: String(d.units_bid || ""), actual_shipping_aed: String(d.shipping_cost_aed || ""), brand: "", model: d.lot_name || "" }); setShowMoveStock(true); }}
                            style={{ width: "100%", marginTop: 8, padding: "7px", borderRadius: 10, border: "none", background: "#06B6D4", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                            📦 Move to Stock
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {inStockCount > 0 && (
              <div style={{ background: "#F8FAFC", borderRadius: 12, padding: "10px 14px", textAlign: "center", color: "#94A3B8", fontSize: 12 }}>
                ➡️ In Stock (archived): {inStockCount} lot{inStockCount !== 1 ? "s" : ""}
              </div>
            )}
          </>
        )}

        {/* New Deal Modal */}
        {showNewDeal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, overflowY: "auto" }}>
            <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 440 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>New Sourcing Deal</span>
                  <button onClick={() => setShowNewDeal(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>SUPPLIER</div>
                  {suppliers.length > 0 ? (
                    <select value={dealForm.supplier_id} onChange={e => {
                      const sup = suppliers.find(s => s.id === e.target.value);
                      setDealForm(f => ({ ...f, supplier_id: e.target.value, supplier_name: sup?.name || "" }));
                    }} style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", background: "#fff" }}>
                      <option value="">— Select supplier —</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  ) : null}
                  <input value={dealForm.supplier_name} onChange={e => setDealForm(f => ({ ...f, supplier_name: e.target.value, supplier_id: "" }))}
                    placeholder="Or type supplier name"
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", marginTop: 6 }} />
                </div>

                {[
                  { label: "LOT NAME / REFERENCE", key: "lot_name", placeholder: "e.g. 50x Dell Latitude 5400 i5 8GB" },
                  { label: "TOTAL UNITS IN LOT", key: "units_total", placeholder: "e.g. 100", type: "number" },
                  { label: "UNITS WE'RE BIDDING ON", key: "units_bid", placeholder: "e.g. 50", type: "number" },
                  { label: "OUR BID (USD per unit)", key: "our_bid_usd", placeholder: "e.g. 85", type: "number" },
                ].map(({ label, key, placeholder, type }) => (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                    <input type={type || "text"} value={dealForm[key]} onChange={e => setDealForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}

                {/* Auto-calc preview */}
                {dealForm.units_bid && dealForm.our_bid_usd && (
                  <div style={{ marginBottom: 12, padding: "10px 14px", background: "#ECFDF5", borderRadius: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>
                      Total bid: ${fmt(Number(dealForm.units_bid) * Number(dealForm.our_bid_usd))} USD
                      = AED {fmt(Number(dealForm.units_bid) * Number(dealForm.our_bid_usd) * exchangeRate)}
                    </div>
                    <div style={{ fontSize: 11, color: "#059669", marginTop: 2 }}>
                      Estimated landed (incl. 10% shipping+duty): AED {fmt(Number(dealForm.units_bid) * Number(dealForm.our_bid_usd) * exchangeRate * 1.1)}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>BID DEADLINE</div>
                  <input type="datetime-local" value={dealForm.bid_deadline} onChange={e => setDealForm(f => ({ ...f, bid_deadline: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>SOURCE</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["gmail", "whatsapp", "other"].map(s => (
                      <button key={s} onClick={() => setDealForm(f => ({ ...f, source: s }))}
                        style={{ flex: 1, padding: "7px 0", borderRadius: 10, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                          background: dealForm.source === s ? "#6366F1" : "#F1F5F9", color: dealForm.source === s ? "#fff" : "#64748B" }}>
                        {s === "gmail" ? "📧 Gmail" : s === "whatsapp" ? "💬 WhatsApp" : "Other"}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>NOTES</div>
                  <textarea value={dealForm.notes} onChange={e => setDealForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Any extra context..."
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowNewDeal(false)}
                    style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                  <button onClick={createDeal}
                    style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Create Deal</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Gmail Bottom Sheet */}
        {showGmail && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "flex-end" }}>
            <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>📧 Check Gmail</span>
                <button onClick={() => setShowGmail(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                <button onClick={() => setGmailPasteMode(false)}
                  style={{ flex: 1, padding: "8px", borderRadius: 10, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: !gmailPasteMode ? "#6366F1" : "#F1F5F9", color: !gmailPasteMode ? "#fff" : "#64748B" }}>
                  Auto-fetch
                </button>
                <button onClick={() => setGmailPasteMode(true)}
                  style={{ flex: 1, padding: "8px", borderRadius: 10, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: gmailPasteMode ? "#6366F1" : "#F1F5F9", color: gmailPasteMode ? "#fff" : "#64748B" }}>
                  Paste Email
                </button>
              </div>

              {gmailPasteMode ? (
                <>
                  <textarea value={gmailPasteText} onChange={e => setGmailPasteText(e.target.value)} rows={6}
                    placeholder="Paste supplier email content here for Claude to analyze..."
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 12 }} />
                  <button onClick={handleCheckGmail} disabled={gmailLoading || !gmailPasteText.trim() || !anthropicKey}
                    style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", background: gmailLoading ? "#E2E8F0" : "#6366F1", color: gmailLoading ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", marginBottom: 12 }}>
                    {gmailLoading ? "⏳ Analyzing..." : "Analyze with Claude"}
                  </button>
                </>
              ) : (
                <div style={{ background: "#FFF7ED", borderRadius: 12, padding: "14px 16px", marginBottom: 14, fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
                  ℹ️ Gmail auto-fetch requires Gmail OAuth setup. Use <strong>Paste Email</strong> to manually paste and analyze email content with Claude.
                </div>
              )}

              {gmailError && (
                <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#EF4444" }}>{gmailError}</div>
              )}

              {gmailResults.map(result => (
                <div key={result.id} style={{ background: "#F8FAFC", borderRadius: 14, padding: 14, marginBottom: 10, border: "1px solid #E2E8F0" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>{result.supplier_name || "Unknown supplier"}</div>
                  <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>{result.summary}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {result.units_count && <span style={{ fontSize: 11, color: "#6366F1", background: "#EEF2FF", padding: "2px 8px", borderRadius: 8 }}>{result.units_count} units</span>}
                    {result.bid_deadline && <span style={{ fontSize: 11, color: "#F59E0B", background: "#FFFBEB", padding: "2px 8px", borderRadius: 8 }}>Deadline: {result.bid_deadline}</span>}
                    {result.milestone && <span style={{ fontSize: 11, color: "#10B981", background: "#ECFDF5", padding: "2px 8px", borderRadius: 8 }}>{result.milestone}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => {
                      setDealForm(f => ({ ...f, supplier_name: result.supplier_name || "", lot_name: result.lot_name || "", units_total: String(result.units_count || ""), bid_deadline: result.bid_deadline || "", source: "gmail" }));
                      setShowGmail(false); setShowNewDeal(true);
                    }} style={{ flex: 1, padding: "7px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      Create Deal
                    </button>
                    <button onClick={() => setShowGmail(false)}
                      style={{ padding: "7px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 11, cursor: "pointer" }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── SUPPLIERS SECTION ──────────────────────────────────────────────────────

  if (section === "suppliers") {
    return (
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {sectionBtns.map(b => (
            <button key={b.id} onClick={() => setSection(b.id)}
              style={{ flex: 1, padding: "8px 4px", borderRadius: 12, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: section === b.id ? "#6366F1" : "#F1F5F9", color: section === b.id ? "#fff" : "#64748B" }}>
              {b.label}
            </button>
          ))}
        </div>

        <button onClick={() => setShowAddSupplier(true)}
          style={{ padding: "10px", borderRadius: 12, border: "1.5px dashed #C7D2FE", background: "#EEF2FF", color: "#6366F1", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
          + Add Supplier
        </button>

        {suppliers.map(s => {
          const supplierDeals = deals.filter(d => d.supplier_id === s.id || d.supplier_name === s.name);
          const totalValue = supplierDeals.reduce((n, d) => n + (d.total_bid_usd || 0), 0);
          const lastDeal = supplierDeals.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
          return (
            <div key={s.id} onClick={() => setSelectedSupplierId(s.id)}
              style={{ background: "#fff", borderRadius: 14, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>{s.location || "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>{supplierDeals.length} deals</div>
                  {totalValue > 0 && <div style={{ fontSize: 11, color: "#64748B" }}>${fmt(totalValue)}</div>}
                </div>
              </div>
              {s.email && <div style={{ fontSize: 11, color: "#6366F1", marginBottom: 2 }}>📧 {s.email}</div>}
              {s.whatsapp && <div style={{ fontSize: 11, color: "#16A34A" }}>💬 {s.whatsapp}</div>}
              {lastDeal && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>Last deal: {timeAgo(lastDeal.created_at)}</div>}
            </div>
          );
        })}

        {showAddSupplier && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 420, maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>Add Supplier</span>
                <button onClick={() => setShowAddSupplier(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>
              {[
                { label: "NAME *", key: "name", placeholder: "Supplier name" },
                { label: "EMAIL", key: "email", placeholder: "contact@supplier.com" },
                { label: "WHATSAPP", key: "whatsapp", placeholder: "+1 555 000 0000" },
                { label: "LOCATION", key: "location", placeholder: "e.g. Texas, USA" },
                { label: "CURRENCY", key: "currency", placeholder: "USD" },
              ].map(({ label, key, placeholder }) => (
                <div key={key} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                  <input value={supplierForm[key]} onChange={e => setSupplierForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
              ))}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>NOTES</div>
                <textarea value={supplierForm.notes} onChange={e => setSupplierForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Payment terms, deal frequency, etc."
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowAddSupplier(false)}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button onClick={createSupplier}
                  style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Add Supplier</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── ANALYTICS SECTION ──────────────────────────────────────────────────────

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthDeals = deals.filter(d => new Date(d.created_at) >= monthStart);
  const totalSpent = deals.filter(d => ["paid","in_transit","in_customs","arrived","in_stock"].includes(d.status))
    .reduce((n, d) => n + calcFinancials(d, exchangeRate).landed, 0);
  const wonDealsAll = deals.filter(d => ["bid_won","payment_due","paid","in_transit","in_customs","arrived","in_stock"].includes(d.status)).length;
  const bidDealsAll = deals.filter(d => d.status !== "evaluating").length;
  const winRate = bidDealsAll > 0 ? ((wonDealsAll / bidDealsAll) * 100).toFixed(0) : 0;

  const supplierVolume = {};
  deals.forEach(d => {
    const name = d.supplier_name || "Unknown";
    if (!supplierVolume[name]) supplierVolume[name] = { deals: 0, value: 0 };
    supplierVolume[name].deals++;
    supplierVolume[name].value += (d.total_bid_usd || 0);
  });
  const topSupplier = Object.entries(supplierVolume).sort((a, b) => b[1].value - a[1].value)[0];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {sectionBtns.map(b => (
          <button key={b.id} onClick={() => setSection(b.id)}
            style={{ flex: 1, padding: "8px 4px", borderRadius: 12, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: section === b.id ? "#6366F1" : "#F1F5F9", color: section === b.id ? "#fff" : "#64748B" }}>
            {b.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { label: "Deals This Month", value: monthDeals.length, icon: "📋", color: "#6366F1", bg: "#EEF2FF" },
          { label: "Win Rate", value: `${winRate}%`, icon: "🎯", color: "#10B981", bg: "#ECFDF5" },
          { label: "Total Spent (Landed)", value: `AED ${totalSpent >= 1000 ? (totalSpent/1000).toFixed(1)+"k" : fmt(totalSpent)}`, icon: "💰", color: "#F59E0B", bg: "#FFFBEB" },
          { label: "Active Deals", value: deals.filter(d => !["in_stock","evaluating"].includes(d.status)).length, icon: "⚡", color: "#3B82F6", bg: "#DBEAFE" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: s.color, fontWeight: 600, opacity: 0.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 12 }}>PIPELINE BREAKDOWN</div>
        {STATUSES.map(st => {
          const count = deals.filter(d => d.status === st.id).length;
          if (count === 0) return null;
          return (
            <div key={st.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#475569" }}>{st.icon} {st.label}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: st.color, background: st.bg, padding: "2px 10px", borderRadius: 8 }}>{count}</span>
            </div>
          );
        })}
      </div>

      {topSupplier && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 10 }}>TOP SUPPLIERS</div>
          {Object.entries(supplierVolume).sort((a, b) => b[1].value - a[1].value).slice(0, 5).map(([name, data]) => (
            <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{name}</div>
                <div style={{ fontSize: 10, color: "#94A3B8" }}>{data.deals} deal{data.deals !== 1 ? "s" : ""}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>${fmt(data.value)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 12 }}>SUMMARY</div>
        {[
          { label: "Total deals tracked", value: deals.length },
          { label: "Bids submitted", value: bidDealsAll },
          { label: "Bids won", value: wonDealsAll },
          { label: "Win rate", value: `${winRate}%` },
          { label: "In transit", value: deals.filter(d => d.status === "in_transit").length },
          { label: "Arrived — pending stock", value: deals.filter(d => d.status === "arrived").length },
        ].map((it, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, marginBottom: 8, borderBottom: i < 5 ? "1px solid #F1F5F9" : "none" }}>
            <span style={{ fontSize: 12, color: "#64748B" }}>{it.label}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SOURCING ALERTS (exported for dashboard) ──────────────────────────────────
export function useSourcingAlerts() {
  const [alerts, setAlerts] = useState({ bidsDue: [], inTransit: 0, arrived: 0, paymentDue: 0 });

  useEffect(() => {
    supabase.from("sourcing_deals").select("id, lot_name, supplier_name, status, bid_deadline")
      .then(({ data }) => {
        const d = data || [];
        const now = Date.now();
        const bidsDue = d.filter(x => x.status === "evaluating" && x.bid_deadline && hoursUntil(x.bid_deadline) <= 24 && hoursUntil(x.bid_deadline) >= 0);
        setAlerts({
          bidsDue,
          inTransit: d.filter(x => x.status === "in_transit").length,
          arrived: d.filter(x => x.status === "arrived").length,
          paymentDue: d.filter(x => x.status === "payment_due").length,
        });
      });
  }, []);

  return alerts;
}
