import React from "react";
import { useUI } from "../../context/UIContext";
import { useCustomers } from "../../context/CustomerContext";

export default function TopBar() {
  const { activeTab, isMobile, setShowSideDrawer, setShowSearch } = useUI();
  const { setView } = useCustomers();

  // Customers tab has its own complete header — don't duplicate
  if (activeTab === "customers") return null;
  // Desktop: each tab manages its own header
  if (!isMobile) return null;

  const titles = {
    home:     "Home",
    stock:    "Stock",
    sourcing: "Sourcing",
    traders:  "Traders",
    ask:      "Ask Claude",
    sales:    "Sales",
    marketing:"Marketing",
  };

  return (
    <div style={{ background: "#fff", padding: "14px 14px 12px", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, letterSpacing: 1.5 }}>LAPTOP FOR LESS</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", letterSpacing: -0.5 }}>
          {titles[activeTab] || ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => setShowSearch(true)}
          style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
          🔍
        </button>
        <button onClick={() => setShowSideDrawer(true)}
          style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>
          📊
        </button>
        <button onClick={() => setView("settings")}
          style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>
          ⚙️
        </button>
      </div>
    </div>
  );
}
