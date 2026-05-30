import { useEffect, useRef } from "react";
import { supabase } from "./supabase";
import SourcingModule, { useSourcingAlerts } from "./SourcingModule";
import ContactModalWrapper from "./components/modals/ContactModalWrapper";

import { daysSince } from "./utils/helpers";

import { useAuth } from "./context/AuthContext";
import { useCustomers } from "./context/CustomerContext";
import { useStock } from "./context/StockContext";
import { useUI } from "./context/UIContext";
import { useSales } from "./context/SalesContext";
import { useParts } from "./context/PartsContext";
import { useReservations } from "./context/ReservationsContext";
import { useBroadcast } from "./hooks/useBroadcast";
import { useImport } from "./hooks/useImport";

import Spinner from "./components/ui/Spinner";
import PartSaleModal from "./components/modals/PartSaleModal";
import LinkStockModal from "./components/modals/LinkStockModal";
import SpecUpgradeModal from "./components/modals/SpecUpgradeModal";
import ReservationModal from "./components/modals/ReservationModal";
import QuickSaleModal from "./components/modals/QuickSaleModal";
import AskClaudeTab from "./components/tabs/AskClaudeTab";
import MarketingTab from "./components/tabs/MarketingTab";
import SalesTab from "./components/tabs/SalesTab";
import HomeTab from "./components/tabs/HomeTab";
import CustomersTab from "./components/tabs/CustomersTab";
import TradersTab from "./components/tabs/TradersTab";
import StockTab from "./components/tabs/StockTab";
import ChatDetailView from "./components/chat/ChatDetailView";
import DesktopSidebar from "./components/layout/DesktopSidebar";
import TopBar from "./components/layout/TopBar";
import SideDrawer from "./components/layout/SideDrawer";
import BottomNav from "./components/layout/BottomNav";
import ToastNotification from "./components/layout/ToastNotification";
import ReceiptModal from "./components/layout/ReceiptModal";
import BroadcastModal from "./components/layout/BroadcastModal";
import AuthScreen from "./components/layout/AuthScreen";
import GlobalSearch from "./components/layout/GlobalSearch";
import StockMatchAlert from "./components/stock/StockMatchAlert";
import ApiKeySetup from "./components/layout/ApiKeySetup";
import EditReservationModal from "./components/modals/EditReservationModal";
import CompleteReservationModal from "./components/modals/CompleteReservationModal";
import SettingsTab from "./components/tabs/SettingsTab";


// ── main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const {
    customers, setCustomers,
    activeCustomerId, setActiveCustomerId,
    activeDealId, setActiveDealId,
    activeCustomer,
    activeDeal,
    view, setView,
    showContactModal, setShowContactModal,
    contactModalPreType, setContactModalPreType,
    loadCustomers,
  } = useCustomers();

  const {
    stock,
    stockFilter, setStockFilter,
    stockSearch,
    soldDealMap, setSoldDealMap,
    showQuickSale, setShowQuickSale,
    quickSalePrefill, setQuickSalePrefill,
    showUpgrade, setShowUpgrade,
    upgradeTarget, setUpgradeTarget,
    loadStock,
    refreshCachedStock,
    lastAddedStock, setLastAddedStock,
  } = useStock();

  const {
    activeTab, setActiveTab,
    isMobile,
    showToast,
    showSearch, setShowSearch,
    installPromptEvent, setInstallPromptEvent,
    showInstallBanner, setShowInstallBanner,
  } = useUI();

  const {
    salesFilter,
    loadTodaySales,
    loadSalesHistory,
  } = useSales();

  const {
    showPartSale, setShowPartSale,
    partSaleTarget, setPartSaleTarget,
    loadParts,
    loadPartsRevMTD,
    loadPartsSold,
  } = useParts();

  const {
    showLinkStock, setShowLinkStock,
    linkStockDeal, setLinkStockDeal,
    showReservation, setShowReservation,
    loadReservedDeals,
  } = useReservations();

  const {
    session,
    authLoading,
    anthropicKey,
    handleLogout,
  } = useAuth();


  // ── sourcing alerts for dashboard ──
  const sourcingAlerts = useSourcingAlerts();

  const { exportData } = useImport();

  const { openBroadcast } = useBroadcast();


  useEffect(() => { if (session) loadCustomers(); }, [session, loadCustomers]);
  useEffect(() => { if (session) { loadStock(); refreshCachedStock(); loadTodaySales(); loadPartsRevMTD(); } }, [session, loadStock, refreshCachedStock, loadTodaySales, loadPartsRevMTD]);

  useEffect(() => {
    if (localStorage.getItem('jnp_install_dismissed')) return;
    const handler = (e) => { e.preventDefault(); setInstallPromptEvent(e); setShowInstallBanner(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Note: tasks tab cache loading is handled after tasks is defined

  // ── auth/handleLogout: clears local UI state on logout ──
  // NOTE: handleAuth and handleLogout come from useAuth().
  // handleLogout in AuthContext only clears session/auth; we also clear customer UI state:
  function handleLogoutWithUI() {
    setCustomers([]); setView("list"); setActiveCustomerId(null); setActiveDealId(null);
    handleLogout();
  }

  async function handleUpgradeApply(option, { newRam, newSsd, finalPrice, upgradeNote }) {
    const item = upgradeTarget;
    if (!item) return;
    if (option === "update_stock") {
      const update = { max_price: finalPrice };
      if (newRam) update.ram = newRam;
      if (newSsd) update.ssd = newSsd;
      await supabase.from("stock").update(update).eq("id", item.id);
      await loadStock();
      setQuickSalePrefill({ item: { ...item, ...update }, upgradeNote });
    } else {
      setQuickSalePrefill({ item, overridePrice: finalPrice, upgradeNote });
    }
    setShowUpgrade(false);
    setUpgradeTarget(null);
    setShowQuickSale(true);
  }

  // ── tasks — used by dashboard overdue logic ──
  const tasks = customers.flatMap(c =>
    (c.deals || [])
      .filter(d => d.stage !== "closed" && d.stage !== "lost")
      .map(d => ({
        customer: c, deal: d,
        days: daysSince(c.last_active),
        type: daysSince(c.last_active) >= 3 ? "overdue" : daysSince(c.last_active) >= 1 ? "followup" : "active",
      }))
  ).sort((a, b) => b.days - a.days);

  // ── stock ──
  useEffect(() => {
    if (activeTab === "stock") {
      loadStock(); refreshCachedStock();
      loadParts(); loadPartsRevMTD();
    }
  }, [activeTab, loadStock, refreshCachedStock]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stockFilter !== "parts_sold") return;
    loadPartsSold();
  }, [stockFilter, loadPartsSold]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === "sales") loadSalesHistory();
  }, [salesFilter, activeTab, loadSalesHistory]);

  useEffect(() => {
    if (stockFilter === "reserved") loadReservedDeals();
  }, [stockFilter, loadReservedDeals]);

  useEffect(() => {
    if (stockFilter !== "sold") return;
    const soldIds = stock.filter(s => s.status === "sold" && s.id).map(s => s.id);
    if (!soldIds.length) return;
    supabase.from("deals").select("id, stock_item_id, walk_in_name, payment_method, value")
      .in("stock_item_id", soldIds)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(d => { if (d.stock_item_id) map[d.stock_item_id] = d; });
        setSoldDealMap(map);
      });
  }, [stockFilter, stock]);









  // ── nav tabs ──
  const NAV_TABS = [
    { key: "home",      icon: "🏠", label: "Home" },
    { key: "customers", icon: "👥", label: "Clients" },
    { key: "stock",     icon: "📦", label: "Stock" },
    { key: "sourcing",  icon: "🌍", label: "Sourcing" },
    { key: "traders",   icon: "🏪", label: "Traders" },
    { key: "ask",       icon: "🤖", label: "Ask Claude" },
  ];

  // ── screens ──────────────────────────────────────────────────────────────────

  // loading
  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFC" }}>
      <Spinner />
    </div>
  );

  // auth screen
  if (!session) return <AuthScreen />;

  // api key setup
  if (!anthropicKey) return <ApiKeySetup />;

  // settings view
  if (view === "settings") {
    return (
      <SettingsTab
        exportData={exportData}
        handleLogoutWithUI={handleLogoutWithUI}
      />
    );
  }

  // detail view
  if (view === "detail" && activeCustomer) {
    return <ChatDetailView />;
  }

  // list view
  return (
    <div style={isMobile
      ? { minHeight: "100vh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }
      : { minHeight: "100vh", background: "#F8FAFC", display: "flex" }}>

      {/* ── Desktop sidebar ── */}
      {!isMobile && <DesktopSidebar NAV_TABS={NAV_TABS} />}

      {/* ── Content area ── */}
      <div style={isMobile
        ? { flex: 1, display: "flex", flexDirection: "column" }
        : { marginLeft: 280, flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh", overflow: "hidden" }}>

      {/* PWA install banner */}
      {showInstallBanner && (
        <div style={{
          background: "#6366F1", color: "#fff", padding: "10px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10, fontSize: 13, fontWeight: 600, flexShrink: 0,
        }}>
          <span style={{ flex: 1 }}>📱 Install JNP CRM on your phone for quick access</span>
          <button onClick={async () => {
            if (installPromptEvent) {
              installPromptEvent.prompt();
              await installPromptEvent.userChoice;
            }
            setShowInstallBanner(false);
          }} style={{
            background: "#fff", color: "#6366F1", border: "none",
            borderRadius: 8, padding: "5px 12px", fontWeight: 800,
            fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
          }}>Install Now</button>
          <button onClick={() => {
            localStorage.setItem('jnp_install_dismissed', '1');
            setShowInstallBanner(false);
          }} style={{
            background: "rgba(255,255,255,0.2)", color: "#fff", border: "none",
            borderRadius: 8, padding: "5px 10px", fontWeight: 700,
            fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
          }}>Dismiss</button>
        </div>
      )}
      {/* top bar — contacts/traders header */}
      <TopBar />
      {/* ── HOME / DASHBOARD TAB ── */}
      {activeTab === "home" && (
        <HomeTab tasks={tasks} sourcingAlerts={sourcingAlerts} />
      )}

      {/* ── CUSTOMERS TAB ── */}
      {activeTab === "customers" && <CustomersTab />}

      {/* ── STOCK TAB ── */}
      {activeTab === "stock" && (
        <StockTab openBroadcast={openBroadcast} handleUpgradeApply={handleUpgradeApply} />
      )}

      {/* ── TRADERS TAB ── */}
      {activeTab === "traders" && (
        <TradersTab
          anthropicKey={anthropicKey}
          stock={stock}
          activeDeal={activeDeal}
        />
      )}

      {/* ── ASK CLAUDE TAB ── */}
      {activeTab === "ask" && (
        <AskClaudeTab />
      )}

      {/* ── SALES HISTORY TAB ── */}
      {activeTab === "sales" && (
        <SalesTab />
      )}

      {/* ── MARKETING TAB ── */}
      {activeTab === "marketing" && (
        <MarketingTab
          stock={stock}
        />
      )}

      {/* ── SOURCING TAB ── */}
      {activeTab === "sourcing" && (
        <SourcingModule anthropicKey={anthropicKey} onAddToStock={() => { loadStock(); refreshCachedStock(); }} />
      )}

      {/* ── LINK STOCK MODAL ── */}
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

      {/* ── SPEC UPGRADE MODAL ── */}
      {showUpgrade && upgradeTarget && (
        <SpecUpgradeModal
          item={upgradeTarget}
          onClose={() => { setShowUpgrade(false); setUpgradeTarget(null); }}
          onApply={handleUpgradeApply}
        />
      )}

      {/* ── PART SALE MODAL ── */}
      {showPartSale && partSaleTarget && (
        <PartSaleModal
          part={partSaleTarget}
          onClose={() => { setShowPartSale(false); setPartSaleTarget(null); }}
          onComplete={() => { loadParts(); loadPartsRevMTD(); if (stockFilter === "parts_sold") setStockFilter("parts_sold"); }}
        />
      )}

      {/* ── RESERVATION MODAL ── */}
      {showReservation && activeCustomer && linkStockDeal && (
        <ReservationModal
          customer={activeCustomer}
          deal={linkStockDeal}
          stock={stock}
          onClose={() => { setShowReservation(false); setLinkStockDeal(null); }}
          onDone={({ selectedItem, pickupDate, depositAmt, balanceDue }) => {
            setShowReservation(false);
            setLinkStockDeal(null);
            loadStock();
            loadCustomers();
            refreshCachedStock();
            showToast("Device reserved successfully 🔒");
          }}
        />
      )}

      {/* ── QUICK SALE MODAL ── */}
      {showQuickSale && (
        <QuickSaleModal
          key={quickSalePrefill ? `prefill-${quickSalePrefill.item?.id}` : "new"}
          stock={stock}
          prefill={quickSalePrefill}
          onClose={() => { setShowQuickSale(false); setQuickSalePrefill(null); }}
          onComplete={() => { loadStock(); refreshCachedStock(); loadTodaySales(); loadCustomers(); setQuickSalePrefill(null); }}
        />
      )}

      {/* ── GLOBAL SEARCH ── */}
      {showSearch && <GlobalSearch onClose={() => setShowSearch(false)} />}

      {/* ── STOCK MATCH ALERT ── */}
      {lastAddedStock && <StockMatchAlert stockItem={lastAddedStock} onClose={() => setLastAddedStock(null)} />}

      {/* ── BROADCAST MODAL ── */}
      <BroadcastModal />

      {/* ── SIDE DRAWER ── */}
      <SideDrawer handleLogout={handleLogoutWithUI} />

      {/* ── SALE RECEIPT MODAL ── */}
      <ReceiptModal />

      {/* ── EDIT RESERVATION MODAL ── */}
      <EditReservationModal />

      {/* ── Complete Reservation modal ── */}
      <CompleteReservationModal />

      {/* ── TOAST NOTIFICATION ── */}
      <ToastNotification />

      {/* ── Floating "+" button ── */}
      <button
        onClick={() => { setContactModalPreType(null); setShowContactModal(true); }}
        style={{
          position: "fixed", bottom: isMobile ? 76 : 28, right: isMobile ? "calc(50% - 228px)" : 28,
          width: 52, height: 52, borderRadius: "50%", border: "none",
          background: "#6366F1", color: "#fff", fontSize: 26, fontWeight: 300,
          cursor: "pointer", boxShadow: "0 4px 18px rgba(99,102,241,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 60, lineHeight: 1,
        }}
        title="Add contact"
      >+</button>

      {/* ── ContactModal ── */}
      <ContactModalWrapper />

      {/* bottom tab bar — mobile only */}
      <BottomNav NAV_TABS={NAV_TABS} sourcingAlerts={sourcingAlerts} />
      </div>{/* end content area */}
      </div>
  );
}
