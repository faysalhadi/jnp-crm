import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase";
import { useCustomers, getClientHealth, getQueuePriority } from "../../context/CustomerContext";
import { useStock } from "../../context/StockContext";
import { TagStrip } from "../chat/TagEditor";
import { STAGES, getRecommendation, customerStockMatch } from "../../constants";
import { formatWhatsAppNumber } from "../../utils/helpers";
import { dealTotal, dealUnitLine } from "../../utils/bulk";
import NewRequirementModal from "../modals/NewRequirementModal";

const ACT_ICON = {
  called: "📞", no_answer: "📵", messaged: "💬", met: "🤝",
  note: "📝", whatsapp: "💬", email: "📧",
};
const ACT_COLOR = {
  called: "#6366F1", no_answer: "#EF4444", messaged: "#10B981", met: "#F59E0B",
  note: "#334155", whatsapp: "#10B981", email: "#3B82F6",
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)  return "now";
  if (mins < 60) return `${mins}m`;
  if (hrs  < 24) return `${hrs}h`;
  if (days < 7)  return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const SH = {
  fontSize: 9, fontWeight: 800, color: "#94A3B8",
  letterSpacing: 1.2, marginTop: 18, marginBottom: 6,
};

export default function ClientPreviewPanel({ client, onOpenChat }) {
  const { loadCustomers, pendingFollowUpMap, lastActivityMap } = useCustomers();
  const { stock, loadStock, refreshCachedStock } = useStock();

  const [activities, setActivities]     = useState([]);
  const [followUps, setFollowUps]       = useState([]);
  const [historyOpen, setHistoryOpen]   = useState(false);
  const [showNewReq, setShowNewReq]     = useState(false);

  // D1 — customers.notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue]     = useState("");
  const [notesSaving, setNotesSaving]   = useState(false);

  // D2 — add activity note
  const [newNote, setNewNote]           = useState("");
  const [addingNote, setAddingNote]     = useState(false);

  useEffect(() => {
    if (!client?.id) return;
    setNotesValue(client.notes || "");
    setEditingNotes(false);
    setHistoryOpen(false);
    fetchPanelData(client.id);
  }, [client?.id]); // eslint-disable-line

  async function fetchPanelData(id) {
    const [{ data: acts }, { data: fus }] = await Promise.all([
      supabase
        .from("activity_log")
        .select("*")
        .eq("customer_id", id)
        .order("logged_at", { ascending: false })
        .limit(50),
      supabase
        .from("follow_ups")
        .select("*")
        .eq("customer_id", id)
        .eq("status", "pending")
        .order("due_at", { ascending: true }),
    ]);
    setActivities(acts || []);
    setFollowUps(fus || []);
  }

  async function saveNotes() {
    setNotesSaving(true);
    const { error } = await supabase
      .from("customers")
      .update({ notes: notesValue })
      .eq("id", client.id);
    if (!error) {
      await loadCustomers();
      setEditingNotes(false);
    }
    setNotesSaving(false);
  }

  async function markFollowUpDone(fuId) {
    await supabase
      .from("follow_ups")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", fuId);
    setFollowUps(prev => prev.filter(f => f.id !== fuId));
  }

  async function addNote() {
    if (!newNote.trim() || addingNote) return;
    setAddingNote(true);
    const now = new Date().toISOString();
    await supabase.from("activity_log").insert({
      customer_id:   client.id,
      activity_type: "note",
      note:          newNote.trim(),
      logged_at:     now,
    });
    await supabase
      .from("customers")
      .update({ last_activity_at: now })
      .eq("id", client.id);
    setNewNote("");
    await fetchPanelData(client.id);
    setAddingNote(false);
  }

  // Computed
  const health    = getClientHealth(client);
  const openDeals = (client.deals || []).filter(d => d.stage !== "closed" && d.stage !== "parked");
  const closedDeals = (client.deals || []).filter(d => d.stage === "closed" || d.stage === "parked");
  const closedValue = closedDeals
    .filter(d => d.stage === "closed")
    .reduce((a, d) => a + (d.value || 0), 0);

  const available = useMemo(
    () => (stock || []).filter(s => s.status === "available"),
    [stock]
  );
  const stockMatchSet = useMemo(() => {
    const s = new Set();
    if (customerStockMatch(client, available)) s.add(client.id);
    return s;
  }, [client, available]);

  const queuePriority = getQueuePriority(client, pendingFollowUpMap, stockMatchSet);
  const fu      = pendingFollowUpMap?.[client.id];
  const lastAct = lastActivityMap?.[client.id];

  const recommendation = useMemo(() => {
    if (!queuePriority) return null;
    return getRecommendation(client, {
      priority:     queuePriority,
      openDeal:     openDeals[0] || null,
      fu,
      matchedStock: customerStockMatch(client, available),
      lastNote:     lastAct?.activity_type === "note" ? lastAct : null,
    });
  }, [client, queuePriority, openDeals, fu, available, lastAct]); // eslint-disable-line

  const contactFields = [
    { label: "Phone",    value: client.number },
    { label: "Email",    value: client.email },
    { label: "Location", value: client.location },
    { label: "Stall",    value: client.stall_number },
    { label: "Tier",     value: client.tier },
    { label: "Type",     value: client.contact_type },
  ].filter(f => f.value);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#F8FAFC", minHeight: 0 }}>

      {/* ── HEADER ── */}
      <div style={{ padding: "16px 20px 12px", background: "#fff", borderBottom: "1px solid #F1F5F9", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
            background: health.bg, border: `2.5px solid ${health.color}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: health.color,
          }}>
            {(client.name || "?")[0].toUpperCase()}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: "#0F172A" }}>{client.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: health.bg, color: health.color }}>
                {health.label}
              </span>
            </div>
            {(client.tags || []).length > 0 && (
              <div style={{ marginTop: 4 }}><TagStrip tags={client.tags} max={6} /></div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
            {client.number ? (
              <a
                href={`https://wa.me/${formatWhatsAppNumber(client.number)}`}
                target="_blank" rel="noreferrer"
                style={{ display: "block", padding: "5px 10px", borderRadius: 7, background: "#1B7A55", color: "#fff", fontSize: 10, fontWeight: 600, textDecoration: "none" }}>
                ✆ WhatsApp
              </a>
            ) : null}
            {client.number ? (
              <a
                href={`tel:${client.number}`}
                style={{ display: "block", padding: "4px 10px", borderRadius: 7, background: "#F1F5F9", color: "#334155", fontSize: 10, fontWeight: 600, textDecoration: "none" }}>
                📞 {client.number}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 48px", minHeight: 0, WebkitOverflowScrolling: "touch" }}>

        {/* 2. CONTACT */}
        {contactFields.length > 0 && (
          <>
            <div style={SH}>CONTACT</div>
            <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #F1F5F9", overflow: "hidden" }}>
              {contactFields.map((f, i) => (
                <div key={f.label} style={{
                  display: "flex", gap: 8, padding: "8px 12px",
                  borderBottom: i < contactFields.length - 1 ? "1px solid #F8FAFC" : "none",
                }}>
                  <span style={{ fontSize: 11, color: "#94A3B8", width: 58, flexShrink: 0 }}>{f.label}</span>
                  <span style={{ fontSize: 11, color: "#0F172A", fontWeight: 600 }}>{f.value}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 3. RECOMMENDATION */}
        {recommendation && (
          <>
            <div style={SH}>RECOMMENDATION</div>
            <div style={{ background: "#EEF2FF", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#4338CA" }}>
              💡 {recommendation}
            </div>
          </>
        )}

        {/* 4. NOTES (D1) */}
        <div style={SH}>NOTES</div>
        {editingNotes ? (
          <div>
            <textarea
              autoFocus
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveNotes();
                if (e.key === "Escape") { setEditingNotes(false); setNotesValue(client.notes || ""); }
              }}
              style={{
                width: "100%", minHeight: 90, padding: "10px 12px",
                borderRadius: 10, border: "1.5px solid #6366F1",
                fontSize: 13, resize: "vertical", outline: "none",
                fontFamily: "inherit", lineHeight: 1.6,
                boxSizing: "border-box", whiteSpace: "pre-wrap",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button
                onClick={saveNotes}
                disabled={notesSaving}
                style={{
                  flex: 1, padding: "7px", borderRadius: 8, border: "none",
                  background: notesSaving ? "#C7D2FE" : "#6366F1",
                  color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: notesSaving ? "default" : "pointer",
                }}>
                {notesSaving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => { setEditingNotes(false); setNotesValue(client.notes || ""); }}
                style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 12, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            onClick={() => setEditingNotes(true)}
            style={{
              background: "#fff", borderRadius: 10, border: "1px solid #F1F5F9",
              padding: "10px 12px", fontSize: 13, lineHeight: 1.6, minHeight: 44,
              color: client.notes ? "#0F172A" : "#CBD5E1",
              whiteSpace: "pre-wrap", cursor: "text",
            }}>
            {client.notes || "No notes yet — tap to add"}
          </div>
        )}

        {/* 5. NEW REQUIREMENT */}
        <div style={{ marginTop: 18 }}>
          <button onClick={() => setShowNewReq(true)}
            style={{
              width: "100%", padding: "10px 0", borderRadius: 10,
              border: "1.5px solid #C7D2FE", background: "#EEF2FF",
              color: "#6366F1", fontSize: 13, fontWeight: 800, cursor: "pointer",
            }}>
            + New requirement
          </button>
        </div>

        {/* 6. OPEN DEALS */}
        {openDeals.length > 0 && (
          <>
            <div style={SH}>OPEN DEALS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {openDeals.map(d => {
                const stage = STAGES.find(s => s.id === d.stage);
                const daysIn = d.updated_at
                  ? Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86400000)
                  : null;
                return (
                  <div key={d.id} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid #F1F5F9" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                        {[d.brand, d.model].filter(Boolean).join(" ") || "Open request"}
                      </span>
                      {stage && (
                        <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, background: stage.bg, color: stage.color, fontWeight: 700 }}>
                          {stage.label}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                      {dealUnitLine(d) ? <span style={{ fontSize: 11, color: "#6366F1", fontWeight: 700 }}>{dealUnitLine(d)}</span> : null}
                      {dealTotal(d) > 0 ? <span style={{ fontSize: 11, color: "#64748B" }}>AED {dealTotal(d).toLocaleString()} total</span> : null}
                      {daysIn !== null ? <span style={{ fontSize: 11, color: "#94A3B8" }}>{daysIn}d in stage</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 6. FOLLOW-UPS */}
        {followUps.length > 0 && (
          <>
            <div style={SH}>FOLLOW-UPS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {followUps.map(f => {
                const overdue = new Date(f.due_at) < new Date();
                return (
                  <div key={f.id} style={{
                    background: overdue ? "#FEF2F2" : "#FFFBEB",
                    borderRadius: 10, padding: "10px 12px",
                    border: `1px solid ${overdue ? "#FECACA" : "#FDE68A"}`,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: overdue ? "#EF4444" : "#D97706" }}>
                        📅 {new Date(f.due_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {" "}
                        {new Date(f.due_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      {f.note && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{f.note}</div>}
                    </div>
                    <button
                      onClick={() => markFollowUpDone(f.id)}
                      style={{ padding: "4px 10px", borderRadius: 7, border: "none", background: "#10B981", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                      Done
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 7. ACTIVITY TIMELINE (D2) */}
        <div style={SH}>ACTIVITY</div>

        {/* D2: Add note input */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addNote(); }}
            placeholder="Add a note…"
            style={{
              flex: 1, padding: "7px 12px", borderRadius: 8,
              border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none",
            }}
          />
          <button
            onClick={addNote}
            disabled={addingNote || !newNote.trim()}
            style={{
              padding: "7px 12px", borderRadius: 8, border: "none",
              background: "#6366F1", color: "#fff", fontSize: 12,
              fontWeight: 700, cursor: "pointer",
            }}>
            Add
          </button>
        </div>

        {activities.length === 0 && (
          <div style={{ fontSize: 12, color: "#CBD5E1", textAlign: "center", padding: "16px 0" }}>No activity yet</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {activities.map((a, i) => {
            const icon  = ACT_ICON[a.activity_type]  || "📋";
            const color = ACT_COLOR[a.activity_type] || "#64748B";
            return (
              <div key={a.id || i} style={{ display: "flex", gap: 10, padding: "8px 12px", background: "#fff", borderRadius: 10, border: "1px solid #F1F5F9" }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color, fontWeight: 700, textTransform: "capitalize" }}>
                    {(a.activity_type || "").replace(/_/g, " ")}
                  </div>
                  {a.note ? <div style={{ fontSize: 12, color: "#334155", marginTop: 2, whiteSpace: "pre-wrap" }}>{a.note}</div> : null}
                </div>
                <span style={{ fontSize: 10, color: "#94A3B8", flexShrink: 0, whiteSpace: "nowrap" }}>{timeAgo(a.logged_at)}</span>
              </div>
            );
          })}
        </div>

        {/* 8. DEAL HISTORY */}
        {closedDeals.length > 0 && (
          <>
            <div style={SH}>DEAL HISTORY</div>
            <button
              onClick={() => setHistoryOpen(p => !p)}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 10,
                border: "1px solid #F1F5F9", background: "#fff",
                cursor: "pointer", fontSize: 12, color: "#64748B",
                textAlign: "left", marginBottom: 6,
              }}>
              {historyOpen ? "▾" : "▸"} {closedDeals.length} deal{closedDeals.length !== 1 ? "s" : ""}
              {closedValue > 0 ? ` — AED ${closedValue.toLocaleString()} total` : ""}
            </button>
            {historyOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {closedDeals.map(d => (
                  <div key={d.id} style={{
                    background: "#fff", borderRadius: 10, padding: "10px 12px",
                    border: "1px solid #F1F5F9",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>
                        {[d.brand, d.model].filter(Boolean).join(" ") || "Device"}
                      </div>
                      {d.closed_at ? (
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>
                          {new Date(d.closed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: d.stage === "parked" ? "#64748B" : "#10B981" }}>
                        {d.stage === "parked" ? "Parked" : "Closed"}
                      </div>
                      {dealTotal(d) > 0 ? (
                        <div style={{ fontSize: 11, color: "#64748B" }}>AED {dealTotal(d).toLocaleString()}</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Open chat view link */}
        <div style={{ textAlign: "center", marginTop: 28, paddingBottom: 8 }}>
          <button
            onClick={onOpenChat}
            style={{ background: "none", border: "none", color: "#6366F1", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
            Open chat view →
          </button>
        </div>
      </div>

      <NewRequirementModal
        open={showNewReq}
        customer={client}
        onClose={() => setShowNewReq(false)}
        onSaved={() => {
          loadCustomers();
          loadStock();
          refreshCachedStock();
          fetchPanelData(client.id);
        }}
      />
    </div>
  );
}
