import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { STAGES, EMPTY_STOCK } from "../../constants";
import PullToRefresh from "../ui/PullToRefresh";
import { daysSince, timeAgo, getGreeting } from "../../utils/helpers";
import { useUI } from "../../context/UIContext";
import { useCustomers } from "../../context/CustomerContext";
import { useStock } from "../../context/StockContext";
import { useSales } from "../../context/SalesContext";
import { useParts } from "../../context/PartsContext";
import MorningBrief from "./MorningBrief";

export default function HomeTab({ tasks, sourcingAlerts }) {
  const { activeTab, setActiveTab, isMobile } = useUI();
  const {
    customers,
    setView, setActiveCustomerId, setActiveDealId, setPendingSuggestion,
    setFilter, setSearch,
    openDeals, closedDeals, revenue,
  } = useCustomers();

  const [todayFollowUps, setTodayFollowUps] = useState([]);
  const [tomorrowFollowUps, setTomorrowFollowUps] = useState([]);
  const [showTomorrow, setShowTomorrow] = useState(false);
  const [waitingMatchCount, setWaitingMatchCount] = useState(0);
  const [waitingMatchDetails, setWaitingMatchDetails] = useState([]);
  const [showWaitingMatches, setShowWaitingMatches] = useState(false);
  const [lostDealMatches, setLostDealMatches] = useState([]);

  useEffect(() => {
    loadFollowUps();
  }, []);

  useEffect(() => {
    loadWaitingMatches();
  }, []); // eslint-disable-line

  useEffect(() => {
    loadLostDealMatches();
  }, []); // eslint-disable-line

  const loadLostDealMatches = async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);
    const { data: lostDeals } = await supabase
      .from("deals")
      .select("*, customers(id, name, number, contact_type)")
      .eq("stage", "lost")
      .gte("updated_at", cutoff.toISOString())
      .not("brand", "is", null);
    if (!lostDeals?.length) return;
    const { data: availableStockData } = await supabase
      .from("stock")
      .select("brand,model,processor,ram,ssd,max_price")
      .eq("status", "available");
    if (!availableStockData?.length) return;
    const matches = [];
    for (const deal of lostDeals) {
      if (!deal.brand) continue;
      const matchingStock = availableStockData.filter(s => {
        const brandMatch = s.brand?.toLowerCase() === deal.brand?.toLowerCase();
        if (!brandMatch) return false;
        if (deal.budget && s.max_price && Number(s.max_price) > Number(deal.budget) * 1.15) return false;
        return true;
      });
      if (matchingStock.length > 0) {
        matches.push({
          deal,
          customer: deal.customers,
          stock: matchingStock[0],
          daysAgo: Math.floor((Date.now() - new Date(deal.updated_at)) / 86400000),
        });
      }
    }
    // Deduplicate by customer
    const seen = new Set();
    const deduped = matches.filter(m => {
      if (!m.customer?.id || seen.has(m.customer.id)) return false;
      seen.add(m.customer.id);
      return true;
    }).slice(0, 5);
    setLostDealMatches(deduped);
  };

  const loadWaitingMatches = async () => {
    const { data: availableStock } = await supabase
      .from("stock")
      .select("id,brand,model,processor,ram,ssd,condition,max_price,status")
      .eq("status", "available");
    const { data: waitingDeals } = await supabase
      .from("deals")
      .select("id,brand,model,budget,customer_id,customers(id,name,number)")
      .eq("stage", "waiting");
    if (!availableStock?.length || !waitingDeals?.length) return;
    const { matchStockToClients } = await import("../../constants");
    const details = [];
    for (const item of availableStock) {
      const matched = matchStockToClients(item, waitingDeals);
      if (matched.length > 0) {
        details.push({ stock: item, clients: matched });
      }
    }
    setWaitingMatchCount(details.length);
    setWaitingMatchDetails(details);
  };

  const loadFollowUps = async () => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const endOfTomorrow = new Date();
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
    endOfTomorrow.setHours(23, 59, 59, 999);

    const { data } = await supabase
      .from("follow_ups")
      .select("*, customers(id, name, number)")
      .eq("status", "pending")
      .lte("due_at", endOfTomorrow.toISOString())
      .order("due_at", { ascending: true });

    const all = data || [];
    setTodayFollowUps(all.filter(fu => new Date(fu.due_at) <= endOfToday));
    setTomorrowFollowUps(all.filter(fu => new Date(fu.due_at) > endOfToday));
  };

  const markFollowUpDone = async (id) => {
    await supabase.from("follow_ups").update({ status: "done" }).eq("id", id);
    loadFollowUps();
  };
  const { stock, setStockFilter, setStockSearch, setShowAddStock, setEditingStock, setStockForm, setShowQuickSale } = useStock();
  const { todaySales, openComplaints } = useSales();
  const { partsRevMTD } = useParts();
  const followUpsDue = tasks.filter(t => t.days >= 1).length;
  const overdueFollowUps = tasks.filter(t => t.days >= 1).length;
  const slowStock = stock.filter(s => s.status === "available" && daysSince(s.created_at) >= 7);
  const slowStockCount = slowStock.length;
  const pendingPaymentClients = customers.filter(c =>
    (c.deals || []).some(d => d.stage === "closed" && d.payment_status === "pending")
  );
  const pendingPayments = pendingPaymentClients.length;
  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
  const reservedItems = stock.filter(s => s.status === "reserved");
  const pickupsToday  = reservedItems.filter(s => s.pickup_date && new Date(s.pickup_date).toDateString() === new Date().toDateString());
  const overduePickups = reservedItems.filter(s => s.pickup_date && new Date(s.pickup_date) < todayMidnight);

  // Navigate to first slow stock item
  const goToSlowStock = () => {
    setStockFilter("available");
    setStockSearch("slow");
    setActiveTab("stock");
  };

  // Navigate to first pending payment client
  const goToPendingPayment = () => {
    if (pendingPaymentClients.length > 0) {
      const c = pendingPaymentClients[0];
      const deal = (c.deals || []).find(d => d.stage === "closed" && d.payment_status === "pending");
      setActiveCustomerId(c.id);
      setActiveDealId(deal?.id || null);
      setView("detail");
      setPendingSuggestion(null);
      setActiveTab("customers");
    }
  };
  const topFocus = [
    ...tasks.filter(t => t.days >= 3).map(t => ({ ...t, priority: 3 })),
    ...tasks.filter(t => t.days >= 1 && t.days < 3).map(t => ({ ...t, priority: 2 })),
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
    <PullToRefresh onRefresh={async () => { await loadFollowUps(); }}>
    <div style={{ padding: isMobile ? "16px 12px 100px" : "24px 32px 40px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Greeting */}
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>{getGreeting()} 👋</div>
        <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      {/* Morning Brief */}
      <MorningBrief />

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
        {[
          { label: "Open Deals", value: openDeals, color: "#6366F1", bg: "#EEF2FF", icon: "📋" },
          { label: "Revenue MTD", value: (() => { const total = revenue + partsRevMTD; return `AED ${total >= 1000 ? (total/1000).toFixed(1)+"k" : total}`; })(), color: "#10B981", bg: "#ECFDF5", icon: "💰" },
          { label: "In Stock", value: stock.filter(s => s.status === "available").length, color: "#F59E0B", bg: "#FFFBEB", icon: "📦" },
          { label: "Incomplete", value: customers.filter(c => (!c.contact_type || c.contact_type === "client" || c.contact_type === "walkin") && !(c.deals || []).length && !c.notes).length, color: "#F97316", bg: "#FFF7ED", icon: "🟠", onClick: () => { setActiveTab("customers"); setFilter && setFilter("all"); } },
          { label: "Follow Ups", value: followUpsDue, color: "#EF4444", bg: "#FEF2F2", icon: "⏰", onClick: () => { setActiveTab("customers"); setFilter("overdue"); } },
        ].map(s => (
          <div key={s.label} onClick={s.onClick} style={{ background: s.bg, borderRadius: 16, padding: "14px 16px", cursor: s.onClick ? "pointer" : "default" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: s.color, fontWeight: 600, opacity: 0.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Follow-ups */}
      {(todayFollowUps.length > 0 || tomorrowFollowUps.length > 0) && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, letterSpacing: 0.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>📅 FOLLOW-UPS</span>
            {todayFollowUps.length > 0 && (
              <span style={{ padding: "1px 8px", borderRadius: 20, background: "#FEF2F2", color: "#EF4444", fontSize: 11, fontWeight: 700 }}>
                {todayFollowUps.filter(fu => new Date(fu.due_at) < new Date()).length > 0
                  ? `${todayFollowUps.filter(fu => new Date(fu.due_at) < new Date()).length} overdue`
                  : `${todayFollowUps.length} today`}
              </span>
            )}
          </div>

          {/* Overdue */}
          {todayFollowUps.filter(fu => new Date(fu.due_at) < new Date()).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", letterSpacing: 0.5, marginBottom: 6 }}>⚠️ OVERDUE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {todayFollowUps.filter(fu => new Date(fu.due_at) < new Date()).map(fu => {
                  const d = new Date(fu.due_at);
                  const customer = fu.customers;
                  return (
                    <div key={fu.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 12, background: "#FEF2F2", border: "1px solid #FEE2E2" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", minWidth: 42, paddingTop: 2 }}>
                        {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{customer?.name || "Unknown"}</div>
                        {fu.note && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{fu.note}</div>}
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button onClick={() => { setActiveCustomerId(customer?.id); setView("detail"); setPendingSuggestion(null); setActiveTab("customers"); }}
                            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #C7D2FE", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            Open chat
                          </button>
                          <button onClick={() => markFollowUpDone(fu.id)}
                            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #BBF7D0", background: "#ECFDF5", color: "#10B981", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            ✓ Done
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Due today (not overdue) */}
          {todayFollowUps.filter(fu => new Date(fu.due_at) >= new Date()).length > 0 && (
            <div style={{ marginBottom: tomorrowFollowUps.length > 0 ? 8 : 0 }}>
              {todayFollowUps.filter(fu => new Date(fu.due_at) < new Date()).length > 0 && (
                <div style={{ fontSize: 10, fontWeight: 700, color: "#D97706", letterSpacing: 0.5, marginBottom: 6 }}>🕐 TODAY</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {todayFollowUps.filter(fu => new Date(fu.due_at) >= new Date()).map(fu => {
                  const d = new Date(fu.due_at);
                  const customer = fu.customers;
                  return (
                    <div key={fu.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 12, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", minWidth: 42, paddingTop: 2 }}>
                        {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{customer?.name || "Unknown"}</div>
                        {fu.note && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{fu.note}</div>}
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <button onClick={() => { setActiveCustomerId(customer?.id); setView("detail"); setPendingSuggestion(null); setActiveTab("customers"); }}
                            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #C7D2FE", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            Open chat
                          </button>
                          <button onClick={() => markFollowUpDone(fu.id)}
                            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #BBF7D0", background: "#ECFDF5", color: "#10B981", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            ✓ Done
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tomorrow - collapsible */}
          {tomorrowFollowUps.length > 0 && (
            <div>
              <button onClick={() => setShowTomorrow(v => !v)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 10, border: "1px solid #F1F5F9", background: "#F8FAFC", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, color: "#64748B" }}>
                <span>📅 Tomorrow ({tomorrowFollowUps.length})</span>
                <span>{showTomorrow ? "▲" : "▼"}</span>
              </button>
              {showTomorrow && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {tomorrowFollowUps.map(fu => {
                    const d = new Date(fu.due_at);
                    const customer = fu.customers;
                    return (
                      <div key={fu.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 12, background: "#F8FAFC", border: "1px solid #F1F5F9" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", minWidth: 42, paddingTop: 2 }}>
                          {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{customer?.name || "Unknown"}</div>
                          {fu.note && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{fu.note}</div>}
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <button onClick={() => { setActiveCustomerId(customer?.id); setView("detail"); setPendingSuggestion(null); setActiveTab("customers"); }}
                              style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #C7D2FE", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              Open chat
                            </button>
                            <button onClick={() => markFollowUpDone(fu.id)}
                              style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #BBF7D0", background: "#ECFDF5", color: "#10B981", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              ✓ Done
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
      {(overduePickups.length > 0 || pickupsToday.length > 0 || slowStockCount > 0 || pendingPayments > 0 || waitingMatchCount > 0) && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, letterSpacing: 0.5 }}>⚡ ALERTS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pickupsToday.length > 0 && <button onClick={() => { setStockFilter("reserved"); setActiveTab("stock"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FFFBEB", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#D97706", fontWeight: 700 }}>🔒 {pickupsToday.length} reservation{pickupsToday.length !== 1 ? "s" : ""} — pickup today</span><span style={{ color: "#D97706", fontSize: 13 }}>→</span></button>}
            {overduePickups.length > 0 && <button onClick={() => { setStockFilter("reserved"); setActiveTab("stock"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FEF2F2", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#EF4444", fontWeight: 700 }}>⚠️ {overduePickups.length} reservation{overduePickups.length !== 1 ? "s" : ""} overdue — client didn't show</span><span style={{ color: "#EF4444", fontSize: 13 }}>→</span></button>}
            {waitingMatchCount > 0 && (
              <div>
                <button onClick={() => setShowWaitingMatches(v => !v)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: showWaitingMatches ? "10px 10px 0 0" : 10, border: "none", background: "#EEEDFE", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontSize: 13, color: "#534AB7", fontWeight: 700 }}>👥 {waitingMatchCount} stock item{waitingMatchCount !== 1 ? "s" : ""} match waiting clients</span>
                  <span style={{ color: "#534AB7", fontSize: 13 }}>{showWaitingMatches ? "▲" : "▼"}</span>
                </button>
                {showWaitingMatches && (
                  <div style={{ background: "#F5F4FF", borderRadius: "0 0 10px 10px", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {waitingMatchDetails.map((match, i) => (
                      <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid #E0DFFE" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>{[match.stock.brand, match.stock.model].filter(Boolean).join(" ")}</div>
                            <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{[match.stock.processor, match.stock.ram, match.stock.ssd, match.stock.condition].filter(Boolean).join(" · ")}</div>
                          </div>
                          {match.stock.max_price && <div style={{ fontSize: 13, fontWeight: 800, color: "#6366F1" }}>AED {Number(match.stock.max_price).toLocaleString()}</div>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {match.clients.map((deal, di) => {
                            const customer = deal.customers;
                            const waUrl = customer?.number ? `https://wa.me/${customer.number.replace(/\D/g, "")}?text=${encodeURIComponent(`${customer?.name} bhai, ${[match.stock.brand, match.stock.model].filter(Boolean).join(" ")} available hai — AED ${match.stock.max_price}. Interest hai?`)}` : null;
                            return (
                              <div key={di} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "#F8F7FF", borderRadius: 8 }}>
                                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#6366F1", flexShrink: 0 }}>{(customer?.name || "?")[0].toUpperCase()}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{customer?.name}</div>
                                  <div style={{ fontSize: 10, color: "#94A3B8" }}>{deal.matchScore?.emoji} {deal.matchScore?.label}{deal.budget ? ` · Budget AED ${Number(deal.budget).toLocaleString()}` : ""}</div>
                                </div>
                                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                                  <button onClick={() => { setActiveCustomerId(customer?.id); setView("detail"); setPendingSuggestion(null); setActiveTab("customers"); }} style={{ padding: "4px 8px", borderRadius: 6, border: "none", background: "#EEF2FF", color: "#6366F1", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Open</button>
                                  {waUrl && <a href={waUrl} target="_blank" rel="noreferrer" style={{ padding: "4px 8px", borderRadius: 6, background: "#25D366", color: "#fff", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>WA</a>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {slowStockCount > 0 && (
              <button onClick={goToSlowStock}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FEF9C3", cursor: "pointer", textAlign: "left" }}>
                <div>
                  <span style={{ fontSize: 13, color: "#CA8A04", fontWeight: 700 }}>⚠️ {slowStockCount} device{slowStockCount !== 1 ? "s" : ""} unsold 7+ days</span>
                  <div style={{ fontSize: 10, color: "#A16207", marginTop: 1 }}>{slowStock.slice(0, 2).map(s => [s.brand, s.model].filter(Boolean).join(" ")).join(", ")}{slowStockCount > 2 ? ` +${slowStockCount - 2} more` : ""}</div>
                </div>
                <span style={{ color: "#CA8A04", fontSize: 13 }}>→</span>
              </button>
            )}
            {pendingPayments > 0 && (
              <button onClick={goToPendingPayment}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#ECFDF5", cursor: "pointer", textAlign: "left" }}>
                <div>
                  <span style={{ fontSize: 13, color: "#10B981", fontWeight: 700 }}>💰 {pendingPayments} payment{pendingPayments !== 1 ? "s" : ""} pending</span>
                  <div style={{ fontSize: 10, color: "#059669", marginTop: 1 }}>{pendingPaymentClients.slice(0, 2).map(c => c.name).join(", ")}{pendingPayments > 2 ? ` +${pendingPayments - 2} more` : ""}</div>
                </div>
                <span style={{ color: "#10B981", fontSize: 13 }}>→</span>
              </button>
            )}
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

      {/* Re-engage Opportunities */}
      {lostDealMatches.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6366F1", marginBottom: 10, letterSpacing: 0.5 }}>⚡ RE-ENGAGE OPPORTUNITIES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lostDealMatches.map((m, i) => (
              <div key={i}
                onClick={() => { setActiveCustomerId(m.customer?.id); setView("detail"); setPendingSuggestion(null); setActiveTab("customers"); }}
                style={{
                  background: "#F8F7FF", border: "1px solid #C7D2FE", borderLeft: "3px solid #6366F1",
                  borderRadius: 12, padding: "11px 14px", cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10,
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{m.customer?.name}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                    Wanted {[m.deal.brand, m.deal.model].filter(Boolean).join(" ")} · {m.daysAgo}d ago
                  </div>
                  <div style={{ fontSize: 11, color: "#6366F1", marginTop: 2, fontWeight: 600 }}>
                    📦 You have: {m.stock.brand} {m.stock.model}{m.stock.max_price ? ` · AED ${Number(m.stock.max_price).toLocaleString()}` : ""}
                  </div>
                </div>
                <div style={{ background: "#EEF2FF", color: "#6366F1", fontSize: 10, padding: "4px 8px", borderRadius: 6, fontWeight: 700, flexShrink: 0 }}>
                  Re-engage →
                </div>
              </div>
            ))}
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

            {/* Quick actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => { setActiveTab("stock"); setShowAddStock(true); setEditingStock(null); setStockForm(EMPTY_STOCK); }}
          style={{ flex: 1, padding: 12, borderRadius: 14, border: "none", background: "#10B981", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Add Stock</button>
      </div>
    </div>
    </PullToRefresh>
  );
}
