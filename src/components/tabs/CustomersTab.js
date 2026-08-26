import React, { useState, useMemo, useEffect } from "react";
import StageBar from "../ui/StageBar";
import Spinner from "../ui/Spinner";
import { daysSince } from "../../utils/helpers";
import { useCustomers, getClientHealth, getQueuePriority } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import { useStock } from "../../context/StockContext";
import PipelineView from "./PipelineView";
import { TagStrip } from "../chat/TagEditor";
import { getTag, customerStockMatch, getRecommendation } from "../../constants";
import { supabase } from "../../supabase";
 
// ── Colour tokens ──────────────────────────────────────────────────────────────
const C = {
  surface:  "#FFFFFF",
  bg:       "#F8FAFC",
  border:   "#F1F5F9",
  text:     "#0F172A",
  muted:    "#94A3B8",
  accent:   "#6366F1",
  green:    "#10B981",
  amber:    "#F59E0B",
  red:      "#EF4444",
  blue:     "#3B82F6",
};
 
// ── Helpers ────────────────────────────────────────────────────────────────────
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
  if (!number) return null;
  let n = number.replace(/\D/g, "");
  if (n.startsWith("00971")) n = n.slice(2);
  if (n.startsWith("971"))   return `https://wa.me/${n}`;
  if (n.startsWith("0"))     n = "971" + n.slice(1);
  else                       n = "971" + n;
  return `https://wa.me/${n}`;
}
 
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name[0].toUpperCase();
}
 
// ── ClientCard ─────────────────────────────────────────────────────────────────
function ClientCard({ c, onOpen, lastActivityMap, pendingFollowUpMap, queuePriority, stock, isSelected }) {
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
 
  const isOverdue    = queuePriority?.priority <= 2;
  const isIncomplete = !(c.deals || []).length && !c.notes && !fu;
  const prefs        = c.preferences || {};
  const hasPrefs     = prefs.brands?.length || prefs.budget_max;
 
  const recommendation = useMemo(() => {
    if (!queuePriority) return null;
    const available = (stock || []).filter(s => s.status === "available");
    return getRecommendation(c, {
      priority: queuePriority,
      openDeal: latestDeal,
      fu,
      matchedStock: customerStockMatch(c, available),
      lastNote: lastAct?.activity_type === "note" ? lastAct : null,
    });
  }, [c, queuePriority, latestDeal, fu, stock, lastAct]);
 
  return (
    <div onClick={onOpen} style={{
      background: isSelected ? "#EEF2FF" : C.surface,
      borderRadius: 14,
      padding: "11px 13px",
      border: `1.5px solid ${isSelected ? C.accent : c.urgent ? "#FECACA" : isOverdue ? "#FEF3C7" : C.border}`,
      cursor: "pointer",
      boxShadow: isSelected ? `0 0 0 2px ${C.accent}30` : "0 1px 4px rgba(0,0,0,0.04)",
      position: "relative",
      overflow: "hidden",
      transition: "border-color 0.15s, background 0.15s",
    }}>
      {queuePriority && (
        <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: queuePriority.color }} />
      )}
 
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: health.bg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: health.color,
            border: `2px solid ${health.color}40`,
          }}>
            {getInitials(c.name)}
          </div>
          {isIncomplete && (
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%", background: "#F97316", border: "2px solid #fff" }} />
          )}
        </div>
 
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              <span style={{ fontWeight: 800, fontSize: 13.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </span>
              {queuePriority && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 8, background: queuePriority.color + "20", color: queuePriority.color, flexShrink: 0 }}>
                  {queuePriority.label}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 8, background: health.bg, color: health.color }}>
                {health.label}
              </span>
              <span style={{ fontSize: 10, color: C.muted }}>{timeAgo(activityTs)}</span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {preview}
          </div>
        </div>
      </div>
 
      {latestDeal && (
        <div style={{ marginTop: 7, marginLeft: 50 }}>
          <StageBar stageId={latestDeal.stage} />
        </div>
      )}
 
      {recommendation && (
        <div style={{
          marginTop: 6, marginLeft: 50, padding: "5px 8px", borderRadius: 8,
          background: (queuePriority.color || C.accent) + "12",
          fontSize: 11, color: "#334155", lineHeight: 1.4,
        }}>
          💡 {recommendation}
        </div>
      )}
 
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5, marginLeft: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {openDeals.length > 0 && (
            <span style={{ fontSize: 10, color: C.accent, fontWeight: 700 }}>{openDeals.length} open</span>
          )}
          {hasPrefs && (
            <span style={{ fontSize: 9, color: C.green, fontWeight: 700, background: "#ECFDF5", padding: "1px 5px", borderRadius: 8 }}>🎯</span>
          )}
          {fu && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 20,
              background: isOverdue ? "#FEF2F2" : "#FFFBEB",
              color:      isOverdue ? C.red      : "#D97706" }}>
              📅 {fmtFollowUp(fu.due_at)}
            </span>
          )}
        </div>
        {totalValue > 0 && (
          <span style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>
            AED {totalValue >= 1000 ? (totalValue / 1000).toFixed(0) + "k" : totalValue.toLocaleString()}
          </span>
        )}
      </div>
 
      {(c.tags || []).length > 0 && (
        <div style={{ marginLeft: 50 }}>
          <TagStrip tags={c.tags} max={4} />
        </div>
      )}
    </div>
  );
}
 
// ── SectionLabel ───────────────────────────────────────────────────────────────
function SectionLabel({ label, count, color = C.muted }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "12px 0 7px" }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <span style={{ fontSize: 10, fontWeight: 800, color, letterSpacing: 1, whiteSpace: "nowrap" }}>
        {label}{count !== undefined ? ` (${count})` : ""}
      </span>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}
 
// ── ClientPreviewPanel (laptop right panel) ────────────────────────────────────
function ClientPreviewPanel({ client, queuePriority, fu, lastActivity, stock, onOpenFull, pendingFollowUpMap, stockMatchSet }) {
  const { loadCustomers } = useCustomers();
  const [recentActivities, setRecentActivities] = useState([]);
  const [contacted, setContacted]               = useState(false);
 
  useEffect(() => {
    if (!client) return;
    setContacted(false);
    supabase
      .from("activity_log")
      .select("activity_type, note, logged_at")
      .eq("customer_id", client.id)
      .order("logged_at", { ascending: false })
      .limit(4)
      .then(({ data }) => setRecentActivities(data || []));
  }, [client?.id]); // eslint-disable-line
 
  const health     = getClientHealth(client);
  const openDeals  = (client.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost");
  const closedDeals = (client.deals || []).filter(d => d.stage === "closed");
  const totalValue = closedDeals.reduce((a, d) => a + (d.value || 0), 0);
  const waUrl      = buildWaUrl(client.number);
 
  const available = (stock || []).filter(s => s.status === "available");
  const latestDeal = openDeals[0];
  const matchedStock = customerStockMatch(client, available);
  const recommendation = queuePriority
    ? getRecommendation(client, {
        priority: queuePriority,
        openDeal: latestDeal,
        fu,
        matchedStock,
        lastNote: lastActivity?.activity_type === "note" ? lastActivity : null,
      })
    : null;
 
  async function logContacted() {
    await supabase.from("activity_log").insert({
      customer_id: client.id,
      activity_type: "messaged",
      note: "Contacted",
      logged_at: new Date().toISOString(),
    });
    await supabase.from("customers").update({
      last_activity_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
    }).eq("id", client.id);
    await loadCustomers();
    setContacted(true);
  }
 
  const activityIcon = { called: "📞", messaged: "💬", met: "🤝", note: "📝", no_answer: "📵" };
 
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 32px 40px", background: C.bg }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: health.bg, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 24, fontWeight: 900,
          color: health.color, border: `3px solid ${health.color}40`, flexShrink: 0,
        }}>
          {getInitials(client.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{client.name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: health.bg, color: health.color }}>
              {health.label}
            </span>
            {queuePriority && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: queuePriority.color + "20", color: queuePriority.color }}>
                {queuePriority.label}
              </span>
            )}
            {client.number && (
              <span style={{ fontSize: 12, color: C.muted }}>{client.number}</span>
            )}
          </div>
          {(client.tags || []).length > 0 && (
            <div style={{ marginTop: 7 }}>
              <TagStrip tags={client.tags} max={6} />
            </div>
          )}
        </div>
      </div>
 
      {/* Recommendation */}
      {recommendation && (
        <div style={{
          padding: "12px 16px", borderRadius: 12, marginBottom: 16,
          background: (queuePriority?.color || C.accent) + "15",
          border: `1px solid ${(queuePriority?.color || C.accent)}30`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: queuePriority?.color || C.accent, marginBottom: 4, letterSpacing: 0.5 }}>
            SUGGESTED ACTION
          </div>
          <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.5 }}>💡 {recommendation}</div>
        </div>
      )}
 
      {/* Follow-up */}
      {fu && (
        <div style={{
          padding: "10px 14px", borderRadius: 10, marginBottom: 16,
          background: new Date(fu.due_at) <= new Date() ? "#FEF2F2" : "#FFFBEB",
          border: `1px solid ${new Date(fu.due_at) <= new Date() ? "#FECACA" : "#FDE68A"}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>📅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: new Date(fu.due_at) <= new Date() ? C.red : "#D97706" }}>
              {fmtFollowUp(fu.due_at)}
            </div>
            {fu.note && <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{fu.note}</div>}
          </div>
        </div>
      )}
 
      {/* Quick actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            <button style={{
              padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer",
              background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 13,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span>💬</span> WhatsApp
            </button>
          </a>
        )}
        <button
          onClick={logContacted}
          disabled={contacted}
          style={{
            padding: "9px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`,
            cursor: contacted ? "default" : "pointer",
            background: contacted ? "#ECFDF5" : C.surface,
            color: contacted ? C.green : "#334155",
            fontWeight: 700, fontSize: 13,
            display: "flex", alignItems: "center", gap: 6,
            opacity: contacted ? 0.8 : 1,
          }}>
          {contacted ? "✅ Logged" : "✓ Log Contacted"}
        </button>
        <button
          onClick={onOpenFull}
          style={{
            marginLeft: "auto", padding: "9px 16px", borderRadius: 10,
            border: `1.5px solid ${C.accent}`, cursor: "pointer",
            background: C.surface, color: C.accent, fontWeight: 700, fontSize: 13,
          }}>
          Open Profile →
        </button>
      </div>
 
      {/* Stats row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Closed Deals", value: closedDeals.length, color: C.green, bg: "#ECFDF5" },
          { label: "Lifetime AED", value: totalValue >= 1000 ? (totalValue / 1000).toFixed(0) + "k" : totalValue || "—", color: C.accent, bg: "#EEF2FF" },
          { label: "Last Active", value: timeAgo(client.last_activity_at || client.last_active) || "—", color: C.amber, bg: "#FFFBEB" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: s.color, opacity: 0.75, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
 
      {/* Open Deals */}
      {openDeals.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>OPEN DEALS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {openDeals.map(d => (
              <div key={d.id} style={{ background: C.surface, borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>
                    {[d.brand, d.model].filter(Boolean).join(" ") || "Open request"}
                  </span>
                  {d.budget && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>
                      AED {Number(d.budget).toLocaleString()}
                    </span>
                  )}
                </div>
                <StageBar stageId={d.stage} />
              </div>
            ))}
          </div>
        </div>
      )}
 
      {/* Recent Activity */}
      {recentActivities.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1, marginBottom: 8 }}>RECENT ACTIVITY</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {recentActivities.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 12px", background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{activityIcon[a.activity_type] || "📋"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#334155", textTransform: "capitalize" }}>
                    {a.activity_type?.replace("_", " ")}
                  </div>
                  {a.note && (
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.note}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{timeAgo(a.logged_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
 
// ── DefaultRightPanel (laptop right panel when nothing selected) ───────────────
function DefaultRightPanel({ allClients, healthCounts, sections, queueClients }) {
  const totalOpen = allClients.reduce((a, c) =>
    a + (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost").length, 0);
  const totalValue = allClients.reduce((a, c) =>
    a + (c.deals || []).filter(d => d.stage === "closed").reduce((s, d) => s + (d.value || 0), 0), 0);
 
  const healthRows = [
    { key: "active",   label: "Active",   color: C.green, icon: "🟢" },
    { key: "warm",     label: "Warm",     color: C.amber,  icon: "🟡" },
    { key: "cooling",  label: "Cooling",  color: C.red,    icon: "🔴" },
    { key: "inactive", label: "Inactive", color: C.muted,  icon: "⚫" },
    { key: "prospect", label: "Prospect", color: C.blue,   icon: "🔵" },
    { key: "new",      label: "New",      color: C.accent, icon: "✨" },
  ].filter(h => (healthCounts[h.key] || 0) > 0);
 
  const totalHealthy = (healthCounts.active || 0) + (healthCounts.warm || 0);
  const totalAtRisk  = (healthCounts.cooling || 0) + (healthCounts.inactive || 0);
 
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "32px 36px 40px", background: C.bg }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, letterSpacing: 1.5, marginBottom: 4 }}>OVERVIEW</div>
      <div style={{ fontSize: 28, fontWeight: 900, color: C.text, marginBottom: 24 }}>Client Health</div>
 
      {/* Big stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
        {[
          { label: "Total Clients",  value: allClients.length, color: C.accent, bg: "#EEF2FF" },
          { label: "Healthy",        value: totalHealthy,       color: C.green,  bg: "#ECFDF5" },
          { label: "At Risk",        value: totalAtRisk,        color: C.red,    bg: "#FEF2F2" },
          { label: "Open Deals",     value: totalOpen,          color: C.amber,  bg: "#FFFBEB" },
          { label: "Lifetime AED",   value: totalValue >= 1000 ? (totalValue / 1000).toFixed(0) + "k" : totalValue, color: C.accent, bg: "#EEF2FF" },
          { label: "In Queue",       value: queueClients.length, color: "#8B5CF6", bg: "#F5F3FF" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 14, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: s.color, opacity: 0.7, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>
 
      {/* Health breakdown */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1, marginBottom: 10 }}>HEALTH BREAKDOWN</div>
        <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          {healthRows.map((h, i) => {
            const count = healthCounts[h.key] || 0;
            const pct   = allClients.length ? Math.round((count / allClients.length) * 100) : 0;
            return (
              <div key={h.key} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 16px",
                borderBottom: i < healthRows.length - 1 ? `1px solid ${C.border}` : "none",
              }}>
                <span style={{ fontSize: 14 }}>{h.icon}</span>
                <span style={{ width: 64, fontSize: 12, fontWeight: 700, color: h.color }}>{h.label}</span>
                <div style={{ flex: 1, height: 6, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: h.color, borderRadius: 4 }} />
                </div>
                <span style={{ width: 28, fontSize: 12, fontWeight: 700, color: h.color, textAlign: "right" }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
 
      {/* Queue summary */}
      {queueClients.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 1, marginBottom: 10 }}>QUEUE SUMMARY</div>
          <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {[
              { label: "ACT NOW",       count: sections.critical.length,  color: C.red },
              { label: "CONFIRM TODAY", count: sections.confirm.length,   color: C.accent },
              { label: "STOCK MATCH",   count: sections.stockMatch.length, color: C.green },
              { label: "FOLLOW UP",     count: sections.silent.length,    color: C.amber },
              { label: "RE-ENGAGE",     count: sections.reengage.length,  color: C.red },
              { label: "OPEN REQUESTS", count: sections.open.length,      color: C.accent },
            ].filter(s => s.count > 0).map((s, i, arr) => (
              <div key={s.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 16px",
                borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", letterSpacing: 0.5 }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: s.color, background: s.color + "15", padding: "2px 10px", borderRadius: 20 }}>
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
 
      <div style={{ marginTop: 32, textAlign: "center", color: C.muted, fontSize: 12 }}>
        ← Select a client to preview
      </div>
    </div>
  );
}
 
// ── Main CustomersTab ──────────────────────────────────────────────────────────
export default function CustomersTab() {
  const [viewMode, setViewModeLocal] = useState("queue");
  const { isMobile, customerViewMode, setCustomerViewMode } = useUI();
 
  const [tagFilter,        setTagFilter]        = useState([]);
  const [isLaptop,         setIsLaptop]         = useState(window.innerWidth >= 900);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [queueSearch,      setQueueSearch]      = useState("");
 
  const setViewMode = (mode) => {
    setViewModeLocal(mode);
    setSelectedClientId(null);
  };
 
  useEffect(() => {
    const h = () => setIsLaptop(window.innerWidth >= 900);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
 
  useEffect(() => {
    if (!isLaptop) setSelectedClientId(null);
  }, [isLaptop]);
 
  useEffect(() => {
    if (customerViewMode && customerViewMode !== "queue") {
      setViewModeLocal(customerViewMode);
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
    allClients.forEach(c => { if (customerStockMatch(c, available)) matched.add(c.id); });
    return matched;
  }, [allClients, stock]);
 
  const queueClients = useMemo(() =>
    allClients
      .map(c => ({ c, priority: getQueuePriority(c, pendingFollowUpMap, stockMatchSet) }))
      .filter(({ priority }) => priority !== null)
      .sort((a, b) => a.priority.priority - b.priority.priority),
    [allClients, pendingFollowUpMap, stockMatchSet]
  );
 
  const filteredQueue = useMemo(() => {
    if (!queueSearch.trim()) return queueClients;
    const q = queueSearch.toLowerCase();
    return queueClients.filter(({ c }) =>
      c.name.toLowerCase().includes(q) ||
      (c.number || "").includes(queueSearch) ||
      (c.deals || []).some(d =>
        (d.brand || "").toLowerCase().includes(q) || (d.model || "").toLowerCase().includes(q)
      )
    );
  }, [queueClients, queueSearch]);
 
  const sections = useMemo(() => {
    const s = { critical: [], confirm: [], stockMatch: [], silent: [], reengage: [], open: [] };
    filteredQueue.forEach(({ c, priority }) => {
      if      (priority.priority <= 3) s.critical.push({ c, priority });
      else if (priority.priority === 4) s.confirm.push({ c, priority });
      else if (priority.priority === 5) s.stockMatch.push({ c, priority });
      else if (priority.priority === 6) s.silent.push({ c, priority });
      else if (priority.priority === 7) s.reengage.push({ c, priority });
      else                              s.open.push({ c, priority });
    });
    return s;
  }, [filteredQueue]);
 
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
    const counts = { active: 0, warm: 0, cooling: 0, inactive: 0, prospect: 0, new: 0 };
    allClients.forEach(cl => {
      const s = getClientHealth(cl).status;
      counts[s] = (counts[s] || 0) + 1;
    });
    return counts;
  }, [allClients]);
 
  const selectedClient = useMemo(() =>
    allClients.find(c => c.id === selectedClientId),
    [allClients, selectedClientId]
  );
 
  function openClient(c) {
    const open = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost");
    const deal = open[0] || (c.deals || [])[0];
    setActiveCustomerId(c.id);
    setActiveDealId(deal?.id || null);
    setView("detail");
    setPendingSuggestion(null);
  }
 
  function handleCardClick(c) {
    if (isLaptop) {
      setSelectedClientId(prev => prev === c.id ? null : c.id);
    } else {
      openClient(c);
    }
  }
 
  // ── Shared sub-sections ──────────────────────────────────────────────────────
  const renderQueueContent = (compact) => (
    <div style={{ flex: 1, overflowY: "auto", padding: compact ? "10px 12px 40px" : "12px 12px 100px" }}>
      {!compact && (
        <div style={{ display: "flex", gap: 5, marginBottom: 10, overflowX: "auto", scrollbarWidth: "none" }}>
          {[
            { key: "active",   label: "🟢 Active",   color: C.green },
            { key: "warm",     label: "🟡 Warm",     color: C.amber },
            { key: "cooling",  label: "🔴 Cooling",  color: C.red },
            { key: "inactive", label: "⚫ Inactive", color: C.muted },
            { key: "prospect", label: "🔵 Prospect", color: C.blue },
          ].filter(h => healthCounts[h.key] > 0).map(h => (
            <button key={h.key}
              onClick={() => { setViewMode("clients"); setFilter(h.key); setSearch(""); }}
              style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 20, border: "none",
                background: "#F8FAFC", fontSize: 10, fontWeight: 700, color: h.color, cursor: "pointer" }}>
              {h.label} {healthCounts[h.key]}
            </button>
          ))}
        </div>
      )}
 
      {loading && <Spinner />}
 
      {!loading && filteredQueue.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
            {queueSearch ? "No matches" : "Queue is clear"}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {queueSearch ? "Try a different search" : "No urgent actions right now."}
          </div>
        </div>
      )}
 
      {[
        { items: sections.critical,   label: "ACT NOW",       color: C.red    },
        { items: sections.confirm,    label: "CONFIRM TODAY", color: C.accent },
        { items: sections.stockMatch, label: "STOCK MATCH",   color: C.green  },
        { items: sections.silent,     label: "FOLLOW UP",     color: "#D97706" },
        { items: sections.reengage,   label: "RE-ENGAGE",     color: C.red    },
        { items: sections.open,       label: "OPEN REQUESTS", color: C.accent },
      ].filter(s => s.items.length > 0).map(s => (
        <div key={s.label}>
          <SectionLabel label={s.label} count={s.items.length} color={s.color} />
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {s.items.map(({ c, priority }) => (
              <ClientCard key={c.id} c={c}
                onOpen={() => handleCardClick(c)}
                lastActivityMap={lastActivityMap}
                pendingFollowUpMap={pendingFollowUpMap}
                queuePriority={priority}
                stock={stock}
                isSelected={selectedClientId === c.id}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
 
  const renderAllContent = (compact) => (
    <>
      <div style={{ background: C.surface, padding: "10px 12px 0", borderBottom: `1px solid ${C.border}` }}>
        {!compact && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[
              { label: "Total", value: allClients.length, color: C.accent, bg: "#EEF2FF" },
              { label: "Open",  value: openDealsCount,    color: C.amber,  bg: "#FFFBEB" },
              { label: "MTD",   value: `AED ${revenue >= 1000 ? (revenue / 1000).toFixed(0) + "k" : revenue}`, color: C.green, bg: "#ECFDF5" },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 10, padding: "7px 5px", textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: s.color, fontWeight: 700, opacity: 0.75 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search name, number or device..."
          style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "#F8FAFC", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 8 }}>
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
              style={{ padding: "4px 11px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: filter === f.key ? C.accent : "#F1F5F9",
                color:      filter === f.key ? "#fff"   : "#64748B" }}>
              {f.label}
            </button>
          ))}
        </div>
        {(() => {
          const usedTags = [...new Set(allClients.flatMap(c => c.tags || []))];
          if (!usedTags.length) return null;
          return (
            <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 8, marginTop: -2 }}>
              <span style={{ fontSize: 10, color: C.muted, alignSelf: "center", flexShrink: 0 }}>🏷️</span>
              {tagFilter.length > 0 && (
                <button onClick={() => setTagFilter([])}
                  style={{ padding: "3px 9px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 10, fontWeight: 700, cursor: "pointer", background: "#F1F5F9", color: C.muted }}>
                  ✕ Clear
                </button>
              )}
              {usedTags.map(tagId => {
                const tag    = getTag(tagId);
                const active = tagFilter.includes(tagId);
                return (
                  <button key={tagId}
                    onClick={() => setTagFilter(prev => active ? prev.filter(t => t !== tagId) : [...prev, tagId])}
                    style={{ padding: "3px 9px", borderRadius: 20, border: active ? `2px solid ${tag.color}` : "none", flexShrink: 0, fontSize: 10, fontWeight: 700, cursor: "pointer",
                      background: active ? tag.bg   : "#F1F5F9",
                      color:      active ? tag.color : "#64748B" }}>
                    {active ? "✓ " : ""}{tag.label}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>
      <div style={{ flex: 1, padding: "10px 12px 40px", overflowY: "auto" }}>
        {loading && <Spinner />}
        {!loading && filteredAll.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#CBD5E1" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>👤</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>No clients match</div>
          </div>
        )}
        {filteredAll.length > 0 && (
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 6 }}>
            {filteredAll.length} client{filteredAll.length !== 1 ? "s" : ""}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {filteredAll.map(c => (
            <ClientCard key={c.id} c={c}
              onOpen={() => handleCardClick(c)}
              lastActivityMap={lastActivityMap}
              pendingFollowUpMap={pendingFollowUpMap}
              queuePriority={getQueuePriority(c, pendingFollowUpMap, stockMatchSet)}
              stock={stock}
              isSelected={selectedClientId === c.id}
            />
          ))}
        </div>
      </div>
    </>
  );
 
  // ── Tab bar (shared) ─────────────────────────────────────────────────────────
  const renderTabs = () => (
    <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, marginLeft: -14, marginRight: -14, paddingLeft: 14 }}>
      {[
        { key: "queue",    label: `Queue (${queueClients.length})` },
        { key: "clients",  label: `All (${allClients.length})` },
        { key: "pipeline", label: "Pipeline" },
      ].map(m => (
        <button key={m.key} onClick={() => setViewMode(m.key)}
          style={{ padding: "8px 14px", border: "none", background: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
            color:        viewMode === m.key ? C.accent : C.muted,
            borderBottom: viewMode === m.key ? `2px solid ${C.accent}` : "2px solid transparent" }}>
          {m.label}
        </button>
      ))}
    </div>
  );
 
  // ── LAPTOP LAYOUT ────────────────────────────────────────────────────────────
  if (isLaptop && viewMode !== "pipeline") {
    return (
      <div style={{ flex: 1, display: "flex", overflow: "hidden", height: "100%" }}>
 
        {/* Left panel */}
        <div style={{ width: 370, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${C.border}`, background: C.surface, overflow: "hidden" }}>
 
          {/* Left header */}
          <div style={{ padding: "16px 14px 0", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1.5 }}>LAPTOP FOR LESS</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Clients</div>
              </div>
            </div>
            {renderTabs()}
          </div>
 
          {/* Queue search (laptop only) */}
          {viewMode === "queue" && (
            <div style={{ padding: "10px 12px 0", background: C.surface, flexShrink: 0 }}>
              <input value={queueSearch} onChange={e => setQueueSearch(e.target.value)}
                placeholder="🔍 Search queue..."
                style={{ width: "100%", padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "#F8FAFC", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
 
          {/* Scrollable list */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {viewMode === "queue"   && renderQueueContent(true)}
            {viewMode === "clients" && renderAllContent(true)}
          </div>
        </div>
 
        {/* Right panel */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {selectedClient ? (
            <ClientPreviewPanel
              client={selectedClient}
              queuePriority={getQueuePriority(selectedClient, pendingFollowUpMap, stockMatchSet)}
              fu={pendingFollowUpMap?.[selectedClient.id]}
              lastActivity={lastActivityMap?.[selectedClient.id]}
              stock={stock}
              pendingFollowUpMap={pendingFollowUpMap}
              stockMatchSet={stockMatchSet}
              onOpenFull={() => openClient(selectedClient)}
            />
          ) : (
            <DefaultRightPanel
              allClients={allClients}
              healthCounts={healthCounts}
              sections={sections}
              queueClients={queueClients}
            />
          )}
        </div>
      </div>
    );
  }
 
  // ── MOBILE LAYOUT ────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
 
      {/* Header */}
      <div style={{ background: C.surface, padding: "16px 14px 0", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1.5 }}>LAPTOP FOR LESS</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Clients</div>
          </div>
        </div>
        {renderTabs()}
      </div>
 
      {/* QUEUE */}
      {viewMode === "queue" && (
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 12px 100px" : "16px 24px 40px" }}>
          <div style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto", scrollbarWidth: "none" }}>
            {[
              { key: "active",   label: "🟢 Active",   color: C.green },
              { key: "warm",     label: "🟡 Warm",     color: C.amber },
              { key: "cooling",  label: "🔴 Cooling",  color: C.red },
              { key: "inactive", label: "⚫ Inactive", color: C.muted },
              { key: "prospect", label: "🔵 Prospect", color: C.blue },
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
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Queue is clear</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.6 }}>
                No urgent actions right now.
              </div>
            </div>
          )}
 
          {[
            { items: sections.critical,   label: "ACT NOW",       color: C.red    },
            { items: sections.confirm,    label: "CONFIRM TODAY", color: C.accent },
            { items: sections.stockMatch, label: "STOCK MATCH",   color: C.green  },
            { items: sections.silent,     label: "FOLLOW UP",     color: "#D97706" },
            { items: sections.reengage,   label: "RE-ENGAGE",     color: C.red    },
            { items: sections.open,       label: "OPEN REQUESTS", color: C.accent },
          ].filter(s => s.items.length > 0).map(s => (
            <div key={s.label}>
              <SectionLabel label={s.label} count={s.items.length} color={s.color} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {s.items.map(({ c, priority }) => (
                  <ClientCard key={c.id} c={c} onOpen={() => openClient(c)}
                    lastActivityMap={lastActivityMap} pendingFollowUpMap={pendingFollowUpMap}
                    queuePriority={priority} stock={stock} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
 
      {/* ALL CLIENTS */}
      {viewMode === "clients" && (
        <>
          <div style={{ background: C.surface, padding: "12px 14px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {[
                { label: "Total", value: allClients.length, color: C.accent, bg: "#EEF2FF" },
                { label: "Open",  value: openDealsCount,    color: C.amber,  bg: "#FFFBEB" },
                { label: "MTD",   value: `AED ${revenue >= 1000 ? (revenue / 1000).toFixed(0) + "k" : revenue}`, color: C.green, bg: "#ECFDF5" },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 12, padding: "8px 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: s.color, fontWeight: 700, opacity: 0.75 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Search name, number or device..."
              style={{ width: "100%", padding: "9px 13px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: "#F8FAFC", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
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
                    background: filter === f.key ? C.accent : "#F1F5F9",
                    color:      filter === f.key ? "#fff"   : "#64748B" }}>
                  {f.label}
                </button>
              ))}
            </div>
            {(() => {
              const usedTags = [...new Set(allClients.flatMap(c => c.tags || []))];
              if (!usedTags.length) return null;
              return (
                <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10, marginTop: -2 }}>
                  <span style={{ fontSize: 10, color: C.muted, alignSelf: "center", flexShrink: 0 }}>🏷️</span>
                  {tagFilter.length > 0 && (
                    <button onClick={() => setTagFilter([])}
                      style={{ padding: "4px 10px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 10, fontWeight: 700, cursor: "pointer", background: "#F1F5F9", color: C.muted }}>
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
                          background: active ? tag.bg   : "#F1F5F9",
                          color:      active ? tag.color : "#64748B" }}>
                        {active ? "✓ " : ""}{tag.label}
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
                <div style={{ fontSize: 15, fontWeight: 700, color: C.muted }}>No clients match</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredAll.map(c => (
                <ClientCard key={c.id} c={c} onOpen={() => openClient(c)}
                  lastActivityMap={lastActivityMap} pendingFollowUpMap={pendingFollowUpMap}
                  queuePriority={getQueuePriority(c, pendingFollowUpMap, stockMatchSet)}
                  stock={stock} />
              ))}
            </div>
          </div>
        </>
      )}
 
      {viewMode === "pipeline" && <PipelineView />}
    </div>
  );
}
