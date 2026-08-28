import React from "react";
import LinkStockModal from "../modals/LinkStockModal";
import ReservationModal from "../modals/ReservationModal";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import { useReservations } from "../../context/ReservationsContext";
import { useStock } from "../../context/StockContext";
import { useSales } from "../../context/SalesContext";
import DesktopSidebar from "../layout/DesktopSidebar";
import SideDrawer from "../layout/SideDrawer";
import GlobalSearch from "../layout/GlobalSearch";
import { useAuth } from "../../context/AuthContext";
import ChatHeader from "./ChatHeader";
import NotesActivityView from "./NotesActivityView";
import SupplierNotesView from "./SupplierNotesView";
import { TraderProfilePanel } from "../tabs/TraderInventoryProfile";

export default function ChatDetailView() {
  const { isMobile, showToast, showSearch, setShowSearch } = useUI();
  const {
    showLinkStock, setShowLinkStock,
    linkStockDeal, setLinkStockDeal,
    showReservation, setShowReservation,
  } = useReservations();
  const {
    activeCustomer,
    activeCustomerId, setActiveCustomerId,
    activeDealId, setActiveDealId,
    setView, setCustomers,
    loadCustomers,
  } = useCustomers();
  const { stock, loadStock, refreshCachedStock } = useStock();
  const { loadTodaySales } = useSales();
  const { handleLogout } = useAuth();

  // The sidebar's menu and search buttons live here too, so the drawer and
  // global search have to be mounted in this route — App only mounts them in
  // the main layout, which this view replaces rather than nests inside.
  function handleLogoutWithUI() {
    setCustomers([]); setView("list"); setActiveCustomerId(null); setActiveDealId(null);
    handleLogout();
  }

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
      ? { height: "100vh", overflow: "hidden", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }
      : { height: "100vh", overflow: "hidden", background: "#F8FAFC", display: "flex" }}>
      {/* The shared, role-gated sidebar. This used to be a hand-rolled copy
          that hardcoded every tab and never checked the role — that private
          copy was how a salesperson reached the owner-only tabs. */}
      {!isMobile && <DesktopSidebar />}
      {/* detail content */}
      <div style={isMobile
        ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
        : { marginLeft: 280, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", height: "100vh", maxWidth: "calc(100vw - 280px)" }}>
        {/* Header stays pinned. It can grow tall (stage bar, deal tabs, expanding
            panels), so it scrolls within its own capped area rather than pushing
            the activity feed off screen. */}
        <div style={{ flexShrink: 0, maxHeight: "70%", overflowY: "auto" }}>
          <ChatHeader />
        </div>
        {/* Notes & Activity is the body of the client view now that the message
            thread is gone — it takes the remaining height and scrolls itself. */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {activeCustomer?.contact_type === "supplier" ? <SupplierNotesView /> : (
            <>
              {activeCustomer?.contact_type === "trader" && activeCustomer?.name && (
                <TraderProfilePanel traderName={activeCustomer.name} />
              )}
              <NotesActivityView />
            </>
          )}
        </div>
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

      {/* Drawer and global search — both are reachable from the sidebar and
          the chat header while a client is open. */}
      <SideDrawer handleLogout={handleLogoutWithUI} />
      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}
    </div>
  );
}
