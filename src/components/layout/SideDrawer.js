import React from "react";
import { useUI } from "../../context/UIContext";
import { useCustomers } from "../../context/CustomerContext";

export default function SideDrawer({ handleLogout }) {
  const { showSideDrawer, setShowSideDrawer, setActiveTab } = useUI();
  const { setView } = useCustomers();
  if (!showSideDrawer) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
      <div onClick={() => setShowSideDrawer(false)}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} />
      <div style={{ position: "absolute", top: 0, right: 0, width: "75%", maxWidth: 300, height: "100%", background: "#fff", display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.12)" }}>
        <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid #F1F5F9" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>JNP CRM</div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Laptop for Less</div>
        </div>
        <div style={{ flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => { setShowSideDrawer(false); setActiveTab("marketing"); }}
            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "none", background: "#FFF7ED", color: "#D97706", fontWeight: 800, fontSize: 14, cursor: "pointer", textAlign: "left", marginBottom: 8 }}>
            📣 Marketing
          </button>
          <button onClick={() => { setShowSideDrawer(false); setActiveTab("sales"); }}
            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "none", background: "#EEF2FF", color: "#6366F1", fontWeight: 800, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
            💰 Sales History
          </button>
          <button onClick={() => { setShowSideDrawer(false); setView("settings"); }}
            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
            ⚙️ Settings
          </button>
        </div>
        <div style={{ padding: "16px 20px", borderTop: "1px solid #F1F5F9" }}>
          <button onClick={handleLogout}
            style={{ width: "100%", padding: "11px 16px", borderRadius: 12, border: "1.5px solid #FEE2E2", background: "#fff", color: "#EF4444", fontWeight: 700, fontSize: 14, cursor: "pointer", textAlign: "left" }}>
            🚪 Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
