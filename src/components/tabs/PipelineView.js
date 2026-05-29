import React, { useState, useMemo } from "react";
import { useCustomers } from "../../context/CustomerContext";
import { STAGES } from "../../constants";

const STAGE_COLORS = {
  new_inquiry:   { dot: "#888780", bg: "#F1EFE8", text: "#5F5E5A" },
  waiting:       { dot: "#EF9F27", bg: "#FAEEDA", text: "#854F0B" },
  interested:    { dot: "#378ADD", bg: "#E6F1FB", text: "#185FA5" },
  negotiation:   { dot: "#378ADD", bg: "#E6F1FB", text: "#185FA5" },
  closed:        { dot: "#534AB7", bg: "#EEEDFE", text: "#3C3489" },
  lost:          { dot: "#94A3B8", bg: "#F1F5F9", text: "#64748B" },
  reserved:      { dot: "#1D9E75", bg: "#E1F5EE", text: "#0F6E56" },
};

function getStageColor(stageId) {
  return STAGE_COLORS[stageId] || { dot: "#94A3B8", bg: "#F1F5F9", text: "#64748B" };
}

function getStageLabel(stageId) {
  const s = STAGES.find(s => s.id === stageId);
  return s?.label || stageId || "Unknown";
}

function getDaysSinceDeal(deal) {
  if (!deal) return 0;
  const date = deal.updated_at || deal.created_at;
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

export default function PipelineView() {
  const { customers, setActiveCustomerId, setActiveDealId, setView, setPendingSuggestion } = useCustomers();
  const [stageFilter, setStageFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [showSort, setShowSort] = useState(false);

  // Build flat list of all deals with customer info
  const allDeals = useMemo(() => {
    const deals = [];
    for (const customer of customers) {
      if (customer.contact_type !== "client" && customer.contact_type !== "walkin" && customer.contact_type !== null && customer.contact_type !== undefined) continue;
      for (const deal of (customer.deals || [])) {
        deals.push({ deal, customer });
      }
    }
    return deals;
  }, [customers]);

  // Count per stage
  const stageCounts = useMemo(() => {
    const counts = { all: allDeals.length };
    for (const { deal } of allDeals) {
      counts[deal.stage] = (counts[deal.stage] || 0) + 1;
    }
    return counts;
  }, [allDeals]);

  // Filter by stage
  const filtered = useMemo(() => {
    let list = stageFilter === "all"
      ? allDeals
      : allDeals.filter(({ deal }) => deal.stage === stageFilter);

    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === "recent") {
        const aTime = a.deal.updated_at || a.deal.created_at || "";
        const bTime = b.deal.updated_at || b.deal.created_at || "";
        return new Date(bTime) - new Date(aTime);
      }
      if (sortBy === "budget_high") {
        return (b.deal.budget || b.deal.value || 0) - (a.deal.budget || a.deal.value || 0);
      }
      if (sortBy === "oldest") {
        const aTime = a.deal.updated_at || a.deal.created_at || "";
        const bTime = b.deal.updated_at || b.deal.created_at || "";
        return new Date(aTime) - new Date(bTime);
      }
      return 0;
    });

    return list;
  }, [allDeals, stageFilter, sortBy]);

  // Pipeline value (open deals only)
  const pipelineValue = useMemo(() => {
    return allDeals
      .filter(({ deal }) => deal.stage !== "closed" && deal.stage !== "lost")
      .reduce((sum, { deal }) => sum + (Number(deal.budget) || Number(deal.value) || 0), 0);
  }, [allDeals]);

  const openCount = allDeals.filter(({ deal }) => deal.stage !== "closed" && deal.stage !== "lost").length;

  // Stage pills to show
  const stagePills = [
    { id: "all", label: "All" },
    ...STAGES.map(s => ({ id: s.id, label: s.label })),
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Filter pills + sort */}
      <div style={{ background: "#fff", borderBottom: "1px solid #F1F5F9", padding: "8px 14px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none" }}>
            {stagePills.map(pill => {
              const count = stageCounts[pill.id] || 0;
              if (pill.id !== "all" && !count) return null;
              return (
                <button
                  key={pill.id}
                  onClick={() => setStageFilter(pill.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "5px 10px", borderRadius: 20, border: "none",
                    background: stageFilter === pill.id ? "#534AB7" : "#F1F5F9",
                    color: stageFilter === pill.id ? "#fff" : "#64748B",
                    fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                  }}>
                  {pill.label}
                  <span style={{
                    fontSize: 10, padding: "1px 5px", borderRadius: 20,
                    background: stageFilter === pill.id ? "rgba(255,255,255,0.25)" : "#fff",
                    color: stageFilter === pill.id ? "#fff" : "#94A3B8",
                  }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Sort button */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => setShowSort(v => !v)}
              style={{ padding: "5px 10px", borderRadius: 20, border: "1px solid #E2E8F0", background: "#fff", fontSize: 11, fontWeight: 600, color: "#64748B", cursor: "pointer" }}>
              ↕ {sortBy === "recent" ? "Recent" : sortBy === "budget_high" ? "Budget" : "Oldest"}
            </button>
            {showSort && (
              <div style={{ position: "absolute", right: 0, top: 32, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 50, overflow: "hidden", minWidth: 140 }}>
                {[
                  { id: "recent", label: "Most recent" },
                  { id: "budget_high", label: "Highest budget" },
                  { id: "oldest", label: "Oldest first" },
                ].map(opt => (
                  <button key={opt.id} onClick={() => { setSortBy(opt.id); setShowSort(false); }}
                    style={{ width: "100%", padding: "10px 14px", border: "none", borderBottom: "1px solid #F1F5F9", background: sortBy === opt.id ? "#F8F7FF" : "#fff", color: sortBy === opt.id ? "#534AB7" : "#334155", fontSize: 12, fontWeight: sortBy === opt.id ? 700 : 400, cursor: "pointer", textAlign: "left" }}>
                    {sortBy === opt.id ? "✓ " : ""}{opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 14px 4px" }}>
        <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>Open deals</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#0F172A" }}>{openCount}</div>
        </div>
        <div style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 3 }}>Pipeline value</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#534AB7" }}>
            AED {pipelineValue >= 1000 ? (pipelineValue / 1000).toFixed(1) + "k" : pipelineValue}
          </div>
        </div>
      </div>

      {/* Deal list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px 100px" }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8" }}>No deals in this stage</div>
          </div>
        )}
        {filtered.map(({ deal, customer }) => {
          const days = getDaysSinceDeal(deal);
          const isOverdue = days >= 3 && deal.stage !== "closed" && deal.stage !== "lost";
          const isVeryOverdue = days >= 7 && deal.stage !== "closed" && deal.stage !== "lost";
          const stageColor = getStageColor(deal.stage);
          const budget = Number(deal.budget) || Number(deal.value) || 0;
          const initials = (customer.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
          const deviceLabel = [deal.brand, deal.model].filter(Boolean).join(" ") || "Device TBD";

          return (
            <div
              key={deal.id}
              onClick={() => { setActiveCustomerId(customer.id); setActiveDealId(deal.id); setView("detail"); setPendingSuggestion(null); }}
              style={{
                background: "#fff",
                borderRadius: 14,
                border: `1px solid ${isVeryOverdue ? "#FEE2E2" : isOverdue ? "#FEF3C7" : "#F1F5F9"}`,
                padding: "11px 13px",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
              }}>
              {/* Avatar */}
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: stageColor.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: stageColor.text, flexShrink: 0 }}>
                {initials}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{customer.name}</div>
                <div style={{ fontSize: 11, color: "#64748B", marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: stageColor.dot, flexShrink: 0, display: "inline-block" }} />
                  {getStageLabel(deal.stage)} · {deviceLabel}
                </div>
              </div>

              {/* Right */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {budget > 0 && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: deal.stage === "closed" ? "#10B981" : "#534AB7" }}>
                    AED {Number(budget).toLocaleString()}
                  </div>
                )}
                <div style={{ fontSize: 10, marginTop: 2, color: isVeryOverdue ? "#EF4444" : isOverdue ? "#D97706" : "#94A3B8", fontWeight: isOverdue ? 700 : 400 }}>
                  {days === 0 ? "Today" : `${days}d ago`}{isVeryOverdue ? " ⚠️" : isOverdue ? " ⏰" : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
