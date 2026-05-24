import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useCustomers } from "../../context/CustomerContext";

const ACTIVITY_TYPES = [
  { id: "called",    label: "📞 Called",    color: "#6366F1", bg: "#EEF2FF" },
  { id: "no_answer", label: "📵 No answer", color: "#EF4444", bg: "#FEF2F2" },
  { id: "messaged",  label: "💬 Messaged",  color: "#10B981", bg: "#ECFDF5" },
  { id: "met",       label: "🤝 Met",       color: "#F59E0B", bg: "#FFFBEB" },
];

const TIME_OPTIONS = [
  { label: "1 hour",   hours: 1 },
  { label: "3 hours",  hours: 3 },
  { label: "Tomorrow", hours: 24 },
  { label: "2 days",   hours: 48 },
  { label: "1 week",   hours: 168 },
];

export default function FollowUpPanel() {
  const { activeCustomer, activeCustomerId, loadCustomers } = useCustomers();
  const [expanded, setExpanded] = useState(false);
  const [followUp, setFollowUp] = useState(null);
  const [activityLog, setActivityLog] = useState([]);
  const [notes, setNotes] = useState(activeCustomer?.notes || "");
  const [notesSaving, setNotesSaving] = useState(false);
  const [showTimeOptions, setShowTimeOptions] = useState(false);
  const [followUpNote, setFollowUpNote] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => {
    if (activeCustomerId) {
      loadFollowUp();
      loadActivityLog();
      setNotes(activeCustomer?.notes || "");
    }
  }, [activeCustomerId]); // eslint-disable-line

  const loadFollowUp = async () => {
    // Use maybeSingle() instead of single() to avoid error when no record found
    const { data } = await supabase
      .from("follow_ups")
      .select("*")
      .eq("customer_id", activeCustomerId)
      .eq("status", "pending")
      .order("due_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    setFollowUp(data || null);
  };

  const loadActivityLog = async () => {
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .eq("customer_id", activeCustomerId)
      .order("logged_at", { ascending: false })
      .limit(10);
    setActivityLog(data || []);
  };

  const setFollowUpTime = async (hours) => {
    setLoading(true);
    const dueAt = new Date(Date.now() + hours * 3600000).toISOString();
    try {
      if (followUp) {
        await supabase.from("follow_ups")
          .update({ due_at: dueAt, note: followUpNote, status: "pending", updated_at: new Date().toISOString() })
          .eq("id", followUp.id);
      } else {
        await supabase.from("follow_ups")
          .insert({ customer_id: activeCustomerId, due_at: dueAt, note: followUpNote, status: "pending" });
      }
    } catch (err) {
      console.error("Follow-up save error:", err);
    }
    setShowTimeOptions(false);
    setFollowUpNote("");
    setLoading(false);
    setTimeout(() => loadFollowUp(), 500);
  };

  const setCustomFollowUpTime = async () => {
    if (!customTime) return;
    setLoading(true);
    const dueAt = new Date(customTime).toISOString();
    try {
      if (followUp) {
        await supabase.from("follow_ups")
          .update({ due_at: dueAt, note: followUpNote, status: "pending", updated_at: new Date().toISOString() })
          .eq("id", followUp.id);
      } else {
        await supabase.from("follow_ups")
          .insert({ customer_id: activeCustomerId, due_at: dueAt, note: followUpNote, status: "pending" });
      }
    } catch (err) {
      console.error("Follow-up custom time save error:", err);
    }
    setShowTimeOptions(false);
    setShowCustomTime(false);
    setFollowUpNote("");
    setLoading(false);
    setTimeout(() => loadFollowUp(), 500);
  };

  const markFollowUpDone = async () => {
    if (!followUp) return;
    await supabase.from("follow_ups")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", followUp.id);
    setFollowUp(null);
  };

  // Clear = delete the follow-up entirely (mistake correction)
  const clearFollowUp = async () => {
    if (!followUp) return;
    await supabase.from("follow_ups").delete().eq("id", followUp.id);
    setFollowUp(null);
    setClearConfirm(false);
  };

  const snoozeFollowUp = async () => {
    if (!followUp) return;
    const newDue = new Date(Date.now() + 3600000).toISOString();
    await supabase.from("follow_ups")
      .update({ due_at: newDue, updated_at: new Date().toISOString() })
      .eq("id", followUp.id);
    await loadFollowUp();
  };

  const logActivity = async (type) => {
    await supabase.from("activity_log").insert({
      customer_id: activeCustomerId,
      activity_type: type,
      logged_at: new Date().toISOString(),
    });
    await supabase.from("customers")
      .update({ last_active: new Date().toISOString(), last_activity_at: new Date().toISOString() })
      .eq("id", activeCustomerId);
    await loadActivityLog();
    await loadCustomers();
  };

  const saveNotes = async (val) => {
    setNotesSaving(true);
    await supabase.from("customers").update({ notes: val }).eq("id", activeCustomerId);
    await loadCustomers();
    setNotesSaving(false);
  };

  const formatDueAt = (dueAt) => {
    if (!dueAt) return "";
    const d = new Date(dueAt);
    const now = new Date();
    const diff = d - now;
    const hours = Math.round(diff / 3600000);
    if (hours < 0) return `Overdue ${Math.abs(hours)}h`;
    if (hours < 1) return "Due now";
    if (hours < 24) return `In ${hours}h`;
    const days = Math.round(hours / 24);
    if (days === 1) return `Tomorrow ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
    return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  };

  const isOverdue = followUp && new Date(followUp.due_at) < new Date();

  const collapsedRow = (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        cursor: "pointer",
        borderBottom: expanded ? "none" : "1px solid #F1F5F9",
      }}>
      {followUp ? (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderRadius: 20,
          background: isOverdue ? "#FEF2F2" : "#FFFBEB",
          border: `1px solid ${isOverdue ? "#FEE2E2" : "#FDE68A"}`,
        }}>
          <span style={{ fontSize: 13 }}>📅</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: isOverdue ? "#EF4444" : "#D97706" }}>
            {formatDueAt(followUp.due_at)}
          </span>
          {followUp.note && (
            <span style={{ fontSize: 11, color: "#94A3B8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
              — {followUp.note}
            </span>
          )}
          <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: "auto" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      ) : (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          borderRadius: 20,
          background: "#F8FAFC",
          border: "1px dashed #E2E8F0",
        }}>
          <span style={{ fontSize: 13 }}>📅</span>
          <span style={{ fontSize: 12, color: "#94A3B8" }}>Set follow-up</span>
          <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: "auto" }}>{expanded ? "▲" : "▼"}</span>
        </div>
      )}

      {ACTIVITY_TYPES.map(a => (
        <button
          key={a.id}
          onClick={e => { e.stopPropagation(); logActivity(a.id); }}
          title={a.label}
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: `1px solid ${a.bg}`,
            background: a.bg,
            fontSize: 14,
            cursor: "pointer",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
          {a.label.split(" ")[0]}
        </button>
      ))}
    </div>
  );

  if (!expanded) return collapsedRow;

  return (
    <div style={{ borderBottom: "1px solid #F1F5F9" }}>
      {collapsedRow}

      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* FOLLOW-UP SECTION */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>📅 FOLLOW-UP</div>

          {followUp && !showTimeOptions ? (
            <div>
              <div style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: isOverdue ? "#FEF2F2" : "#FFFBEB",
                border: `1px solid ${isOverdue ? "#FEE2E2" : "#FDE68A"}`,
                marginBottom: 8,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isOverdue ? "#EF4444" : "#D97706" }}>
                  {formatDueAt(followUp.due_at)}
                </div>
                {followUp.note && <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{followUp.note}</div>}
              </div>

              {/* Clear confirm state */}
              {clearConfirm ? (
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <div style={{ flex: 1, fontSize: 12, color: "#EF4444", display: "flex", alignItems: "center" }}>Remove this follow-up?</div>
                  <button onClick={clearFollowUp}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#EF4444", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Yes, clear
                  </button>
                  <button onClick={() => setClearConfirm(false)}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 12, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={markFollowUpDone}
                    style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "#ECFDF5", color: "#10B981", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    ✓ Done
                  </button>
                  <button onClick={snoozeFollowUp}
                    style={{ flex: 1, padding: "7px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    +1hr
                  </button>
                  <button onClick={() => setShowTimeOptions(true)}
                    style={{ flex: 1, padding: "7px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#6366F1", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    ✏️ Edit
                  </button>
                  <button onClick={() => setClearConfirm(true)}
                    style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    ✕
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <input
                value={followUpNote}
                onChange={e => setFollowUpNote(e.target.value)}
                placeholder='Note — e.g. "waiting for wife approval"'
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box", marginBottom: 8 }}
              />
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                {TIME_OPTIONS.map(t => (
                  <button key={t.label} onClick={() => setFollowUpTime(t.hours)} disabled={loading}
                    style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {t.label}
                  </button>
                ))}
                <button onClick={() => setShowCustomTime(v => !v)}
                  style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid #C7D2FE", background: "#EEF2FF", color: "#6366F1", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Pick time
                </button>
              </div>
              {showCustomTime && (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <input type="datetime-local" value={customTime} onChange={e => setCustomTime(e.target.value)}
                    style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none" }} />
                  <button onClick={setCustomFollowUpTime} disabled={!customTime || loading}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Set
                  </button>
                </div>
              )}
              {followUp && (
                <button onClick={() => { setShowTimeOptions(false); setShowCustomTime(false); }}
                  style={{ marginTop: 6, padding: "5px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 12, cursor: "pointer" }}>
                  ← Cancel
                </button>
              )}
            </div>
          )}
        </div>

        {/* NOTES SECTION */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>
            📝 NOTES {notesSaving && <span style={{ color: "#10B981" }}>• saving...</span>}
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            onBlur={() => saveNotes(notes)}
            placeholder='e.g. "Prefers MacBook, budget 3k–3.5k. Comes weekends only."'
            rows={3}
            style={{ width: "100%", padding: "9px 11px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box", color: "#334155" }}
          />
        </div>

        {/* ACTIVITY LOG */}
        {activityLog.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>📋 ACTIVITY</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {activityLog.map((a, i) => {
                const type = ACTIVITY_TYPES.find(t => t.id === a.activity_type);
                const d = new Date(a.logged_at);
                const timeStr = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "#F8FAFC" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: type?.color || "#94A3B8", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}>{type?.label || a.activity_type}</span>
                      {a.note && <span style={{ fontSize: 11, color: "#94A3B8" }}> — {a.note}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "#CBD5E1" }}>{timeStr}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
