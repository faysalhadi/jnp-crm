import React, { useState, useMemo, useEffect } from "react";
import StageBar from "../ui/StageBar";
import Spinner from "../ui/Spinner";
import { daysSince } from "../../utils/helpers";
import { useCustomers, getClientHealth, getQueuePriority } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import { useStock } from "../../context/StockContext";
import PipelineView from "./PipelineView";
import { TagStrip } from "../chat/TagEditor";
import { getTag } from "../../constants";

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

function ClientCard({ c, onOpen, lastActivityMap, pendingFollowUpMap, queuePriority}) {
  const openDeals  = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost");
  const latestDeal = openDeals[0] || (c.deals || [])[0];
  const totalValue = (c.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
  const activityTs = c.last_activity_at || c.last_active;
  const fu         = pendingFollowUpMap?.[c.id];
  const health     = getClientHealth(c);
  const lastAct    = lastActivityMap?.[c.id];

  const notePreview = lastAct?.activity_type === "note" ? lastAct.note?.slice(0, 55) : null;
  const dealPreview = latestDeal
    ? ([latestDeal.brand, latestDeal.model].filter(Boolean).join(" ") || "Open request") +
      (latestDeal.budget ? ` · AED ${Number(latestDeal.budget).toLocaleString()}` : "")
    : null;
  const preview = notePreview || dealPreview || c.notes?.slice(0, 55) || c.number || "No details yet";

  const hasFollowUp  = !!fu;
  const isOverdue    = queuePriority?.priority <= 2;
  const isIncomplete = !(c.deals || []).length && !c.notes && !hasFollowUp;
  const prefs        = c.preferences || {};
  const hasPrefs     = prefs.brands?.length || prefs.budget_max;

  return (
    <div onClick={onOpen} style={{
      background: "#fff", borderRadius: 16, padding: "12px 14px",
      border: `1.5px solid ${c.urgent ? "#FECACA" : isOverdue ? "#FEF3C7" : "#F1F5F9"}`,
      cursor: "pointer",
      boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      position: "relative", overflow: "hidden",
    }}>
      {queuePriority && <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: queuePriority.color }} />}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%",
            background: health.bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800, color: health.color,
            border: `2px solid ${health.color}40`,
          }}>
            {(c.name || "?")[0].toUpperCase()}
          </div>
          {isIncomplete && (
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: "50%", background: "#F97316", border: "2px solid #fff" }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </span>
              {queuePriority && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8, background: queuePriority.color + "20", color: queuePriority.color, flexShrink: 0 }}>
                  {queuePriority.label}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8, background: health.bg, color: health.color }}>
                {health.label}
              </span>
              <span style={{ fontSize: 10, color: "#94A3B8" }}>{timeAgo(activityTs)}</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {preview}
          </div>
        </div>
      </div>

      {latestDeal && (
        <div style={{ marginTop: 8, marginLeft: 52 }}>
          <StageBar stageId={latestDeal.stage} />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginLeft: 52 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {openDeals.length > 0 && (
            <span style={{ fontSize: 10, color: "#6366F1", fontWeight: 700 }}>{openDeals.length} open</span>
          )}
          {hasPrefs && (
            <span style={{ fontSize: 9, color: "#10B981", fontWeight: 700, background: "#ECFDF5", padding: "1px 6px", borderRadius: 8 }}>🎯</span>
          )}
          {fu && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
              background: isOverdue ? "#FEF2F2" : "#FFFBEB",
              color:      isOverdue ? "#EF4444" : "#D97706" }}>
              📅 {fmtFollowUp(fu.due_at)}
            </span>
          )}
        </div>
        {totalValue > 0 && (
          <span style={{ fontSize: 10, color: "#10B981", fontWeight: 700 }}>
            AED {totalValue >= 1000 ? (totalValue / 1000).toFixed(0) + "k" : totalValue.toLocaleString()}
          </span>
        )}
      </div>

      {(c.tags || []).length > 0 && (
        <div style={{ marginLeft: 52 }}>
          <TagStrip tags={c.tags} max={4} />
        </div>
      )}
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

  const [tagFilter, setTagFilter] = useState(null);

  useEffect(() => {
    if (customerViewMode && customerViewMode !== "queue") {
      setViewModeLocal(customerViewMode);
      // Use setTimeout to avoid triggering re-render during navigation
      setTimeout(() => setCustomerViewMode("queue"), 100);
    }
  }, [customerViewMode]); // eslint-disable-line
  const { stock } = useStock();
  const {
    customers, loading,
    lastActivityMap, pendingFollowUpMap,
    setActiveCustomerId, setActiveDealId, setView, setPendingSuggestion,
    filter, setFilter,
    search, setSearch,
    openDeals: openDealsCount, revenue,
  } = useCustomers();

  const allClients = useMemo(() =>
    customers.filter(c => !c.contact_type || c.contact_type === "client" || c.contact_type === "walkin"),
    [customers]
  );

  const stockMatchSet = useMemo(() => {
    const available = (stock || []).filter(s => s.status === "available");
    const matched = new Set();
    allClients.forEach(c => {
      const prefs = c.preferences || {};
      if (!prefs.brands?.length && !prefs.budget_max) return;
      const has = available.some(s => {
        if (prefs.brands?.length && !prefs.brands.some(b => (s.brand || "").toLowerCase().includes(b.toLowerCase()))) return false;
        if (prefs.budget_max && s.max_price > Number(prefs.budget_max)) return false;
        return true;
      });
      if (has) matched.add(c.id);
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
    const s = { critical: [], confirm: [], stockMatch: [], silent: [], reengage: [], open: [] };
    queueClients.forEach(({ c, priority }) => {
      if      (priority.priority <= 3) s.critical.push({ c, priority });
      else if (priority.priority === 4) s.confirm.push({ c, priority });
      else if (priority.priority === 5) s.stockMatch.push({ c, priority });
      else if (priority.priority === 6) s.silent.push({ c, priority });
      else if (priority.priority === 7) s.reengage.push({ c, priority });
      else                              s.open.push({ c, priority });
    });
    return s;
  }, [queueClients]);

  const filteredAll = useMemo(() => {
    return allClients.filter(c => {
      if (tagFilter && !(c.tags || []).includes(tagFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        const dealMatch = (c.deals || []).some(d =>
          (d.brand || "").toLowerCase().includes(q) || (d.model || "").toLowerCase().includes(q)
        );
        return c.name.toLowerCase().includes(q) || (c.number || "").includes(search) || dealMatch;
      }
      if (filter === "urgent")     return c.urgent;
      if (filter === "overdue")    return daysSince(c.last_active) >= 1 && (c.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
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

  function openClient(c) {
    const open = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost");
    const deal = open[0] || (c.deals || [])[0];
    setActiveCustomerId(c.id);
    setActiveDealId(deal?.id || null);
    setView("detail");
    setPendingSuggestion(null);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: "#fff", padding: "16px 14px 0", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, letterSpacing: 1.5 }}>LAPTOP FOR LESS</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Clients</div>
          </div>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid #F1F5F9", marginLeft: -14, marginRight: -14, paddingLeft: 14 }}>
          {[
            { key: "queue",    label: `Queue (${queueClients.length})` },
            { key: "clients",  label: `All (${allClients.length})` },
            { key: "pipeline", label: "Pipeline" },
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

      {/* QUEUE */}
      {viewMode === "queue" && (
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 12px 100px" : "16px 24px 40px" }}>

          {/* Health summary */}
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
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4, lineHeight: 1.6 }}>
                No urgent actions right now.
              </div>
            </div>
          )}

          {[
            { items: sections.critical,  label: "ACT NOW",       color: "#EF4444",  actions: true  },
            { items: sections.confirm,   label: "CONFIRM TODAY", color: "#6366F1",  actions: true  },
            { items: sections.stockMatch,label: "STOCK MATCH",   color: "#10B981",  actions: true  },
            { items: sections.silent,    label: "FOLLOW UP",     color: "#D97706",  actions: true  },
            { items: sections.reengage,  label: "RE-ENGAGE",     color: "#EF4444",  actions: true  },
            { items: sections.open,      label: "OPEN REQUESTS", color: "#6366F1",  actions: false },
          ].filter(s => s.items.length > 0).map(s => (
            <div key={s.label}>
              <SectionLabel label={s.label} count={s.items.length} color={s.color} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {s.items.map(({ c, priority }) => (
                  <ClientCard key={c.id} c={c} onOpen={() => openClient(c)}
                    lastActivityMap={lastActivityMap} pendingFollowUpMap={pendingFollowUpMap}
                    queuePriority={priority}  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ALL CLIENTS */}
      {viewMode === "clients" && (
        <>
          <div style={{ background: "#fff", padding: "12px 14px 0", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[
                { label: "Total",  value: allClients.length, color: "#6366F1", bg: "#EEF2FF" },
                { label: "Open",   value: openDealsCount,    color: "#F59E0B", bg: "#FFFBEB" },
                { label: "MTD",    value: `AED ${revenue >= 1000 ? (revenue / 1000).toFixed(0) + "k" : revenue}`, color: "#10B981", bg: "#ECFDF5" },
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
            {/* Tag filter row */}
            {(() => {
              const usedTags = [...new Set(allClients.flatMap(c => c.tags || []))];
              if (!usedTags.length) return null;
              return (
                <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10, marginTop: -2 }}>
                  <span style={{ fontSize: 10, color: "#94A3B8", alignSelf: "center", flexShrink: 0 }}>🏷️</span>
                  {tagFilter && (
                    <button onClick={() => setTagFilter(null)}
                      style={{ padding: "4px 10px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 10, fontWeight: 700, cursor: "pointer", background: "#F1F5F9", color: "#94A3B8" }}>
                      ✕ Clear
                    </button>
                  )}
                  {usedTags.map(tagId => {
                    const tag = getTag(tagId);
                    const active = tagFilter === tagId;
                    return (
                      <button key={tagId} onClick={() => setTagFilter(active ? null : tagId)}
                        style={{ padding: "4px 10px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 10, fontWeight: 700, cursor: "pointer",
                          background: active ? tag.color : tag.bg,
                          color: active ? "#fff" : tag.color }}>
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <div style={{ flex: 1, padding: isMobile ? "10px 12px 100px" : "16px 24px 40px", overflowY: "auto" }}>
            {loading && <Spinner />}
            {!loading && filteredAll.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#CBD5E1" }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>👤</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>No clients match</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredAll.map(c => (
                <ClientCard key={c.id} c={c} onOpen={() => openClient(c)}
                  lastActivityMap={lastActivityMap} pendingFollowUpMap={pendingFollowUpMap}
                  queuePriority={getQueuePriority(c, pendingFollowUpMap, stockMatchSet)}
                   />
              ))}
            </div>
          </div>
        </>
      )}

      {viewMode === "pipeline" && <PipelineView />}
    </div>
  );
}
