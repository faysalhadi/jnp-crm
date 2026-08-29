import React from "react";
import { useUI } from "../../context/UIContext";
import { useStock } from "../../context/StockContext";
import { useProfile } from "../../context/ProfileContext";
import { useCustomers } from "../../context/CustomerContext";
import { ALL_NAV_TABS } from "../../constants/access";
import { effectiveStatus } from "../../utils/holds";

export default function BottomNav({ sourcingAlerts }) {
  const { isMobile, activeTab, setActiveTab } = useUI();
  const { stock } = useStock();
  const { access } = useProfile();
  const { setView, setActiveCustomerId, setActiveDealId } = useCustomers();
  if (!isMobile) return null;

  const visibleTabs = ALL_NAV_TABS
    .filter(t => access.canTab(t.key))
    .map(t => t.key === "stock"
      ? { ...t, badge: stock.filter(s => effectiveStatus(s) === "available").length || 0 }
      : t);

  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "1px solid #F1F5F9", display: "flex", zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}>
      {visibleTabs.map(t => (
        <button key={t.key} onClick={() => { setActiveTab(t.key); setView("list"); setActiveCustomerId(null); setActiveDealId(null); }}
          style={{ flex: 1, padding: "8px 2px 12px", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative" }}>
          {t.badge > 0 && (
            <div style={{ position: "absolute", top: 6, right: "25%", width: 16, height: 16, borderRadius: "50%", background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.badge}</div>
          )}
          <span style={{ fontSize: 18 }}>{t.icon}</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: activeTab === t.key ? "#6366F1" : "#94A3B8" }}>{t.short || t.label}</span>
          {activeTab === t.key && <div style={{ position: "absolute", bottom: 0, width: 28, height: 3, background: "#6366F1", borderRadius: "3px 3px 0 0" }} />}
        </button>
      ))}
    </div>
  );
}
