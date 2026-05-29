import React, { useState } from "react";
import StageBar from "../ui/StageBar";
import Spinner from "../ui/Spinner";
import { TIERS } from "../../constants";
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
  if (mins < 1)   return "now";
  if (mins < 60)  return `${mins}m`;
  if (hrs  < 24)  return `${hrs}h`;
  if (days < 7)   return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function CustomersTab() {
  const [viewMode, setViewMode] = useState("contacts");
  const { isMobile, setShowSideDrawer } = useUI();
  const {
    customers,
    loading,
    setActiveCustomerId,
    setActiveDealId,
    setView,
    setPendingSuggestion,
    filter, setFilter,
    search, setSearch,
    contactTypeFilter, setContactTypeFilter,
    setShowContactModal,
    setContactModalPreType,
    openDeals,
    closedDeals,
    revenue,
    filtered,
  } = useCustomers();

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

      {/* ── Sticky header ── */}
      <div style={{ background: "#fff", padding: "16px 14px 0", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, letterSpacing: 1.5 }}>LAPTOP FOR LESS</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: -0.5 }}>Contacts</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setShowSideDrawer(true)}
              style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>
              📊
            </button>
            <button onClick={() => { setContactModalPreType(null); setShowContactModal(true); }}
              style={{ height: 36, padding: "0 16px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              + Add
            </button>
          </div>
        </div>

        {/* View toggle */}
        <div style={{ display: "flex", gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid #F1F5F9", marginBottom: 14 }}>
          {["contacts", "pipeline"].map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                background: viewMode === mode ? "#534AB7" : "#F8FAFC",
                color:      viewMode === mode ? "#fff"    : "#64748B" }}>
              {mode === "contacts" ? "Contacts" : "Pipeline"}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "contacts" ? (
        <>
          {/* ── Filters + search ── */}
          <div style={{ background: "#fff", padding: "14px 14px 0", borderBottom: "1px solid #F1F5F9" }}>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[
                { label: "Open Deals", value: openDeals,  color: "#6366F1", bg: "#EEF2FF" },
                { label: "Closed",     value: closedDeals, color: "#10B981", bg: "#ECFDF5" },
                { label: "This Month", value: `AED ${revenue >= 1000 ? (revenue/1000).toFixed(1)+"k" : revenue}`, color: "#F59E0B", bg: "#FFFBEB" },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: s.color, fontWeight: 700, opacity: 0.75, marginTop: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Search */}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍  Search name or number..."
              style={{ width: "100%", padding: "9px 13px", borderRadius: 12, border: "1.5px solid #F1F5F9", background: "#F8FAFC", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
            />

            {/* Contact type pills */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", marginBottom: 8 }}>
              {[
                { key: "all",      label: "All" },
                { key: "client",   label: "🔴 Clients" },
                { key: "trader",   label: "🟡 Traders" },
                { key: "supplier", label: "🔵 Suppliers" },
                { key: "walkin",   label: "⚡ Walk-in" },
              ].map(f => (
                <button key={f.key} onClick={() => setContactTypeFilter(f.key)}
                  style={{ padding: "5px 14px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: contactTypeFilter === f.key ? "#0F172A" : "#F1F5F9",
                    color:      contactTypeFilter === f.key ? "#fff"    : "#64748B" }}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Behaviour pills */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10 }}>
              {[
                { key: "all",     label: "All" },
                { key: "urgent",  label: "🔴 Urgent" },
                { key: "overdue", label: "⏰ Overdue" },
                { key: "vip",     label: "⭐ VIP" },
                { key: "cold",    label: "❄️ Cold" },
              ].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  style={{ padding: "5px 14px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: filter === f.key ? "#6366F1" : "#F1F5F9",
                    color:      filter === f.key ? "#fff"    : "#64748B" }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Contact list ── */}
          <div style={{ flex: 1, padding: isMobile ? "10px 12px 100px" : "16px 24px 40px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
            {loading && <Spinner />}
            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#CBD5E1" }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>💼</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>
                  {search || filter !== "all" ? "No contacts match" : "No contacts yet"}
                </div>
                <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>
                  {!search && filter === "all" && "Tap + Add to get started"}
                </div>
              </div>
            )}

            {filtered.map(c => {
              const cType      = c.contact_type || "client";
              const tier       = TIERS[c.tier] || TIERS.cold;
              const openD      = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost");
              const latestDeal = openD[0] || (c.deals || [])[0];
              const overdue    = daysSince(c.last_active) >= 1 && openD.length > 0;
              const totalValue = (c.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
              const activityTs = c.last_activity_at || c.last_active;

              // Preview: deal info → notes → number
              const dealPreview = latestDeal
                ? ([latestDeal.brand, latestDeal.model].filter(Boolean).join(" ") || "Open deal") +
                  (latestDeal.budget ? ` · AED ${Number(latestDeal.budget).toLocaleString()}` : "")
                : null;
              const preview = dealPreview || c.notes?.slice(0, 50) || c.number || "No details yet";

              const typeBadge = cType === "trader"   ? { label: "Trader",   color: "#D97706", bg: "#FFFBEB" }
                              : cType === "supplier"  ? { label: "Supplier", color: "#2563EB", bg: "#EFF6FF" }
                              : cType === "walkin"    ? { label: "Walk-in",  color: "#6366F1", bg: "#EEF2FF" }
                              : null;

              return (
                <div key={c.id}
                  onClick={() => {
                    setActiveCustomerId(c.id);
                    setActiveDealId(latestDeal?.id || null);
                    setView("detail");
                    setPendingSuggestion(null);
                  }}
                  style={{
                    background: "#fff", borderRadius: 18, padding: "12px 14px",
                    border: `1.5px solid ${c.urgent ? "#FECACA" : "#F1F5F9"}`,
                    cursor: "pointer",
                    boxShadow: c.urgent ? "0 2px 16px rgba(239,68,68,0.08)" : "0 1px 4px rgba(0,0,0,0.05)",
                    position: "relative", overflow: "hidden",
                  }}>

                  {/* Urgent stripe */}
                  {c.urgent && <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: "#EF4444" }} />}

                  {/* Row 1 — avatar + name + timestamp */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Avatar */}
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                      background: c.urgent ? "#FEF2F2" : cType === "trader" ? "#FFFBEB" : cType === "supplier" ? "#EFF6FF" : "#EEF2FF",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 17, fontWeight: 800, textTransform: "uppercase",
                      color: c.urgent ? "#EF4444" : cType === "trader" ? "#D97706" : cType === "supplier" ? "#2563EB" : "#6366F1",
                    }}>
                      {(c.name || "?")[0]}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Name + type badge + timestamp */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.name}
                          </span>
                          {typeBadge && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: typeBadge.color, background: typeBadge.bg, padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>
                              {typeBadge.label}
                            </span>
                          )}
                          {!typeBadge && cType === "client" && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: tier.color, background: tier.bg, padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>
                              {tier.icon} {tier.label}
                            </span>
                          )}
                          {c.urgent && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: "#EF4444", background: "#FEF2F2", padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>
                              URGENT
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: "#94A3B8", flexShrink: 0 }}>
                          {timeAgo(activityTs)}
                        </span>
                      </div>

                      {/* Preview line */}
                      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {preview}
                      </div>
                    </div>
                  </div>

                  {/* Stage bar — clients with open deal */}
                  {(cType === "client" || cType === "walkin") && latestDeal && (
                    <div style={{ marginTop: 8, marginLeft: 54 }}>
                      <StageBar stageId={latestDeal.stage} />
                    </div>
                  )}

                  {/* Bottom row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginLeft: 54 }}>
                    <span style={{ fontSize: 10, color: "#CBD5E1" }}>
                      {cType === "client" || cType === "walkin"
                        ? `${(c.deals || []).length} deal${(c.deals || []).length !== 1 ? "s" : ""}`
                        : c.location || c.number || ""}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {totalValue > 0 && (
                        <span style={{ fontSize: 10, color: "#10B981", fontWeight: 700 }}>
                          AED {totalValue.toLocaleString()}
                        </span>
                      )}
                      {overdue && (
                        <span style={{ fontSize: 9, color: "#EF4444", fontWeight: 700 }}>⚠️ Follow up</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <PipelineView />
      )}
    </div>
  );
}
