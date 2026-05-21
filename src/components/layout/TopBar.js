import React from "react";
import { useUI } from "../../context/UIContext";
import { useCustomers } from "../../context/CustomerContext";

export default function TopBar() {
  const { activeTab, isMobile, setShowSideDrawer } = useUI();
  const { setView, setShowContactModal, setContactModalPreType } = useCustomers();

  if (!isMobile && activeTab !== "customers" && activeTab !== "traders") return null;

  return (
    <div style={{ background: "#fff", padding: "16px 14px 0", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, letterSpacing: 1.5 }}>LAPTOP FOR LESS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: -0.5 }}>
            {activeTab === "customers" ? "Contacts" : "Ask Claude"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => setShowSideDrawer(true)} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>📊</button>
          <button onClick={() => setView("settings")} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>⚙️</button>
          {activeTab === "customers" && (
            <button onClick={() => { setContactModalPreType("client"); setShowContactModal(true); }}
              style={{ height: 36, padding: "0 16px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              + Add Client
            </button>
          )}
          {activeTab === "traders" && (
            <button onClick={() => { setContactModalPreType("trader"); setShowContactModal(true); }}
              style={{ height: 36, padding: "0 16px", borderRadius: 10, border: "none", background: "#D97706", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              + Add Trader
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
