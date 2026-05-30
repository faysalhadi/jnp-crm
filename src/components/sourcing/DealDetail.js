import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../supabase";
import {
  STAGES, STAGE_MAP, MILESTONES, DEFAULT_RATE, DUTY_PCT,
  fmtUSD, fmtAED, hoursUntil, timeAgo, fmtTime,
  calcLanded, calcProfit, callClaude,
  StageBadge, MilestoneBadge, Row
} from "./SourcingHelpers";
import SourcingCalculator from "./SourcingCalculator";
import SourcingMessages from "./SourcingMessages";
import SupplierNotesView from "../chat/SupplierNotesView";
import FollowUpPanel from "../chat/FollowUpPanel";

// ── Cost allocation helper ────────────────────────────────────────────────────
function allocateLotCost(rows, lotCost) {
  const totalMarket = rows.reduce((s, r) => s + r.qty * r.marketValue, 0);
  if (totalMarket === 0) return rows.map(r => ({ ...r, allocatedCostPerUnit: 0, totalCostPerUnit: 0 }));
  return rows.map(r => {
    const share    = (r.qty * r.marketValue) / totalMarket;
    const perUnit  = (lotCost * share) / r.qty;
    return { ...r, allocatedCostPerUnit: Math.round(perUnit), totalCostPerUnit: Math.round(perUnit) };
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  DEAL DETAIL — timeline + milestone detection
// ══════════════════════════════════════════════════════════════════════════════
export default function DealDetail({ deal: initialDeal, suppliers, rate, anthropicKey, onBack, onUpdate }) {
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

  // lot conversion
  const [showMove,     setShowMove]     = useState(false);
  const [lotRows,      setLotRows]      = useState([]);
  const [lotAllocated, setLotAllocated] = useState([]);
  const [lotName,      setLotName]      = useState("");
  const [uploadError,  setUploadError]  = useState(null);
  const [lotSaving,    setLotSaving]    = useState(false);

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

  // ── parse uploaded sheet ──────────────────────────────────────────────────
  function handleSheetUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb       = XLSX.read(ev.target.result, { type: "binary" });
        const ws       = wb.Sheets[wb.SheetNames[0]];
        const allRows  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        // Read lot name from row 0
        const getRowVal = (idx) => {
          const row = allRows[idx] || [];
          for (let ci = 1; ci < row.length; ci++) {
            if (row[ci] !== "" && row[ci] !== null && row[ci] !== undefined) return String(row[ci]).trim();
          }
          return "";
        };
        const sheetLotName = getRowVal(0);
        if (sheetLotName) setLotName(sheetLotName);

        // Find header row
        let headerRowIdx = -1;
        for (let i = 0; i < allRows.length; i++) {
          if (allRows[i].some(cell => String(cell).toLowerCase().trim() === "brand")) { headerRowIdx = i; break; }
        }
        if (headerRowIdx === -1) { setUploadError("No header row found with 'Brand' column."); return; }

        const headers = allRows[headerRowIdx].map(h => String(h).trim().toLowerCase());
        const colIdx  = (names) => { for (const n of names) { const idx = headers.findIndex(h => h.includes(n.toLowerCase())); if (idx >= 0) return idx; } return -1; };
        const brandCol = colIdx(["brand"]); const modelCol = colIdx(["model"]); const procCol = colIdx(["processor"]);
        const ramCol   = colIdx(["ram"]);   const ssdCol   = colIdx(["ssd"]);   const condCol = colIdx(["condition"]);
        const qtyCol   = colIdx(["qty","quantity"]); const mvCol = colIdx(["market value","marketvalue"]);
        const sellCol  = colIdx(["sell price","max price","my sell"]);
        const getCell  = (row, idx) => idx >= 0 ? String(row[idx] || "").trim() : "";
        const getNum   = (row, idx) => idx >= 0 ? parseFloat(String(row[idx] || "").replace(/,/g, "")) || 0 : 0;

        const rows = allRows.slice(headerRowIdx + 1)
          .filter(row => getCell(row, brandCol))
          .map(row => ({
            brand: getCell(row, brandCol), model: getCell(row, modelCol), processor: getCell(row, procCol),
            ram: getCell(row, ramCol), ssd: getCell(row, ssdCol), condition: getCell(row, condCol),
            qty: Math.max(1, parseInt(getCell(row, qtyCol)) || 1),
            marketValue: getNum(row, mvCol), sellPrice: getNum(row, sellCol), refurbCost: 0,
          }));

        if (!rows.length) { setUploadError("No device rows found."); return; }
        setLotRows(rows);
        setUploadError(null);
      } catch (err) { setUploadError("Could not read file: " + err.message); }
    };
    reader.readAsBinaryString(file);
  }

  // Recalculate allocation when rows change (use landed cost as lot cost)
  function getLatestAllocation() {
    if (!lotRows.length) return [];
    return allocateLotCost(lotRows, landed);
  }

  // ── convert to lot ────────────────────────────────────────────────────────
  async function handleConvertToLot() {
    const allocated = getLatestAllocation();
    if (!allocated.length) return;
    setLotSaving(true);

    // 1. Create lot record
    const { data: lot, error: lotErr } = await supabase.from("lots").insert({
      name:          lotName || d.lot_name || d.supplier_name || "Unnamed Lot",
      supplier:      d.supplier_name || null,
      purchase_date: new Date().toISOString().split("T")[0],
      total_cost:    Math.round(landed),
      total_devices: allocated.reduce((s, r) => s + r.qty, 0),
      status:        "active",
    }).select().single();

    if (lotErr) { alert("Failed to create lot: " + lotErr.message); setLotSaving(false); return; }

    // 2. Insert stock items
    const stockItems = [];
    for (const row of allocated) {
      for (let i = 0; i < row.qty; i++) {
        stockItems.push({
          brand: row.brand || null, model: row.model || null,
          processor: row.processor || null, ram: row.ram || null,
          ssd: row.ssd || null, condition: row.condition || null,
          cost_price:         row.totalCostPerUnit,
          min_price:          row.sellPrice ? Math.round(row.sellPrice * 0.92) : null,
          max_price:          row.sellPrice || null,
          lot_id:             lot.id,
          allocated_lot_cost: row.allocatedCostPerUnit,
          refurb_cost:        0,
          status:             "available",
        });
      }
    }

    for (let i = 0; i < stockItems.length; i += 20) {
      const { error } = await supabase.from("stock").insert(stockItems.slice(i, i + 20));
      if (error) { alert("Stock insert failed: " + error.message); setLotSaving(false); return; }
    }

    // 3. Mark deal as in_stock
    await patchDeal({ status: "in_stock", shipping_cost_aed: localShipping, landed_cost_aed: landed });
    setShowMove(false);
    setLotRows([]); setLotAllocated([]); setLotName(""); setUploadError(null);
    if (onAddToStock) onAddToStock();
    showToast(`✅ Lot created · ${stockItems.length} devices added to stock`);
    setLotSaving(false);
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
            <button onClick={() => { setLotName(d.lot_name || d.supplier_name || ""); setShowMove(true); }}
              style={{ padding: "9px 20px", borderRadius: 10, border: "2px solid rgba(255,255,255,0.4)",
                background: "rgba(255,255,255,0.15)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              📦 Convert to Lot →
            </button>
          </div>
        )}

        {/* Follow-up panel */}
        {d.supplier_id && (
          <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <FollowUpPanel customerId={d.supplier_id} />
          </div>
        )}

        {/* Deal-specific notes — filtered to this deal */}
        <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", minHeight: 300, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#0F172A" }}>📝 Notes — {d.lot_name || "This Deal"}</span>
          </div>
          <SupplierNotesView filterDealId={d.id} customerId={d.supplier_id || null} />
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

        <SourcingCalculator
          deal={d}
          rate={localRate}
          patchDeal={patchDeal}
        />

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
      {/* ── Convert to Lot Modal ── */}
      {showMove && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 420 }}>

              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>📦 Convert to Lot</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{d.supplier_name} · {d.lot_name || "—"}</div>
                </div>
                <button onClick={() => { setShowMove(false); setLotRows([]); setUploadError(null); }}
                  style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>

              {/* Landed cost summary */}
              <div style={{ padding: "10px 14px", borderRadius: 12, background: "#EEF2FF", border: "1px solid #C7D2FE", marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#4338CA", marginBottom: 6 }}>LANDED COST (used for allocation)</div>
                {[
                  { l: "Purchase", v: fmtAED(Number(d.our_bid_usd || 0) * Number(d.units_bid || 0) * localRate) },
                  { l: "Shipping", v: fmtAED(localShipping) },
                  { l: "Duty 5%",  v: fmtAED((Number(d.our_bid_usd || 0) * Number(d.units_bid || 0) * localRate) * 0.05) },
                  { l: "Total",    v: fmtAED(landed), bold: true },
                ].map((row, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span style={{ fontSize: 11, color: "#4338CA" }}>{row.l}</span>
                    <span style={{ fontSize: 11, fontWeight: row.bold ? 800 : 600, color: "#4338CA" }}>{row.v}</span>
                  </div>
                ))}
              </div>

              {/* Lot name */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>LOT NAME</div>
                <input value={lotName} onChange={e => setLotName(e.target.value)}
                  placeholder={d.lot_name || d.supplier_name || "e.g. HP/Dell Mixed May 2025"}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Upload sheet */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>UPLOAD PRICING SHEET</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6, lineHeight: 1.5 }}>
                  Use the JNP Stock Import Template. Fill Brand, Model, Qty, Market Value, Sell Price for each model.
                </div>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleSheetUpload}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1.5px dashed #E2E8F0", fontSize: 12, boxSizing: "border-box", background: "#F8FAFC" }} />
                {uploadError && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 5, fontWeight: 600 }}>{uploadError}</div>}
              </div>

              {/* Allocation preview */}
              {lotRows.length > 0 && (() => {
                const alloc = getLatestAllocation();
                const totalDevices = alloc.reduce((s, r) => s + r.qty, 0);
                return (
                  <>
                    <div style={{ background: "#F8FAFC", borderRadius: 12, padding: 12, marginBottom: 12, border: "1px solid #F1F5F9" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>
                        Cost Allocation Preview ({totalDevices} devices)
                      </div>
                      {alloc.map((row, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "6px 0", borderBottom: i < alloc.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A" }}>
                              {row.brand} {row.model} {row.condition ? `· ${row.condition}` : ""} ×{row.qty}
                            </div>
                            {row.processor && <div style={{ fontSize: 10, color: "#94A3B8" }}>{row.processor}</div>}
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: "#EF4444" }}>Cost {fmtAED(row.totalCostPerUnit)}</div>
                            {row.sellPrice > 0 && (
                              <div style={{ fontSize: 10, color: "#10B981", fontWeight: 700 }}>
                                Profit {fmtAED(row.sellPrice - row.totalCostPerUnit)}
                                {" "}({row.sellPrice > 0 ? (((row.sellPrice - row.totalCostPerUnit) / row.sellPrice) * 100).toFixed(1) : 0}%)
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button onClick={handleConvertToLot} disabled={lotSaving}
                      style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", fontWeight: 800, fontSize: 14,
                        cursor: lotSaving ? "not-allowed" : "pointer",
                        background: lotSaving ? "#E2E8F0" : "#10B981",
                        color: lotSaving ? "#94A3B8" : "#fff" }}>
                      {lotSaving ? `⏳ Creating lot...` : `✅ Create Lot & Add ${totalDevices} Devices to Stock`}
                    </button>
                  </>
                );
              })()}

              {lotRows.length === 0 && (
                <div style={{ textAlign: "center", padding: "16px 0", color: "#CBD5E1", fontSize: 12 }}>
                  Upload your pricing sheet to preview cost allocation
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
