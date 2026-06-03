import React, { useState, useMemo } from "react";
import StageBar from "../ui/StageBar";
import Spinner from "../ui/Spinner";
import { daysSince } from "../../utils/helpers";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import PipelineView from "./PipelineView";

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
    return overH < 24 ? `${overH}h overdue` : `${Math.floor(overH/24)}d overdue`;
  }
  if (diffH === 0) return "Due now";
  if (diffH < 24)  return `In ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Tomorrow";
  return `In ${diffD} days`;
}

function getAttention(c, pendingFollowUpMap) {
  if (c.urgent) return { type: "urgent", label: "🔴 Urgent" };
  const fu = pendingFollowUpMap?.[c.id];
  if (fu) {
    const now = new Date(), due = new Date(fu.due_at);
    if (due <= now) return { type: "followup_overdue", label: "📅 " + fmtFollowUp(fu.due_at) };
    const diffH = Math.round((due - now) / 3600000);
    if (diffH <= 3) return { type: "followup_soon", label: "📅 " + fmtFollowUp(fu.due_at) };
  }
  const openDeal = (c.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
  if (openDeal && daysSince(c.last_active) >= 3) {
    return { type: "silent", label: `⚠️ ${daysSince(c.last_active)}d silent` };
  }
  return null;
}

function ClientCard({ c, onOpen, lastActivityMap, pendingFollowUpMap }) {
  const openD      = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost");
  const latestDeal = openD[0] || (c.deals || [])[0];
  const totalValue = (c.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
  const activityTs = c.last_activity_at || c.last_active;
  const attention  = getAttention(c, pendingFollowUpMap);
  const fu         = pendingFollowUpMap?.[c.id];

  // Preview: last note → deal info → contact notes → number
  const lastAct = lastActivityMap?.[c.id];
  const notePreview = lastAct?.activity_type === "note" ? lastAct.note?.slice(0, 55) : null;
  const dealPreview = latestDeal
    ? ([latestDeal.brand, latestDeal.model].filter(Boolean).join(" ") || "Open deal") +
      (latestDeal.budget ? ` · AED ${Number(latestDeal.budget).toLocaleString()}` : "")
    : null;
  const preview = notePreview || dealPreview || c.notes?.slice(0, 55) || c.number || "No details yet";

  const isOverdue = attention?.type === "followup_overdue" || attention?.type === "urgent";
  const hasFollowUp = !!pendingFollowUpMap?.[c.id];
  const isIncomplete = (!c.contact_type || c.contact_type === "client" || c.contact_type === "walkin")
    && !(c.deals || []).length
    && !c.notes
    && !hasFollowUp;

  return (
    <div onClick={onOpen} style={{
      background: "#fff", borderRadius: 18, padding: "12px 14px",
      border: `1.5px solid ${c.urgent ? "#FECACA" : isOverdue ? "#FEF3C7" : "#F1F5F9"}`,
      cursor: "pointer",
      boxShadow: c.urgent ? "0 2px 16px rgba(239,68,68,0.08)" : "0 1px 4px rgba(0,0,0,0.05)",
      position: "relative", overflow: "hidden",
    }}>
      {c.urgent && <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: "#EF4444" }} />}

      {/* Row 1 — avatar + name + timestamp */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: "50%",
            background: c.urgent ? "#FEF2F2" : c.contact_type === "walkin" ? "#EEF2FF" : "#EEF2FF",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, fontWeight: 800, textTransform: "uppercase",
            color: c.urgent ? "#EF4444" : "#6366F1",
          }}>
            {(c.name || "?")[0]}
          </div>
          {isIncomplete && (
            <div style={{
              position: "absolute", bottom: 0, right: 0,
              width: 12, height: 12, borderRadius: "50%",
              background: "#F97316", border: "2px solid #fff",
            }} title="Incomplete profile" />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </span>
              {c.contact_type === "walkin" && (
                <span style={{ fontSize: 9, fontWeight: 700, color: "#6366F1", background: "#EEF2FF", padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>
                  Walk-in
                </span>
              )}
              {c.urgent && (
                <span style={{ fontSize: 9, fontWeight: 700, color: "#EF4444", background: "#FEF2F2", padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>
                  URGENT
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: "#94A3B8", flexShrink: 0 }}>{timeAgo(activityTs)}</span>
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {preview}
          </div>
        </div>
      </div>

      {/* Stage bar */}
      {latestDeal && (
        <div style={{ marginTop: 8, marginLeft: 54 }}>
          <StageBar stageId={latestDeal.stage} />
        </div>
      )}

      {/* Bottom row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginLeft: 54 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#CBD5E1" }}>
            {(c.deals || []).length} deal{(c.deals || []).length !== 1 ? "s" : ""}
          </span>
          {fu && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
              background: attention?.type === "followup_overdue" ? "#FEF2F2" : "#FFFBEB",
              color: attention?.type === "followup_overdue" ? "#EF4444" : "#D97706",
            }}>
              📅 {fmtFollowUp(fu.due_at)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {totalValue > 0 && (
            <span style={{ fontSize: 10, color: "#10B981", fontWeight: 700 }}>
              AED {totalValue.toLocaleString()}
            </span>
          )}
          {attention?.type === "silent" && (
            <span style={{ fontSize: 9, color: "#D97706", fontWeight: 700 }}>⚠️ Follow up</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomersTab() {
  const [viewMode, setViewMode] = useState("clients");
  const { isMobile, setShowSideDrawer, setShowSearch } = useUI();
  const {
    customers, loading,
    lastActivityMap, pendingFollowUpMap,
    setActiveCustomerId, setActiveDealId, setView, setPendingSuggestion,
    filter, setFilter,
    search, setSearch,
    setShowContactModal, setContactModalPreType,
    openDeals, closedDeals, revenue,
  } = useCustomers();

  // Only clients + walk-ins
  const allClients = useMemo(() =>
    customers.filter(c => !c.contact_type || c.contact_type === "client" || c.contact_type === "walkin"),
    [customers]
  );

  // Apply search + behaviour filter
  const filtered = useMemo(() => {
    return allClients
      .filter(c => {
        if (search) return c.name.toLowerCase().includes(search.toLowerCase()) || (c.number || "").includes(search);
        if (filter === "urgent")  return c.urgent;
        if (filter === "overdue") return daysSince(c.last_active) >= 1 && (c.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
        if (filter === "vip")     return c.tier === "vip";
        if (filter === "cold")    return c.tier === "cold";
        return true;
      })
      .sort((a, b) => {
        if (a.urgent && !b.urgent) return -1;
        if (!a.urgent && b.urgent) return 1;
        const aTime = a.last_activity_at || a.last_active || "";
        const bTime = b.last_activity_at || b.last_active || "";
        return new Date(bTime) - new Date(aTime);
      });
  }, [allClients, search, filter]);

  // Needs Attention: urgent + overdue follow-up (within 3h or past) + silent 3+ days
  const needsAttention = useMemo(() =>
    filtered.filter(c => getAttention(c, pendingFollowUpMap) !== null),
    [filtered, pendingFollowUpMap]
  );
  const rest = useMemo(() =>
    filtered.filter(c => getAttention(c, pendingFollowUpMap) === null),
    [filtered, pendingFollowUpMap]
  );

  function openClient(c) {
    const openD = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost");
    const deal  = openD[0] || (c.deals || [])[0];
    setActiveCustomerId(c.id);
    setActiveDealId(deal?.id || null);
    setView("detail");
    setPendingSuggestion(null);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

      {/* ── Sticky header ── */}
      <div style={{ background: "#fff", padding: "16px 14px 0", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, letterSpacing: 1.5 }}>LAPTOP FOR LESS</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: -0.5 }}>Clients</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setShowSearch(true)}
              style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
              🔍
            </button>
            <button onClick={() => setShowSideDrawer(true)}
              style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>
              📊
            </button>
          </div>
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid #F1F5F9", marginBottom: 14 }}>
          {[{ key: "clients", label: "Clients" }, { key: "pipeline", label: "Pipeline" }].map(m => (
            <button key={m.key} onClick={() => setViewMode(m.key)}
              style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                background: viewMode === m.key ? "#534AB7" : "#F8FAFC",
                color:      viewMode === m.key ? "#fff"    : "#64748B" }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "clients" ? (
        <>
          {/* ── Filters ── */}
          <div style={{ background: "#fff", padding: "14px 14px 0", borderBottom: "1px solid #F1F5F9" }}>
            {/* Stats */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[
                { label: "Open Deals",  value: openDeals,   color: "#6366F1", bg: "#EEF2FF" },
                { label: "Closed",      value: closedDeals,  color: "#10B981", bg: "#ECFDF5" },
                { label: "This Month",  value: `AED ${revenue >= 1000 ? (revenue/1000).toFixed(1)+"k" : revenue}`, color: "#F59E0B", bg: "#FFFBEB" },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: s.color, fontWeight: 700, opacity: 0.75, marginTop: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Search */}
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍  Search name or number..."
              style={{ width: "100%", padding: "9px 13px", borderRadius: 12, border: "1.5px solid #F1F5F9", background: "#F8FAFC", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />

            {/* Behaviour pills */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10 }}>
              {[
                { key: "all", label: "All" },
                { key: "urgent",  label: "🔴 Urgent" },
                { key: "overdue", label: "⏰ Overdue" },
                { key: "vip",     label: "⭐ VIP" },
                { key: "cold",    label: "❄️ Cold" },
              ].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  style={{ padding: "5px 14px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: filter === f.key ? "#6366F1" : "#F1F5F9",
                    color:      filter === f.key ? "#fff"    : "#64748B" }}>
                  {f.key === "all" ? `All (${allClients.length})` : f.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── List ── */}
          <div style={{ flex: 1, padding: isMobile ? "10px 12px 100px" : "16px 24px 40px", overflowY: "auto" }}>
            {loading && <Spinner />}

            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#CBD5E1" }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>👤</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>
                  {search || filter !== "all" ? "No clients match" : "No clients yet"}
                </div>
                <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>
                  {!search && filter === "all" && "Tap + Client to get started"}
                </div>
              </div>
            )}

            {/* Needs Attention section */}
            {!loading && !search && filter === "all" && needsAttention.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#EF4444", letterSpacing: 1, whiteSpace: "nowrap" }}>
                    NEEDS ATTENTION ({needsAttention.length})
                  </span>
                  <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {needsAttention.map(c => (
                    <ClientCard key={c.id} c={c} onOpen={() => openClient(c)}
                      lastActivityMap={lastActivityMap} pendingFollowUpMap={pendingFollowUpMap} />
                  ))}
                </div>
              </div>
            )}

            {/* All clients */}
            {!loading && rest.length > 0 && (
              <div>
                {!search && filter === "all" && needsAttention.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 1, whiteSpace: "nowrap" }}>
                      ALL CLIENTS ({rest.length})
                    </span>
                    <div style={{ flex: 1, height: 1, background: "#F1F5F9" }} />
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {rest.map(c => (
                    <ClientCard key={c.id} c={c} onOpen={() => openClient(c)}
                      lastActivityMap={lastActivityMap} pendingFollowUpMap={pendingFollowUpMap} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <PipelineView />
      )}
    </div>
  );
}
