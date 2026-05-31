import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabase";
import { useAuth } from "../../context/AuthContext";
import { requestNotificationPermission, getNotificationPermission } from "../../utils/notifications";

function timeLabel(dateStr) {
  if (!dateStr) return "";
  const d     = new Date(dateStr);
  const now   = new Date();
  const diff  = d - now;
  const mins  = Math.round(diff / 60000);
  const hrs   = Math.round(diff / 3600000);
  const days  = Math.round(diff / 86400000);
  if (mins < -1440) return `${Math.abs(days)}d overdue`;
  if (mins < -60)   return `${Math.abs(hrs)}h overdue`;
  if (mins < 0)     return "Overdue";
  if (mins < 60)    return `In ${mins}m`;
  if (hrs  < 24)    return `In ${hrs}h`;
  if (days === 1)   return "Tomorrow";
  if (days < 7)     return `In ${days} days`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function isOverdue(dateStr) {
  return dateStr && new Date(dateStr) < new Date();
}

function isDueToday(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const t = new Date();
  return d.toDateString() === t.toDateString();
}

const QUICK_TIMES = [
  { label: "In 1h",     mins: 60 },
  { label: "In 3h",     mins: 180 },
  { label: "Tomorrow",  days: 1 },
  { label: "In 2 days", days: 2 },
  { label: "Next week", days: 7 },
];

const CATEGORIES = [
  { id: "client",   label: "👤 Client",    color: "#6366F1", bg: "#EEF2FF" },
  { id: "supplier", label: "📦 Supplier",   color: "#2563EB", bg: "#EFF6FF" },
  { id: "payment",  label: "💰 Payment",    color: "#D97706", bg: "#FFFBEB" },
  { id: "stock",    label: "📋 Stock",      color: "#10B981", bg: "#ECFDF5" },
  { id: "personal", label: "🔔 Personal",   color: "#64748B", bg: "#F1F5F9" },
];

export default function RemindersTab() {
  const { session } = useAuth();
  const [reminders, setReminders]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [showAdd, setShowAdd]       = useState(false);
  const [filter, setFilter]         = useState("pending"); // pending | done | all
  const [notifPerm, setNotifPerm]   = useState(getNotificationPermission());
  const [form, setForm] = useState({
    title: "", note: "", due_at: "", category: "personal",
  });

  const loadReminders = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("reminders").select("*").order("due_at", { ascending: true });
    if (filter === "pending") query = query.eq("status", "pending");
    if (filter === "done")    query = query.eq("status", "done");
    const { data } = await query;
    setReminders(data || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  async function addReminder() {
    if (!form.title.trim() || !form.due_at) return;
    await supabase.from("reminders").insert({
      title:    form.title.trim(),
      note:     form.note.trim() || null,
      due_at:   form.due_at,
      category: form.category,
      status:   "pending",
    });
    setForm({ title: "", note: "", due_at: "", category: "personal" });
    setShowAdd(false);
    loadReminders();
  }

  async function markDone(id) {
    await supabase.from("reminders").update({ status: "done", done_at: new Date().toISOString() }).eq("id", id);
    loadReminders();
  }

  async function deleteReminder(id) {
    await supabase.from("reminders").delete().eq("id", id);
    loadReminders();
  }

  async function requestPerm() {
    const result = await requestNotificationPermission();
    setNotifPerm(result);
  }

  function setQuickTime(item) {
    const d = new Date();
    if (item.mins) d.setMinutes(d.getMinutes() + item.mins);
    if (item.days) { d.setDate(d.getDate() + item.days); d.setHours(9, 0, 0, 0); }
    // Format for datetime-local input
    const pad  = n => String(n).padStart(2, "0");
    const val  = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    setForm(f => ({ ...f, due_at: val }));
  }

  const pending    = reminders.filter(r => r.status === "pending");
  const overdue    = pending.filter(r => isOverdue(r.due_at));
  const today      = pending.filter(r => !isOverdue(r.due_at) && isDueToday(r.due_at));
  const upcoming   = pending.filter(r => !isOverdue(r.due_at) && !isDueToday(r.due_at));

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Notification permission banner */}
      {notifPerm !== "granted" && notifPerm !== "unsupported" && (
        <div style={{ background: "linear-gradient(135deg, #6366F1, #7C3AED)", borderRadius: 16, padding: 16, color: "#fff" }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>🔔 Enable Push Notifications</div>
          <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 10, lineHeight: 1.6 }}>
            Get notified when a reminder is due — even when you're not in the app.
            {notifPerm === "denied" && " You've blocked notifications. Enable them in your browser settings."}
          </div>
          {notifPerm !== "denied" && (
            <button onClick={requestPerm}
              style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: "rgba(255,255,255,0.9)", color: "#6366F1", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              Enable Notifications
            </button>
          )}
        </div>
      )}

      {notifPerm === "granted" && (
        <div style={{ padding: "8px 14px", borderRadius: 12, background: "#ECFDF5", border: "1px solid #BBF7D0", fontSize: 11, color: "#059669", fontWeight: 600 }}>
          ✅ Notifications enabled — you'll be alerted 5 minutes before each reminder
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>⏰ Reminders</div>
          {overdue.length > 0 && (
            <div style={{ fontSize: 11, color: "#EF4444", fontWeight: 700, marginTop: 1 }}>
              {overdue.length} overdue
            </div>
          )}
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: showAdd ? "#F1F5F9" : "#6366F1", color: showAdd ? "#64748B" : "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
          {showAdd ? "Cancel" : "+ Add"}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #E2E8F0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>REMINDER TITLE *</div>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder='e.g. "Call Adrian about HP lot", "Pick up stock from JNP"'
              autoFocus
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>NOTE (optional)</div>
            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Any extra detail..."
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", marginBottom: 6, letterSpacing: 0.5 }}>WHEN *</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {QUICK_TIMES.map(t => (
                <button key={t.label} onClick={() => setQuickTime(t)}
                  style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#334155", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  {t.label}
                </button>
              ))}
            </div>
            <input type="datetime-local" value={form.due_at} onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", marginBottom: 6, letterSpacing: 0.5 }}>CATEGORY</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setForm(f => ({ ...f, category: cat.id }))}
                  style={{ padding: "5px 10px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: form.category === cat.id ? cat.color : "#F1F5F9",
                    color:      form.category === cat.id ? "#fff"    : "#64748B" }}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={addReminder} disabled={!form.title.trim() || !form.due_at}
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", fontWeight: 800, fontSize: 14, cursor: !form.title.trim() || !form.due_at ? "not-allowed" : "pointer",
              background: !form.title.trim() || !form.due_at ? "#E2E8F0" : "#6366F1",
              color:      !form.title.trim() || !form.due_at ? "#94A3B8" : "#fff" }}>
            Save Reminder
          </button>
        </div>
      )}

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 6 }}>
        {[
          { key: "pending", label: `Pending (${pending.length})` },
          { key: "done",    label: "Done" },
          { key: "all",     label: "All" },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: "5px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
              background: filter === f.key ? "#6366F1" : "#F1F5F9",
              color:      filter === f.key ? "#fff"    : "#64748B" }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", color: "#94A3B8", padding: 20, fontSize: 12 }}>Loading...</div>}

      {!loading && reminders.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>⏰</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8" }}>No reminders yet</div>
          <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>Tap + Add to create one</div>
        </div>
      )}

      {/* Overdue section */}
      {filter === "pending" && overdue.length > 0 && (
        <ReminderSection title="OVERDUE" color="#EF4444" items={overdue} onDone={markDone} onDelete={deleteReminder} />
      )}

      {/* Today section */}
      {filter === "pending" && today.length > 0 && (
        <ReminderSection title="TODAY" color="#D97706" items={today} onDone={markDone} onDelete={deleteReminder} />
      )}

      {/* Upcoming section */}
      {filter === "pending" && upcoming.length > 0 && (
        <ReminderSection title="UPCOMING" color="#6366F1" items={upcoming} onDone={markDone} onDelete={deleteReminder} />
      )}

      {/* Done / All list */}
      {(filter === "done" || filter === "all") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {reminders.map(r => (
            <ReminderCard key={r.id} reminder={r} onDone={markDone} onDelete={deleteReminder} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReminderSection({ title, color, items, onDone, onDelete }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
        <span style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: 1, whiteSpace: "nowrap" }}>{title} ({items.length})</span>
        <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map(r => <ReminderCard key={r.id} reminder={r} onDone={onDone} onDelete={onDelete} />)}
      </div>
    </div>
  );
}

function ReminderCard({ reminder: r, onDone, onDelete }) {
  const cat    = CATEGORIES.find(c => c.id === r.category) || CATEGORIES[4];
  const over   = r.status === "pending" && isOverdue(r.due_at);
  const done   = r.status === "done";

  return (
    <div style={{
      background: "#fff", borderRadius: 14, padding: "12px 14px",
      border: `1.5px solid ${over ? "#FEE2E2" : done ? "#F1F5F9" : "#F1F5F9"}`,
      opacity: done ? 0.65 : 1,
      boxShadow: over ? "0 2px 8px rgba(239,68,68,0.1)" : "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {/* Category dot */}
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color, marginTop: 4, flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: done ? 400 : 700, color: done ? "#94A3B8" : "#0F172A",
              textDecoration: done ? "line-through" : "none", flex: 1 }}>
              {r.title}
            </div>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap",
              background: over ? "#FEF2F2" : done ? "#F1F5F9" : "#F8FAFC",
              color:      over ? "#EF4444" : done ? "#94A3B8" : "#64748B",
            }}>
              {done ? "✓ Done" : timeLabel(r.due_at)}
            </span>
          </div>
          {r.note && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{r.note}</div>}
          <div style={{ fontSize: 9, color: "#CBD5E1", marginTop: 4 }}>
            {new Date(r.due_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
            {" · "}{new Date(r.due_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          {!done && (
            <button onClick={() => onDone(r.id)}
              style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#ECFDF5", color: "#10B981", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ✓
            </button>
          )}
          <button onClick={() => onDelete(r.id)}
            style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#FEF2F2", color: "#EF4444", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}
