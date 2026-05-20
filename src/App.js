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

import { useCustomers } from "./context/CustomerContext";

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

  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login"); // login | signup
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [anthropicKey, setAnthropicKey] = useState(getAnthropicKey);
  const [keyInput, setKeyInput] = useState("");

  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgInput, setMsgInput] = useState("");
  const [chatMode, setChatMode] = useState("type"); // kept for compat
  // ── new chat flow ──
  const [incomingText,         setIncomingText]         = useState("");
  const [replyMode,            setReplyMode]            = useState(null); // null | "myself" | "ai"
  const [replyingToId,         setReplyingToId]         = useState(null);
  const [directReplyText,      setDirectReplyText]      = useState("");
  const [generatedReply,       setGeneratedReply]       = useState("");
  const [generatedReplyLoading,setGeneratedReplyLoading]= useState(false);
  const [editingGenerated,     setEditingGenerated]     = useState(false);
  const [copied, setCopied] = useState(null);
  const [editSent, setEditSent] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [editingNumber, setEditingNumber] = useState(false);
  const [numberInput, setNumberInput] = useState('');
  const [outreachMode, setOutreachMode] = useState(false);
  const [outreachReason, setOutreachReason] = useState("");
  const [outreachCustom, setOutreachCustom] = useState("");
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importingMultiple, setImportingMultiple] = useState(false);
  const [importMultipleProgress, setImportMultipleProgress] = useState({ current: 0, total: 0 });
  const [importMultipleResult, setImportMultipleResult] = useState(null);
  const chatFileInputRef = useRef(null);
  const chatFilesInputRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const stockFileInputRef = useRef(null);

  const [stock, setStock] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [stockFilter, setStockFilter] = useState("available");
  const [stockSearch, setStockSearch] = useState("");
  const [expandedStockId, setExpandedStockId] = useState(null);
  const [stockPhotoUploading, setStockPhotoUploading] = useState(false);
  const [stockForm, setStockForm] = useState(EMPTY_STOCK);
  const [showImportStock, setShowImportStock] = useState(false);
  const [importPreview, setImportPreview] = useState(null); // array of mapped rows
  const [importingStock, setImportingStock] = useState(false);
  const [importStockResult, setImportStockResult] = useState(null);
  const importStockFileRef = useRef(null);
  const [cachedStock, setCachedStock] = useState([]);
  const [stockView, setStockView] = useState("devices"); // "devices" | "parts"
  const [parts, setParts] = useState([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [showAddPart, setShowAddPart] = useState(false);
  const [editingPart, setEditingPart] = useState(null);
  const EMPTY_PART = { category: "RAM", compatible_with: "", specs: "", condition: "Used", quantity: 1, cost_price: "", sell_price: "", source: "", notes: "" };
  const [partForm, setPartForm] = useState(EMPTY_PART);
  const PART_CATEGORIES = ["RAM", "SSD", "HDD", "Screen", "Battery", "Charger", "Keyboard", "Trackpad", "Other"];
  const PART_ICONS = { RAM: "🧠", SSD: "💾", HDD: "💿", Screen: "🖥️", Battery: "🔋", Charger: "🔌", Keyboard: "⌨️", Trackpad: "🖱️", Other: "🔧" };
  const [askMessages, setAskMessages] = useState([]);
  const [askInput, setAskInput] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const askBottomRef = useRef(null);
  const [toast, setToast] = useState(null);

  // ── marketing ──
  const [activeMarketingTab, setActiveMarketingTab] = useState("today");
  const [marketingDevices, setMarketingDevices] = useState([]);

  // ── traders ──
  const [traderListings, setTraderListings] = useState([]);
  const [traderListingsLoading, setTraderListingsLoading] = useState(false);
  const [traderSection, setTraderSection] = useState("inventory");
  const [traderSearch, setTraderSearch] = useState("");
  const [traderFilter, setTraderFilter] = useState("all");
  const [showImportTrader, setShowImportTrader] = useState(false);
  const [traderGroup, setTraderGroup] = useState("");
  const [traderChatText, setTraderChatText] = useState("");
  const [traderImportLoading, setTraderImportLoading] = useState(false);
  const [traderImportPreview, setTraderImportPreview] = useState(null);
  const [savingTraderListings, setSavingTraderListings] = useState(false);
  const [traderImportResult, setTraderImportResult] = useState(null);
  const [showTraderMatches, setShowTraderMatches] = useState(false);
  const [showCheckTraders, setShowCheckTraders] = useState(false);
  const [checkTradersResults, setCheckTradersResults] = useState([]);
  const [checkTradersLoading, setCheckTradersLoading] = useState(false);

  // ── receipt ──
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptPaymentMethod, setReceiptPaymentMethod] = useState("Cash");

  // ── edit reservation ──
  const [showEditReservation,  setShowEditReservation]  = useState(false);
  const [editReservationItem,  setEditReservationItem]  = useState(null);
  const [editReservationForm,  setEditReservationForm]  = useState({ agreedPrice: "", pickupDate: "", depositAmount: "", balanceDue: "", notes: "" });

  // ── side drawer / sales history ──
  const [showSideDrawer,       setShowSideDrawer]       = useState(false);
  const [salesHistory,         setSalesHistory]         = useState([]);
  const [salesHistoryLoading,  setSalesHistoryLoading]  = useState(false);
  const [salesFilter,          setSalesFilter]          = useState("month");
  const [showSaleReceipt,      setShowSaleReceipt]      = useState(false);
  const [saleReceiptData,      setSaleReceiptData]      = useState(null);
  const [expandedSaleId,       setExpandedSaleId]       = useState(null);
  const [receiptEditName,      setReceiptEditName]      = useState("");

  // ── broadcast ──
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastItem, setBroadcastItem] = useState(null);
  const [broadcastClients, setBroadcastClients] = useState([]);
  const [broadcastSelected, setBroadcastSelected] = useState(new Set());
  const [broadcastMessages, setBroadcastMessages] = useState([]);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastStep, setBroadcastStep] = useState("clients");
  const [broadcastSent, setBroadcastSent] = useState(new Set());

  // ── quick sale ──
  const [showQuickSale,    setShowQuickSale]    = useState(false);
  const [quickSalePrefill, setQuickSalePrefill] = useState(null);
  const [todaySales,       setTodaySales]       = useState({ total: 0, whatsapp: 0, walkin: 0 });

  // ── reservation ──
  const [showReservation, setShowReservation] = useState(false);
  const [reservedDeals, setReservedDeals] = useState([]);
  const [reservedDealsLoading, setReservedDealsLoading] = useState(false);
  const [expandedReservedDeal, setExpandedReservedDeal] = useState(null);
  const [showCompleteReservation, setShowCompleteReservation] = useState(false);
  const [completingDeal, setCompletingDeal] = useState(null);
  const [completionPaymentMethod, setCompletionPaymentMethod] = useState("Cash");

  // ── spec upgrade ──
  const [showUpgrade,   setShowUpgrade]   = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState(null);

  // ── link stock (close deal) ──
  const [showLinkStock, setShowLinkStock] = useState(false);
  const [linkStockDeal, setLinkStockDeal] = useState(null);

  // ── sold deal map (stockItemId → deal, for sold view) ──
  const [soldDealMap, setSoldDealMap] = useState({});

  // ── part sale ──
  const [showPartSale,     setShowPartSale]     = useState(false);
  const [partSaleTarget,   setPartSaleTarget]   = useState(null);
  const [partsSold,        setPartsSold]        = useState([]);
  const [partsSoldLoading, setPartsSoldLoading] = useState(false);
  const [partsRevMTD,      setPartsRevMTD]      = useState(0);

  // ── sourcing alerts for dashboard ──
  const sourcingAlerts = useSourcingAlerts();

  // ── supplier reply generator ──
  const [showSupplierReply,   setShowSupplierReply]   = useState(false);
  const [supplierReplyCtx,    setSupplierReplyCtx]    = useState("");
  const [supplierReplyGmail,  setSupplierReplyGmail]  = useState("");
  const [supplierReplyWA,     setSupplierReplyWA]     = useState("");
  const [supplierReplyLoading,setSupplierReplyLoading]= useState(false);
  const [copiedSupGmail,      setCopiedSupGmail]      = useState(false);
  const [copiedSupWA,         setCopiedSupWA]         = useState(false);

  // ── auth ──
  useEffect(() => {
    const stored = localStorage.getItem('jnp_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.access_token) {
          // Restore session into supabase client
          supabase.auth.setSession({
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token || '',
          }).catch(() => {});
          setSession(parsed);
          setAuthLoading(false);
          return;
        }
      } catch {}
    }
    setSession(null);
    setAuthLoading(false);
  }, []);

  const loadStock = useCallback(async () => {
    setStockLoading(true);
    const { data } = await supabase.from("stock").select("*").order("created_at", { ascending: false });
    setStock(data || []);
    setStockLoading(false);
  }, []);

  const refreshCachedStock = useCallback(async () => {
    const { data } = await supabase
      .from("stock")
      .select("brand, model, processor, ram, ssd, screen, condition, charger, box, activation_lock, max_price, min_price, cost_price, created_at")
      .eq("status", "available")
      .order("brand");
    setCachedStock(data || []);
  }, []);

  const loadPartsRevMTD = useCallback(async () => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const { data } = await supabase.from("deals")
      .select("value").eq("sale_type", "parts").eq("stage", "closed")
      .gte("closed_at", monthStart.toISOString());
    setPartsRevMTD((data || []).reduce((s, d) => s + (Number(d.value) || 0), 0));
  }, []);

  const loadSalesHistory = useCallback(async () => {
    setSalesHistoryLoading(true);
    const now = new Date();
    let fromDate = null;
    if (salesFilter === "today") {
      fromDate = new Date(); fromDate.setHours(0,0,0,0);
    } else if (salesFilter === "week") {
      fromDate = new Date(now - 7 * 86400000);
    } else if (salesFilter === "month") {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const dealQuery = supabase.from("deals").select("*, customers(name, number), deal_items(*)").eq("stage","closed").order("closed_at",{ascending:false});
    if (fromDate) dealQuery.gte("closed_at", fromDate.toISOString());
    const { data: dealSales } = await dealQuery;

    const walkinQuery = supabase.from("deals").select("*").eq("stage","closed").eq("sale_type","walkin").order("closed_at",{ascending:false});
    if (fromDate) walkinQuery.gte("closed_at", fromDate.toISOString());
    const { data: walkinSales } = await walkinQuery;

    const partsQuery = supabase.from("parts_sales").select("*").order("sold_at",{ascending:false});
    if (fromDate) partsQuery.gte("sold_at", fromDate.toISOString());
    const { data: partsSalesData } = await partsQuery;

    const stockIds = (dealSales || []).map(d => d.stock_item_id).filter(Boolean);
    let stockMap = {};
    if (stockIds.length) {
      const { data: stockItems } = await supabase.from("stock").select("id,brand,model,processor,ram,ssd,condition,serial_number").in("id",stockIds);
      (stockItems || []).forEach(s => { stockMap[s.id] = s; });
    }

    const combined = [];
    (dealSales || []).forEach(d => {
      const stock = stockMap[d.stock_item_id] || {};
      combined.push({
        id: d.id, type: d.sale_type === "walkin" ? "walkin" : "device", date: d.closed_at,
        customerName: d.customers?.name || d.walk_in_name || "Walk-in Customer",
        customerNumber: d.customers?.number || null,
        device: [stock.brand, stock.model].filter(Boolean).join(" ") || "Device",
        specs: [stock.ram, stock.ssd, stock.condition].filter(Boolean).join(" · "),
        serialNumber: stock.serial_number || null,
        price: d.value || 0, paymentMethod: d.payment_method || "Cash",
        depositAmount: d.deposit_amount || 0, balanceDue: d.balance_due || 0,
        brand: stock.brand, model: stock.model, processor: stock.processor,
        ram: stock.ram, ssd: stock.ssd, condition: stock.condition,
        items: (d.deal_items || []).map(i => ({
          label: i.item_type === "device"
            ? ([i.brand, i.model].filter(Boolean).join(" ") || "Device")
            : `${i.category || "Part"}${i.specs ? ` · ${i.specs}` : ""}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`,
          price: Number(i.agreed_price || 0),
        })),
      });
    });
    (walkinSales || []).forEach(d => {
      if (d.stock_item_id) return;
      combined.push({
        id: d.id, type: "walkin", date: d.closed_at,
        customerName: d.walk_in_name || "Walk-in Customer",
        customerNumber: d.walk_in_number || null,
        device: [d.brand, d.model].filter(Boolean).join(" ") || "Device",
        specs: [d.ram, d.storage, d.condition].filter(Boolean).join(" · "),
        serialNumber: null, price: d.value || 0, paymentMethod: d.payment_method || "Cash",
        brand: d.brand, model: d.model, processor: null, ram: d.ram, ssd: d.storage, condition: d.condition,
      });
    });
    (partsSalesData || []).forEach(p => {
      combined.push({
        id: p.id, type: "part", date: p.sold_at,
        customerName: p.customer_name || "Walk-in Customer", customerNumber: null,
        device: [p.category, p.specs].filter(Boolean).join(" — "),
        specs: p.compatible_with || "", serialNumber: null,
        price: p.total_revenue || 0, paymentMethod: p.payment_method || "Cash",
        quantity: p.quantity_sold || 1,
      });
    });
    combined.sort((a, b) => new Date(b.date) - new Date(a.date));
    setSalesHistory(combined);
    setSalesHistoryLoading(false);
  }, [salesFilter]);

  const loadReservedDeals = useCallback(async () => {
    setReservedDealsLoading(true);
    const { data: deals } = await supabase
      .from("deals")
      .select("*, customers(id, name, number), deal_items(*)")
      .eq("stage", "confirmed_pending_pickup")
      .order("created_at", { ascending: false });
    setReservedDeals(deals || []);
    setReservedDealsLoading(false);
  }, []);

  const loadTodaySales = useCallback(async () => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { data } = await supabase.from("deals")
      .select("sale_type, closed_at").eq("stage", "closed")
      .gte("closed_at", todayStart.toISOString());
    const deals = data || [];
    setTodaySales({
      total:    deals.length,
      whatsapp: deals.filter(d => !d.sale_type || d.sale_type === "whatsapp").length,
      walkin:   deals.filter(d => d.sale_type === "walkin").length,
    });
  }, []);

  useEffect(() => { if (session) loadCustomers(); }, [session, loadCustomers]);
  useEffect(() => { if (session) { loadStock(); refreshCachedStock(); loadTodaySales(); loadPartsRevMTD(); } }, [session, loadStock, refreshCachedStock, loadTodaySales, loadPartsRevMTD]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    setChatMode("type"); setMsgInput("");
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

  // ── auth actions ──
  async function handleAuth() {
    setAuthBusy(true); setAuthError("");
    try {
      if (authMode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ 
          email: authEmail.trim(), 
          password: authPassword 
        });
        if (error) { setAuthError(error.message); setAuthBusy(false); return; }
        if (data?.session) {
          // Store session in localStorage manually
          localStorage.setItem('jnp_session', JSON.stringify(data.session));
          setSession(data.session);
        }
      } else {
        const { error } = await supabase.auth.signUp({ 
          email: authEmail.trim(), 
          password: authPassword 
        });
        if (error) { setAuthError(error.message); setAuthBusy(false); return; }
        setAuthError("✅ Account created! You can now sign in.");
        setAuthMode("login");
      }
    } catch (e) {
      setAuthError("Something went wrong. Please try again.");
    }
    setAuthBusy(false);
  }

  async function handleLogout() {
    localStorage.removeItem('jnp_session');
    await supabase.auth.signOut().catch(() => {});
    setSession(null);
    setCustomers([]); setView("list"); setActiveCustomerId(null); setActiveDealId(null);
  }

  async function handleReserveDevice() {
    let deal = activeDeal;
    if (!deal && activeCustomer?.id) {
      const { data: newD } = await supabase.from("deals").insert({
        customer_id: activeCustomer.id,
        stage: "new_inquiry",
        brand: "", model: "",
      }).select().single();
      if (newD) {
        deal = newD;
        setActiveDealId(newD.id);
        loadCustomers();
      }
    }
    if (!deal) return;
    setLinkStockDeal({ ...deal });
    setShowReservation(true);
  }

  async function handleConfirmSale() {
    if (activeDeal) {
      setLinkStockDeal({ ...activeDeal });
      setShowLinkStock(true);
      return;
    }
    if (!activeCustomer?.id) return;
    const { data: newD } = await supabase.from("deals").insert({
      customer_id: activeCustomer.id,
      stage: "new_inquiry",
      brand: "", model: "",
    }).select().single();
    if (newD) {
      setActiveDealId(newD.id);
      setLinkStockDeal({ ...newD });
      setShowLinkStock(true);
      loadCustomers();
    }
  }

  async function moveStage(stageId) {
    // Auto-create deal if none exists
    if (!activeDealId && activeCustomer?.id) {
      const { data: newDeal } = await supabase.from("deals").insert({
        customer_id: activeCustomer.id,
        stage: stageId,
        brand: "", model: "",
        ...(stageId === "closed" ? { closed_at: new Date().toISOString() } : {}),
      }).select().single();
      if (newDeal) {
        setActiveDealId(newDeal.id);
        await loadCustomers();
        if (stageId === "lost") setShowLossReason(true);
        if (stageId === "confirmed_pending_pickup") { setLinkStockDeal(newDeal); setShowReservation(true); }
        if (stageId === "closed") { setLinkStockDeal(newDeal); setShowLinkStock(true); }
      }
      return;
    }
    const fields = { stage: stageId };
    if (stageId === "closed") fields.closed_at = new Date().toISOString();
    await updateDeal(activeDealId, fields);
    const updatedDeals = activeCustomer.deals.map(d => d.id === activeDealId ? { ...d, ...fields } : d);
    await updateCustomer(activeCustomerId, { tier: autoTier(updatedDeals) });
    setPendingSuggestion(null);
    if (stageId === "lost") setShowLossReason(true);
    if (stageId === "confirmed_pending_pickup") { setLinkStockDeal({ ...activeDeal, stage: stageId }); setShowReservation(true); }
    if (stageId === "closed") { setLinkStockDeal({ ...activeDeal, ...fields }); setShowLinkStock(true); }
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

  // ── message actions ──

  // ── NEW CHAT FLOW FUNCTIONS ─────────────────────────────────────────────────

  // Step 1: add an incoming client message (saves as role=customer, shows LEFT)
  async function addIncomingMessage() {
    if (!incomingText.trim()) return;
    // Auto-create a deal if no active deal exists (e.g. new contact from floating button)
    let dealId = activeDealId;
    if (!dealId && activeCustomer?.id) {
      const { data: newDeal } = await supabase.from("deals").insert({
        customer_id: activeCustomer.id,
        stage: "new_inquiry",
        brand: "", model: "",
      }).select().single();
      if (newDeal) {
        dealId = newDeal.id;
        setActiveDealId(newDeal.id);
        await loadCustomers();
      }
    }
    if (!dealId) return;
    const content = incomingText.trim();
    setIncomingText("");
    const isVoice  = content.toLowerCase().startsWith("voice note:");
    const isUrgent = /urgent|today|asap|same day|need it now|quickly/i.test(content);
    const { data: msg } = await supabase.from("messages").insert({
      deal_id: activeDealId, role: "customer", content, is_voice: isVoice,
    }).select().single();
    if (msg) setMessages(prev => [...prev, msg]);
    if (isUrgent) await updateCustomer(activeCustomerId, { urgent: true });
    await updateCustomer(activeCustomerId, { last_active: new Date().toISOString() });
  }

  // Step 3b: call Claude with full conversation history, show result for review
  async function generateAIReply(triggerMsgId) {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setReplyingToId(triggerMsgId);
    setReplyMode("ai");
    setGeneratedReplyLoading(true);
    setGeneratedReply("");
    setEditingGenerated(false);

    const history = messages.map(m => ({
      role: m.role === "customer" ? "user" : "assistant",
      content: m.sent && m.sent !== "NOT_SENT" ? m.sent : m.content,
    }));

    const cType = activeCustomer?.contact_type || "client";
    const systemPrompt = cType === "trader"
      ? `You are helping Faisal Hadi at Laptop for Less UAE communicate with ${activeCustomer.name}, a local laptop trader. Keep messages short, direct and casual. Return JSON with only a "reply" field (WhatsApp style, max 3 lines).`
      : cType === "supplier"
      ? `You are helping Faisal Hadi at Laptop for Less UAE communicate with ${activeCustomer.name}, an international laptop supplier. Write professional business messages. Return JSON with only a "reply" field (formal, 2-4 sentences).`
      : buildSystemPromptFromCache(cachedStock); // clients and walk-ins

    try {
      const raw = await callClaude(anthropicKey, history, systemPrompt);
      const clean = raw.replace(/```json|```/g, "").trim();
      let parsed; try { parsed = JSON.parse(clean); } catch { parsed = { reply: raw }; }
      setGeneratedReply(parsed.reply || raw);
      // Update deal specs from AI analysis (clients and walk-ins)
      if ((cType === "client" || cType === "walkin") && parsed) {
        const specUpdate = {};
        if (parsed.brand && parsed.brand !== "unknown" && !activeDeal?.brand) specUpdate.brand = parsed.brand;
        if (parsed.model && parsed.model !== "unknown" && !activeDeal?.model) specUpdate.model = parsed.model;
        if (parsed.ram   && parsed.ram   !== "unknown") specUpdate.ram   = parsed.ram;
        if (parsed.storage && parsed.storage !== "unknown") specUpdate.storage = parsed.storage;
        if (parsed.condition && parsed.condition !== "unknown") specUpdate.condition = parsed.condition;
        if (parsed.budget) specUpdate.budget = parsed.budget;
        if (Object.keys(specUpdate).length) await updateDeal(activeDealId, specUpdate);
        if (parsed.suggestedStage && parsed.suggestedStage !== activeDeal?.stage)
          setPendingSuggestion({ stage: parsed.suggestedStage, reason: parsed.stageReason });
        if (parsed.urgency) await updateCustomer(activeCustomerId, { urgent: true });
      }
    } catch {
      setGeneratedReply("⚠️ Error generating. Check your API key in Settings.");
    }
    setGeneratedReplyLoading(false);
  }

  // Send the AI-generated reply (or edited version)
  async function sendAIReply() {
    const content = generatedReply.trim();
    if (!content || !activeDealId) return;
    const { data: msg } = await supabase.from("messages").insert({
      deal_id: activeDealId, role: "assistant", content, sent: content,
    }).select().single();
    if (msg) setMessages(prev => [...prev, msg]);
    setGeneratedReply(""); setReplyMode(null); setReplyingToId(null); setEditingGenerated(false);
    await updateCustomer(activeCustomerId, { last_active: new Date().toISOString() });
  }

  // Send the manually-typed reply
  async function sendDirectReply() {
    const content = directReplyText.trim();
    if (!content || !activeDealId) return;
    setDirectReplyText("");
    const { data: msg } = await supabase.from("messages").insert({
      deal_id: activeDealId, role: "assistant", content, sent: content,
    }).select().single();
    if (msg) setMessages(prev => [...prev, msg]);
    setReplyMode(null); setReplyingToId(null);
    await updateCustomer(activeCustomerId, { last_active: new Date().toISOString() });
  }

  // Generate an opening message for an empty conversation
  async function generateOpeningMessage() {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setReplyMode("ai");
    setGeneratedReplyLoading(true);
    setGeneratedReply("");
    const prompt = `Generate a friendly opening WhatsApp message from "Laptop for Less" (UAE laptop reseller) to a new client named ${activeCustomer?.name}. ${activeDeal?.brand ? `They are interested in: ${activeDeal.brand} ${activeDeal.model || ""}` : ""}${activeDeal?.budget ? `. Budget: AED ${activeDeal.budget}` : ""}. Keep it short, welcoming, ask what they're looking for. Return JSON with only a "reply" field.`;
    try {
      const raw = await callClaude(anthropicKey, [{ role: "user", content: prompt }], buildSystemPromptFromCache(cachedStock));
      const clean = raw.replace(/```json|```/g, "").trim();
      let parsed; try { parsed = JSON.parse(clean); } catch { parsed = { reply: raw }; }
      setGeneratedReply(parsed.reply || raw);
    } catch { setGeneratedReply("Error generating. Check your API key."); }
    setGeneratedReplyLoading(false);
  }

  // ── LEGACY (kept so nothing breaks) ─────────────────────────────────────────

  // Mode 1 — Type Message: save owner's own typed text directly (no AI)
  async function sendDirectMessage() {
    if (!msgInput.trim()) return;
    // Auto-create a deal if no active deal exists
    let dealId = activeDealId;
    if (!dealId && activeCustomer?.id) {
      const { data: newDeal } = await supabase.from("deals").insert({
        customer_id: activeCustomer.id,
        stage: "new_inquiry",
        brand: "", model: "",
      }).select().single();
      if (newDeal) {
        dealId = newDeal.id;
        setActiveDealId(newDeal.id);
        await loadCustomers();
      }
    }
    if (!dealId) return;
    const content = msgInput.trim();
    setMsgInput("");
    const { data: msg } = await supabase.from("messages").insert({
      deal_id: dealId,
      role: "assistant",
      content,
      sent: content,
    }).select().single();
    if (msg) setMessages(prev => [...prev, msg]);
    await updateCustomer(activeCustomerId, { last_active: new Date().toISOString() });
  }

  // Mode 2 — AI Reply: paste client message, Claude generates a reply
  async function sendMessage() {
    if (!msgInput.trim() || !activeDeal || msgLoading) return;
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }

    const isVoice = msgInput.toLowerCase().startsWith("voice note:");
    const isUrgent = /urgent|today|asap|same day|need it now|quickly/i.test(msgInput);

    const { data: userMsg } = await supabase.from("messages").insert({ deal_id: activeDealId, role: "customer", content: msgInput.trim(), is_voice: isVoice }).select().single();
    setMessages(prev => [...prev, userMsg]);
    setMsgInput(""); setMsgLoading(true); setPendingSuggestion(null);
    if (isUrgent) await updateCustomer(activeCustomerId, { urgent: true });
    await updateCustomer(activeCustomerId, { last_active: new Date().toISOString() });

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role === "customer" ? "user" : "assistant",
        content: m.sent && m.sent !== "NOT_SENT" ? m.sent : m.content,
      }));

      const cType = activeCustomer?.contact_type || "client";
      const systemPrompt = cType === "trader"
        ? `You are helping Faisal Hadi at Laptop for Less UAE communicate with ${activeCustomer.name}, a local laptop trader. Keep messages short, direct and casual — this is a trader-to-trader conversation. You may be buying from or selling to them. Return JSON with only a "reply" field (WhatsApp style, max 3 lines).`
        : cType === "supplier"
        ? `You are helping Faisal Hadi at Laptop for Less UAE communicate with ${activeCustomer.name}, an international laptop supplier. Write professional business messages. Return JSON with only a "reply" field (formal but friendly, 2-4 sentences).`
        : buildSystemPromptFromCache(cachedStock);
      const raw = await callClaude(anthropicKey, history, systemPrompt);
      const clean = raw.replace(/```json|```/g, "").trim();
      let parsed;
      try { parsed = JSON.parse(clean); } catch { parsed = { reply: raw }; }

      // update deal specs
      const specUpdate = {};
      if (parsed.brand && parsed.brand !== "unknown" && !activeDeal.brand) specUpdate.brand = parsed.brand;
      if (parsed.model && parsed.model !== "unknown" && !activeDeal.model) specUpdate.model = parsed.model;
      if (parsed.ram && parsed.ram !== "unknown") specUpdate.ram = parsed.ram;
      if (parsed.storage && parsed.storage !== "unknown") specUpdate.storage = parsed.storage;
      if (parsed.screen && parsed.screen !== "unknown") specUpdate.screen = parsed.screen;
      if (parsed.condition && parsed.condition !== "unknown") specUpdate.condition = parsed.condition;
      if (parsed.budget) specUpdate.budget = parsed.budget;
      if (parsed.activationLock && parsed.activationLock !== "unknown") specUpdate.activation_lock = parsed.activationLock;
      if (parsed.charger && parsed.charger !== "unknown") specUpdate.charger = parsed.charger;
      if (parsed.box && parsed.box !== "unknown") specUpdate.box = parsed.box;
      if (Object.keys(specUpdate).length) await updateDeal(activeDealId, specUpdate);

      const { data: aiMsg } = await supabase.from("messages").insert({ deal_id: activeDealId, role: "assistant", content: parsed.reply || raw }).select().single();
      setMessages(prev => [...prev, aiMsg]);

      if (parsed.suggestedStage && parsed.suggestedStage !== activeDeal.stage) {
        setPendingSuggestion({ stage: parsed.suggestedStage, reason: parsed.stageReason });
      }
      if (parsed.urgency) await updateCustomer(activeCustomerId, { urgent: true });

    } catch {
      const { data: errMsg } = await supabase.from("messages").insert({ deal_id: activeDealId, role: "assistant", content: "⚠️ API error. Check your Anthropic key in Settings." }).select().single();
      setMessages(prev => [...prev, errMsg]);
    } finally { setMsgLoading(false); }
  }

  async function generateSupplierReply() {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setSupplierReplyLoading(true); setSupplierReplyGmail(""); setSupplierReplyWA("");
    const sup = activeCustomer;
    const prompt = `You are writing communications on behalf of Faisal Hadi, Laptop for Less, Sharjah UAE.

Supplier: ${sup?.name || "Supplier"}
${sup?.location ? `Location: ${sup.location}` : ""}
${sup?.email ? `Email: ${sup.email}` : ""}
Context: ${supplierReplyCtx || "General follow-up"}

Write TWO versions. Return JSON only:
{
  "gmail": "Formal email, 3-5 sentences, professional tone. End with: Best regards,\\nFaisal Hadi\\nLaptop for Less, UAE",
  "whatsapp": "Casual, 2-3 lines max, 1 emoji, no formal sign-off"
}`;
    try {
      const raw = await callClaude(anthropicKey, [{ role: "user", content: prompt }],
        "You write professional supplier communications for a UAE laptop reseller. Return only valid JSON.");
      const p = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setSupplierReplyGmail(p.gmail || ""); setSupplierReplyWA(p.whatsapp || "");
    } catch { setSupplierReplyGmail("Error generating — check your API key."); }
    setSupplierReplyLoading(false);
  }

  async function generateOutreach() {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    const reason = outreachReason === "Custom message" ? outreachCustom : outreachReason;
    if (!reason) return;
    setMsgLoading(true);

    const context = `Generate a WhatsApp outreach message to send to ${activeCustomer?.name}.
Reason: ${reason}
Customer history: ${activeDeal?.brand ? `Interested in ${activeDeal.brand} ${activeDeal.model || ""}` : "General customer"}
Budget: ${activeDeal?.budget ? `AED ${activeDeal.budget}` : "Unknown"}
Last stage: ${STAGES.find(s => s.id === activeDeal?.stage)?.label}
Return JSON with only a "reply" field containing the message.`;

    try {
      const systemPrompt = buildSystemPromptFromCache(cachedStock);
      const raw = await callClaude(anthropicKey, [{ role: "user", content: context }], systemPrompt);
      const clean = raw.replace(/```json|```/g, "").trim();
      let parsed;
      try { parsed = JSON.parse(clean); } catch { parsed = { reply: raw }; }
      const { data: aiMsg } = await supabase.from("messages").insert({ deal_id: activeDealId, role: "assistant", content: parsed.reply || raw }).select().single();
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      alert("Error generating message. Check your API key.");
    } finally {
      setMsgLoading(false); setOutreachMode(false); setOutreachReason(""); setOutreachCustom("");
    }
  }

  async function confirmSent(msgId, text) {
    await supabase.from("messages").update({ sent: text }).eq("id", msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, sent: text } : m));
    setEditSent(null);
    // open whatsapp
    if (activeCustomer?.number) window.open(`https://wa.me/${activeCustomer.number.replace(/\D/g,"")}?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function markNotSent(msgId) {
    await supabase.from("messages").update({ sent: "NOT_SENT" }).eq("id", msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, sent: "NOT_SENT" } : m));
  }

  function copyMsg(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id); setTimeout(() => setCopied(null), 2000);
  }

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
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
    setPartsSoldLoading(true);
    supabase.from("parts_sales").select("*")
      .order("sold_at", { ascending: false })
      .then(({ data }) => { setPartsSold(data || []); setPartsSoldLoading(false); });
  }, [stockFilter]);

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

  async function loadParts() {
    setPartsLoading(true);
    const { data } = await supabase.from("stock_parts").select("*").order("created_at", { ascending: false });
    setParts(data || []);
    setPartsLoading(false);
  }

  async function savePart() {
    const payload = {
      category:       partForm.category,
      compatible_with:partForm.compatible_with.trim() || null,
      specs:          partForm.specs.trim()           || null,
      condition:      partForm.condition,
      quantity:       parseInt(partForm.quantity) || 1,
      cost_price:     partForm.cost_price ? parseFloat(partForm.cost_price) : null,
      sell_price:     partForm.sell_price ? parseFloat(partForm.sell_price) : null,
      source:         partForm.source.trim()  || null,
      notes:          partForm.notes.trim()   || null,
      status:         "available",
    };
    if (editingPart) {
      await supabase.from("stock_parts").update(payload).eq("id", editingPart.id);
    } else {
      await supabase.from("stock_parts").insert(payload);
    }
    await loadParts();
    setShowAddPart(false); setEditingPart(null); setPartForm(EMPTY_PART);
  }

  async function deletePart(id) {
    await supabase.from("stock_parts").delete().eq("id", id);
    setParts(prev => prev.filter(p => p.id !== id));
  }

  function getMatchingClients(item) {
    return customers.filter(c =>
      (c.deals || []).some(d => {
        if (d.stage === "closed" || d.stage === "lost") return false;
        const brandMatch = !item.brand || !d.brand || d.brand.toLowerCase() === item.brand.toLowerCase();
        const budgetOk = !item.min_price || !d.budget || Number(d.budget) >= Number(item.min_price);
        return brandMatch && budgetOk;
      })
    );
  }

  async function saveStock() {
    const payload = {
      brand: stockForm.brand || null,
      model: stockForm.model || null,
      processor: stockForm.processor || null,
      ram: stockForm.ram || null,
      ssd: stockForm.ssd || null,
      screen: stockForm.screen || null,
      condition: stockForm.condition || null,
      charger: stockForm.charger || null,
      box: stockForm.box || null,
      activation_lock: stockForm.activation_lock || null,
      cost_price: stockForm.cost_price ? parseFloat(stockForm.cost_price) : null,
      min_price: stockForm.min_price ? parseFloat(stockForm.min_price) : null,
      max_price: stockForm.max_price ? parseFloat(stockForm.max_price) : null,
      serial_number: stockForm.serial_number || null,
      notes: stockForm.notes || null,
      photo_url: stockForm.photo_url || null,
      status: stockForm.status || "available",
    };
    if (editingStock) {
      await supabase.from("stock").update(payload).eq("id", editingStock.id);
      // Immediate state update — no reload needed
      setStock(prev => prev.map(s => s.id === editingStock.id ? { ...s, ...payload } : s));
    } else {
      const { data: newItem } = await supabase.from("stock").insert(payload).select().single();
      if (newItem) {
        // Immediate update — item appears at top instantly
        setStock(prev => [newItem, ...prev]);
      } else {
        // Fallback: re-fetch the full list
        await loadStock();
      }
    }
    refreshCachedStock();
    setShowAddStock(false);
    setEditingStock(null);
    setStockForm(EMPTY_STOCK);
  }

  async function deleteStockItem(id) {
    await supabase.from("stock").delete().eq("id", id);
    if (expandedStockId === id) setExpandedStockId(null);
    await loadStock();
    refreshCachedStock();
    showToast("Item deleted", "error");
  }

  async function toggleStockStatus(item) {
    const newStatus = item.status === "available" ? "sold" : "available";
    await supabase.from("stock").update({ status: newStatus }).eq("id", item.id);
    setStock(prev => prev.map(s => s.id === item.id ? { ...s, status: newStatus } : s));
    refreshCachedStock();
  }

  async function uploadStockPhoto(file) {
    if (!file) return;
    setStockPhotoUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filename = `stock/${Date.now()}.${ext}`;
      const { data: uploadData, error } = await supabase.storage.from("stock-photos").upload(filename, file, { upsert: true });
      if (!error && uploadData) {
        const { data: urlData } = supabase.storage.from("stock-photos").getPublicUrl(uploadData.path);
        setStockForm(f => ({ ...f, photo_url: urlData.publicUrl }));
      }
    } catch {}
    setStockPhotoUploading(false);
  }

  function downloadStockTemplate() {
    const headers = [["Brand","Model","Processor","RAM","SSD","Screen","Condition","Charger","Box","Activation Lock","Cost Price","Min Price","Max Price","Serial Number","Notes"]];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock");
    XLSX.writeFile(wb, "stock-import-template.xlsx");
  }

  function handleStockFileSelect(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const col = (row, ...keys) => {
        for (const k of keys) {
          const v = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()] ?? "";
          if (String(v).trim()) return String(v).trim();
        }
        return "";
      };
      const mapped = rows.map(r => ({
        brand: col(r, "Brand") || null,
        model: col(r, "Model") || null,
        processor: col(r, "Processor") || null,
        ram: col(r, "RAM", "Ram") || null,
        ssd: col(r, "SSD", "Ssd") || null,
        screen: col(r, "Screen", "Screen Size") || null,
        condition: col(r, "Condition") || null,
        charger: col(r, "Charger").toLowerCase() || null,
        box: col(r, "Box").toLowerCase() || null,
        activation_lock: col(r, "Activation Lock").toLowerCase() || null,
        cost_price: parseFloat(col(r, "Cost Price")) || null,
        min_price: parseFloat(col(r, "Min Price")) || null,
        max_price: parseFloat(col(r, "Max Price")) || null,
        serial_number: col(r, "Serial Number", "Serial") || null,
        notes: col(r, "Notes") || null,
        status: "available",
      })).filter(r => r.brand || r.model);
      setImportPreview(mapped);
      setImportStockResult(null);
    };
    reader.readAsArrayBuffer(file);
  }

  async function importStockItems() {
    if (!importPreview?.length) return;
    setImportingStock(true);
    const { data: inserted, error } = await supabase.from("stock").insert(importPreview).select();
    if (!error && inserted) {
      setStock(prev => [...inserted, ...prev]);
      setImportStockResult({ success: true, count: inserted.length });
      setTimeout(() => { setShowImportStock(false); setImportPreview(null); setImportStockResult(null); }, 1800);
    } else {
      setImportStockResult({ success: false, message: error?.message || "Import failed" });
    }
    setImportingStock(false);
  }







  // ── import whatsapp chat ──
  async function importChatFile(file) {
    const text = cleanWhatsAppText(await file.text());

    // Extract name + phone from filename
    let filename = file.name.replace(/\.txt$/i, "").replace(/^WhatsApp\s*(Chat\s*)?(with\s*)?[-–]?\s*/i, "").trim();
    let numberFromFile = "";
    const phoneMatch = filename.match(/\+?\d[\d\s\-()]{7,}/);
    if (phoneMatch) {
      numberFromFile = phoneMatch[0].replace(/\s/g, "");
      filename = filename.replace(phoneMatch[0], "").replace(/[-_]/g, " ").trim();
    }

    // Find first non-owner sender in chat
    let senderFromChat = "";
    for (const line of text.split("\n")) {
      const m = line.match(/\[\d{1,2}\/\d{1,2}\/\d{4}[^\]]+\]\s+~?([^:]+):/);
      if (m) {
        const s = m[1].replace(/^~/, "").trim();
        if (!s.toLowerCase().includes("laptop for less")) { senderFromChat = s; break; }
      }
    }

    const customerName = (filename || senderFromChat || "Unknown Customer").trim();

    const chatPrompt = `Analyze this WhatsApp chat between 'Laptop For Less' (a UAE laptop reseller) and a customer.

PARSING:
- 'Laptop For Less' = the owner/seller (ignore for customer profile, read for context)
- All other senders = the customer
- Strip ~ from sender names
- English + Urdu/Arabic mix is normal

EXTRACT:
- intent: 'buying' or 'selling'
- brand: MacBook/Dell/HP/Lenovo/Other/Unknown
- model: specific model (e.g. 'Dell 5420', 'MacBook Air M1') or empty
- processor: e.g. 'Core i5 11th Gen' / 'Apple M1' or empty
- ram: e.g. '8GB' or empty
- storage: e.g. '256GB' or empty
- condition: New/Like New/Used/Unknown
- quantity: units wanted (default 1)
- budget: price in AED if mentioned (number only, null if not)
- urgency: true if said urgent/today/asap/need now
- stage: 'new_inquiry'|'requirement_noted'|'negotiation'|'closed'|'lost'
- notes: important context

SHORTHAND: '8/256'=8GB RAM/256GB SSD. '16/512'=16GB/512GB. 'i5 11th'=Core i5 11th Gen. '750aed'=AED 750.

Return ONLY valid JSON (no markdown):
{"intent":"buying","brand":"Unknown","model":"","processor":"","ram":"","storage":"","condition":"Unknown","quantity":1,"budget":null,"urgency":false,"stage":"new_inquiry","notes":""}

Chat:
${text.slice(0, 12000)}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, messages: [{ role: "user", content: chatPrompt }] }),
      });
      const data = await res.json();
      const raw = (data?.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
      let info; try { info = JSON.parse(raw); } catch { info = {}; }

      const { data: customer } = await supabase.from("customers").insert({
        name: customerName, number: numberFromFile || "", notes: info.notes || "",
        tier: "cold", urgent: info.urgency || false,
      }).select().single();
      if (!customer) return null;

      const { data: deal } = await supabase.from("deals").insert({
        customer_id: customer.id,
        brand: info.brand && info.brand !== "Unknown" ? info.brand : "",
        model: info.model || "",
        ram: info.ram || "", storage: info.storage || "",
        condition: info.condition && info.condition !== "Unknown" ? info.condition : "",
        budget: info.budget || null, stage: info.stage || "new_inquiry",
      }).select().single();
      if (deal) await saveImportedMessages(deal.id, text);
      return customer;
    } catch { return null; }
  }

  async function importSingleChatFile(file) {
    if (!anthropicKey) { alert("Add Anthropic API key in Settings first."); return; }
    setImporting(true); setImportResult(null);
    const customer = await importChatFile(file);
    await loadCustomers();
    if (customer) setImportResult({ success: true, message: `✅ Imported ${customer.name} successfully!` });
    else setImportResult({ success: false, message: "❌ Import failed. Check your API key." });
    setImporting(false);
  }

  async function importMultipleChatFiles(files) {
    if (!anthropicKey) { alert("Add Anthropic API key in Settings first."); return; }
    setImportingMultiple(true); setImportMultipleResult(null);
    let created = 0; let failed = 0;
    for (let i = 0; i < files.length; i++) {
      setImportMultipleProgress({ current: i + 1, total: files.length });
      const result = await importChatFile(files[i]);
      if (result) created++; else failed++;
    }
    await loadCustomers();
    setImportMultipleResult({ created, failed, total: files.length });
    setImportingMultiple(false);
    setImportMultipleProgress({ current: 0, total: 0 });
  }

  async function importWhatsAppChat() {
    if (!importText.trim() || !anthropicKey) return;
    setImporting(true); setImportResult(null);

    const prompt = `You are analyzing a WhatsApp chat export for a UAE laptop reselling business called "Laptop for Less".

WHATSAPP FORMAT: Lines start with [DD/MM/YYYY, H:MM:SS AM/PM] SenderName: message
- Strip ~ from sender names (e.g. ~Kunchana → Kunchana)
- "Laptop For Less" = the business owner — read their messages for context but do NOT create a record for them
- Skip system messages and media omissions ("image omitted" etc.)

YOUR TASK: Extract EVERY non-owner person as a customer. Do NOT skip anyone even if they only sent 1 message.

SHORTHAND SPECS:
- "8/256" = RAM:8GB, Storage:256GB  |  "16/512" = RAM:16GB, Storage:512GB
- "i5 11th" or "i5/11gen" = Processor: Core i5 11th Gen
- "i7 12th" = Core i7 12th Gen  |  "i3 10th" = Core i3 10th Gen
- "m1","m2","m3" = Apple Silicon  |  "ryzen 5","r5" = Ryzen 5
- Numbers like "620", "1250 aed" = budget

STAGE RULES:
- new_inquiry: asked if something is available, no price/specs discussed
- requirement_noted: specs and/or price mentioned by either side
- negotiation: back-and-forth on price happened
- closed: deal confirmed ("confirmed", "done", "I'll take it", "ok done")
- lost: said no, or no reply after price given

Return ONLY a JSON array — no markdown, no explanation:
[{
  "name": "customer name (strip ~)",
  "number": "phone number from filename like +971 55 539 0642 or empty",
  "intent": "buying or selling or unknown",
  "brand": "MacBook or Dell or HP or Lenovo or Other or unknown",
  "model": "model number/name or empty",
  "processor": "Core i5 11th Gen or Apple M1 etc or empty",
  "ram": "8GB or empty",
  "storage": "256GB or empty",
  "condition": "New or Like New or Used or Refurbished or unknown",
  "budget": price as number or null,
  "quantity": units wanted as number or null,
  "urgent": true or false,
  "notes": "key context from the conversation",
  "stage": "new_inquiry or requirement_noted or negotiation or closed or lost"
}]

CRITICAL RULES:
- Include EVERY customer even if they only sent 1 message
- Include even if intent is not clear — set intent to "unknown"
- Merge multiple appearances of same person into one entry
- Never skip a contact just because the conversation is brief
- Return ONLY the JSON array

WhatsApp Chat:
${cleanWhatsAppText(importText).slice(0, 12000)}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      const raw = data?.content?.[0]?.text || "[]";
      const clean = raw.replace(/\`\`\`json|\`\`\`/g, "").trim();
      let contacts;
      try { contacts = JSON.parse(clean); } catch { contacts = []; }

      if (!contacts.length) {
        setImportResult({ success: false, message: "No contacts extracted. Try a longer chat or check the format." });
        setImporting(false); return;
      }

      // Create customers and deals in Supabase
      let created = 0;
      for (const c of contacts) {
        if (!c.name) continue;
        const { data: customer } = await supabase.from("customers").insert({
          name: c.name, number: c.number || "", notes: c.notes || "",
          tier: "cold", urgent: c.urgent || false,
        }).select().single();
        if (!customer) continue;
        const { data: deal } = await supabase.from("deals").insert({
          customer_id: customer.id,
          brand: c.brand && c.brand !== "unknown" ? c.brand : "",
          model: c.model || "",
          ram: c.ram || "",
          storage: c.storage || "",
          condition: c.condition && c.condition !== "unknown" ? c.condition : "",
          budget: c.budget || null,
          stage: c.stage || "new_inquiry",
        }).select().single();
        if (deal) await saveImportedMessages(deal.id, cleanWhatsAppText(importText));
        created++;
      }

      await loadCustomers();
      setImportResult({ success: true, message: `✅ Imported ${created} customer${created !== 1 ? "s" : ""} successfully!` });
      setImportText("");
    } catch (e) {
      setImportResult({ success: false, message: "Error importing. Check your API key." });
    }
    setImporting(false);
  }

  // ── export data ──
  async function exportData() {
    setExporting(true);
    try {
      const { data: allCustomers } = await supabase.from("customers").select("*, deals(*)").order("last_active", { ascending: false });
      const exportObj = {
        exported_at: new Date().toISOString(),
        business: "Laptop for Less",
        total_customers: allCustomers?.length || 0,
        customers: allCustomers || [],
      };
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `jnp-crm-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click(); URL.revokeObjectURL(url);

      // Also export as CSV
      const rows = [["Name", "Number", "Tier", "Urgent", "Brand", "Model", "Stage", "Budget (AED)", "Value (AED)", "Last Active", "Notes"]];
      (allCustomers || []).forEach(c => {
        const deal = (c.deals || [])[0] || {};
        rows.push([
          c.name, c.number || "", c.tier, c.urgent ? "Yes" : "No",
          deal.brand || "", deal.model || "", deal.stage || "",
          deal.budget || "", deal.value || "",
          c.last_active ? new Date(c.last_active).toLocaleDateString() : "",
          c.notes || "",
        ]);
      });
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
      const csvBlob = new Blob([csv], { type: "text/csv" });
      const csvUrl = URL.createObjectURL(csvBlob);
      const b = document.createElement("a");
      b.href = csvUrl; b.download = `jnp-crm-export-${new Date().toISOString().slice(0,10)}.csv`;
      setTimeout(() => { b.click(); URL.revokeObjectURL(csvUrl); }, 500);
    } catch (e) {
      alert("Export failed. Please try again.");
    }
    setExporting(false);
  }

  // ── ask claude: smart context ──
  function detectQueryType(question) {
    const q = question.toLowerCase();
    if (q.match(/contact|trader|supplier|who deals|find.*person|find.*contact|deals in|sells|buying|who has|who sell|who buy|customer|client/))
      return "contacts";
    if (q.match(/stock|inventory|available|how many|do you have|in stock|devices|laptops/))
      return "stock";
    if (q.match(/margin|profit|cost|markup|best deal|most profitable|earning/))
      return "margins";
    if (q.match(/follow up|cold|silent|overdue|not replied|inactive|who to contact/))
      return "followups";
    if (q.match(/revenue|sales|earned|this month|total sales|how much|income/))
      return "revenue";
    if (q.match(/sourcing|shipment|supplier|order|lot|arriving|transit|customs/))
      return "sourcing";
    if (q.match(/part|ram|ssd|hdd|screen|battery|charger|keyboard|spare/))
      return "parts";
    return "general";
  }

  async function buildContactsContext() {
    const { data: contacts } = await supabase
      .from("customers")
      .select("name, number, contact_type, notes, location, last_active")
      .order("last_active", { ascending: false });
    const lines = (contacts || []).map(c => {
      const type = c.contact_type || "client";
      const parts = [
        `[${type.toUpperCase()}]`,
        c.name,
        c.number ? `📱 ${c.number}` : null,
        c.location ? `📍 ${c.location}` : null,
        c.notes ? `Notes: ${c.notes}` : null,
        `Last active: ${c.last_active ? Math.floor((Date.now() - new Date(c.last_active)) / 86400000) + "d ago" : "never"}`,
      ].filter(Boolean);
      return parts.join(" · ");
    }).join("\n");
    return `CONTACTS (${(contacts || []).length} total):\n${lines || "(none)"}`;
  }

  async function buildStockContext() {
    const { data: stock } = await supabase
      .from("stock")
      .select("brand, model, processor, ram, ssd, condition, status, max_price, created_at")
      .eq("status", "available")
      .order("brand");
    const lines = (stock || []).map((s, i) => {
      const age = Math.floor((Date.now() - new Date(s.created_at)) / 86400000);
      return `${i + 1}. ${s.brand || ""} ${s.model || ""} ${s.processor || ""} ${s.ram || ""}/${s.ssd || ""} ${s.condition || ""} AED${s.max_price || 0} (${age}d)`;
    }).join("\n");
    return `AVAILABLE STOCK (${(stock || []).length} items):\n${lines || "(none)"}`;
  }

  async function buildMarginsContext() {
    const { data: stock } = await supabase
      .from("stock")
      .select("brand, model, condition, cost_price, min_price, max_price, created_at")
      .eq("status", "available")
      .order("brand");
    const lines = (stock || []).map((s, i) => {
      const cost = Number(s.cost_price) || 0;
      const sell = Number(s.max_price) || 0;
      const profit = sell - cost;
      const margin = sell > 0 ? Math.round((profit / sell) * 100) : 0;
      const age = Math.floor((Date.now() - new Date(s.created_at)) / 86400000);
      return `${i + 1}. ${s.brand || ""} ${s.model || ""} ${s.condition || ""} Cost:AED${cost} Sell:AED${sell} Profit:AED${profit}(${margin}%) ${age}d`;
    }).join("\n");
    return `STOCK WITH MARGINS:\n${lines || "(none)"}`;
  }

  async function buildFollowupsContext() {
    const { data: custs } = await supabase
      .from("customers")
      .select("name, last_active, contact_type, deals(stage, brand, model, budget)")
      .order("last_active", { ascending: true })
      .limit(50);
    const overdue = (custs || []).filter(c => {
      const days = Math.floor((Date.now() - new Date(c.last_active || 0)) / 86400000);
      return days >= 1 && (c.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
    });
    const lines = overdue.map(c => {
      const days = Math.floor((Date.now() - new Date(c.last_active || 0)) / 86400000);
      const deal = (c.deals || []).find(d => d.stage !== "closed" && d.stage !== "lost");
      return `${c.name} · ${days}d silent · ${[deal?.brand, deal?.model].filter(Boolean).join(" ") || "open deal"} · ${deal?.stage || ""} · ${deal?.budget ? "AED " + deal.budget : "no budget"}`;
    }).join("\n");
    return `OVERDUE FOLLOW UPS (${overdue.length}):\n${lines || "(none — all clients active)"}`;
  }

  async function buildRevenueContext() {
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { data: deals } = await supabase
      .from("deals")
      .select("value, sale_type, closed_at, brand, model, walk_in_name")
      .eq("stage", "closed")
      .gte("closed_at", monthStart.toISOString())
      .order("closed_at", { ascending: false });
    const total = (deals || []).reduce((s, d) => s + (Number(d.value) || 0), 0);
    const walkin = (deals || []).filter(d => d.sale_type === "walkin");
    const whatsapp = (deals || []).filter(d => !d.sale_type || d.sale_type === "whatsapp");
    const lines = (deals || []).slice(0, 20).map(d => {
      const date = new Date(d.closed_at).toLocaleDateString("en-GB");
      const device = [d.brand, d.model].filter(Boolean).join(" ") || "Device";
      return `${date} · ${device} · AED${d.value || 0} · ${d.sale_type || "whatsapp"}`;
    }).join("\n");
    return `REVENUE THIS MONTH:\nTotal: AED ${total.toLocaleString()}\nDeals: ${(deals || []).length} (${whatsapp.length} WhatsApp · ${walkin.length} Walk-in)\n\nRECENT SALES:\n${lines || "(none)"}`;
  }

  async function buildPartsContext() {
    const { data: parts } = await supabase
      .from("stock_parts")
      .select("category, specs, compatible_with, quantity, cost_price, sell_price")
      .gt("quantity", 0)
      .order("category");
    const lines = (parts || []).map((p, i) =>
      `${i + 1}. ${p.category} ${p.specs || ""} ${p.compatible_with || ""} ×${p.quantity} AED${p.sell_price || 0}`
    ).join("\n");
    return `SPARE PARTS (${(parts || []).length} types):\n${lines || "(none)"}`;
  }

  async function buildSmartContext(question) {
    const type = detectQueryType(question);
    const date = new Date().toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    let context = `Date: ${date}\nBusiness: Laptop for Less, Sharjah UAE\n\n`;
    switch (type) {
      case "contacts":
        context += await buildContactsContext();
        break;
      case "stock":
        context += await buildStockContext();
        break;
      case "margins":
        context += await buildMarginsContext();
        break;
      case "followups":
        context += await buildFollowupsContext();
        break;
      case "revenue":
        context += await buildRevenueContext();
        break;
      case "parts":
        context += await buildPartsContext();
        break;
      case "sourcing":
        context += "Sourcing data: Check the Sourcing tab for active deals.";
        break;
      default: {
        const [stockCtx, followupsCtx, revenueCtx] = await Promise.all([
          buildStockContext(),
          buildFollowupsContext(),
          buildRevenueContext(),
        ]);
        context += [stockCtx, followupsCtx, revenueCtx].join("\n\n");
      }
    }
    return context;
  }

  // ── ask claude ──
  async function sendAskMessage(msg) {
    const trimmed = (msg || "").trim();
    if (!trimmed || askLoading) return;
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setAskInput("");
    setAskMessages(prev => [...prev, { role: "owner", content: trimmed }]);
    setAskLoading(true);
    try {
      const context = await buildSmartContext(trimmed);
      const system = `You are a business analyst assistant for "Laptop for Less", a UAE laptop reselling business. The owner is asking about their business. Answer accurately using only the data provided. Be concise and direct. Format numbers with AED currency. Use emojis for readability. When recommending actions be specific.\n\n${context}`;
      const history = askMessages
        .map(m => ({ role: m.role === "owner" ? "user" : "assistant", content: m.content }))
        .concat([{ role: "user", content: trimmed }]);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, system, messages: history }),
      });
      const data = await res.json();
      setAskMessages(prev => [...prev, { role: "claude", content: data?.content?.[0]?.text || "No response." }]);
    } catch {
      setAskMessages(prev => [...prev, { role: "claude", content: "⚠️ Error. Check your API key in Settings." }]);
    }
    setAskLoading(false);
  }

  // ── traders ──
  const loadTraderListings = useCallback(async () => {
    setTraderListingsLoading(true);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from("trader_inventory").select("*")
      .eq("status", "active")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false });
    setTraderListings(data || []);
    setTraderListingsLoading(false);
  }, []);

  useEffect(() => { if (activeTab === "traders") loadTraderListings(); }, [activeTab, loadTraderListings]);

  async function extractTraderListings() {
    if (!traderChatText.trim() || !anthropicKey) return;
    setTraderImportLoading(true); setTraderImportResult(null);
    setTraderImportPreview(null);

    // Step 1: Clean and merge multi-line messages
    const cleanedTraderText = cleanWhatsAppText(traderChatText);
    const lineRegexForMerge = /^\[(\d{1,2}\/\d{1,2}\/\d{4}),\s*([\d:]+\s*(?:AM|PM|am|pm))\]/;
    const rawLines = cleanedTraderText.split('\n');
    const mergedLines = [];
    for (const line of rawLines) {
      if (lineRegexForMerge.test(line.trim())) {
        mergedLines.push(line);
      } else if (line.trim() && mergedLines.length > 0) {
        mergedLines[mergedLines.length - 1] += ' | ' + line.trim();
      }
    }

    // Step 2: Filter to only lines with laptop selling signals
    const skipSenders = ['JNP', 'JNP Laptop Market'];
    const skipContent = ['end-to-end encrypted', 'added you', 'created this group', 'omitted', 'sticker', 'document omitted'];
    const sellSignals = ['wts', 'want to sale', 'want to sell', 'available', 'shipment', 'w.t.sal', 'for sale', 'selling'];
    const laptopBrands = ['dell', 'hp', 'lenovo', 'thinkpad', 'elitebook', 'latitude', 'surface', 'macbook', '840', '850', '5420', '7420', '640', '830', '845', '835'];

    const relevantLines = mergedLines.filter(line => {
      const lower = line.toLowerCase();
      if (skipContent.some(s => lower.includes(s))) return false;
      if (skipSenders.some(s => line.includes('] ' + s + ':') || line.includes('] ~' + s + ':'))) return false;
      const hasSellSignal = sellSignals.some(s => lower.includes(s));
      const hasLaptop = laptopBrands.some(b => lower.includes(b));
      return hasSellSignal || (hasLaptop && lower.includes('|'));
    });

    console.log('Total lines:', mergedLines.length, 'Relevant lines:', relevantLines.length);
    setTraderImportResult({ success: false, message: `⏳ Processing ${relevantLines.length} relevant messages...` });

    if (relevantLines.length === 0) {
      setTraderImportResult({ success: false, message: 'No laptop listings found. Make sure you pasted a group chat with laptop listings.' });
      setTraderImportLoading(false);
      return;
    }

    // Step 3: Process in chunks of 30 lines to avoid token limits
    const chunkSize = 30;
    const allListings = [];
    const totalChunks = Math.ceil(relevantLines.length / chunkSize);

    const extractionPrompt = (chunkText) => `Extract laptop listings from this WhatsApp group chat. Return ONLY a JSON array, no markdown.

SELLING signals: WTS, Want to Sell, Want to Sale, Available, New Shipment, W.T.SAL
SKIP: RAM only, SSD only, HDD only, phones, LCD papers, screen papers, desktop towers, buying requests

BRAND DECODER:
- 640/650/840/850/830/835/845/1030/1040/EliteBook/firefly/ProBook = HP laptop
- 3301/3390/3480/5290/5400/5410/5420/5490/5511/7320/7390/7400/7410/7420/7430/7490/XPS/Precision/Latitude = Dell laptop  
- T14/T14s/X13/ThinkPad/T480/T490/L380 = Lenovo laptop
- Surface = Microsoft laptop
- MacBook = Apple laptop

SPEC DECODER:
- "CI5.11TH.8.256" = Core i5 11th Gen, 8GB RAM, 256GB SSD
- "i5/11th Gen 8/256Gb" = Core i5 11th Gen, 8GB, 256GB
- "840g8 Ci711th 16gb 512" = HP EliteBook 840 G8, Core i7 11th, 16GB, 512GB
- "645g4 AMD 7 -1pc" = HP 645 G4, AMD Ryzen 7, qty 1

Return format:
[{"type":"selling","category":"laptop","brand":"HP","model":"EliteBook 840 G8","processor":"Core i7 11th Gen","ram":"8GB","storage":"256GB","condition":"Used","quantity":null,"price":null,"currency":"AED","charger":"unknown","notes":"","trader_name":"sender name","trader_number":"phone if visible in message"}]

If no laptop listings found return [].

Chat:
${chunkText}`;

    try {
      for (let i = 0; i < totalChunks; i++) {
        const chunk = relevantLines.slice(i * chunkSize, (i + 1) * chunkSize);
        const chunkText = chunk.join('\n');
        setTraderImportResult({ success: false, message: `⏳ Processing chunk ${i + 1} of ${totalChunks}...` });

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8000,
            system: "You extract laptop inventory listings from WhatsApp group chats for a UAE laptop reseller. Return only valid JSON arrays.",
            messages: [{ role: "user", content: extractionPrompt(chunkText) }],
          }),
        });

        const data = await res.json();
        if (data.error) { console.error('API error chunk', i, data.error); continue; }
        const raw = data?.content?.[0]?.text || "[]";
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        const clean = jsonMatch ? jsonMatch[0] : raw.replace(/```json|```/g, "").trim();
        let chunkListings = [];
        try { chunkListings = JSON.parse(clean); } catch(e) { console.error('Parse error chunk', i, e.message, clean.slice(0, 100)); }
        if (Array.isArray(chunkListings)) allListings.push(...chunkListings);
        console.log(`Chunk ${i+1}/${totalChunks}: ${chunkListings.length} listings`);
      }

      // Deduplicate by brand+model+trader
      const seen = new Set();
      const deduped = allListings.filter(l => {
        const key = `${l.trader_name}|${l.brand}|${l.model}|${l.ram}|${l.storage}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      console.log('Total listings:', allListings.length, 'After dedup:', deduped.length);
      setTraderImportPreview(deduped);
      if (deduped.length === 0) {
        setTraderImportResult({ success: false, message: "No laptop listings found. This group chat may not have laptop listings, or try a different section." });
      } else {
        setTraderImportResult({ success: false, message: `✅ Found ${deduped.length} listings from ${new Set(deduped.map(l => l.trader_name)).size} traders. Confirm to save.` });
      }
    } catch(e) {
      console.error("Extraction error:", e);
      setTraderImportResult({ success: false, message: "Extraction failed. Check API key." });
    }
    setTraderImportLoading(false);
  }

  async function saveTraderListings() {
    if (!traderImportPreview?.length) return;
    setSavingTraderListings(true);
    const group = traderGroup || "Other";
    // Delete stale listings from the same source_group (older than 1 hour)
    // so re-importing the same chat replaces old data instead of duplicating
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await supabase.from("trader_inventory").delete()
      .eq("source_group", group)
      .lt("created_at", oneHourAgo);
    const rows = traderImportPreview.map(l => ({ ...l, source_group: group, status: "active" }));
    const { error } = await supabase.from("trader_inventory").insert(rows);
    if (!error) {
      await loadTraderListings();
      setTraderImportResult({ success: true, count: rows.length });
      setTimeout(() => { setShowImportTrader(false); setTraderImportPreview(null); setTraderChatText(""); setTraderGroup(""); setTraderImportResult(null); }, 1800);
    } else { setTraderImportResult({ success: false, message: error.message }); }
    setSavingTraderListings(false);
  }

  async function checkTradersForDeal() {
    setCheckTradersLoading(true);
    if (!traderListings.length) {
      const { data } = await supabase.from("trader_inventory").select("*").eq("type", "selling").eq("status", "active").order("created_at", { ascending: false });
      const results = (data || []).filter(t => {
        const brand = activeDeal?.brand || ""; const model = activeDeal?.model || "";
        return (!brand || !t.brand || t.brand.toLowerCase().includes(brand.toLowerCase()) || brand.toLowerCase().includes((t.brand || "").toLowerCase()));
      });
      setCheckTradersResults(results);
    } else {
      const brand = activeDeal?.brand || ""; const model = activeDeal?.model || "";
      setCheckTradersResults(traderListings.filter(t => t.type === "selling" && (!brand || !t.brand || t.brand.toLowerCase().includes(brand.toLowerCase()))));
    }
    setCheckTradersLoading(false); setShowCheckTraders(true);
  }

  // ── receipt ──
  function buildReceiptText(paymentMethod) {
    if (!activeDeal || !activeCustomer) return "";
    const num = activeDeal.receipt_number || `LFL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const payStatus = PAYMENT_STATUSES.find(p => p.id === activeDeal.payment_status)?.label || "Pending";
    return `━━━━━━━━━━━━━━━━━━━━━━
      LAPTOP FOR LESS
      UAE | laptopforless.ae
━━━━━━━━━━━━━━━━━━━━━━
RECEIPT #: ${num}
Date: ${date}

SOLD TO:
Name: ${activeCustomer.name}
Contact: ${activeCustomer.number || "—"}

DEVICE DETAILS:
Brand & Model: ${[activeDeal.brand, activeDeal.model].filter(Boolean).join(" ") || "—"}
${activeDeal.processor ? `Processor: ${activeDeal.processor}\n` : ""}RAM: ${activeDeal.ram || "—"}
Storage: ${activeDeal.storage || activeDeal.ssd || "—"}
Screen: ${activeDeal.screen || "—"}
Condition: ${activeDeal.condition || "—"}
${activeDeal.serial_number ? `Serial #: ${activeDeal.serial_number}\n` : ""}Charger Included: ${activeDeal.charger || "—"}
Box Included: ${activeDeal.box || "—"}

PAYMENT:
Amount Paid: AED ${(activeDeal.value || 0).toLocaleString()}
Payment Status: ${payStatus}
Payment Method: ${paymentMethod}

Thank you for your purchase! 🙏
For any issues please contact us on WhatsApp.
━━━━━━━━━━━━━━━━━━━━━━`;
  }

  function buildSaleReceiptText(sale, nameOverride) {
    const num = `LFL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const date = new Date(sale.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const customerName = nameOverride || sale.customerName || "Customer";
    return `━━━━━━━━━━━━━━━━━━━━━━
      LAPTOP FOR LESS
      UAE | laptopforless.ae
━━━━━━━━━━━━━━━━━━━━━━
RECEIPT #: ${num}
Date: ${date}

SOLD TO:
Name: ${customerName}${sale.customerNumber ? `\nContact: ${sale.customerNumber}` : ""}

${sale.items && sale.items.length > 0
    ? `ITEMS:\n${sale.items.map(i =>
        `${i.label}${' '.repeat(Math.max(1, 30 - i.label.length))}AED ${Number(i.price).toLocaleString()}`
      ).join('\n')}`
    : sale.type === "part"
      ? `PART DETAILS:\nItem: ${sale.device}${sale.specs ? `\nCompatible With: ${sale.specs}` : ""}\nQuantity: ${sale.quantity || 1}`
      : `DEVICE DETAILS:\n${sale.device}${sale.specs ? `\n${sale.specs}` : ""}${sale.serialNumber ? `\nSerial #: ${sale.serialNumber}` : ""}`
  }

PAYMENT:
${sale.depositAmount > 0 ?
`Total: AED ${Number(sale.price).toLocaleString()}
Deposit Paid: AED ${Number(sale.depositAmount).toLocaleString()}
Balance Received: AED ${Number(sale.price - sale.depositAmount).toLocaleString()}` :
`Amount: AED ${Number(sale.price).toLocaleString()}`}
Method: ${sale.paymentMethod}

Thank you for your purchase! 🙏
For any issues contact us on WhatsApp.
━━━━━━━━━━━━━━━━━━━━━━`;
  }

  async function saveReceiptNumber(num) {
    if (activeDeal && !activeDeal.receipt_number) {
      await supabase.from("deals").update({ receipt_number: num, receipt_date: new Date().toISOString(), payment_method: receiptPaymentMethod }).eq("id", activeDealId);
      await loadCustomers();
    }
  }

  // ── broadcast ──
  function openBroadcast(item) {
    const matches = customers.filter(c =>
      (c.deals || []).some(d => {
        if (d.stage === "closed" || d.stage === "lost") return false;
        const brandMatch = !item.brand || !d.brand || d.brand.toLowerCase() === item.brand.toLowerCase();
        const budgetOk = !item.min_price || !d.budget || Number(d.budget) >= Number(item.min_price);
        return brandMatch || budgetOk;
      })
    );
    setBroadcastItem(item);
    setBroadcastClients(matches);
    setBroadcastSelected(new Set(matches.map(c => c.id)));
    setBroadcastMessages([]); setBroadcastStep("clients"); setBroadcastSent(new Set());
    setShowBroadcast(true);
  }

  async function generateBroadcastMessages() {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setBroadcastLoading(true);
    const selected = broadcastClients.filter(c => broadcastSelected.has(c.id));
    const device = [broadcastItem?.brand, broadcastItem?.model].filter(Boolean).join(" ");
    const specs = [broadcastItem?.ram, broadcastItem?.ssd, broadcastItem?.condition].filter(Boolean).join(", ");
    const msgs = await Promise.all(selected.map(async c => {
      const deal = (c.deals || []).find(d => d.stage !== "closed" && d.stage !== "lost");
      const prompt = `Write a short WhatsApp message to ${c.name} about: ${device} ${specs} AED ${broadcastItem?.max_price}. Their interest: ${deal?.brand || "laptop"} budget AED ${deal?.budget || "unknown"}. Personal, friendly, under 40 words, 1-2 emojis. Return message text only.`;
      try {
        const text = await callClaude(anthropicKey, [{ role: "user", content: prompt }], "You write short friendly WhatsApp messages for Laptop for Less UAE.");
        return { client: c, message: text.trim(), deal };
      } catch {
        return { client: c, message: `Hey ${c.name}! 👋 Just got a ${device} — ${specs}. AED ${broadcastItem?.max_price}. Interested? 😊`, deal };
      }
    }));
    setBroadcastMessages(msgs); setBroadcastStep("messages"); setBroadcastLoading(false);
  }

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
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #EEF2FF 0%, #F8FAFC 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 24, padding: 32, boxShadow: "0 8px 40px rgba(99,102,241,0.12)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💻</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: -0.5 }}>Laptop for Less</div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>CRM — {authMode === "login" ? "Sign in to continue" : "Create your account"}</div>
        </div>

        {authError && (
          <div style={{ padding: "10px 14px", borderRadius: 10, background: authError.startsWith("✅") ? "#ECFDF5" : "#FEF2F2", color: authError.startsWith("✅") ? "#10B981" : "#EF4444", fontSize: 13, marginBottom: 16, fontWeight: 600 }}>
            {authError}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <input value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="Email address" type="email"
            style={{ padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
          <input value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Password" type="password"
            onKeyDown={e => e.key === "Enter" && handleAuth()}
            style={{ padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" }} />
        </div>

        <button onClick={handleAuth} disabled={authBusy || !authEmail || !authPassword}
          style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: authBusy ? "#C7D2FE" : "#6366F1", color: "#fff", fontWeight: 800, fontSize: 15, cursor: authBusy ? "not-allowed" : "pointer", marginBottom: 12 }}>
          {authBusy ? "Please wait..." : authMode === "login" ? "Sign In →" : "Create Account →"}
        </button>

        <div style={{ textAlign: "center", fontSize: 13, color: "#94A3B8" }}>
          {authMode === "login" ? "Don't have an account? " : "Already have an account? "}
          <span onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}
            style={{ color: "#6366F1", fontWeight: 700, cursor: "pointer" }}>
            {authMode === "login" ? "Sign up" : "Sign in"}
          </span>
        </div>
      </div>
    </div>
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
          <button onClick={handleLogout}
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
        isMobile={isMobile}
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
        showReceipt={showReceipt}
        setShowReceipt={setShowReceipt}
        receiptPaymentMethod={receiptPaymentMethod}
        setReceiptPaymentMethod={setReceiptPaymentMethod}
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
        showCheckTraders={showCheckTraders}
        setShowCheckTraders={setShowCheckTraders}
        checkTradersResults={checkTradersResults}
        setCheckTradersResults={setCheckTradersResults}
        checkTradersLoading={checkTradersLoading}
        setCheckTradersLoading={setCheckTradersLoading}
        showLinkStock={showLinkStock}
        setShowLinkStock={setShowLinkStock}
        linkStockDeal={linkStockDeal}
        setLinkStockDeal={setLinkStockDeal}
        showReservation={showReservation}
        setShowReservation={setShowReservation}
        anthropicKey={anthropicKey}
        cachedStock={cachedStock}
        bottomRef={bottomRef}
        NAV_TABS={NAV_TABS}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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
        checkTradersForDeal={checkTradersForDeal}
        buildReceiptText={buildReceiptText}
        saveReceiptNumber={saveReceiptNumber}
        traderListings={traderListings}
        setShowSideDrawer={setShowSideDrawer}
        showToast={showToast}
        setStockSearch={setStockSearch}
        setStockFilter={setStockFilter}
        setTraderSearch={setTraderSearch}
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
          todaySales={todaySales}
          partsRevMTD={partsRevMTD}
          sourcingAlerts={sourcingAlerts}
          isMobile={isMobile}
          setActiveTab={setActiveTab}
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
          isMobile={isMobile}
          openDeals={openDeals}
          closedDeals={closedDeals}
          revenue={revenue}
          setShowSideDrawer={setShowSideDrawer}
        />
      )}

      {/* ── STOCK TAB ── */}
      {activeTab === "stock" && (
        <StockTab
          isMobile={isMobile}
          stock={stock}
          stockLoading={stockLoading}
          loadStock={loadStock}
          refreshCachedStock={refreshCachedStock}
          stockFilter={stockFilter}
          setStockFilter={setStockFilter}
          stockSearch={stockSearch}
          setStockSearch={setStockSearch}
          stockView={stockView}
          setStockView={setStockView}
          showAddStock={showAddStock}
          setShowAddStock={setShowAddStock}
          editingStock={editingStock}
          setEditingStock={setEditingStock}
          stockForm={stockForm}
          setStockForm={setStockForm}
          expandedStockId={expandedStockId}
          setExpandedStockId={setExpandedStockId}
          stockPhotoUploading={stockPhotoUploading}
          setStockPhotoUploading={setStockPhotoUploading}
          showImportStock={showImportStock}
          setShowImportStock={setShowImportStock}
          importPreview={importPreview}
          setImportPreview={setImportPreview}
          importingStock={importingStock}
          setImportingStock={setImportingStock}
          importStockResult={importStockResult}
          setImportStockResult={setImportStockResult}
          parts={parts}
          partsLoading={partsLoading}
          loadParts={loadParts}
          showAddPart={showAddPart}
          setShowAddPart={setShowAddPart}
          editingPart={editingPart}
          setEditingPart={setEditingPart}
          partForm={partForm}
          setPartForm={setPartForm}
          showPartSale={showPartSale}
          setShowPartSale={setShowPartSale}
          partSaleTarget={partSaleTarget}
          setPartSaleTarget={setPartSaleTarget}
          partsSold={partsSold}
          partsSoldLoading={partsSoldLoading}
          partsRevMTD={partsRevMTD}
          loadPartsRevMTD={loadPartsRevMTD}
          showUpgrade={showUpgrade}
          setShowUpgrade={setShowUpgrade}
          upgradeTarget={upgradeTarget}
          setUpgradeTarget={setUpgradeTarget}
          showQuickSale={showQuickSale}
          setShowQuickSale={setShowQuickSale}
          quickSalePrefill={quickSalePrefill}
          setQuickSalePrefill={setQuickSalePrefill}
          soldDealMap={soldDealMap}
          setSoldDealMap={setSoldDealMap}
          customers={customers}
          saveStock={saveStock}
          deleteStockItem={deleteStockItem}
          toggleStockStatus={toggleStockStatus}
          uploadStockPhoto={uploadStockPhoto}
          downloadStockTemplate={downloadStockTemplate}
          handleStockFileSelect={handleStockFileSelect}
          importStockItems={importStockItems}
          savePart={savePart}
          deletePart={deletePart}
          getMatchingClients={getMatchingClients}
          openBroadcast={openBroadcast}
          handleUpgradeApply={handleUpgradeApply}
          loadCustomers={loadCustomers}
          loadTodaySales={loadTodaySales}
          stockFileInputRef={stockFileInputRef}
          importStockFileRef={importStockFileRef}
          setSaleReceiptData={setSaleReceiptData}
          setReceiptEditName={setReceiptEditName}
          setShowSaleReceipt={setShowSaleReceipt}
          filteredStock={filteredStock}
          reservedDeals={reservedDeals}
          reservedDealsLoading={reservedDealsLoading}
          loadReservedDeals={loadReservedDeals}
          expandedReservedDeal={expandedReservedDeal}
          setExpandedReservedDeal={setExpandedReservedDeal}
          showCompleteReservation={showCompleteReservation}
          setShowCompleteReservation={setShowCompleteReservation}
          completingDeal={completingDeal}
          setCompletingDeal={setCompletingDeal}
          completionPaymentMethod={completionPaymentMethod}
          setCompletionPaymentMethod={setCompletionPaymentMethod}
          showEditReservation={showEditReservation}
          setShowEditReservation={setShowEditReservation}
          editReservationItem={editReservationItem}
          setEditReservationItem={setEditReservationItem}
          editReservationForm={editReservationForm}
          setEditReservationForm={setEditReservationForm}
          showToast={showToast}
        />
      )}

      {/* ── TRADERS TAB ── */}

            {/* ── TRADERS TAB ── */}
      {activeTab === "traders" && (
        <TradersTab
          anthropicKey={anthropicKey}
          isMobile={isMobile}
          stock={stock}
          customers={customers}
          traderListings={traderListings}
          traderListingsLoading={traderListingsLoading}
          loadTraderListings={loadTraderListings}
          traderSection={traderSection}
          setTraderSection={setTraderSection}
          traderSearch={traderSearch}
          setTraderSearch={setTraderSearch}
          traderFilter={traderFilter}
          setTraderFilter={setTraderFilter}
          showImportTrader={showImportTrader}
          setShowImportTrader={setShowImportTrader}
          traderGroup={traderGroup}
          setTraderGroup={setTraderGroup}
          traderChatText={traderChatText}
          setTraderChatText={setTraderChatText}
          traderImportLoading={traderImportLoading}
          setTraderImportLoading={setTraderImportLoading}
          traderImportPreview={traderImportPreview}
          setTraderImportPreview={setTraderImportPreview}
          savingTraderListings={savingTraderListings}
          setSavingTraderListings={setSavingTraderListings}
          traderImportResult={traderImportResult}
          setTraderImportResult={setTraderImportResult}
          showTraderMatches={showTraderMatches}
          setShowTraderMatches={setShowTraderMatches}
          showCheckTraders={showCheckTraders}
          setShowCheckTraders={setShowCheckTraders}
          checkTradersResults={checkTradersResults}
          setCheckTradersResults={setCheckTradersResults}
          checkTradersLoading={checkTradersLoading}
          setCheckTradersLoading={setCheckTradersLoading}
          activeDeal={activeDeal}
          extractTraderListings={extractTraderListings}
          saveTraderListings={saveTraderListings}
          checkTradersForDeal={checkTradersForDeal}
        />
      )}

      {/* ── ASK CLAUDE TAB ── */}
      {activeTab === "ask" && (
        <AskClaudeTab
          anthropicKey={anthropicKey}
          isMobile={isMobile}
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
        <SalesTab
          isMobile={isMobile}
          salesHistory={salesHistory}
          salesHistoryLoading={salesHistoryLoading}
          salesFilter={salesFilter}
          setSalesFilter={setSalesFilter}
          setSaleReceiptData={setSaleReceiptData}
          setReceiptEditName={setReceiptEditName}
          setShowSaleReceipt={setShowSaleReceipt}
        />
      )}

      {/* ── MARKETING TAB ── */}
      {activeTab === "marketing" && (
        <MarketingTab
          isMobile={isMobile}
          stock={stock}
          activeMarketingTab={activeMarketingTab}
          setActiveMarketingTab={setActiveMarketingTab}
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

      {/* ── RECEIPT MODAL ── */}
      {showReceipt && activeDeal && activeCustomer && (() => {
        const receiptText = buildReceiptText(receiptPaymentMethod);
        const receiptNum = activeDeal.receipt_number || receiptText.match(/RECEIPT #: (LFL-\d+-\d+)/)?.[1] || "";
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, overflowY: "auto" }}>
            <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>🧾 Receipt</span>
                  <button onClick={() => setShowReceipt(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
                </div>
                {/* Payment method */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6, letterSpacing: 0.5 }}>PAYMENT METHOD</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {["Cash", "Bank Transfer"].map(m => (
                      <button key={m} onClick={() => setReceiptPaymentMethod(m)}
                        style={{ flex: 1, padding: "8px", borderRadius: 10, border: "none", background: receiptPaymentMethod === m ? "#6366F1" : "#F1F5F9", color: receiptPaymentMethod === m ? "#fff" : "#64748B", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Receipt preview */}
                <div style={{ background: "#F8FAFC", borderRadius: 14, padding: 16, fontFamily: "monospace", fontSize: 12, lineHeight: 1.8, color: "#0F172A", whiteSpace: "pre-line", marginBottom: 16, border: "1px solid #E2E8F0" }}>
                  {receiptText}
                </div>
                {/* Actions */}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { navigator.clipboard.writeText(receiptText); saveReceiptNumber(receiptNum); }}
                    style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                    📋 Copy Receipt
                  </button>
                  {activeCustomer.number && (
                    <button onClick={() => { saveReceiptNumber(receiptNum); window.open(`https://wa.me/${activeCustomer.number.replace(/\D/g,"")}?text=${encodeURIComponent(receiptText)}`, "_blank"); }}
                      style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                      📱 Send WhatsApp
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── BROADCAST MODAL ── */}
      {showBroadcast && broadcastItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontWeight: 800, fontSize: 17, color: "#0F172A" }}>📢 Broadcast</span>
                <button onClick={() => setShowBroadcast(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
              {/* Device summary */}
              <div style={{ background: "#EEF2FF", borderRadius: 12, padding: "10px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#4338CA" }}>{[broadcastItem.brand, broadcastItem.model].filter(Boolean).join(" ")}</div>
                <div style={{ fontSize: 12, color: "#818CF8" }}>{[broadcastItem.ram, broadcastItem.ssd, broadcastItem.condition].filter(Boolean).join(" · ")} · AED {broadcastItem.max_price?.toLocaleString()}</div>
              </div>

              {broadcastStep === "clients" && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10 }}>
                    Found {broadcastClients.length} potential buyer{broadcastClients.length !== 1 ? "s" : ""}
                  </div>
                  {broadcastClients.length === 0
                    ? <div style={{ textAlign: "center", padding: 30, color: "#94A3B8" }}>No matching clients found.<br/>No open deals match this device's brand/price.</div>
                    : (
                      <>
                        {broadcastClients.map(c => {
                          const deal = (c.deals || []).find(d => d.stage !== "closed" && d.stage !== "lost");
                          const isSelected = broadcastSelected.has(c.id);
                          const brandMatch = !broadcastItem.brand || !deal?.brand || deal.brand.toLowerCase() === broadcastItem.brand.toLowerCase();
                          const budgetMatch = !broadcastItem.min_price || !deal?.budget || Number(deal.budget) >= Number(broadcastItem.min_price);
                          const strength = brandMatch && budgetMatch ? "✅ Strong" : "⚠️ Partial";
                          return (
                            <div key={c.id} onClick={() => setBroadcastSelected(prev => { const n = new Set(prev); isSelected ? n.delete(c.id) : n.add(c.id); return n; })}
                              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", marginBottom: 6, borderRadius: 12, border: `1.5px solid ${isSelected ? "#6366F1" : "#F1F5F9"}`, background: isSelected ? "#EEF2FF" : "#fff", cursor: "pointer" }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{c.name}</div>
                                <div style={{ fontSize: 11, color: "#94A3B8" }}>{[deal?.brand, deal?.model].filter(Boolean).join(" ") || "No spec"}{deal?.budget ? ` · AED ${deal.budget}` : ""} · {daysSince(c.last_active)}d ago</div>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: brandMatch && budgetMatch ? "#10B981" : "#F59E0B" }}>{strength}</span>
                                <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${isSelected ? "#6366F1" : "#E2E8F0"}`, background: isSelected ? "#6366F1" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  {isSelected && <span style={{ color: "#fff", fontSize: 12, lineHeight: 1 }}>✓</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <button onClick={generateBroadcastMessages} disabled={broadcastLoading || broadcastSelected.size === 0}
                          style={{ width: "100%", marginTop: 8, padding: 13, borderRadius: 12, border: "none", background: broadcastSelected.size === 0 || broadcastLoading ? "#E2E8F0" : "#6366F1", color: broadcastSelected.size === 0 || broadcastLoading ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                          {broadcastLoading ? "⏳ Generating messages..." : `Generate Messages for ${broadcastSelected.size} Client${broadcastSelected.size !== 1 ? "s" : ""} →`}
                        </button>
                      </>
                    )
                  }
                </>
              )}

              {broadcastStep === "messages" && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8" }}>{broadcastMessages.length} messages ready</div>
                    <button onClick={() => setBroadcastStep("clients")} style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 11, cursor: "pointer" }}>← Back</button>
                  </div>
                  {broadcastMessages.map((item, i) => (
                    <div key={i} style={{ background: broadcastSent.has(i) ? "#F0FDF4" : "#F8FAFC", borderRadius: 14, padding: "12px 14px", marginBottom: 8, border: `1px solid ${broadcastSent.has(i) ? "#BBF7D0" : "#E2E8F0"}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{item.client.name}</span>
                        {broadcastSent.has(i) && <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>✓ Sent</span>}
                      </div>
                      <textarea defaultValue={item.message} onChange={e => { broadcastMessages[i].message = e.target.value; }} rows={3}
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.5, background: "#fff" }} />
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <a href={`https://wa.me/${(item.client.number || "").replace(/\D/g,"")}?text=${encodeURIComponent(item.message)}`} target="_blank" rel="noreferrer"
                          onClick={() => setBroadcastSent(prev => new Set([...prev, i]))}
                          style={{ flex: 1, padding: "7px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
                          📱 Open WhatsApp
                        </a>
                        <button onClick={() => setBroadcastSent(prev => new Set([...prev, i]))}
                          style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #BBF7D0", background: broadcastSent.has(i) ? "#ECFDF5" : "#fff", color: "#10B981", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                          ✓ Sent
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SIDE DRAWER ── */}
      {showSideDrawer && (
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
                📊 Sales History
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
      )}

      {/* ── SALE RECEIPT MODAL ── */}
      {showSaleReceipt && saleReceiptData && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>🧾 Receipt</span>
                <button onClick={() => setShowSaleReceipt(false)}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>CUSTOMER NAME</div>
                <input value={receiptEditName} onChange={e => setReceiptEditName(e.target.value)} placeholder="Customer name"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ background: "#F8FAFC", borderRadius: 14, padding: 16, fontFamily: "monospace", fontSize: 12, lineHeight: 1.8, color: "#0F172A", whiteSpace: "pre-line", marginBottom: 16, border: "1px solid #E2E8F0" }}>
                {buildSaleReceiptText(saleReceiptData, receiptEditName)}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => navigator.clipboard.writeText(buildSaleReceiptText(saleReceiptData, receiptEditName))}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  📋 Copy
                </button>
                <button onClick={() => {
                  const text = buildSaleReceiptText(saleReceiptData, receiptEditName);
                  const number = saleReceiptData.customerNumber;
                  window.open(`https://wa.me/${number ? number.replace(/\D/g,"") : ""}?text=${encodeURIComponent(text)}`, "_blank");
                }}
                  style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  📱 WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
      {toast && (
        <div style={{
          position: "fixed",
          bottom: isMobile ? 90 : 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 999,
          padding: "12px 24px",
          borderRadius: 12,
          background: toast.type === "success" ? "#10B981"
            : toast.type === "error" ? "#EF4444"
            : "#6366F1",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
          whiteSpace: "nowrap",
          animation: "slideUp 0.3s ease",
        }}>
          {toast.type === "success" ? "✅ " : toast.type === "error" ? "❌ " : "ℹ️ "}
          {toast.message}
          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateX(-50%) translateY(20px); }
              to   { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
          `}</style>
        </div>
      )}

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
      {isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "1px solid #F1F5F9", display: "flex", zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}>
          {[
            { key: "home", icon: "🏠", label: "Home" },
            { key: "customers", icon: "👥", label: "Contacts" },
            { key: "stock", icon: "📦", label: "Stock", badge: stock.filter(s => s.status === "available").length || 0 },
            { key: "sourcing", icon: "🌍", label: "Sourcing" },
            { key: "traders", icon: "🏪", label: "Traders" },
            { key: "ask", icon: "🤖", label: "Ask" },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{ flex: 1, padding: "8px 2px 12px", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative" }}>
              {t.badge > 0 && (
                <div style={{ position: "absolute", top: 6, right: "25%", width: 16, height: 16, borderRadius: "50%", background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.badge}</div>
              )}
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: activeTab === t.key ? "#6366F1" : "#94A3B8" }}>{t.label}</span>
              {activeTab === t.key && <div style={{ position: "absolute", bottom: 0, width: 28, height: 3, background: "#6366F1", borderRadius: "3px 3px 0 0" }} />}
            </button>
          ))}
        </div>
      )}
      </div>{/* end content area */}
    </div>
  );
}
