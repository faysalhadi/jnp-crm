import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { getGreeting, timeAgo } from "../../utils/helpers";
import { useUI } from "../../context/UIContext";
import { useCustomers } from "../../context/CustomerContext";
import { useProfile } from "../../context/ProfileContext";
import PullToRefresh from "../ui/PullToRefresh";

export default function SalespersonHomeTab() {
  const { isMobile } = useUI();
  const { customers, loading: customersLoading, setView, setActiveCustomerId, setActiveDealId } = useCustomers();
  const { currentProfile } = useProfile();

  const [todayFollowUps, setTodayFollowUps] = useState([]);
  const [tomorrowFollowUps, setTomorrowFollowUps] = useState([]);
  const [showTomorrow, setShowTomorrow] = useState(false);
  const [followUpsLoading, setFollowUpsLoading] = useState(true);

  const loadFollowUps = async (customerList) => {
    const list = customerList || customers;
    if (!list.length) { setTodayFollowUps([]); setTomorrowFollowUps([]); setFollowUpsLoading(false); return; }
    const ids = list.map(c => c.id);
    const now = new Date();
    const endOfTomorrow = new Date(now); endOfTomorrow.setDate(now.getDate() + 1); endOfTomorrow.setHours(23, 59, 59, 999);
    const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from("follow_ups")
      .select("*, customers(id, name, number)")
      .in("customer_id", ids)
      .eq("status", "pending")
      .lte("due_at", endOfTomorrow.toISOString())
      .order("due_at", { ascending: true });

    const all = data || [];
    setTodayFollowUps(all.filter(fu => new Date(fu.due_at) <= endOfToday));
    setTomorrowFollowUps(all.filter(fu => new Date(fu.due_at) > endOfToday));
    setFollowUpsLoading(false);
  };

  const markFollowUpDone = async (id) => {
    await supabase.from("follow_ups").update({ status: "done" }).eq("id", id);
    loadFollowUps();
  };

  // Re-run whenever customers loads or changes
  useEffect(() => {
    if (!customersLoading) loadFollowUps(customers);
  }, [customers, customersLoading]); // eslint-disable-line

  // Open deals from assigned clients
  const openDeals = customers.flatMap(c =>
    (c.deals || [])
      .filter(d => d.stage !== "closed" && d.stage !== "lost")
      .map(d => ({ ...d, customer: c }))
  ).sort((a, b) => {
    const stageOrder = { confirmed_pending_pickup: 0, negotiation: 1, new_inquiry: 2 };
    return (stageOrder[a.stage] ?? 9) - (stageOrder[b.stage] ?? 9);
  });

  // Clients needing attention (no activity in 3+ days with open deal)
  const needsAttention = customers.filter(c => {
    const hasOpen = (c.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
    if (!hasOpen) return false;
    const last = c.last_activity_at || c.last_active;
    if (!last) return true;
    const days = Math.floor((Date.now() - new Date(last)) / 86400000);
    return days >= 2;
  }).slice(0, 5);

  const goToClient = (customerId, dealId) => {
    setActiveCustomerId(customerId);
    setActiveDealId(dealId || null);
    setView("detail");
  };

  const STAGE_LABELS = {
    new_inquiry: "New inquiry",
    negotiation: "Negotiating",
    confirmed_pending_pickup: "Pickup pending",
    closed: "Closed",
    lost: "Lost",
  };

  const STAGE_COLORS = {
    new_inquiry: "#6366F1",
    negotiation: "#F59E0B",
    confirmed_pending_pickup: "#10B981",
  };

  if (customersLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#94A3B8", fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={() => loadFollowUps(customers)}>
      <div style={{ padding: isMobile ? "16px 12px 100px" : "24px 32px 40px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 600, margin: "0 auto" }}>

        {/* Greeting */}
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>{getGreeting()}, {(currentProfile?.name || "").split(" ")[0]} 👋</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[
            { label: "My Clients", value: customers.length, color: "#6366F1", bg: "#EEF2FF" },
            { label: "Open Deals", value: openDeals.length, color: "#F59E0B", bg: "#FFFBEB" },
            { label: "Follow-ups Today", value: todayFollowUps.length, color: todayFollowUps.length > 0 ? "#EF4444" : "#10B981", bg: todayFollowUps.length > 0 ? "#FEF2F2" : "#ECFDF5" },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, borderRadius: 14, padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Follow-ups today */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5 }}>📅 TODAY'S FOLLOW-UPS</div>
            {tomorrowFollowUps.length > 0 && (
              <button onClick={() => setShowTomorrow(v => !v)} style={{ fontSize: 11, color: "#6366F1", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
                {showTomorrow ? "Hide tomorrow" : `+ Tomorrow (${tomorrowFollowUps.length})`}
              </button>
            )}
          </div>
          {todayFollowUps.length === 0 && !showTomorrow && (
            <div style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", padding: "10px 0" }}>No follow-ups due today 🎉</div>
          )}
          {[...(todayFollowUps), ...(showTomorrow ? tomorrowFollowUps : [])].map(fu => {
            const isOverdue = new Date(fu.due_at) < new Date();
            const isTomorrow = !todayFollowUps.find(t => t.id === fu.id);
            return (
              <div key={fu.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #F1F5F9" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{fu.customers?.name}</div>
                  {fu.note && <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{fu.note}</div>}
                  <div style={{ fontSize: 11, marginTop: 3, color: isOverdue ? "#EF4444" : isTomorrow ? "#6366F1" : "#F59E0B", fontWeight: 600 }}>
                    {isOverdue ? "⚠️ Overdue" : isTomorrow ? "📆 Tomorrow" : "⏰ Today"} · {timeAgo(fu.due_at)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => goToClient(fu.customer_id)}
                    style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "#EEF2FF", color: "#6366F1", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                    Open
                  </button>
                  <button onClick={() => markFollowUpDone(fu.id)}
                    style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "#ECFDF5", color: "#10B981", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                    Done
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Needs attention */}
        {needsAttention.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 10 }}>⚠️ NEEDS ATTENTION</div>
            {needsAttention.map(c => {
              const openDeal = (c.deals || []).find(d => d.stage !== "closed" && d.stage !== "lost");
              const last = c.last_activity_at || c.last_active;
              const days = last ? Math.floor((Date.now() - new Date(last)) / 86400000) : null;
              return (
                <button key={c.id} onClick={() => goToClient(c.id, openDeal?.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 0", borderBottom: "1px solid #F1F5F9", background: "none", border: "none", borderBottom: "1px solid #F1F5F9", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#EF4444", flexShrink: 0 }}>
                    {(c.name || "?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                      {openDeal?.brand} {openDeal?.model} · {days !== null ? `Silent ${days}d` : "No activity"}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#EF4444", fontWeight: 600 }}>→</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Open deals */}
        {openDeals.length > 0 && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 10 }}>📋 OPEN DEALS</div>
            {openDeals.slice(0, 8).map(d => (
              <button key={d.id} onClick={() => goToClient(d.customer.id, d.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 0", background: "none", border: "none", borderBottom: "1px solid #F1F5F9", cursor: "pointer", textAlign: "left", boxSizing: "border-box" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{d.customer.name}</div>
                  <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{[d.brand, d.model].filter(Boolean).join(" ") || "—"}{d.value ? ` · AED ${d.value}` : ""}</div>
                </div>
                <div style={{ padding: "3px 8px", borderRadius: 8, background: (STAGE_COLORS[d.stage] || "#94A3B8") + "20", color: STAGE_COLORS[d.stage] || "#94A3B8", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                  {STAGE_LABELS[d.stage] || d.stage}
                </div>
              </button>
            ))}
            {openDeals.length > 8 && (
              <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: "8px 0" }}>+{openDeals.length - 8} more — check Clients tab</div>
            )}
          </div>
        )}

        {/* Empty state */}
        {customers.length === 0 && (
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>No clients yet</div>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>Add your first client from the Clients tab</div>
          </div>
        )}
      </div>
    </PullToRefresh>
  );
}
