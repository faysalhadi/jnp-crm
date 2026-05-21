import React from "react";
import { useUI } from "../../context/UIContext";
import { useCustomers } from "../../context/CustomerContext";

export default function DesktopSidebar({ NAV_TABS }) {
  const { activeTab, setActiveTab } = useUI();
  const { setView, setActiveCustomerId, setActiveDealId } = useCustomers();

  return (
    <div style={{ width: 280, flexShrink: 0, background: "#fff", borderRight: "1px solid #F1F5F9", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 40 }}>
      <div style={{ padding: "22px 20px 18px", borderBottom: "1px solid #F1F5F9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>💻</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>JNP CRM</div>
            <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, letterSpacing: 0.5 }}>LAPTOP FOR LESS</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {NAV_TABS.map(t => (
          <button key={t.key}
            onClick={() => { setActiveTab(t.key); setView("list"); setActiveCustomerId(null); setActiveDealId(null); }}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left", width: "100%", fontSize: 14,
                     fontWeight: activeTab === t.key ? 700 : 500, background: activeTab === t.key ? "#EEF2FF" : "transparent",
                     color: activeTab === t.key ? "#6366F1" : "#64748B", transition: "all 0.15s" }}>
            <span style={{ fontSize: 19 }}>{t.icon}</span>
            <span style={{ flex: 1 }}>{t.label}</span>
            {activeTab === t.key && <div style={{ width: 4, height: 20, borderRadius: 2, background: "#6366F1" }} />}
          </button>
        ))}
      </div>
      <div style={{ padding: "16px 20px", borderTop: "1px solid #F1F5F9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#6366F1" }}>F</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Faisal</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>Owner</div>
          </div>
          <button onClick={() => setView("settings")} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 15 }}>⚙️</button>
        </div>
      </div>
    </div>
  );
}
