import React, { useState, useEffect } from "react";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";

// Loose matching logic
function deviceMatches(stock, deal) {
  if (!deal.brand && !deal.model) return false;
  const sb = (stock.brand || "").toLowerCase();
  const sm = (stock.model || "").toLowerCase();
  const sp = (stock.processor || "").toLowerCase();
  const db = (deal.brand || "").toLowerCase();
  const dm = (deal.model || "").toLowerCase();

  // Brand must match if specified
  if (db && !sb.includes(db) && !db.includes(sb)) return false;

  // Model matching — loose: "MacBook Air M2" matches "MacBook Air M2"
  // Also matches if no model specified (brand match only)
  if (dm) {
    const dmWords = dm.split(" ").filter(w => w.length > 2);
    const matches = dmWords.filter(w => sm.includes(w) || sp.includes(w));
    if (matches.length < Math.ceil(dmWords.length * 0.5)) return false;
  }

  // Budget check — client budget must be >= stock min_price (if set), with 15% tolerance
  if (deal.budget && stock.min_price) {
    const tolerance = 1.15;
    if (Number(deal.budget) * tolerance < Number(stock.min_price)) return false;
  }

  return true;
}

export default function StockMatchAlert({ stockItem, onClose }) {
  const { customers, setActiveCustomerId, setActiveDealId, setView, setPendingSuggestion } = useCustomers();
  const { setActiveTab } = useUI();
  const [matches, setMatches] = useState({ exact: [], loose: [] });

  useEffect(() => {
    if (!stockItem) return;
    const exact = [];
    const loose = [];

    customers
      .filter(c => !c.contact_type || c.contact_type === "client" || c.contact_type === "walkin")
      .forEach(c => {
        (c.deals || [])
          .filter(d => d.stage !== "closed" && d.stage !== "lost" && d.stage !== "waiting")
          .forEach(d => {
            if (!d.brand && !d.model) return;
            const sb = (stockItem.brand || "").toLowerCase();
            const sm = (stockItem.model || "").toLowerCase();
            const db = (d.brand || "").toLowerCase();
            const dm = (d.model || "").toLowerCase();

            // Exact: brand + model both match
            const brandMatch = !db || sb.includes(db) || db.includes(sb);
            const modelMatch = !dm || sm.includes(dm) || dm.includes(sm);

            if (brandMatch && modelMatch && (db || dm)) {
              exact.push({ customer: c, deal: d });
            } else if (deviceMatches(stockItem, d)) {
              loose.push({ customer: c, deal: d });
            }
          });
      });

    setMatches({ exact, loose });
  }, [stockItem, customers]);  // eslint-disable-line

  const total = matches.exact.length + matches.loose.length;
  if (total === 0) return null;

  function openClient(customer, deal) {
    setActiveCustomerId(customer.id);
    setActiveDealId(deal.id);
    setView("detail");
    setPendingSuggestion(null);
    setActiveTab("customers");
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "flex-end" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "75vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Handle */}
        <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "12px auto 4px" }} />

        {/* Header */}
        <div style={{ padding: "8px 16px 12px", borderBottom: "1px solid #F1F5F9" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
            🎯 {total} Client{total !== 1 ? "s" : ""} Want This
          </div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
            {stockItem.brand} {stockItem.model} added to stock
          </div>
        </div>

        {/* Match list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 24px", display: "flex", flexDirection: "column", gap: 6 }}>

          {matches.exact.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#10B981", letterSpacing: 0.5, marginBottom: 2 }}>
                ✅ EXACT MATCH ({matches.exact.length})
              </div>
              {matches.exact.map(({ customer, deal }, i) => (
                <ClientMatchRow key={`e-${i}`} customer={customer} deal={deal} type="exact" onOpen={() => openClient(customer, deal)} />
              ))}
            </>
          )}

          {matches.loose.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#F59E0B", letterSpacing: 0.5, marginTop: matches.exact.length ? 8 : 2, marginBottom: 2 }}>
                🟡 POSSIBLE MATCH ({matches.loose.length})
              </div>
              {matches.loose.map(({ customer, deal }, i) => (
                <ClientMatchRow key={`l-${i}`} customer={customer} deal={deal} type="loose" onOpen={() => openClient(customer, deal)} />
              ))}
            </>
          )}
        </div>

        {/* Close */}
        <div style={{ padding: "10px 14px 28px" }}>
          <button onClick={onClose} style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#64748B", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientMatchRow({ customer, deal, type, onOpen }) {
  const device = [deal.brand, deal.model].filter(Boolean).join(" ") || "Open deal";
  const stageName = deal.stage?.replace(/_/g, " ") || "";
  const isExact = type === "exact";

  return (
    <div onClick={onOpen} style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px", borderRadius: 12, cursor: "pointer",
      background: isExact ? "#F0FDF4" : "#FFFBEB",
      border: `1px solid ${isExact ? "#BBF7D0" : "#FDE68A"}`,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
        background: isExact ? "#DCFCE7" : "#FEF3C7",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: 800, color: isExact ? "#10B981" : "#D97706",
        textTransform: "uppercase",
      }}>
        {(customer.name || "?")[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{customer.name}</div>
        <div style={{ fontSize: 11, color: "#64748B", marginTop: 1, display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span>{device}</span>
          {deal.budget && <span>· AED {Number(deal.budget).toLocaleString()}</span>}
          {stageName && <span>· {stageName}</span>}
        </div>
      </div>
      <span style={{ fontSize: 12, color: isExact ? "#10B981" : "#D97706", flexShrink: 0 }}>→</span>
    </div>
  );
}
