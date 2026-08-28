import React from "react";
import LinkStockModal from "../modals/LinkStockModal";
import ReservationModal from "../modals/ReservationModal";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import { useReservations } from "../../context/ReservationsContext";
import { useStock } from "../../context/StockContext";
import { useSales } from "../../context/SalesContext";
import ChatHeader from "./ChatHeader";
import NotesActivityView from "./NotesActivityView";
import SupplierNotesView from "./SupplierNotesView";
import { TraderProfilePanel } from "../tabs/TraderInventoryProfile";

const NAV_TABS = [
  { key: "home",      icon: "🏠", label: "Home" },
  { key: "customers", icon: "👥", label: "Contacts" },
  { key: "stock",     icon: "📦", label: "Stock" },
  { key: "sourcing",  icon: "🌍", label: "Sourcing" },
  { key: "traders",   icon: "🏪", label: "Traders" },
  { key: "ask",       icon: "🤖", label: "Ask Claude" },
];

export default function ChatDetailView() {
  const { isMobile, setActiveTab, activeTab, showToast } = useUI();
  const {
    showLinkStock, setShowLinkStock,
    linkStockDeal, setLinkStockDeal,
    showReservation, setShowReservation,
  } = useReservations();
  const {
    activeCustomer,
    activeCustomerId, setActiveCustomerId,
    activeDealId, setActiveDealId,
    setView,
    loadCustomers,
  } = useCustomers();
  const { stock, loadStock, refreshCachedStock } = useStock();
  const { loadTodaySales } = useSales();

  // A missing customer used to render an empty shell with no explanation.
  // Say so, and give a way back instead of a blank screen.
  if (activeCustomerId && !activeCustomer) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8FAFC", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 14, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: 32 }}>🔍</div>
        <div style={{ color: "#7880A3", fontSize: 13 }}>Client not found. Go back and try again.</div>
        <button onClick={() => { setView("list"); setActiveCustomerId(null); setActiveDealId(null); }}
          style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "#6366F1",
                   color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          ← Back to Clients
        </button>
      </div>
    );
  }

  return (
    <div style={isMobile
      ? { minHeight: "100vh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }
      : { minHeight: "100vh", background: "#F8FAFC", display: "flex" }}>
      {/* Desktop sidebar in detail view */}
      {!isMobile && (
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
      )}
      {/* detail content */}
      <div style={isMobile ? { flex: 1, display: "flex", flexDirection: "column" } : { marginLeft: 280, flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh", maxWidth: "calc(100vw - 280px)" }}>
        <ChatHeader />
        {activeCustomer?.contact_type === "supplier" ? <SupplierNotesView /> : (
          <>
            {activeCustomer?.contact_type === "trader" && activeCustomer?.name && (
              <TraderProfilePanel traderName={activeCustomer.name} />
            )}
            <NotesActivityView />
          </>
        )}
      </div>

      {/* ── LINK STOCK MODAL (inside detail view so it renders when chat is open) ── */}
      {showLinkStock && activeCustomer && linkStockDeal && (
        <LinkStockModal
          customer={activeCustomer}
          deal={linkStockDeal}
          onClose={() => { setShowLinkStock(false); setLinkStockDeal(null); }}
          onDone={() => {
            setShowLinkStock(false);
            setLinkStockDeal(null);
            loadCustomers();
            loadStock();
            refreshCachedStock();
            loadTodaySales();
            showToast("Sale confirmed successfully ✅");
          }}
        />
      )}
      {/* ── RESERVATION MODAL (inside detail view) ── */}
      {showReservation && activeCustomer && linkStockDeal && (
        <ReservationModal
          customer={activeCustomer}
          deal={linkStockDeal}
          stock={stock}
          onClose={() => { setShowReservation(false); setLinkStockDeal(null); }}
          onDone={() => {
            setShowReservation(false);
            setLinkStockDeal(null);
            loadStock();
            loadCustomers();
            refreshCachedStock();
            showToast("Device reserved successfully 🔒");
          }}
        />
      )}
    </div>
  );
}
