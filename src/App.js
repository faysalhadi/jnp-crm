import { useEffect, useRef } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import SourcingModule, { useSourcingAlerts } from "./SourcingModule";
import ContactModalWrapper from "./components/modals/ContactModalWrapper";

import { daysSince } from "./utils/helpers";

import { useAuth } from "./context/AuthContext";
import { useProfile } from "./context/ProfileContext";
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
import PartsCompatibilityTab from "./components/tabs/PartsCompatibilityTab";
import SalesTab from "./components/tabs/SalesTab";
import ScreenTallyTab from "./components/tabs/ScreenTallyTab";
import HomeTab from "./components/tabs/HomeTab";
import SalespersonHomeTab from "./components/tabs/SalespersonHomeTab";
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
import { startNotificationChecker, stopNotificationChecker } from "./utils/notifications";
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

  const { profileLoading, profileError, isOwner, isSalesperson, isViewingAs, viewingAs, clearViewingAs, access } = useProfile();


  // ── sourcing alerts for dashboard ──
  const sourcingAlerts = useSourcingAlerts();

  const { exportData } = useImport();

  const { openBroadcast } = useBroadcast();


  const sessionUserId = session?.user?.id;
  useEffect(() => { if (sessionUserId) loadCustomers(); }, [sessionUserId]); // eslint-disable-line
  useEffect(() => { if (sessionUserId) { loadStock(); refreshCachedStock(); loadTodaySales(); loadPartsRevMTD(); } }, [sessionUserId]); // eslint-disable-line

  // Auto-reset detail view if customer not found after customers are loaded
  useEffect(() => {
    if (view === "detail" && !activeCustomer && customers.length > 0) {
      setView("list");
    }
  }, [view, activeCustomer, customers.length]); // eslint-disable-line

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









  // ── nav access ──
  // Nav components filter themselves from constants/access.js, so App only
  // needs the second layer: never render a tab this user may not reach, even
  // if a stale state value or a stray setActiveTab call points at one.
  const safeTab = access.canTab(activeTab) ? activeTab : "home";

  // Keep the nav highlight on the tab that is actually showing.
  useEffect(() => {
    if (!profileLoading && !access.canTab(activeTab)) {
      setActiveTab("home");
    }
  }, [profileLoading, activeTab, access]); // eslint-disable-line

  // ── screens ──────────────────────────────────────────────────────────────────

  // loading
  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFC" }}>
      <Spinner />
    </div>
  );

  // auth screen
  if (!session) return <AuthScreen />;

  // profile loading
  if (profileLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFC" }}>
      <Spinner />
    </div>
  );

  // profile error screen
  if (profileError) return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24,
      background: "#0B0D18", color: "#E6E9F5", fontFamily: "Inter, sans-serif",
      textAlign: "center", gap: 12
    }}>
      <div style={{ fontSize: 32 }}>🔒</div>
      <div style={{ fontWeight: 600, fontSize: 16 }}>Account not configured</div>
      <div style={{ color: "#7880A3", fontSize: 14 }}>{profileError}</div>
    </div>
  );

  // api key setup — salespersons don't need the Anthropic key
  if (!anthropicKey && !isSalesperson) return <ApiKeySetup />;

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
  if (view === "detail") {
    if (!activeCustomer) {
      return (
        <div style={{ minHeight: "100vh", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "#94A3B8" }}>Loading...</div>
          <button onClick={() => setView("list")} style={{ fontSize: 11, color: "#CBD5E1", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
        </div>
      );
    }
    return <ErrorBoundary><ChatDetailView /></ErrorBoundary>;
  }

  // list view
  return (
    <div style={isMobile
      ? { height: "100dvh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden", paddingTop: isViewingAs ? 40 : 0 }
      : { height: "100dvh", background: "#F8FAFC", display: "flex", overflow: "hidden", paddingTop: isViewingAs ? 40 : 0 }}>

      {/* ── Viewing-as banner ── */}
      {isViewingAs && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#112B1E', borderBottom: '1px solid #1A4530',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 16px', fontFamily: 'Inter, sans-serif',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#1A4530', color: '#2EC97A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
              {viewingAs.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <span style={{ color: '#2EC97A', fontSize: 13, fontWeight: 600 }}>Viewing as {viewingAs.name}</span>
            <span style={{ color: '#7880A3', fontSize: 12 }}>· read only</span>
          </div>
          <button onClick={clearViewingAs} style={{ background: 'none', border: '1px solid #1A4530', color: '#2EC97A', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            Exit ✕
          </button>
        </div>
      )}

      {/* ── Desktop sidebar ── */}
      {!isMobile && <DesktopSidebar />}

      {/* ── Content area ── */}
      <div style={isMobile
        ? { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }
        : { marginLeft: 280, flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", minHeight: 0 }}>

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
      {safeTab === "home" && (
        (isSalesperson || isViewingAs)
          ? <SalespersonHomeTab />
          : <HomeTab tasks={tasks} sourcingAlerts={sourcingAlerts} />
      )}

      {/* ── CUSTOMERS TAB ── */}
      {safeTab === "customers" && <CustomersTab />}

      {/* ── STOCK TAB ── */}
      {safeTab === "stock" && (
        <StockTab openBroadcast={openBroadcast} handleUpgradeApply={handleUpgradeApply} />
      )}

      {/* ── TRADERS TAB ── */}
      {safeTab === "traders" && (
        <TradersTab
          anthropicKey={anthropicKey}
          stock={stock}
          activeDeal={activeDeal}
        />
      )}

      {/* ── ASK CLAUDE TAB ── */}
      {safeTab === "ask" && (
        <AskClaudeTab />
      )}

      {/* ── SALES HISTORY TAB ── */}
      {safeTab === "sales" && (
        <SalesTab />
      )}

      {/* ── MARKETING TAB ── */}
      {safeTab === "marketing" && (
        <MarketingTab
          stock={stock}
        />
      )}

      {/* ── PARTS DB TAB ── */}
      {safeTab === "parts" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <PartsCompatibilityTab />
        </div>
      )}

      {/* ── SCREEN TALLY (drawer-only utility, full-screen overlay) ── */}
      {safeTab === "screentally" && (
        <ScreenTallyTab onClose={() => setActiveTab("home")} />
      )}

      {/* ── SOURCING TAB ── */}
      {safeTab === "sourcing" && (
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

      {/* ── BROADCAST MODAL ── */}
      <BroadcastModal />

      {/* bottom tab bar — mobile only */}
      <BottomNav sourcingAlerts={sourcingAlerts} />
      </div>{/* end content area */}
      </div>
  );
}
