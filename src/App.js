import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import SourcingModule, { useSourcingAlerts } from "./SourcingModule";
import ContactModal from "./ContactModal";

import {
  ANTHROPIC_KEY_STORAGE, STAGES, TIERS, BRANDS,
  LOSS_REASONS, PAYMENT_STATUSES, OUTREACH_REASONS,
  QUICK_ACTIONS, SOURCING_STAGES, SOURCING_STAGE_COLORS,
  SOURCING_CHANNELS, SYSTEM_PROMPT, EMPTY_STOCK,
} from "./constants";

import {
  getGreeting, timeAgo, waTsFormat, daysSince,
  autoTier, monthRevenue, getAnthropicKey, saveAnthropicKey,
  parseGB, labelGB, cleanWhatsAppText,
} from "./utils/helpers";

import {
  callClaude,
  buildSystemPromptFromCache,
  buildOwnerContext,
} from "./utils/claude";

import { useAuth } from "./context/AuthContext";
import { useCustomers } from "./context/CustomerContext";
import { useStock } from "./context/StockContext";
import { useUI } from "./context/UIContext";
import { useSales } from "./context/SalesContext";
import { useParts } from "./context/PartsContext";
import { useReservations } from "./context/ReservationsContext";
import { moveStage as moveStageService, buildReceiptText as buildReceiptTextService, saveReceiptNumber as saveReceiptNumberService } from "./services/dealService";
import { loadMessages as loadMessagesService, saveMessage as saveMessageService, generateReply as generateReplyService } from "./services/messageService";
import { getMatchingClients as getMatchingClientsService } from "./services/broadcastService";
import { useChatActions } from "./hooks/useChatActions";
import { useAskClaude } from "./hooks/useAskClaude";
import { useImport } from "./hooks/useImport";
import { useChat } from "./context/ChatContext";
import { useImportContext } from "./context/ImportContext";
import { useAskClaudeContext } from "./context/AskClaudeContext";
import { useBroadcast } from "./hooks/useBroadcast";

import { saveImportedMessages } from "./utils/whatsapp";
import Badge from "./components/ui/Badge";
import Spinner from "./components/ui/Spinner";
import StageBar from "./components/ui/StageBar";
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
import SideDrawer from "./components/layout/SideDrawer";
import BottomNav from "./components/layout/BottomNav";
import ToastNotification from "./components/layout/ToastNotification";
import ReceiptModal from "./components/layout/ReceiptModal";
import BroadcastModal from "./components/layout/BroadcastModal";
import AuthScreen from "./components/layout/AuthScreen";

// ── main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const {
    customers, setCustomers,
    loading,
    lastMsgMap,
    activeCustomerId, setActiveCustomerId,
    activeDealId, setActiveDealId,
    activeCustomer,
    activeDeal,
    view, setView,
    filter, setFilter,
    search, setSearch,
    contactTypeFilter, setContactTypeFilter,
    pendingSuggestion, setPendingSuggestion,
    showContactModal, setShowContactModal,
    contactModalPreType, setContactModalPreType,
    newCustomer, setNewCustomer,
    newDeal, setNewDeal,
    showAddDeal, setShowAddDeal,
    showDeleteConfirm, setShowDeleteConfirm,
    showLossReason, setShowLossReason,
    loadCustomers,
    addCustomer,
    deleteCustomer,
    updateCustomer,
    updateDeal,
    addDeal,
  } = useCustomers();

  const {
    stock, setStock,
    stockLoading,
    cachedStock, setCachedStock,
    stockFilter, setStockFilter,
    stockSearch, setStockSearch,
    stockView, setStockView,
    showAddStock, setShowAddStock,
    editingStock, setEditingStock,
    stockForm, setStockForm,
    expandedStockId, setExpandedStockId,
    stockPhotoUploading,
    showImportStock, setShowImportStock,
    importPreview, setImportPreview,
    importingStock,
    importStockResult, setImportStockResult,
    soldDealMap, setSoldDealMap,
    stockFileInputRef,
    importStockFileRef,
    loadStock,
    refreshCachedStock,
    saveStock,
    deleteStockItem,
    toggleStockStatus,
    uploadStockPhoto,
    downloadStockTemplate,
    handleStockFileSelect,
    importStockItems,
  } = useStock();

  const {
    activeTab, setActiveTab,
    isMobile, setIsMobile,
    showSideDrawer, setShowSideDrawer,
    toast, setToast,
    showToast,
    installPromptEvent, setInstallPromptEvent,
    showInstallBanner, setShowInstallBanner,
    activeMarketingTab, setActiveMarketingTab,
  } = useUI();

  const {
    todaySales, setTodaySales,
    salesHistory,
    salesHistoryLoading,
    salesFilter, setSalesFilter,
    showSaleReceipt, setShowSaleReceipt,
    saleReceiptData, setSaleReceiptData,
    receiptEditName, setReceiptEditName,
    openComplaints,
    loadTodaySales,
    loadSalesHistory,
    buildSaleReceiptText,
    loadOpenComplaints,
  } = useSales();

  const {
    parts, setParts,
    partsLoading,
    showAddPart, setShowAddPart,
    editingPart, setEditingPart,
    partForm, setPartForm,
    showPartSale, setShowPartSale,
    partSaleTarget, setPartSaleTarget,
    partsSold, setPartsSold,
    partsSoldLoading,
    partsRevMTD,
    loadParts,
    savePart,
    deletePart,
    loadPartsRevMTD,
    loadPartsSold,
  } = useParts();

  const {
    reservedDeals, setReservedDeals,
    reservedDealsLoading,
    expandedReservedDeal, setExpandedReservedDeal,
    showCompleteReservation, setShowCompleteReservation,
    completingDeal, setCompletingDeal,
    completionPaymentMethod, setCompletionPaymentMethod,
    showEditReservation, setShowEditReservation,
    editReservationItem, setEditReservationItem,
    editReservationForm, setEditReservationForm,
    showLinkStock, setShowLinkStock,
    linkStockDeal, setLinkStockDeal,
    showReservation, setShowReservation,
    loadReservedDeals,
  } = useReservations();

  const {
    session, setSession,
    authLoading,
    authMode, setAuthMode,
    authEmail, setAuthEmail,
    authPassword, setAuthPassword,
    authError, setAuthError,
    authBusy,
    anthropicKey, setAnthropicKey,
    keyInput, setKeyInput,
    handleAuth, handleLogout,
  } = useAuth();

  const {
    messages, setMessages,
    msgLoading, setMsgLoading,
    msgInput, setMsgInput,
    incomingText, setIncomingText,
    replyMode, setReplyMode,
    replyingToId, setReplyingToId,
    directReplyText, setDirectReplyText,
    generatedReply, setGeneratedReply,
    generatedReplyLoading, setGeneratedReplyLoading,
    editingGenerated, setEditingGenerated,
    copied, setCopied,
    editSent, setEditSent,
    editingName, setEditingName,
    nameInput, setNameInput,
    editingNumber, setEditingNumber,
    numberInput, setNumberInput,
    outreachMode, setOutreachMode,
    outreachReason, setOutreachReason,
    outreachCustom, setOutreachCustom,
    showSupplierReply, setShowSupplierReply,
    supplierReplyCtx, setSupplierReplyCtx,
    supplierReplyGmail, setSupplierReplyGmail,
    supplierReplyWA, setSupplierReplyWA,
    supplierReplyLoading, setSupplierReplyLoading,
    copiedSupGmail, setCopiedSupGmail,
    copiedSupWA, setCopiedSupWA,
  } = useChat();

  const {
    importText, setImportText,
    importing, setImporting,
    importResult, setImportResult,
    importingMultiple, setImportingMultiple,
    importMultipleProgress, setImportMultipleProgress,
    importMultipleResult, setImportMultipleResult,
    exporting, setExporting,
  } = useImportContext();

  const {
    askMessages, setAskMessages,
    askInput, setAskInput,
    askLoading, setAskLoading,
    expandedSaleId, setExpandedSaleId,
    marketingDevices, setMarketingDevices,
  } = useAskClaudeContext();
  const chatFileInputRef = useRef(null);
  const chatFilesInputRef = useRef(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const askBottomRef = useRef(null);

  // ── broadcast ── (managed by useBroadcast hook, initialized below after messages state)

  // ── quick sale ──
  const [showQuickSale,    setShowQuickSale]    = useState(false);
  const [quickSalePrefill, setQuickSalePrefill] = useState(null);


  // ── spec upgrade ──
  const [showUpgrade,   setShowUpgrade]   = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState(null);



  // ── sourcing alerts for dashboard ──
  const sourcingAlerts = useSourcingAlerts();

  // ── hooks ──
  const {
    handleReserveDevice, handleConfirmSale, moveStage,
    addIncomingMessage, generateAIReply, sendAIReply,
    sendDirectReply, generateOpeningMessage,
    confirmSent, markNotSent, copyMsg,
    generateOutreach, generateSupplierReply,
  } = useChatActions();

  const { buildSmartContext, sendAskMessage: _sendAskMessage } = useAskClaude();

  function sendAskMessage(msg) {
    return _sendAskMessage(msg, askMessages, setAskMessages, setAskInput, setAskLoading);
  }

  const {
    importChatFile: _importChatFile,
    importSingleChatFile: _importSingleChatFile,
    importMultipleChatFiles: _importMultipleChatFiles,
    importWhatsAppChat: _importWhatsAppChat,
    exportData: _exportData,
  } = useImport(anthropicKey);

  function importSingleChatFile(file) {
    return _importSingleChatFile(file, setImporting, setImportResult);
  }

  function importMultipleChatFiles(files) {
    return _importMultipleChatFiles(files, setImportingMultiple, setImportMultipleProgress, setImportMultipleResult);
  }

  function importWhatsAppChat() {
    return _importWhatsAppChat(importText, setImporting, setImportResult, setImportText);
  }

  function exportData() {
    return _exportData(setExporting);
  }

  const {
    showBroadcast, setShowBroadcast,
    broadcastItem, setBroadcastItem,
    broadcastClients, setBroadcastClients,
    broadcastSelected, setBroadcastSelected,
    broadcastMessages, setBroadcastMessages,
    broadcastLoading, setBroadcastLoading,
    broadcastStep, setBroadcastStep,
    broadcastSent, setBroadcastSent,
    openBroadcast,
    generateBroadcastMessages,
  } = useBroadcast(anthropicKey);


  useEffect(() => { if (session) loadCustomers(); }, [session, loadCustomers]);
  useEffect(() => { if (session) { loadStock(); refreshCachedStock(); loadTodaySales(); loadPartsRevMTD(); } }, [session, loadStock, refreshCachedStock, loadTodaySales, loadPartsRevMTD]);

  useEffect(() => {
    if (localStorage.getItem('jnp_install_dismissed')) return;
    const handler = (e) => { e.preventDefault(); setInstallPromptEvent(e); setShowInstallBanner(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Note: tasks tab cache loading is handled after tasks is defined

  // ── load messages for active deal ──
  useEffect(() => {
    if (!activeDealId) { setMessages([]); return; }
    supabase.from("messages").select("*").eq("deal_id", activeDealId).order("ts", { ascending: true })
      .then(({ data }) => setMessages(data || []));
  }, [activeDealId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Reset all chat input state when switching contacts
  useEffect(() => {
    setIncomingText(""); setReplyMode(null); setReplyingToId(null);
    setDirectReplyText(""); setGeneratedReply(""); setGeneratedReplyLoading(false); setEditingGenerated(false);
  }, [activeCustomerId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { askBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [askMessages]);

  // Auto-create a conversation deal for traders/suppliers that have none,
  // so the existing messages system (which requires deal_id) works unchanged.
  useEffect(() => {
    if (view !== "detail" || !activeCustomerId) return;
    const c = customers.find(x => x.id === activeCustomerId);
    if (!c) return;
    const cType = c.contact_type || "client";
    if (cType === "client" || cType === "walkin") return; // clients and walk-ins always have deals
    if (c.deals && c.deals.length > 0) {
      if (!activeDealId) setActiveDealId(c.deals[0].id);
      return;
    }
    // No deals — create a silent conversation deal
    supabase.from("deals")
      .insert({ customer_id: activeCustomerId, stage: "new_inquiry" })
      .select().single()
      .then(({ data: d }) => { if (d) { setActiveDealId(d.id); loadCustomers(); } });
  }, [activeCustomerId, view]); // eslint-disable-line react-hooks/exhaustive-deps

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


  const getMatchingClients = (item) => getMatchingClientsService(item, customers);










  // ── nav tabs (used by both sidebar instances) ──
  const NAV_TABS = [
    { key: "home",      icon: "🏠", label: "Home" },
    { key: "customers", icon: "👥", label: "Contacts" },
    { key: "stock",     icon: "📦", label: "Stock" },
    { key: "sourcing",  icon: "🌍", label: "Sourcing" },
    { key: "traders",   icon: "🏪", label: "Traders" },
    { key: "ask",       icon: "🤖", label: "Ask Claude" },
  ];

  // ── computed ──
  const openDeals = customers.reduce((a, c) => a + (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost").length, 0);
  const closedDeals = customers.reduce((a, c) => a + (c.deals || []).filter(d => d.stage === "closed").length, 0);
  const revenue = monthRevenue(customers);

  const filtered = customers
    .filter(c => {
      const cType = c.contact_type || "client";
      if (contactTypeFilter !== "all" && cType !== contactTypeFilter) return false;
      if (search) return c.name.toLowerCase().includes(search.toLowerCase()) || (c.number || "").includes(search);
      if (filter === "urgent") return c.urgent;
      if (filter === "overdue") return daysSince(c.last_active) >= 1 && (c.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
      if (filter === "vip") return c.tier === "vip";
      if (filter === "cold") return c.tier === "cold";
      return true;
    })
    .sort((a, b) => {
      if (a.urgent && !b.urgent) return -1;
      if (!a.urgent && b.urgent) return 1;
      const aTime = a.last_activity_at || a.last_active;
      const bTime = b.last_activity_at || b.last_active;
      return new Date(bTime) - new Date(aTime);
    });

  const filteredStock = stock.filter(item => {
    if (stockSearch) {
      const q = stockSearch.toLowerCase();
      return (item.brand || "").toLowerCase().includes(q) ||
             (item.model || "").toLowerCase().includes(q) ||
             (item.processor || "").toLowerCase().includes(q) ||
             (item.serial_number || "").toLowerCase().includes(q);
    }
    if (stockFilter === "available") return item.status === "available";
    if (stockFilter === "reserved") return item.status === "reserved";
    if (stockFilter === "sold") return item.status === "sold";
    return true;
  });

  // ── screens ──────────────────────────────────────────────────────────────────

  // loading
  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFC" }}>
      <Spinner />
    </div>
  );

  // auth screen
  if (!session) return (
    <AuthScreen
      authMode={authMode} setAuthMode={setAuthMode}
      authEmail={authEmail} setAuthEmail={setAuthEmail}
      authPassword={authPassword} setAuthPassword={setAuthPassword}
      authError={authError} setAuthError={setAuthError}
      authBusy={authBusy} setAuthBusy={setAuthBusy}
      handleAuth={handleAuth}
    />
  );

  // api key setup
  if (!anthropicKey) return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 24, padding: 28, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>ONE-TIME SETUP</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Add Anthropic API Key</div>
        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>
          Get your key from <strong>console.anthropic.com</strong> → API Keys. Stored locally on your device only.
        </div>
        <input value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="sk-ant-api03-..."
          style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 12, fontFamily: "monospace", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />
        <button onClick={() => { saveAnthropicKey(keyInput); setAnthropicKey(keyInput); }} disabled={!keyInput.startsWith("sk-")}
          style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: keyInput.startsWith("sk-") ? "#6366F1" : "#E2E8F0", color: keyInput.startsWith("sk-") ? "#fff" : "#94A3B8", fontWeight: 700, fontSize: 14, cursor: keyInput.startsWith("sk-") ? "pointer" : "not-allowed" }}>
          Save & Continue →
        </button>
      </div>
    </div>
  );

  // settings view
  if (view === "settings") return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button onClick={() => setView("list")} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer", fontSize: 18 }}>←</button>
        <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>Settings</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 12, letterSpacing: 0.5 }}>ANTHROPIC API KEY</div>
          <input value={keyInput || anthropicKey} onChange={e => setKeyInput(e.target.value)} placeholder="sk-ant-api03-..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 11, fontFamily: "monospace", outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
          <button onClick={() => { const k = keyInput || anthropicKey; saveAnthropicKey(k); setAnthropicKey(k); alert("Saved!"); }}
            style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Save Key
          </button>
        </div>

        {/* Import WhatsApp Chat */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>📥 IMPORT WHATSAPP CHATS</div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12, lineHeight: 1.6 }}>
            Export each chat as a .txt file (WhatsApp → Chat → ⋮ → More → Export → Without media).<br/>
            Each file = one customer. Claude extracts specs, stage, budget automatically.
          </div>

          {/* Hidden file inputs */}
          <input type="file" accept=".txt" ref={chatFileInputRef} style={{ display: "none" }}
            onChange={e => { if (e.target.files?.[0]) importSingleChatFile(e.target.files[0]); e.target.value = ""; }} />
          <input type="file" accept=".txt" multiple ref={chatFilesInputRef} style={{ display: "none" }}
            onChange={e => { if (e.target.files?.length) importMultipleChatFiles(Array.from(e.target.files)); e.target.value = ""; }} />

          {/* Progress bar for multiple import */}
          {importingMultiple && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#EEF2FF", marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: "#6366F1", fontWeight: 700, marginBottom: 6 }}>
                Processing {importMultipleProgress.current} of {importMultipleProgress.total} chats...
              </div>
              <div style={{ height: 4, borderRadius: 4, background: "#C7D2FE" }}>
                <div style={{ height: "100%", borderRadius: 4, background: "#6366F1", width: `${importMultipleProgress.total ? (importMultipleProgress.current / importMultipleProgress.total) * 100 : 0}%`, transition: "width 0.3s" }} />
              </div>
            </div>
          )}

          {/* Multiple import result */}
          {importMultipleResult && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "#ECFDF5", marginBottom: 10, fontSize: 13, fontWeight: 700, color: "#10B981" }}>
              ✅ {importMultipleResult.created}/{importMultipleResult.total} chats imported{importMultipleResult.failed > 0 ? ` (${importMultipleResult.failed} failed)` : ""}
            </div>
          )}

          {/* Single import result */}
          {importResult && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: importResult.success ? "#ECFDF5" : "#FEF2F2", color: importResult.success ? "#10B981" : "#EF4444", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
              {importResult.message}
            </div>
          )}

          {/* File import buttons */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button onClick={() => { setImportResult(null); chatFileInputRef.current?.click(); }}
              disabled={importing || importingMultiple || !anthropicKey}
              style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", background: importing || importingMultiple || !anthropicKey ? "#E2E8F0" : "#6366F1", color: importing || importingMultiple || !anthropicKey ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {importing ? "⏳ Importing..." : "📄 One Chat File"}
            </button>
            <button onClick={() => { setImportMultipleResult(null); chatFilesInputRef.current?.click(); }}
              disabled={importing || importingMultiple || !anthropicKey}
              style={{ flex: 1, padding: 12, borderRadius: 10, border: "none", background: importing || importingMultiple || !anthropicKey ? "#E2E8F0" : "#10B981", color: importing || importingMultiple || !anthropicKey ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {importingMultiple ? "⏳ Processing..." : "📂 Multiple Files"}
            </button>
          </div>

          {/* Paste fallback */}
          <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#CBD5E1", marginBottom: 8, letterSpacing: 0.5 }}>OR PASTE CHAT TEXT (FALLBACK)</div>
            <textarea value={importText} onChange={e => setImportText(e.target.value)}
              placeholder="Paste WhatsApp chat text here..."
              rows={4}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 8, lineHeight: 1.5 }} />
            <button onClick={importWhatsAppChat} disabled={importing || !importText.trim() || !anthropicKey}
              style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: importing || !importText.trim() || !anthropicKey ? "#E2E8F0" : "#6366F1", color: importing || !importText.trim() || !anthropicKey ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {importing ? "⏳ Importing..." : "Import from Pasted Text →"}
            </button>
          </div>

          {!anthropicKey && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 8, textAlign: "center" }}>Add Anthropic API key above first</div>}
        </div>

        {/* Export Data */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>📤 EXPORT DATA</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12, lineHeight: 1.5 }}>
            Download all your customers and deals as JSON + CSV backup.
          </div>
          <button onClick={exportData} disabled={exporting}
            style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: exporting ? "#E2E8F0" : "#10B981", color: exporting ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 13, cursor: exporting ? "not-allowed" : "pointer" }}>
            {exporting ? "⏳ Exporting..." : "📥 Download Backup (JSON + CSV)"}
          </button>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>ACCOUNT</div>
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 12 }}>{session?.user?.email}</div>
          <button onClick={handleLogoutWithUI}
            style={{ width: "100%", padding: 11, borderRadius: 10, border: "1px solid #FEE2E2", background: "#fff", color: "#EF4444", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );

  // add customer view
  if (view === "add") return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button onClick={() => setView("list")} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", cursor: "pointer", fontSize: 18 }}>←</button>
        <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>New Customer</span>
      </div>
      <div style={{ background: "#fff", borderRadius: 20, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 14 }}>
        {[
          { label: "NAME *", key: "name", placeholder: "e.g. Ali Hassan", type: "text" },
          { label: "WHATSAPP NUMBER", key: "number", placeholder: "e.g. 971501234567", type: "tel" },
        ].map(f => (
          <div key={f.key}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 5, letterSpacing: 0.5 }}>{f.label}</div>
            <input value={newCustomer[f.key]} onChange={e => setNewCustomer(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} type={f.type}
              style={{ width: "100%", padding: "11px 13px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          </div>
        ))}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 5, letterSpacing: 0.5 }}>NOTES</div>
          <textarea value={newCustomer.notes} onChange={e => setNewCustomer(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. Prefers MacBook, pays cash, lives in Sharjah..." rows={3}
            style={{ width: "100%", padding: "11px 13px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        <button onClick={addCustomer} disabled={!newCustomer.name.trim()}
          style={{ padding: 14, borderRadius: 14, border: "none", background: newCustomer.name.trim() ? "#6366F1" : "#E2E8F0", color: newCustomer.name.trim() ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 15, cursor: newCustomer.name.trim() ? "pointer" : "not-allowed" }}>
          Add Customer →
        </button>
      </div>
    </div>
  );

  // detail view
  if (view === "detail" && activeCustomer) {
    return (
      <ChatDetailView
        messages={messages}
        setMessages={setMessages}
        msgLoading={msgLoading}
        incomingText={incomingText}
        setIncomingText={setIncomingText}
        replyMode={replyMode}
        setReplyMode={setReplyMode}
        replyingToId={replyingToId}
        setReplyingToId={setReplyingToId}
        directReplyText={directReplyText}
        setDirectReplyText={setDirectReplyText}
        generatedReply={generatedReply}
        setGeneratedReply={setGeneratedReply}
        generatedReplyLoading={generatedReplyLoading}
        setGeneratedReplyLoading={setGeneratedReplyLoading}
        editingGenerated={editingGenerated}
        setEditingGenerated={setEditingGenerated}
        copied={copied}
        setCopied={setCopied}
        editSent={editSent}
        setEditSent={setEditSent}
        editingName={editingName}
        setEditingName={setEditingName}
        nameInput={nameInput}
        setNameInput={setNameInput}
        editingNumber={editingNumber}
        setEditingNumber={setEditingNumber}
        numberInput={numberInput}
        setNumberInput={setNumberInput}
        outreachMode={outreachMode}
        setOutreachMode={setOutreachMode}
        outreachReason={outreachReason}
        setOutreachReason={setOutreachReason}
        outreachCustom={outreachCustom}
        setOutreachCustom={setOutreachCustom}
        showSupplierReply={showSupplierReply}
        setShowSupplierReply={setShowSupplierReply}
        supplierReplyCtx={supplierReplyCtx}
        setSupplierReplyCtx={setSupplierReplyCtx}
        supplierReplyGmail={supplierReplyGmail}
        setSupplierReplyGmail={setSupplierReplyGmail}
        supplierReplyWA={supplierReplyWA}
        setSupplierReplyWA={setSupplierReplyWA}
        supplierReplyLoading={supplierReplyLoading}
        setSupplierReplyLoading={setSupplierReplyLoading}
        copiedSupGmail={copiedSupGmail}
        setCopiedSupGmail={setCopiedSupGmail}
        copiedSupWA={copiedSupWA}
        setCopiedSupWA={setCopiedSupWA}
        anthropicKey={anthropicKey}
        cachedStock={cachedStock}
        bottomRef={bottomRef}
        NAV_TABS={NAV_TABS}
        activeTab={activeTab}
        stock={stock}
        loadStock={loadStock}
        refreshCachedStock={refreshCachedStock}
        loadTodaySales={loadTodaySales}
        moveStage={moveStage}
        handleConfirmSale={handleConfirmSale}
        handleReserveDevice={handleReserveDevice}
        addIncomingMessage={addIncomingMessage}
        generateAIReply={generateAIReply}
        sendAIReply={sendAIReply}
        sendDirectReply={sendDirectReply}
        generateOpeningMessage={generateOpeningMessage}
        confirmSent={confirmSent}
        markNotSent={markNotSent}
        copyMsg={copyMsg}
        generateOutreach={generateOutreach}
        generateSupplierReply={generateSupplierReply}
        showToast={showToast}
        setStockSearch={setStockSearch}
        setStockFilter={setStockFilter}
      />
    );
  }

  // list view
  return (
    <div style={isMobile
      ? { minHeight: "100vh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }
      : { minHeight: "100vh", background: "#F8FAFC", display: "flex" }}>

      {/* ── Desktop sidebar ── */}
      {!isMobile && (
        <div style={{ width: 280, flexShrink: 0, background: "#fff", borderRight: "1px solid #F1F5F9", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 40 }}>
          {/* Logo */}
          <div style={{ padding: "22px 20px 18px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg,#6366F1,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>💻</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>JNP CRM</div>
                <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, letterSpacing: 0.5 }}>LAPTOP FOR LESS</div>
              </div>
            </div>
          </div>
          {/* Nav items */}
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
          {/* User info */}
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
      {/* top bar — contacts/traders header (hidden on desktop for other tabs) */}
      {(isMobile || activeTab === "customers" || activeTab === "traders") && (
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
      )}
      {/* ── HOME / DASHBOARD TAB ── */}
      {activeTab === "home" && (
        <HomeTab
          customers={customers}
          stock={stock}
          tasks={tasks}
          sourcingAlerts={sourcingAlerts}
          setView={setView}
          setActiveCustomerId={setActiveCustomerId}
          setActiveDealId={setActiveDealId}
          setPendingSuggestion={setPendingSuggestion}
          setShowQuickSale={setShowQuickSale}
          setStockFilter={setStockFilter}
          setFilter={setFilter}
          setShowAddStock={setShowAddStock}
          setEditingStock={setEditingStock}
          setStockForm={setStockForm}
          openDeals={openDeals}
          closedDeals={closedDeals}
          revenue={revenue}
          setSearch={setSearch}
        />
      )}

      {/* ── CUSTOMERS TAB ── */}
      {activeTab === "customers" && (
        <CustomersTab
          openDeals={openDeals}
          closedDeals={closedDeals}
          revenue={revenue}
        />
      )}

      {/* ── STOCK TAB ── */}
      {activeTab === "stock" && (
        <StockTab
          customers={customers}
          showUpgrade={showUpgrade}
          setShowUpgrade={setShowUpgrade}
          upgradeTarget={upgradeTarget}
          setUpgradeTarget={setUpgradeTarget}
          showQuickSale={showQuickSale}
          setShowQuickSale={setShowQuickSale}
          quickSalePrefill={quickSalePrefill}
          setQuickSalePrefill={setQuickSalePrefill}
          openBroadcast={openBroadcast}
          handleUpgradeApply={handleUpgradeApply}
          loadCustomers={loadCustomers}
          loadTodaySales={loadTodaySales}
          setSaleReceiptData={setSaleReceiptData}
          setReceiptEditName={setReceiptEditName}
          setShowSaleReceipt={setShowSaleReceipt}
          filteredStock={filteredStock}
        />
      )}

      {/* ── TRADERS TAB ── */}

            {/* ── TRADERS TAB ── */}
      {activeTab === "traders" && (
        <TradersTab
          anthropicKey={anthropicKey}
          stock={stock}
          customers={customers}
          activeDeal={activeDeal}
        />
      )}

      {/* ── ASK CLAUDE TAB ── */}
      {activeTab === "ask" && (
        <AskClaudeTab
          anthropicKey={anthropicKey}
          askMessages={askMessages}
          setAskMessages={setAskMessages}
          askInput={askInput}
          setAskInput={setAskInput}
          askLoading={askLoading}
          setAskLoading={setAskLoading}
          askBottomRef={askBottomRef}
          sendAskMessage={sendAskMessage}
        />
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

      {/* ── BROADCAST MODAL ── */}
      <BroadcastModal
        showBroadcast={showBroadcast} setShowBroadcast={setShowBroadcast}
        broadcastItem={broadcastItem} setBroadcastItem={setBroadcastItem}
        broadcastClients={broadcastClients} setBroadcastClients={setBroadcastClients}
        broadcastSelected={broadcastSelected} setBroadcastSelected={setBroadcastSelected}
        broadcastMessages={broadcastMessages} setBroadcastMessages={setBroadcastMessages}
        broadcastLoading={broadcastLoading}
        broadcastStep={broadcastStep} setBroadcastStep={setBroadcastStep}
        broadcastSent={broadcastSent} setBroadcastSent={setBroadcastSent}
        generateBroadcastMessages={generateBroadcastMessages}
      />

      {/* ── SIDE DRAWER ── */}
      <SideDrawer handleLogout={handleLogoutWithUI} />

      {/* ── SALE RECEIPT MODAL ── */}
      <ReceiptModal />

      {/* ── EDIT RESERVATION MODAL ── */}
      {showEditReservation && editReservationItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>✏️ Edit Reservation</div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                    {[editReservationItem.brand, editReservationItem.model].filter(Boolean).join(" ") || "Device"}
                  </div>
                </div>
                <button onClick={() => setShowEditReservation(false)}
                  style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { label: "AGREED PRICE (AED)", key: "agreedPrice", type: "number" },
                  { label: "PICKUP DATE", key: "pickupDate", type: "date" },
                ].map(({ label, key, type }) => (
                  <div key={key}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                    <input type={type} value={editReservationForm[key]}
                      onChange={e => setEditReservationForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>DEPOSIT PAID (AED)</div>
                  <input type="number" value={editReservationForm.depositAmount}
                    onChange={e => {
                      const dep = Number(e.target.value) || 0;
                      const bal = Math.max(0, (Number(editReservationForm.agreedPrice) || 0) - dep);
                      setEditReservationForm(f => ({ ...f, depositAmount: e.target.value, balanceDue: String(bal) }));
                    }}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>BALANCE DUE (AED)</div>
                  <input type="number" value={editReservationForm.balanceDue}
                    onChange={e => setEditReservationForm(f => ({ ...f, balanceDue: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>NOTES</div>
                  <input value={editReservationForm.notes}
                    onChange={e => setEditReservationForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="e.g. Client confirmed via WhatsApp"
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setShowEditReservation(false)}
                    style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={async () => {
                    const agreedN = Number(editReservationForm.agreedPrice) || 0;
                    const depositN = Number(editReservationForm.depositAmount) || 0;
                    const balanceN = Number(editReservationForm.balanceDue) || 0;
                    await supabase.from("stock").update({
                      pickup_date: editReservationForm.pickupDate || null,
                      sold_price: agreedN || null,
                    }).eq("id", editReservationItem.id);
                    const { data: dealData } = await supabase.from("deals")
                      .select("id").eq("stock_item_id", editReservationItem.id).single();
                    if (dealData) {
                      await supabase.from("deals").update({
                        value: agreedN || null,
                        deposit_amount: depositN || null,
                        balance_due: balanceN || null,
                        pickup_date: editReservationForm.pickupDate || null,
                        reservation_notes: editReservationForm.notes || null,
                      }).eq("id", dealData.id);
                    }
                    setShowEditReservation(false);
                    loadStock();
                    loadCustomers();
                  }}
                    style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                    Save Changes
                  </button>
                </div>
                <button onClick={async () => {
                  if (!window.confirm("Release this reservation? Device will return to available stock.")) return;
                  try {
                    const deal = editReservationItem;

                    // Release all reserved stock items linked to this deal
                    const { data: dealItems } = await supabase
                      .from("deal_items")
                      .select("*")
                      .eq("deal_id", deal.id);

                    for (const item of (dealItems || [])) {
                      if (item.item_type === "device" && item.stock_id) {
                        await supabase.from("stock").update({
                          status: "available",
                          reserved_for_customer_id: null,
                          reserved_at: null,
                          pickup_date: null,
                          sold_price: null,
                        }).eq("id", item.stock_id);
                      }
                    }

                    // Also try to release via stock_item_id on deal directly
                    if (deal.stock_item_id) {
                      await supabase.from("stock").update({
                        status: "available",
                        reserved_for_customer_id: null,
                        reserved_at: null,
                        pickup_date: null,
                        sold_price: null,
                      }).eq("id", deal.stock_item_id);
                    }

                    // Delete deal items
                    await supabase.from("deal_items").delete().eq("deal_id", deal.id);

                    // Reset the deal stage
                    await supabase.from("deals").update({
                      stage: "device_found",
                      value: null,
                      deposit_amount: null,
                      balance_due: null,
                      pickup_date: null,
                      stock_item_id: null,
                    }).eq("id", deal.id);

                    setShowEditReservation(false);
                    loadStock();
                    loadCustomers();
                    loadReservedDeals();
                    showToast("Device released back to stock 🔓");
                  } catch (e) {
                    alert("Error releasing reservation: " + (e.message || "Unknown error"));
                  }
                }}
                  style={{ padding: 12, borderRadius: 12, border: "1.5px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  🔓 Release Reservation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Complete Reservation modal ── */}
      {showCompleteReservation && completingDeal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>✅ Complete Sale</div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{completingDeal.customers?.name || "Customer"}</div>
                </div>
                <button onClick={() => setShowCompleteReservation(false)}
                  style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(completingDeal.deal_items || []).map((item, i) => (
                    <div key={item.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#F8FAFC", borderRadius: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                        {item.item_type === "device"
                          ? ([item.brand, item.model].filter(Boolean).join(" ") || "Device")
                          : `🔧 ${item.category || "Part"}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#6366F1" }}>AED {Number(item.agreed_price || 0).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding: "12px 14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569", marginBottom: 6 }}>
                    <span>Total</span>
                    <span style={{ fontWeight: 700 }}>AED {Number(completingDeal.value || 0).toLocaleString()}</span>
                  </div>
                  {completingDeal.deposit_amount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#F59E0B", marginBottom: 6 }}>
                      <span>Deposit paid</span>
                      <span style={{ fontWeight: 700 }}>AED {Number(completingDeal.deposit_amount).toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: "#10B981", borderTop: "1px solid #E2E8F0", paddingTop: 8 }}>
                    <span>Balance due today</span>
                    <span>AED {Number(completingDeal.balance_due || completingDeal.value || 0).toLocaleString()}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>PAYMENT METHOD</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["Cash", "Bank Transfer", "Partial"].map(m => (
                      <button key={m} onClick={() => setCompletionPaymentMethod(m)}
                        style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                                 background: completionPaymentMethod === m ? "#6366F1" : "#F1F5F9",
                                 color: completionPaymentMethod === m ? "#fff" : "#64748B" }}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={async () => {
                  try {
                    const soldAt = new Date().toISOString();
                    const items = completingDeal.deal_items || [];
                    for (const item of items) {
                      if (item.item_type === "device" && item.stock_id) {
                        await supabase.from("stock").update({
                          status: "sold",
                          sold_at: soldAt,
                          sold_to_customer_id: completingDeal.customers?.id || null,
                        }).eq("id", item.stock_id);
                      }
                    }
                    await supabase.from("deals").update({
                      stage: "closed",
                      closed_at: soldAt,
                      payment_method: completionPaymentMethod,
                      payment_status: "received",
                    }).eq("id", completingDeal.id);
                    setShowCompleteReservation(false);
                    setCompletingDeal(null);
                    loadReservedDeals();
                    loadStock();
                    loadCustomers();
                    loadTodaySales();
                    const receiptItems = items.map(i => ({
                      label: i.item_type === "device"
                        ? ([i.brand, i.model].filter(Boolean).join(" ") || "Device")
                        : `${i.category || "Part"}${i.specs ? ` · ${i.specs}` : ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`,
                      price: Number(i.agreed_price || 0),
                    }));
                    setSaleReceiptData({
                      type: "reserved",
                      date: soldAt,
                      customerName: completingDeal.customers?.name || "Customer",
                      customerNumber: completingDeal.customers?.number || null,
                      price: Number(completingDeal.value || 0),
                      depositAmount: Number(completingDeal.deposit_amount || 0),
                      balanceDue: Number(completingDeal.balance_due || 0),
                      paymentMethod: completionPaymentMethod,
                      items: receiptItems,
                    });
                    setReceiptEditName(completingDeal.customers?.name || "Customer");
                    setShowSaleReceipt(true);
                  } catch (e) {
                    alert("Error completing sale: " + (e.message || "Unknown error"));
                  }
                }}
                  style={{ padding: 14, borderRadius: 12, border: "none", background: "#10B981", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                  ✅ Complete Sale — AED {Number(completingDeal.balance_due || completingDeal.value || 0).toLocaleString()} Due
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
      {showContactModal && (
        <ContactModal
          defaultType={contactModalPreType}
          onClose={() => { setShowContactModal(false); setContactModalPreType(null); }}
          onCreated={async (customer, deal) => {
            await loadCustomers();
            setShowContactModal(false);
            setContactModalPreType(null);
            if (customer) {
              setActiveCustomerId(customer.id);
              setActiveDealId(deal?.id || null);
              setView("detail");
              setActiveTab("customers");
            }
          }}
        />
      )}

      {/* bottom tab bar — mobile only */}
      <BottomNav NAV_TABS={NAV_TABS} sourcingAlerts={sourcingAlerts} />
      </div>{/* end content area */}
    </div>
  );
}
