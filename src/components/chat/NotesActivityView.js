import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import { useCustomers } from "../../context/CustomerContext";
import { useAuth } from "../../context/AuthContext";
import { useChat } from "../../context/ChatContext";
import { useChatActions } from "../../hooks/useChatActions";

const ACTIVITY_TYPES = [
  { id: "called",    label: "📞 Called",    color: "#6366F1", bg: "#EEF2FF" },
  { id: "no_answer", label: "📵 No answer", color: "#EF4444", bg: "#FEF2F2" },
  { id: "messaged",  label: "💬 Messaged",  color: "#10B981", bg: "#ECFDF5" },
  { id: "met",       label: "🤝 Met",       color: "#F59E0B", bg: "#FFFBEB" },
];

export default function NotesActivityView() {
  const { activeCustomerId, activeCustomer, loadCustomers, activeDeal } = useCustomers();
  const { anthropicKey } = useAuth();
  const [intel, setIntel] = useState(null);
  const [intelLoading, setIntelLoading] = useState(false);
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

  const [noteText, setNoteText]       = useState("");
  const [activityLog, setActivityLog] = useState([]);
  const [saving, setSaving]           = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [editText, setEditText]       = useState("");
  const [deletingId, setDeletingId]   = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (activeCustomerId) {
      setNoteText("");
      setEditingId(null);
      fetchActivityLog(activeCustomerId);
    }
  }, [activeCustomerId]); // eslint-disable-line

  async function fetchActivityLog(cid) {
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .eq("customer_id", cid)
      .order("logged_at", { ascending: false })
      .limit(50);
    setActivityLog(data || []);
  }

  async function analyzeNote(noteText) {
    if (!anthropicKey || !noteText.trim() || noteText.length < 20) return;
    setIntelLoading(true);
    setIntel(null);
    const deal = activeDeal;
    const prompt = `Extract actionable information from this sales note. Return JSON only, no other text.

Note: "${noteText}"
Current deal: ${deal ? `${deal.brand || ""} ${deal.model || ""}, Budget AED ${deal.budget || "unknown"}, Stage: ${deal.stage}` : "No active deal"}

Return:
{
  "budgetUpdate": number or null,
  "stageUpdate": "new_inquiry|requirement_noted|searching|device_found|negotiation|confirmed_pending_pickup|closed|lost|waiting" or null,
  "followUpSuggestion": "description of suggested follow-up" or null,
  "followUpDays": number or null,
  "insight": "one sentence insight" or null
}

Only extract if clearly mentioned. budgetUpdate only if client explicitly stated a price/budget. stageUpdate only if the stage clearly changed.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await res.json();
      const raw = data?.content?.[0]?.text || "";
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const hasInsight = parsed.budgetUpdate || parsed.stageUpdate || parsed.followUpSuggestion || parsed.insight;
      if (hasInsight) setIntel(parsed);
    } catch (e) {
      // Silently fail — note intelligence is optional enhancement
      console.log("Note intel skipped:", e?.message);
    }
    setIntelLoading(false);
  }

  async function applyIntel(type) {
    if (!intel || !activeDeal) return;
    if (type === "budget" && intel.budgetUpdate) {
      await supabase.from("deals").update({ budget: intel.budgetUpdate }).eq("id", activeDeal.id);
      await loadCustomers();
    }
    if (type === "stage" && intel.stageUpdate) {
      await supabase.from("deals").update({ stage: intel.stageUpdate }).eq("id", activeDeal.id);
      await loadCustomers();
    }
    if (type === "followup" && intel.followUpSuggestion) {
      const due = new Date();
      due.setDate(due.getDate() + (intel.followUpDays || 1));
      due.setHours(10, 0, 0, 0);
      await supabase.from("follow_ups").insert({
        customer_id: activeCustomerId,
        due_at: due.toISOString(),
        note: intel.followUpSuggestion,
        status: "pending",
      });
    }
    setIntel(null);
  }

  async function saveNote() {
    if (!noteText.trim() || !activeCustomerId || saving) return;
    setSaving(true);
    await supabase.from("activity_log").insert({
      customer_id:   activeCustomerId,
      activity_type: "note",
      note:          noteText.trim(),
      logged_at:     new Date().toISOString(),
    });
    await supabase.from("customers")
      .update({ last_active: new Date().toISOString(), last_activity_at: new Date().toISOString() })
      .eq("id", activeCustomerId);
    const savedText = noteText.trim();
    setNoteText("");
    setSaving(false);
    await fetchActivityLog(activeCustomerId);
    loadCustomers();
    analyzeNote(savedText);
  }

  async function logActivity(type) {
    if (!activeCustomerId) return;
    await supabase.from("activity_log").insert({
      customer_id:   activeCustomerId,
      activity_type: type,
      logged_at:     new Date().toISOString(),
    });
    await supabase.from("customers")
      .update({ last_active: new Date().toISOString(), last_activity_at: new Date().toISOString() })
      .eq("id", activeCustomerId);
    await fetchActivityLog(activeCustomerId);
    loadCustomers();
  }

  async function saveEdit(id) {
    if (!editText.trim()) return;
    await supabase.from("activity_log").update({ note: editText.trim() }).eq("id", id);
    setEditingId(null);
    setEditText("");
    await fetchActivityLog(activeCustomerId);
  }

  async function deleteEntry(id) {
    await supabase.from("activity_log").delete().eq("id", id);
    setDeletingId(null);
    await fetchActivityLog(activeCustomerId);
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported. Try Chrome."); return; }
    const r = new SR();
    r.lang = "en-US";
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
      setNoteText(transcript);
    };
    r.onerror = () => setIsRecording(false);
    r.onend   = () => setIsRecording(false);
    r.start();
    recognitionRef.current = r;
    setIsRecording(true);
  }

  function stopVoice() {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }

  function fmtDate(dateStr) {
    if (!dateStr) return "";
    const d     = new Date(dateStr);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return (
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
      " · " +
      d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F8FAFC" }}>

      {/* ── Input area ── */}
      <div style={{ padding: "10px 14px 12px", background: "#fff", borderBottom: "1px solid #F1F5F9", flexShrink: 0 }}>

        {/* Activity quick buttons */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {ACTIVITY_TYPES.map(a => (
            <button key={a.id} onClick={() => logActivity(a.id)}
              style={{
                flex: 1, padding: "7px 2px", borderRadius: 8,
                border: "1px solid " + a.bg, background: a.bg,
                fontSize: 11, fontWeight: 700, color: a.color,
                cursor: "pointer", whiteSpace: "nowrap",
                overflow: "hidden", textOverflow: "ellipsis",
              }}>
              {a.label}
            </button>
          ))}
        </div>

        {/* Note input */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveNote(); }
            }}
            placeholder="Write a note... (Enter to save)"
            rows={2}
            style={{
              flex: 1, padding: "9px 11px", borderRadius: 10,
              border: "1.5px solid #E2E8F0", fontSize: 13,
              outline: "none", resize: "none", fontFamily: "inherit",
              lineHeight: 1.5, boxSizing: "border-box",
              color: "#334155", background: "#F8FAFC",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <button
              onClick={isRecording ? stopVoice : startVoice}
              title={isRecording ? "Stop recording" : "Voice note"}
              style={{
                width: 36, height: 36, borderRadius: 10, border: "none",
                background: isRecording ? "#FEF2F2" : "#F1F5F9",
                color: isRecording ? "#EF4444" : "#64748B",
                fontSize: 15, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              {isRecording ? "⏹" : "🎤"}
            </button>
            <button
              onClick={saveNote}
              disabled={!noteText.trim() || saving}
              style={{
                width: 36, height: 36, borderRadius: 10, border: "none",
                background: noteText.trim() ? "#6366F1" : "#F1F5F9",
                color: noteText.trim() ? "#fff" : "#CBD5E1",
                fontSize: 18, fontWeight: 700,
                cursor: noteText.trim() ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
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

      {/* ── Note Intelligence Panel ── */}
      {(intelLoading || intel) && (
        <div style={{ padding: "8px 14px", background: "#EEF2FF", borderBottom: "1px solid #C7D2FE", flexShrink: 0 }}>
          {intelLoading && (
            <div style={{ fontSize: 11, color: "#6366F1", fontWeight: 600 }}>🤖 Reading note...</div>
          )}
          {intel && !intelLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#534AB7" }}>🤖 Claude noticed</span>
                <button onClick={() => setIntel(null)} style={{ fontSize: 11, color: "#94A3B8", background: "none", border: "none", cursor: "pointer" }}>Dismiss</button>
              </div>
              {intel.insight && <div style={{ fontSize: 11, color: "#334155", lineHeight: 1.5 }}>{intel.insight}</div>}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {intel.budgetUpdate && activeDeal && (
                  <button onClick={() => applyIntel("budget")} style={{ padding: "4px 10px", borderRadius: 20, border: "none", background: "#6366F1", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Update budget → AED {intel.budgetUpdate.toLocaleString()}
                  </button>
                )}
                {intel.stageUpdate && activeDeal && intel.stageUpdate !== activeDeal.stage && (
                  <button onClick={() => applyIntel("stage")} style={{ padding: "4px 10px", borderRadius: 20, border: "none", background: "#10B981", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Move to {intel.stageUpdate.replace(/_/g, " ")}
                  </button>
                )}
                {intel.followUpSuggestion && (
                  <button onClick={() => applyIntel("followup")} style={{ padding: "4px 10px", borderRadius: 20, border: "none", background: "#F59E0B", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    📅 Set follow-up
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
                // ── Edit mode ──
                <div>
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(entry.id); }
                      if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                    }}
                    rows={3}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 8,
                      border: "1.5px solid #6366F1", fontSize: 13,
                      outline: "none", resize: "none", fontFamily: "inherit",
                      lineHeight: 1.5, boxSizing: "border-box", marginBottom: 8,
                    }}
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => saveEdit(entry.id)}
                      style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Save
                    </button>
                    <button onClick={() => { setEditingId(null); setEditText(""); }}
                      style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 12, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : isDeleting ? (
                // ── Delete confirm ──
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 12, color: "#EF4444", fontWeight: 600 }}>Delete this entry?</span>
                  <button onClick={() => deleteEntry(entry.id)}
                    style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#EF4444", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Delete
                  </button>
                  <button onClick={() => setDeletingId(null)}
                    style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 12, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              ) : (
                // ── Normal view ──
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    {isNote ? (
                      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>{entry.note}</div>
                    ) : (
                      <div style={{ fontSize: 12, fontWeight: 700, color: type?.color || "#64748B" }}>
                        {type?.label || entry.activity_type}
                        {entry.note && (
                          <span style={{ fontWeight: 400, color: "#94A3B8", fontSize: 12 }}> — {entry.note}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, color: "#CBD5E1", whiteSpace: "nowrap" }}>
                      {fmtDate(entry.logged_at)}
                    </span>
                    {isNote && (
                      <button onClick={() => { setEditingId(entry.id); setEditText(entry.note || ""); }}
                        title="Edit"
                        style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "#F1F5F9", color: "#94A3B8", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        ✏️
                      </button>
                    )}
                    <button onClick={() => setDeletingId(entry.id)}
                      title="Delete"
                      style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "#FEF2F2", color: "#EF4444", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      🗑
                    </button>
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
                style={{
                  width: "100%", padding: 13, borderRadius: 12, border: "none", marginBottom: 18,
                  background: supplierReplyLoading ? "#E2E8F0" : "#2563EB",
                  color: supplierReplyLoading ? "#94A3B8" : "#fff",
                  fontWeight: 800, fontSize: 14, cursor: "pointer",
                }}>
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
