import React, { useState, useMemo, useEffect } from "react";
import Spinner from "../ui/Spinner";
import { daysSince, formatWhatsAppNumber } from "../../utils/helpers";
import { useCustomers, getClientHealth, getQueuePriority } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import { useStock } from "../../context/StockContext";
import { TagStrip } from "../chat/TagEditor";
import { getTag, customerStockMatch, PARK_REASON_LABEL } from "../../constants";
import { getReasonLine, getQuickMessage } from "../../utils/reasonLine";
import { dealTotal, dealUnitLine } from "../../utils/bulk";
import { logWhatsAppContact } from "../../services/quickContactService";
import ClientPreviewPanel from "./ClientPreviewPanel";
import { useProfile } from "../../context/ProfileContext";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)  return "now";
  if (mins < 60) return `${mins}m`;
  if (hrs < 24)  return `${hrs}h`;
  if (days < 7)  return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function fmtFollowUp(due_at) {
  const now  = new Date();
  const due  = new Date(due_at);
  const diffH = Math.round((due - now) / 3600000);
  if (diffH < 0) {
    const overH = Math.abs(diffH);
    return overH < 24 ? `${overH}h overdue` : `${Math.floor(overH / 24)}d overdue`;
  }
  if (diffH === 0) return "Due now";
  if (diffH < 24)  return `In ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return diffD === 1 ? "Tomorrow" : `In ${diffD} days`;
}

function buildWaUrl(number) {
  return `https://wa.me/${formatWhatsAppNumber(number)}`;
}

const STAGE_COLORS = {
  new_inquiry: "#6366F1", device_found: "#F59E0B",
  negotiation: "#F59E0B", confirmed_pending_pickup: "#10B981",
  closed: "#10B981", lost: "#94A3B8",
};
const STAGE_LABELS = {
  new_inquiry: "Inquiry", device_found: "Found",
  negotiation: "Negotiating", confirmed_pending_pickup: "Pickup",
  closed: "Closed", lost: "Lost",
};

function ClientCard({ c, onOpen, onSelect, isSelected, lastActivityMap, pendingFollowUpMap, queuePriority, stock }) {
  const openDeals  = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "parked");
  const latestDeal = openDeals[0] || (c.deals || [])[0];
  const activityTs = c.last_activity_at || c.last_active;
  const fu         = pendingFollowUpMap?.[c.id];
  const health     = getClientHealth(c);
  const lastAct    = lastActivityMap?.[c.id];
  const isOverdue  = queuePriority?.priority <= 2;
  const isIncomplete = !(c.deals || []).length && !c.notes && !fu;

  const available    = useMemo(() => (stock || []).filter(s => s.status === "available"), [stock]);
  const matchedStock = useMemo(() => customerStockMatch(c, available), [c, available]);
  const daysSilent   = useMemo(() => {
    const ts = lastAct?.logged_at || c.last_activity_at || c.last_active;
    if (!ts) return 0;
    return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
  }, [lastAct, c]);

  const ctx    = { queuePriority, openDeal: latestDeal, followUp: fu, matchedStock, lastActivity: lastAct, daysSilent };
  const reason = getReasonLine(c, ctx);

  const { loadCustomers } = useCustomers();
  const { isOwner, profiles } = useProfile();
  const assignedSP = isOwner && c.assigned_to ? (profiles || []).find(p => p.id === c.assigned_to) : null;
  const spInitials = assignedSP ? assignedSP.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() : null;

  const noNumber = !c.number;

  return (
    <div
      onClick={onSelect || onOpen}
      style={{
        background: isSelected ? "#EEF2FF" : "#fff",
        borderRadius: 16, padding: "10px 14px",
        border: isSelected
          ? "1.5px solid #6366F1"
          : `1.5px solid ${c.urgent ? "#FECACA" : isOverdue ? "#FEF3C7" : "#F1F5F9"}`,
        cursor: "pointer",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: health.bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 800, color: health.color,
            border: `2px solid ${health.color}`,
          }}>
            {(c.name || "?")[0].toUpperCase()}
          </div>
          {isIncomplete && (
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%", background: "#F97316", border: "2px solid #fff" }} />
          )}
          {spInitials && (
            <div style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#10B981", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: "#fff" }}>
              {spInitials}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </span>
              {queuePriority && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8, background: queuePriority.color + "20", color: queuePriority.color, flexShrink: 0 }}>
                  {queuePriority.label}
                </span>
              )}
            </div>
            <span style={{ fontSize: 10, color: "#94A3B8", flexShrink: 0 }}>{timeAgo(activityTs)}</span>
          </div>

          <div style={{ fontSize: 11, color: "#64748B", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {reason}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 5, gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              {latestDeal?.stage && (
                <span style={{
                  fontSize: 9, padding: "2px 6px", borderRadius: 4,
                  background: (STAGE_COLORS[latestDeal.stage] || "#6366F1") + "18",
                  color: STAGE_COLORS[latestDeal.stage] || "#6366F1",
                  fontWeight: 700, flexShrink: 0,
                }}>
                  {STAGE_LABELS[latestDeal.stage] || latestDeal.stage}
                </span>
              )}
              {fu && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20, flexShrink: 0,
                  background: isOverdue ? "#FEF2F2" : "#FFFBEB",
                  color:      isOverdue ? "#EF4444" : "#D97706" }}>
                  📅 {fmtFollowUp(fu.due_at)}
                </span>
              )}
              {latestDeal && dealUnitLine(latestDeal) && (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", flexShrink: 0, whiteSpace: "nowrap" }}>
                  {dealUnitLine(latestDeal)}
                  {dealTotal(latestDeal) > 0 ? ` · ${dealTotal(latestDeal).toLocaleString()}` : ""}
                </span>
              )}
              {(c.tags || []).length > 0 && (
                <TagStrip tags={c.tags} max={2} />
              )}
            </div>
            <button
              disabled={noNumber}
              onClick={e => {
                e.stopPropagation();
                const msg = getQuickMessage(c, ctx);
                window.open(buildWaUrl(c.number) + "?text=" + encodeURIComponent(msg), "_blank");
                logWhatsAppContact(c.id, msg).then(() => loadCustomers());
              }}
              style={{
                height: 24, padding: "0 8px", borderRadius: 7, border: "none",
                fontSize: 10, fontWeight: 600, flexShrink: 0,
                background: noNumber ? "#E2E8F0" : "#1B7A55",
                color: noNumber ? "#94A3B8" : "#FFFFFF",
                cursor: noNumber ? "default" : "pointer",
              }}>
              ✆ WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ label, count, color = "#94A3B8" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "14px 0 8px" }}>
      <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
      <span style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: 1, whiteSpace: "nowrap" }}>
        {label}{count !== undefined ? ` (${count})` : ""}
      </span>
      <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
    </div>
  );
}

export default function CustomersTab() {
  const [viewMode, setViewModeLocal] = useState("queue");
  const { isMobile, customerViewMode, setCustomerViewMode } = useUI();
  const [tagFilter, setTagFilter] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);

  const setViewMode = (mode) => setViewModeLocal(mode);

  useEffect(() => {
    if (customerViewMode && customerViewMode !== "queue") {
      // coerce "pipeline" (removed) and anything unexpected back to "queue"
      const safe = customerViewMode === "pipeline" ? "queue" : customerViewMode;
      setViewModeLocal(safe);
      setTimeout(() => setCustomerViewMode("queue"), 100);
    }
  }, [customerViewMode]); // eslint-disable-line

  const { stock } = useStock();
  const { isOwner, currentProfile } = useProfile();
  const [parkedOpen, setParkedOpen] = useState(false);
  const {
    customers, loading,
    lastActivityMap, pendingFollowUpMap,
    setActiveCustomerId, setActiveDealId, setView, setPendingSuggestion,
    filter, setFilter,
    search, setSearch,
    openDeals: openDealsCount, revenue,
    loadCustomers,
  } = useCustomers();

  const allClients = useMemo(() =>
    customers.filter(c => !c.contact_type || c.contact_type === "client" || c.contact_type === "walkin"),
    [customers]
  );

  // Keep selectedClient in sync when customer data refreshes
  useEffect(() => {
    if (selectedClient) {
      const updated = customers.find(c => c.id === selectedClient.id);
      if (updated) setSelectedClient(updated);
    }
  }, [customers]); // eslint-disable-line

  const stockMatchSet = useMemo(() => {
    const available = (stock || []).filter(s => s.status === "available");
    const matched = new Set();
    allClients.forEach(c => {
      if (customerStockMatch(c, available)) matched.add(c.id);
    });
    return matched;
  }, [allClients, stock]);

  const queueClients = useMemo(() =>
    allClients
      .map(c => ({ c, priority: getQueuePriority(c, pendingFollowUpMap, stockMatchSet) }))
      .filter(({ priority }) => priority !== null)
      .sort((a, b) => a.priority.priority - b.priority.priority),
    [allClients, pendingFollowUpMap, stockMatchSet]
  );

  const sections = useMemo(() => {
    const s = { critical: [], sourcing: [], confirm: [], stockMatch: [], silent: [], reengage: [], open: [] };
    queueClients.forEach(({ c, priority }) => {
      if      (priority.priority === 2) s.sourcing.push({ c, priority });
      else if (priority.priority <= 4)  s.critical.push({ c, priority });
      else if (priority.priority === 5) s.confirm.push({ c, priority });
      else if (priority.priority === 6) s.stockMatch.push({ c, priority });
      else if (priority.priority === 7) s.silent.push({ c, priority });
      else if (priority.priority === 8) s.reengage.push({ c, priority });
      else                              s.open.push({ c, priority });
    });
    // Live work, oldest first — the deal closest to going cold sits on top.
    s.sourcing.sort((a, b) =>
      new Date(a.priority.deal?.sourcing_started_at || 0) - new Date(b.priority.deal?.sourcing_started_at || 0));
    return s;
  }, [queueClients]);

  // PARKED lives at the very bottom, collapsed. Role decides scope — a
  // salesperson sees only what he parked; an owner or manager sees everyone's.
  const parkedClients = useMemo(() => {
    const inQueue = new Set(queueClients.map(({ c }) => c.id));
    const mine = (d) => isOwner || !currentProfile?.id || d.created_by === currentProfile.id;
    return allClients
      .map(c => {
        const parked = (c.deals || []).filter(d => d.stage === "parked" && mine(d));
        if (!parked.length) return null;
        const oldest = parked.reduce((acc, d) =>
          !acc || (d.parked_at && new Date(d.parked_at) < new Date(acc)) ? (d.parked_at || acc) : acc, null);
        return { c, parkedAt: oldest, deals: parked };
      })
      .filter(Boolean)
      .filter(({ c }) => !inQueue.has(c.id))
      .sort((a, b) => new Date(a.parkedAt || 0) - new Date(b.parkedAt || 0));
  }, [allClients, queueClients, isOwner, currentProfile?.id]);

  const filteredAll = useMemo(() => {
    return allClients.filter(c => {
      if (tagFilter.length > 0 && !tagFilter.every(t => (c.tags || []).includes(t))) return false;
      if (search) {
        const q = search.toLowerCase();
        const dealMatch = (c.deals || []).some(d =>
          (d.brand || "").toLowerCase().includes(q) || (d.model || "").toLowerCase().includes(q)
        );
        return c.name.toLowerCase().includes(q) || (c.number || "").includes(search) || dealMatch;
      }
      if (filter === "urgent")     return c.urgent;
      if (filter === "overdue")    return daysSince(c.last_active) >= 1 && (c.deals || []).some(d => d.stage !== "closed" && d.stage !== "parked");
      if (filter === "waiting")    return (c.deals || []).some(d => d.stage === "new_inquiry");
      if (filter === "incomplete") return !(c.deals || []).length && !c.notes && !pendingFollowUpMap?.[c.id];
      if (filter === "cooling")    return getClientHealth(c).status === "cooling";
      if (filter === "inactive")   return getClientHealth(c).status === "inactive";
      return true;
    }).sort((a, b) => {
      if (a.urgent && !b.urgent) return -1;
      if (!a.urgent && b.urgent) return 1;
      return new Date(b.last_activity_at || b.last_active || "") - new Date(a.last_activity_at || a.last_active || "");
    });
  }, [allClients, search, filter, tagFilter, pendingFollowUpMap]);

  const healthCounts = useMemo(() => {
    const c = { active: 0, warm: 0, cooling: 0, inactive: 0, prospect: 0, new: 0 };
    allClients.forEach(cl => { c[getClientHealth(cl).status] = (c[getClientHealth(cl).status] || 0) + 1; });
    return c;
  }, [allClients]);

  // On mobile: navigate to chat detail. On desktop: select client for panel.
  function openClient(c) {
    if (isMobile) {
      const open = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "parked");
      const deal = open[0] || (c.deals || [])[0];
      setActiveCustomerId(c.id);
      setActiveDealId(deal?.id || null);
      setView("detail");
      setPendingSuggestion(null);
    } else {
      setSelectedClient(c);
    }
  }

  // "Open chat view →" from panel navigates to ChatDetailView
  function openChatFromPanel() {
    if (!selectedClient) return;
    const open = (selectedClient.deals || []).filter(d => d.stage !== "closed" && d.stage !== "parked");
    const deal = open[0] || (selectedClient.deals || [])[0];
    setActiveCustomerId(selectedClient.id);
    setActiveDealId(deal?.id || null);
    setView("detail");
    setPendingSuggestion(null);
  }

  // ── LEFT PANEL content (queue or all-clients list) ──────────────────────
  function renderHeader() {
    return (
      <div style={{ background: "#fff", padding: "16px 14px 0", borderBottom: "1px solid #F1F5F9", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, letterSpacing: 1.5 }}>LAPTOP FOR LESS</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Clients</div>
          </div>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid #F1F5F9", marginLeft: -14, marginRight: -14, paddingLeft: 14 }}>
          {[
            { key: "queue",   label: `Queue (${queueClients.length})` },
            { key: "clients", label: `All (${allClients.length})` },
          ].map(m => (
            <button key={m.key} onClick={() => setViewMode(m.key)}
              style={{ padding: "8px 14px", border: "none", background: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                color:        viewMode === m.key ? "#6366F1" : "#94A3B8",
                borderBottom: viewMode === m.key ? "2px solid #6366F1" : "2px solid transparent" }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderQueueList() {
    return (
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "12px 12px 100px", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", scrollbarWidth: "none" }}>
          {[
            { key: "active",   label: "🟢 Active",   color: "#10B981" },
            { key: "warm",     label: "🟡 Warm",     color: "#F59E0B" },
            { key: "cooling",  label: "🔴 Cooling",  color: "#EF4444" },
            { key: "inactive", label: "⚫ Inactive", color: "#94A3B8" },
            { key: "prospect", label: "🔵 Prospect", color: "#3B82F6" },
          ].filter(h => healthCounts[h.key] > 0).map(h => (
            <button key={h.key}
              onClick={() => { setViewMode("clients"); setFilter(h.key); setSearch(""); }}
              style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 20, border: "none",
                background: "#F8FAFC", fontSize: 10, fontWeight: 700, color: h.color, cursor: "pointer" }}>
              {h.label} {healthCounts[h.key]}
            </button>
          ))}
        </div>

        {loading && <Spinner />}

        {!loading && queueClients.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>Queue is clear</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4, lineHeight: 1.6 }}>No urgent actions right now.</div>
          </div>
        )}

        {[
          { items: sections.critical,   label: "ACT NOW",       color: "#EF4444" },
          { items: sections.sourcing,   label: "SOURCING",      color: "#F97316" },
          { items: sections.confirm,    label: "CONFIRM TODAY", color: "#6366F1" },
          { items: sections.stockMatch, label: "STOCK MATCH",   color: "#10B981" },
          { items: sections.silent,     label: "FOLLOW UP",     color: "#D97706" },
          { items: sections.reengage,   label: "RE-ENGAGE",     color: "#EF4444" },
          { items: sections.open,       label: "OPEN REQUESTS", color: "#6366F1" },
        ].filter(s => s.items.length > 0).map(s => (
          <div key={s.label}>
            <SectionLabel label={s.label} count={s.items.length} color={s.color} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {s.items.map(({ c, priority }) => (
                <ClientCard key={c.id} c={c}
                  onOpen={() => openClient(c)}
                  onSelect={isMobile ? null : () => openClient(c)}
                  isSelected={selectedClient?.id === c.id}
                  lastActivityMap={lastActivityMap} pendingFollowUpMap={pendingFollowUpMap}
                  queuePriority={priority} stock={stock} />
              ))}
            </div>
          </div>
        ))}

        {/* ── PARKED — collapsed, at the very bottom ── */}
        {parkedClients.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <button
              onClick={() => setParkedOpen(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px", borderRadius: 12, cursor: "pointer",
                border: "1px solid #F1F5F9", background: "#F8FAFC",
              }}>
              <span style={{ fontSize: 13 }}>👁</span>
              <span style={{ flex: 1, textAlign: "left", fontSize: 10, fontWeight: 800, color: "#94A3B8", letterSpacing: 1 }}>
                PARKED
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>{parkedClients.length}</span>
              <span style={{ fontSize: 11, color: "#94A3B8" }}>{parkedOpen ? "▾" : "▸"}</span>
            </button>

            {parkedOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {parkedClients.map(({ c, parkedAt, deals }) => (
                  <div key={c.id} onClick={() => openClient(c)}
                    style={{
                      background: "#fff", borderRadius: 12, padding: "10px 13px",
                      border: "1px solid #F1F5F9", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[deals[0]?.brand, deals[0]?.model].filter(Boolean).join(" ") || "Parked deal"}
                        {deals[0]?.parked_reason ? ` · ${PARK_REASON_LABEL[deals[0].parked_reason] || deals[0].parked_reason}` : ""}
                        {deals[0]?.target_unit_price ? ` · offered AED ${Number(deals[0].target_unit_price).toLocaleString()}/unit` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: "#CBD5E1", flexShrink: 0, whiteSpace: "nowrap" }}>
                      {parkedAt ? timeAgo(parkedAt) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderAllClientsList() {
    return (
      <>
        <div style={{ background: "#fff", padding: "12px 14px 0", borderBottom: "1px solid #F1F5F9", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {[
              { label: "Total", value: allClients.length, color: "#6366F1", bg: "#EEF2FF" },
              { label: "Open",  value: openDealsCount,    color: "#F59E0B", bg: "#FFFBEB" },
              { label: "MTD",   value: `AED ${revenue >= 1000 ? (revenue / 1000).toFixed(0) + "k" : revenue}`, color: "#10B981", bg: "#ECFDF5" },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 12, padding: "8px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: s.color, fontWeight: 700, opacity: 0.75 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search name, number or device..."
            style={{ width: "100%", padding: "9px 13px", borderRadius: 12, border: "1.5px solid #F1F5F9", background: "#F8FAFC", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10 }}>
            {[
              { key: "all",        label: `All (${allClients.length})` },
              { key: "urgent",     label: "🔴 Urgent" },
              { key: "waiting",    label: "⏳ Waiting" },
              { key: "overdue",    label: "⏰ Overdue" },
              { key: "cooling",    label: "🔄 Cooling" },
              { key: "incomplete", label: "🟠 Incomplete" },
              { key: "inactive",   label: "⚫ Inactive" },
            ].map(f => (
              <button key={f.key} onClick={() => { setFilter(f.key); setSearch(""); }}
                style={{ padding: "5px 12px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: filter === f.key ? "#6366F1" : "#F1F5F9",
                  color:      filter === f.key ? "#fff"    : "#64748B" }}>
                {f.label}
              </button>
            ))}
          </div>
          {(() => {
            const usedTags = [...new Set(allClients.flatMap(c => c.tags || []))];
            if (!usedTags.length) return null;
            return (
              <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10, marginTop: -2 }}>
                <span style={{ fontSize: 10, color: "#94A3B8", alignSelf: "center", flexShrink: 0 }}>🏷️</span>
                {tagFilter.length > 0 && (
                  <button onClick={() => setTagFilter([])}
                    style={{ padding: "4px 10px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 10, fontWeight: 700, cursor: "pointer", background: "#F1F5F9", color: "#94A3B8" }}>
                    ✕ Clear
                  </button>
                )}
                {usedTags.map(tagId => {
                  const tag    = getTag(tagId);
                  const active = tagFilter.includes(tagId);
                  return (
                    <button key={tagId}
                      onClick={() => setTagFilter(prev => active ? prev.filter(t => t !== tagId) : [...prev, tagId])}
                      style={{ padding: "4px 10px", borderRadius: 20, border: active ? `2px solid ${tag.color}` : "none", flexShrink: 0, fontSize: 10, fontWeight: 700, cursor: "pointer",
                        background: active ? tag.bg : "#F1F5F9",
                        color: active ? tag.color : "#64748B" }}>
                      {active ? "✓ " : ""}{tag.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
        <div style={{ flex: 1, padding: "10px 12px 100px", overflowY: "auto", minHeight: 0, WebkitOverflowScrolling: "touch" }}>
          {loading && <Spinner />}
          {!loading && filteredAll.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#CBD5E1" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>👤</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>No clients match</div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredAll.map(c => (
              <ClientCard key={c.id} c={c}
                onOpen={() => openClient(c)}
                onSelect={isMobile ? null : () => openClient(c)}
                isSelected={selectedClient?.id === c.id}
                lastActivityMap={lastActivityMap} pendingFollowUpMap={pendingFollowUpMap}
                queuePriority={getQueuePriority(c, pendingFollowUpMap, stockMatchSet)}
                stock={stock} />
            ))}
          </div>
        </div>
      </>
    );
  }

  // ── MOBILE: single-column layout ────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
        {renderHeader()}
        {viewMode === "queue"   && renderQueueList()}
        {viewMode === "clients" && renderAllClientsList()}
      </div>
    );
  }

  // ── DESKTOP: two-panel layout ────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, height: "100%" }}>
      {/* Tab bar + title (spans full width) */}
      {renderHeader()}

      {/* Two-panel row */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* LEFT panel — 370px fixed */}
        <div style={{ width: 370, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #F1F5F9", overflow: "hidden", minHeight: 0 }}>
          {viewMode === "queue"   && renderQueueList()}
          {viewMode === "clients" && renderAllClientsList()}
        </div>

        {/* RIGHT panel — flex:1 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {selectedClient ? (
            <ClientPreviewPanel
              key={selectedClient.id}
              client={selectedClient}
              onOpenChat={openChatFromPanel}
            />
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#CBD5E1", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 32 }}>👈</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Select a client to view details</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
