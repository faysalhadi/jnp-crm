import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import { useCustomers } from "../../context/CustomerContext";
import { useChat } from "../../context/ChatContext";
import { useChatActions } from "../../hooks/useChatActions";

const ACTIVITY_TYPES = [
  { id: "called",    label: "📞 Called",    color: "#6366F1", bg: "#EEF2FF" },
  { id: "no_answer", label: "📵 No answer", color: "#EF4444", bg: "#FEF2F2" },
  { id: "messaged",  label: "💬 Messaged",  color: "#10B981", bg: "#ECFDF5" },
  { id: "met",       label: "🤝 Met",       color: "#D97706", bg: "#FFFBEB" },
];

const CHANNELS = [
  { id: "whatsapp", label: "💬 WhatsApp", color: "#25D366", bg: "#F0FDF4" },
  { id: "gmail",    label: "📧 Gmail",    color: "#EA4335", bg: "#FEF2F2" },
];

export default function SupplierNotesView({ filterDealId = null }) {
  const { activeCustomerId, activeCustomer, loadCustomers } = useCustomers();
  const {
    showSupplierReply, setShowSupplierReply,
    supplierReplyCtx, setSupplierReplyCtx,
    supplierReplyGmail, setSupplierReplyGmail,
    supplierReplyWA, setSupplierReplyWA,
    supplierReplyLoading,
    copiedSupGmail, setCopiedSupGmail,
    copiedSupWA, setCopiedSupWA,
  } = useChat();
  const { generateSupplierReply } = useChatActions();

  const [noteText, setNoteText]     = useState("");
  const [channel, setChannel]       = useState("whatsapp");
  const [selectedDealId, setSelectedDealId] = useState(filterDealId || "");
  const [openDeals, setOpenDeals]   = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [saving, setSaving]         = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [editText, setEditText]     = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (activeCustomerId) {
      setNoteText("");
      setEditingId(null);
      setSelectedDealId(filterDealId || "");
      fetchAll(activeCustomerId);
    }
  }, [activeCustomerId, filterDealId]); // eslint-disable-line

  async function fetchAll(cid) {
    // Fetch open sourcing deals for this supplier
    const { data: deals } = await supabase
      .from("sourcing_deals")
      .select("id, lot_name, status")
      .eq("supplier_id", cid)
      .not("status", "in", '("in_stock","cancelled")')
      .order("created_at", { ascending: false });
    setOpenDeals(deals || []);

    // Fetch activity log
    try {
      let query = supabase
        .from("activity_log")
        .select("*")
        .eq("customer_id", cid)
        .order("logged_at", { ascending: false })
        .limit(50);
      if (filterDealId) query = query.eq("sourcing_deal_id", filterDealId);
      const { data: logs, error } = await query;
      // If filter fails (column missing), fetch all and filter client-side
      if (error && filterDealId) {
        const { data: allLogs } = await supabase.from("activity_log").select("*").eq("customer_id", cid).order("logged_at", { ascending: false }).limit(50);
        setActivityLog(allLogs || []);
      } else {
        setActivityLog(logs || []);
      }
    } catch { setActivityLog([]); }
  }

  async function saveNote() {
    if (!noteText.trim() || !activeCustomerId || saving) return;
    setSaving(true);

    // Try with new columns first, fall back to basic insert if columns missing
    const payload = {
      customer_id:   activeCustomerId,
      activity_type: "note",
      note:          noteText.trim(),
      logged_at:     new Date().toISOString(),
    };

    // Add new columns only if they might exist
    const extPayload = { ...payload, channel, sourcing_deal_id: selectedDealId || null };
    let { error } = await supabase.from("activity_log").insert(extPayload);

    // If error (columns missing), retry without new columns
    if (error) {
      console.warn("Extended insert failed, trying basic:", error.message);
      ({ error } = await supabase.from("activity_log").insert(payload));
      if (error) { console.error("saveNote failed:", error.message); setSaving(false); return; }
    }

    await supabase.from("customers")
      .update({ last_active: new Date().toISOString(), last_activity_at: new Date().toISOString() })
      .eq("id", activeCustomerId);
    setNoteText("");
    setSaving(false);
    await fetchAll(activeCustomerId);
    loadCustomers();
  }

  async function logActivity(type) {
    if (!activeCustomerId) return;
    const payload = { customer_id: activeCustomerId, activity_type: type, logged_at: new Date().toISOString() };
    const extPayload = { ...payload, channel, sourcing_deal_id: selectedDealId || null };
    let { error } = await supabase.from("activity_log").insert(extPayload);
    if (error) await supabase.from("activity_log").insert(payload);
    await supabase.from("customers")
      .update({ last_active: new Date().toISOString(), last_activity_at: new Date().toISOString() })
      .eq("id", activeCustomerId);
    await fetchAll(activeCustomerId);
    loadCustomers();
  }

  async function saveEdit(id) {
    if (!editText.trim()) return;
    await supabase.from("activity_log").update({ note: editText.trim() }).eq("id", id);
    setEditingId(null); setEditText("");
    await fetchAll(activeCustomerId);
  }

  async function deleteEntry(id) {
    await supabase.from("activity_log").delete().eq("id", id);
    setDeletingId(null);
    await fetchAll(activeCustomerId);
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported. Try Chrome."); return; }
    const r = new SR();
    r.lang = "en-US"; r.continuous = false; r.interimResults = true;
    r.onresult = (e) => setNoteText(Array.from(e.results).map(r => r[0].transcript).join(""));
    r.onerror = () => setIsRecording(false);
    r.onend   = () => setIsRecording(false);
    r.start();
    recognitionRef.current = r;
    setIsRecording(true);
  }

  function stopVoice() { recognitionRef.current?.stop(); setIsRecording(false); }

  function fmtDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr), today = new Date();
    if (d.toDateString() === today.toDateString())
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
      " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }

  function getDealLabel(dealId) {
    if (!dealId) return null;
    const deal = openDeals.find(d => d.id === dealId);
    return deal?.lot_name || "Deal";
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F8FAFC" }}>

      {/* ── Input area ── */}
      <div style={{ padding: "10px 14px 12px", background: "#fff", borderBottom: "1px solid #F1F5F9", flexShrink: 0 }}>

        {/* Activity buttons */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {ACTIVITY_TYPES.map(a => (
            <button key={a.id} onClick={() => logActivity(a.id)}
              style={{ flex: 1, padding: "7px 2px", borderRadius: 8, border: "1px solid " + a.bg,
                background: a.bg, fontSize: 11, fontWeight: 700, color: a.color, cursor: "pointer",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {a.label}
            </button>
          ))}
        </div>

        {/* Channel toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {CHANNELS.map(ch => (
            <button key={ch.id} onClick={() => setChannel(ch.id)}
              style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: channel === ch.id ? ch.color : "#F1F5F9",
                color:      channel === ch.id ? "#fff"   : "#64748B" }}>
              {ch.label}
            </button>
          ))}
        </div>

        {/* Deal picker — only show if not already filtered to a specific deal */}
        {!filterDealId && (
          <div style={{ marginBottom: 8 }}>
            <select value={selectedDealId} onChange={e => setSelectedDealId(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0",
                fontSize: 12, outline: "none", background: "#F8FAFC", color: "#334155", fontFamily: "inherit" }}>
              <option value="">General (no specific deal)</option>
              {openDeals.map(d => (
                <option key={d.id} value={d.id}>{d.lot_name || "Unnamed Deal"} · {d.status?.replace(/_/g," ")}</option>
              ))}
            </select>
          </div>
        )}

        {/* Note input */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveNote(); } }}
            placeholder={`Write a ${channel === "gmail" ? "Gmail" : "WhatsApp"} note...`}
            rows={2}
            style={{ flex: 1, padding: "9px 11px", borderRadius: 10, border: "1.5px solid #E2E8F0",
              fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit",
              lineHeight: 1.5, boxSizing: "border-box", color: "#334155", background: "#F8FAFC" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <button onClick={isRecording ? stopVoice : startVoice}
              style={{ width: 36, height: 36, borderRadius: 10, border: "none",
                background: isRecording ? "#FEF2F2" : "#F1F5F9",
                color:      isRecording ? "#EF4444" : "#64748B",
                fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isRecording ? "⏹" : "🎤"}
            </button>
            <button onClick={saveNote} disabled={!noteText.trim() || saving}
              style={{ width: 36, height: 36, borderRadius: 10, border: "none",
                background: noteText.trim() ? "#6366F1" : "#F1F5F9",
                color:      noteText.trim() ? "#fff"    : "#CBD5E1",
                fontSize: 18, fontWeight: 700, cursor: noteText.trim() ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center" }}>
              {saving ? "⏳" : "↑"}
            </button>
          </div>
        </div>

        {isRecording && (
          <div style={{ fontSize: 11, color: "#EF4444", fontWeight: 600, marginTop: 5, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#EF4444", display: "inline-block" }} />
            Recording... tap ⏹ when done
          </div>
        )}
      </div>

      {/* ── Activity feed ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
        {activityLog.length === 0 && (
          <div style={{ textAlign: "center", color: "#CBD5E1", fontSize: 13, marginTop: 48, lineHeight: 1.8 }}>
            No notes yet.<br />Add your first note above.
          </div>
        )}

        {activityLog.map((entry, i) => {
          const type   = ACTIVITY_TYPES.find(t => t.id === entry.activity_type);
          const isNote = entry.activity_type === "note";
          const ch     = CHANNELS.find(c => c.id === entry.channel);
          const dealLabel = getDealLabel(entry.sourcing_deal_id);
          const isEditing  = editingId === entry.id;
          const isDeleting = deletingId === entry.id;

          return (
            <div key={entry.id || i} style={{
              padding: "10px 12px", borderRadius: 12,
              background: isNote ? "#fff" : (type?.bg || "#F8FAFC"),
              border: "1px solid " + (isNote ? "#E2E8F0" : (type?.bg || "#F1F5F9")),
              boxShadow: isNote ? "0 1px 3px rgba(0,0,0,0.04)" : "none",
            }}>
              {isEditing ? (
                <div>
                  <textarea autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(entry.id); } if (e.key === "Escape") { setEditingId(null); setEditText(""); } }}
                    rows={3}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #6366F1",
                      fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit",
                      lineHeight: 1.5, boxSizing: "border-box", marginBottom: 8 }} />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => saveEdit(entry.id)}
                      style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
                    <button onClick={() => { setEditingId(null); setEditText(""); }}
                      style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              ) : isDeleting ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 12, color: "#EF4444", fontWeight: 600 }}>Delete this entry?</span>
                  <button onClick={() => deleteEntry(entry.id)}
                    style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#EF4444", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                  <button onClick={() => setDeletingId(null)}
                    style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                </div>
              ) : (
                <div>
                  {/* Tags row — deal + channel */}
                  {(dealLabel || ch) && (
                    <div style={{ display: "flex", gap: 5, marginBottom: 5, flexWrap: "wrap" }}>
                      {dealLabel && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: "#EEF2FF", color: "#6366F1" }}>
                          📋 {dealLabel}
                        </span>
                      )}
                      {ch && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: ch.bg, color: ch.color }}>
                          {ch.label}
                        </span>
                      )}
                      {!dealLabel && !ch && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: "#F1F5F9", color: "#94A3B8" }}>
                          General
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      {isNote ? (
                        <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{entry.note}</div>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 700, color: type?.color || "#64748B" }}>
                          {type?.label || entry.activity_type}
                          {entry.note && <span style={{ fontWeight: 400, color: "#94A3B8", fontSize: 12 }}> — {entry.note}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: "#CBD5E1", whiteSpace: "nowrap" }}>{fmtDate(entry.logged_at)}</span>
                      {isNote && (
                        <button onClick={() => { setEditingId(entry.id); setEditText(entry.note || ""); }}
                          style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "#F1F5F9", color: "#94A3B8", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✏️</button>
                      )}
                      <button onClick={() => setDeletingId(entry.id)}
                        style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "#FEF2F2", color: "#EF4444", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>🗑</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Supplier reply modal ── */}
      {showSupplierReply && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>✍️ Generate Reply</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{activeCustomer?.name} · Supplier</div>
                </div>
                <button onClick={() => setShowSupplierReply(false)}
                  style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>WHAT DO YOU WANT TO SAY?</div>
              <textarea value={supplierReplyCtx} onChange={e => setSupplierReplyCtx(e.target.value)} rows={3}
                placeholder='e.g. "Accept their lot offer, ask for invoice and shipping quote"'
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 14 }} />
              <button onClick={generateSupplierReply} disabled={supplierReplyLoading}
                style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", marginBottom: 18,
                  background: supplierReplyLoading ? "#E2E8F0" : "#2563EB",
                  color: supplierReplyLoading ? "#94A3B8" : "#fff",
                  fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                {supplierReplyLoading ? "⏳ Generating…" : "⚡ Generate Gmail + WhatsApp"}
              </button>
              {supplierReplyGmail && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>📧 GMAIL — FORMAL</div>
                  <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: 8 }}>{supplierReplyGmail}</div>
                  <button onClick={() => { navigator.clipboard.writeText(supplierReplyGmail); setCopiedSupGmail(true); setTimeout(() => setCopiedSupGmail(false), 2000); }}
                    style={{ padding: "6px 16px", borderRadius: 20, border: "none", background: copiedSupGmail ? "#ECFDF5" : "#F1F5F9", color: copiedSupGmail ? "#059669" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {copiedSupGmail ? "✓ Copied!" : "📋 Copy Gmail"}
                  </button>
                </div>
              )}
              {supplierReplyWA && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>💬 WHATSAPP — SHORT</div>
                  <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: 8 }}>{supplierReplyWA}</div>
                  <button onClick={() => { navigator.clipboard.writeText(supplierReplyWA); setCopiedSupWA(true); setTimeout(() => setCopiedSupWA(false), 2000); }}
                    style={{ padding: "6px 16px", borderRadius: 20, border: "none", background: copiedSupWA ? "#ECFDF5" : "#F1F5F9", color: copiedSupWA ? "#059669" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {copiedSupWA ? "✓ Copied!" : "📋 Copy WhatsApp"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
