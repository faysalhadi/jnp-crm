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
}) {
  return (
    <div style={{ flex: 1, padding: isMobile ? "10px 12px 100px" : "16px 24px 40px", display: "flex", flexDirection: "column", gap: 8 }}>
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
  );
}
