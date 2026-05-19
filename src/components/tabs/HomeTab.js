import React from "react";
import { STAGES, EMPTY_STOCK } from "../../constants";
import { daysSince, timeAgo, getGreeting } from "../../utils/helpers";

export default function HomeTab({
  customers, stock, tasks, todaySales, partsRevMTD,
  sourcingAlerts, isMobile, setActiveTab, setView,
  setActiveCustomerId, setActiveDealId, setPendingSuggestion,
  setShowQuickSale, setStockFilter, setFilter,
  setShowAddStock, setEditingStock, setStockForm,
  openDeals, closedDeals, revenue,
  setSearch,
}) {
  const followUpsDue = tasks.filter(t => t.days >= 1).length;
  const urgentClients = customers.filter(c => c.urgent).length;
  const overdueFollowUps = tasks.filter(t => t.days >= 1).length;
  const slowStock = stock.filter(s => s.status === "available" && daysSince(s.created_at) >= 7).length;
  const pendingPayments = customers.reduce((n, c) => n + (c.deals || []).filter(d => d.stage === "closed" && d.payment_status === "pending").length, 0);
  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
  const reservedItems = stock.filter(s => s.status === "reserved");
  const pickupsToday  = reservedItems.filter(s => s.pickup_date && new Date(s.pickup_date).toDateString() === new Date().toDateString());
  const overduePickups = reservedItems.filter(s => s.pickup_date && new Date(s.pickup_date) < todayMidnight);
  const topFocus = [
    ...tasks.filter(t => t.days >= 3).map(t => ({ ...t, priority: 3 })),
    ...tasks.filter(t => t.days >= 1 && t.days < 3).map(t => ({ ...t, priority: 2 })),
    ...customers.filter(c => c.urgent).flatMap(c => (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost").map(d => ({ customer: c, deal: d, days: daysSince(c.last_active), type: "urgent", priority: 2 }))),
  ].sort((a, b) => b.priority - a.priority || b.days - a.days).slice(0, 3);
  const recentActivity = (() => {
    const items = [];
    [...customers].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 3).forEach(c => items.push({ icon: "👤", text: `New client: ${c.name}`, date: c.created_at }));
    [...stock].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 3).forEach(s => {
      const device = [s.brand, s.model].filter(Boolean).join(" ") || "Device";
      items.push({ icon: s.status === "sold" ? "💸" : "📦", text: `${s.status === "sold" ? "Sold" : "Added"}: ${device}`, date: s.created_at });
    });
    customers.forEach(c => (c.deals || []).forEach(d => {
      if (d.stage === "closed" && d.closed_at) items.push({ icon: "✅", text: `Deal closed: ${c.name}${d.value ? ` AED ${d.value}` : ""}`, date: d.closed_at });
    }));
    return items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 5);
  })();

  return (
    <div style={{ flex: 1, padding: isMobile ? "16px 12px 100px" : "24px 32px 40px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
      {/* Greeting */}
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>{getGreeting()} 👋</div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
        {[
          { label: "Open Deals", value: openDeals, color: "#6366F1", bg: "#EEF2FF", icon: "📋" },
          { label: "Revenue MTD", value: (() => { const total = revenue + partsRevMTD; return `AED ${total >= 1000 ? (total/1000).toFixed(1)+"k" : total}`; })(), color: "#10B981", bg: "#ECFDF5", icon: "💰" },
          { label: "In Stock", value: stock.filter(s => s.status === "available").length, color: "#F59E0B", bg: "#FFFBEB", icon: "📦" },
          { label: "Follow Ups", value: followUpsDue, color: "#EF4444", bg: "#FEF2F2", icon: "⏰", onClick: () => { setActiveTab("customers"); setFilter("overdue"); } },
        ].map(s => (
          <div key={s.label} onClick={s.onClick} style={{ background: s.bg, borderRadius: 16, padding: "14px 16px", cursor: s.onClick ? "pointer" : "default" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: s.color, fontWeight: 600, opacity: 0.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Today's sales stat */}
      {todaySales.total > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, padding: "10px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🏷️</span>
          <span style={{ fontSize: 13, color: "#0F172A", fontWeight: 600 }}>
            Today: <b>{todaySales.total}</b> sale{todaySales.total !== 1 ? "s" : ""}
            {todaySales.whatsapp > 0 && <span style={{ color: "#10B981" }}> ({todaySales.whatsapp} WhatsApp</span>}
            {todaySales.walkin > 0 && <span style={{ color: "#6366F1" }}>{todaySales.whatsapp > 0 ? " + " : " ("}{todaySales.walkin} walk-in ⚡</span>}
            {(todaySales.whatsapp > 0 || todaySales.walkin > 0) && <span>)</span>}
          </span>
        </div>
      )}

      {/* Alerts */}
      {(urgentClients > 0 || overdueFollowUps > 0 || slowStock > 0 || pendingPayments > 0 || pickupsToday.length > 0 || overduePickups.length > 0) && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, letterSpacing: 0.5 }}>⚡ ALERTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pickupsToday.length > 0 && <button onClick={() => { setStockFilter("reserved"); setActiveTab("stock"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FFFBEB", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#D97706", fontWeight: 700 }}>🔒 {pickupsToday.length} reservation{pickupsToday.length !== 1 ? "s" : ""} — pickup today</span><span style={{ color: "#D97706", fontSize: 13 }}>→</span></button>}
            {overduePickups.length > 0 && <button onClick={() => { setStockFilter("reserved"); setActiveTab("stock"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FEF2F2", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#EF4444", fontWeight: 700 }}>⚠️ {overduePickups.length} reservation{overduePickups.length !== 1 ? "s" : ""} overdue — client didn't show</span><span style={{ color: "#EF4444", fontSize: 13 }}>→</span></button>}
            {urgentClients > 0 && <button onClick={() => { setFilter("urgent"); setActiveTab("customers"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FEF2F2", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#EF4444", fontWeight: 700 }}>🔴 {urgentClients} urgent client{urgentClients !== 1 ? "s" : ""}</span><span style={{ color: "#EF4444", fontSize: 13 }}>→</span></button>}
            {overdueFollowUps > 0 && <button onClick={() => { setActiveTab("customers"); setFilter("overdue"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FFFBEB", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#F59E0B", fontWeight: 700 }}>⏰ {overdueFollowUps} overdue follow up{overdueFollowUps !== 1 ? "s" : ""}</span><span style={{ color: "#F59E0B", fontSize: 13 }}>→</span></button>}
            {slowStock > 0 && <button onClick={() => { setStockFilter("available"); setActiveTab("stock"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FEF9C3", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#CA8A04", fontWeight: 700 }}>⚠️ {slowStock} device{slowStock !== 1 ? "s" : ""} unsold 7+ days</span><span style={{ color: "#CA8A04", fontSize: 13 }}>→</span></button>}
            {pendingPayments > 0 && <button onClick={() => { setFilter("all"); setActiveTab("customers"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#ECFDF5", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#10B981", fontWeight: 700 }}>💰 {pendingPayments} payment{pendingPayments !== 1 ? "s" : ""} pending</span><span style={{ color: "#10B981", fontSize: 13 }}>→</span></button>}
          </div>
        </div>
      )}

      {/* Sourcing Alerts */}
      {(sourcingAlerts.bidsDue.length > 0 || sourcingAlerts.inTransit > 0 || sourcingAlerts.arrived > 0 || sourcingAlerts.paymentDue > 0) && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, letterSpacing: 0.5 }}>🌍 SOURCING ALERTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sourcingAlerts.bidsDue.length > 0 && <button onClick={() => setActiveTab("sourcing")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FEF2F2", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#EF4444", fontWeight: 700 }}>⚠️ {sourcingAlerts.bidsDue.length} bid{sourcingAlerts.bidsDue.length !== 1 ? "s" : ""} due within 24h</span><span style={{ color: "#EF4444", fontSize: 13 }}>→</span></button>}
            {sourcingAlerts.paymentDue > 0 && <button onClick={() => setActiveTab("sourcing")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#DBEAFE", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#3B82F6", fontWeight: 700 }}>💳 {sourcingAlerts.paymentDue} payment{sourcingAlerts.paymentDue !== 1 ? "s" : ""} pending</span><span style={{ color: "#3B82F6", fontSize: 13 }}>→</span></button>}
            {sourcingAlerts.inTransit > 0 && <button onClick={() => setActiveTab("sourcing")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#EDE9FE", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#8B5CF6", fontWeight: 700 }}>🚚 {sourcingAlerts.inTransit} shipment{sourcingAlerts.inTransit !== 1 ? "s" : ""} in transit</span><span style={{ color: "#8B5CF6", fontSize: 13 }}>→</span></button>}
            {sourcingAlerts.arrived > 0 && <button onClick={() => setActiveTab("sourcing")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#CFFAFE", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#06B6D4", fontWeight: 700 }}>📦 {sourcingAlerts.arrived} lot{sourcingAlerts.arrived !== 1 ? "s" : ""} arrived — add to stock</span><span style={{ color: "#06B6D4", fontSize: 13 }}>→</span></button>}
          </div>
        </div>
      )}

      {/* Today's focus */}
      {topFocus.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, letterSpacing: 0.5 }}>🎯 TODAY'S FOCUS</div>
          {topFocus.map((t, i) => {
            const c = t.customer; const d = t.deal;
            const device = [d?.brand, d?.model].filter(Boolean).join(" ") || "Open deal";
            const stage = STAGES.find(s => s.id === d?.stage)?.label || "";
            return (
              <div key={i} onClick={() => { setActiveCustomerId(c.id); setActiveDealId(d?.id); setView("detail"); setPendingSuggestion(null); }}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", marginBottom: i < topFocus.length - 1 ? 6 : 0, background: "#F8FAFC", borderRadius: 12, cursor: "pointer", border: "1px solid #F1F5F9" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>{device} · {stage}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: t.days >= 3 ? "#EF4444" : "#F59E0B" }}>{t.days}d silent</div>
                  <span style={{ fontSize: 12, color: "#6366F1" }}>→</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, letterSpacing: 0.5 }}>🕐 RECENT ACTIVITY</div>
          {recentActivity.map((a, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: i < recentActivity.length - 1 ? 8 : 0, marginBottom: i < recentActivity.length - 1 ? 8 : 0, borderBottom: i < recentActivity.length - 1 ? "1px solid #F8FAFC" : "none" }}>
              <span style={{ fontSize: 13, color: "#475569" }}>{a.icon} {a.text}</span>
              <span style={{ fontSize: 11, color: "#CBD5E1", flexShrink: 0, marginLeft: 8 }}>{timeAgo(a.date)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => { setActiveTab("customers"); setView("add"); }}
          style={{ flex: 1, padding: 12, borderRadius: 14, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ New Client</button>
        <button onClick={() => { setActiveTab("stock"); setShowAddStock(true); setEditingStock(null); setStockForm(EMPTY_STOCK); }}
          style={{ flex: 1, padding: 12, borderRadius: 14, border: "none", background: "#10B981", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Add Stock</button>
        <button onClick={() => { setActiveTab("customers"); setSearch(""); }}
          style={{ flex: 1, padding: 12, borderRadius: 14, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🔍 Search</button>
      </div>
    </div>
  );
}
