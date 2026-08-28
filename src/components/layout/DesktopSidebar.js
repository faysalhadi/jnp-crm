import React from "react";
import { useUI } from "../../context/UIContext";
import { useCustomers } from "../../context/CustomerContext";
import { useProfile } from "../../context/ProfileContext";
import { ALL_NAV_TABS } from "../../constants/access";

export default function DesktopSidebar() {
  const { activeTab, setActiveTab, setShowSearch, setShowSideDrawer } = useUI();
  const { setView, setActiveCustomerId, setActiveDealId } = useCustomers();
  const { currentProfile, access } = useProfile();
  const visibleTabs = ALL_NAV_TABS.filter(t => access.canTab(t.key));
  const drawerItems = [
    { id: "marketing",     icon: "📣", label: "Marketing" },
    { id: "parts",         icon: "🔧", label: "Parts DB" },
    { id: "sales_history", icon: "💰", label: "Sales History" },
  ].filter(item => access.canDrawer(item.id));

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
        {visibleTabs.map(t => (
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

        {/* Extra nav items only accessible via drawer on mobile */}
        {drawerItems.length > 0 && (
          <div style={{ borderTop: "1px solid #F1F5F9", marginTop: 8, paddingTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {drawerItems.map(item => (
              <button key={item.id}
                onClick={() => setShowSideDrawer(true)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left", width: "100%", fontSize: 14, fontWeight: 500, background: "transparent", color: "#64748B", transition: "all 0.15s" }}>
                <span style={{ fontSize: 19 }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ padding: "16px 20px", borderTop: "1px solid #F1F5F9" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#6366F1" }}>
            {(currentProfile?.name || "?")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{currentProfile?.name || "User"}</div>
            <div style={{ fontSize: 10, color: "#94A3B8", textTransform: "capitalize" }}>{currentProfile?.role || "owner"}</div>
          </div>
          <button onClick={() => setShowSearch(true)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 15 }}>🔍</button>
          <button onClick={() => setShowSideDrawer(true)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 15 }} title="Menu">☰</button>
          <button onClick={() => setView("settings")} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 15 }}>⚙️</button>
        </div>
      </div>
    </div>
  );
}
