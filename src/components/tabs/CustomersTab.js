import React from "react";
import Badge from "../ui/Badge";
import StageBar from "../ui/StageBar";
import Spinner from "../ui/Spinner";
import { TIERS } from "../../constants";
import { daysSince, waTsFormat } from "../../utils/helpers";

export default function CustomersTab({
  isMobile,
  loading,
  filtered,
  lastMsgMap,
  setActiveCustomerId,
  setActiveDealId,
  setView,
  setPendingSuggestion,
  openDeals,
  closedDeals,
  revenue,
  search, setSearch,
  filter, setFilter,
  contactTypeFilter, setContactTypeFilter,
  setShowContactModal,
  setContactModalPreType,
  setShowSideDrawer,
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

      {/* Sticky header with search and filters */}
      <div style={{ background: "#fff", padding: "16px 14px 0", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 10 }}>
        {/* Title row */}
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
            <button onClick={() => { setContactModalPreType("client"); setShowContactModal(true); }}
              style={{ height: 36, padding: "0 16px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              + Add
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            { label: "Open Deals", value: openDeals, color: "#6366F1", bg: "#EEF2FF" },
            { label: "Closed", value: closedDeals, color: "#10B981", bg: "#ECFDF5" },
            { label: "This Month", value: `AED ${revenue >= 1000 ? (revenue/1000).toFixed(1)+"k" : revenue}`, color: "#F59E0B", bg: "#FFFBEB" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: s.color, fontWeight: 700, opacity: 0.75, marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search bar */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍  Search name or number..."
          style={{ width: "100%", padding: "9px 13px", borderRadius: 12, border: "1.5px solid #F1F5F9", background: "#F8FAFC", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }}
        />

        {/* Contact type filter pills */}
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
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
                       color: contactTypeFilter === f.key ? "#fff" : "#64748B" }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Behaviour filter pills */}
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
                       color: filter === f.key ? "#fff" : "#64748B" }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer list */}
      <div style={{ flex: 1, padding: isMobile ? "10px 12px 100px" : "16px 24px 40px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
      {loading && <Spinner />}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#CBD5E1" }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>💼</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>{search || filter !== "all" ? "No customers match" : "No customers yet"}</div>
          <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>{!search && filter === "all" && "Tap + Add to get started"}</div>
        </div>
      )}
      {filtered.map(c => {
        const cType      = c.contact_type || "client";
        const tier       = TIERS[c.tier] || TIERS.cold;
        const openD      = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost");
        const latestDeal = openD[openD.length - 1] || (c.deals || [])[c.deals.length - 1];
        const overdue    = daysSince(c.last_active) >= 1 && openD.length > 0;
        const totalValue = (c.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
        const activityTs = c.last_activity_at || c.last_active;

        // Last message from batch-loaded map
        const lastMsg   = lastMsgMap[c.id];
        const msgText   = lastMsg ? (lastMsg.sent && lastMsg.sent !== "NOT_SENT" ? lastMsg.sent : lastMsg.content) : null;
        const isUnread  = lastMsg && lastMsg.role === "customer" && (!lastMsg.sent || lastMsg.sent === "NOT_SENT");

        // Preview: real last message → deal info fallback → notes fallback
        const preview = msgText
          ? msgText.slice(0, 40) + (msgText.length > 40 ? "…" : "")
          : latestDeal
            ? ([latestDeal.brand, latestDeal.model].filter(Boolean).join(" ") || "Device TBD") + (latestDeal.budget ? ` · AED ${Number(latestDeal.budget).toLocaleString()}` : "")
            : (c.notes?.slice(0, 40) || c.number || "No messages yet");

        const typeBadge = cType === "trader"   ? { label: "🟡 Trader",   color: "#D97706", bg: "#FFFBEB" }
                        : cType === "supplier"  ? { label: "🔵 Supplier", color: "#2563EB", bg: "#EFF6FF" }
                        : cType === "walkin"    ? { label: "⚡ Walk-in",  color: "#6366F1", bg: "#EEF2FF" }
                        : null;

        return (
          <div key={c.id} onClick={() => { setActiveCustomerId(c.id); setActiveDealId(latestDeal?.id); setView("detail"); setPendingSuggestion(null); }}
            style={{ background: "#fff", borderRadius: 18, padding: "12px 14px", border: `1.5px solid ${c.urgent ? "#FECACA" : "#F1F5F9"}`, cursor: "pointer", boxShadow: c.urgent ? "0 2px 16px rgba(239,68,68,0.08)" : "0 1px 4px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" }}>
            {c.urgent && <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: "#EF4444" }} />}

            {/* Row 1 — avatar + name + timestamp */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Avatar with green dot if unread */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: c.urgent ? "#FEF2F2" : cType === "trader" ? "#FFFBEB" : cType === "supplier" ? "#EFF6FF" : "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: c.urgent ? "#EF4444" : cType === "trader" ? "#D97706" : cType === "supplier" ? "#2563EB" : "#6366F1", textTransform: "uppercase" }}>
                  {c.name[0]}
                </div>
                {isUnread && (
                  <div style={{ position: "absolute", bottom: 1, right: 1, width: 11, height: 11, borderRadius: "50%", background: "#22C55E", border: "2px solid #fff" }} />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Name row + timestamp */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    {typeBadge && <span style={{ fontSize: 9, fontWeight: 700, color: typeBadge.color, background: typeBadge.bg, padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>{typeBadge.label}</span>}
                    {c.urgent && <Badge color="#EF4444" bg="#FEF2F2" small>URGENT</Badge>}
                  </div>
                  <span style={{ fontSize: 11, color: isUnread ? "#22C55E" : "#94A3B8", fontWeight: isUnread ? 700 : 400, flexShrink: 0 }}>
                    {waTsFormat(activityTs)}
                  </span>
                </div>

                {/* Preview line */}
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                  {lastMsg && lastMsg.role !== "customer" && (
                    <span style={{ fontSize: 10, color: "#94A3B8", flexShrink: 0 }}>You:</span>
                  )}
                  <span style={{ fontSize: 12, color: isUnread ? "#0F172A" : "#94A3B8", fontWeight: isUnread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {preview}
                  </span>
                  {isUnread && (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
                  )}
                </div>
              </div>
            </div>

            {/* Stage bar for clients */}
            {cType === "client" && latestDeal && (
              <div style={{ marginTop: 8, marginLeft: 54 }}>
                <StageBar stageId={latestDeal.stage} />
              </div>
            )}

            {/* Bottom row */}
            {(totalValue > 0 || overdue || (cType !== "client" && (c.location || c.number))) && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5, marginLeft: 54 }}>
                {cType === "client"
                  ? <span style={{ fontSize: 10, color: "#CBD5E1" }}>{(c.deals || []).length} deal{(c.deals || []).length !== 1 ? "s" : ""}</span>
                  : <span style={{ fontSize: 10, color: "#94A3B8" }}>{c.location || c.number || ""}</span>
                }
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {totalValue > 0 && <span style={{ fontSize: 10, color: "#10B981", fontWeight: 700 }}>AED {totalValue.toLocaleString()}</span>}
                  {overdue && <span style={{ fontSize: 9, color: "#EF4444", fontWeight: 700 }}>⚠️ Follow up</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
