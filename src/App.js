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
import SalesTab from "./components/tabs/SalesTab";

// ── main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login"); // login | signup
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [anthropicKey, setAnthropicKey] = useState(getAnthropicKey);
  const [keyInput, setKeyInput] = useState("");

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("list");
  const [activeCustomerId, setActiveCustomerId] = useState(null);
  const [activeDealId, setActiveDealId] = useState(null);
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
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const [copied, setCopied] = useState(null);
  const [editSent, setEditSent] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [editingNumber, setEditingNumber] = useState(false);
  const [numberInput, setNumberInput] = useState('');
  const [outreachMode, setOutreachMode] = useState(false);
  const [outreachReason, setOutreachReason] = useState("");
  const [outreachCustom, setOutreachCustom] = useState("");
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLossReason, setShowLossReason] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", number: "", notes: "" });
  const [newDeal, setNewDeal] = useState({ brand: "", model: "", value: "" });
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

  // ── global contact modal ──
  const [showContactModal,   setShowContactModal]   = useState(false);
  const [contactModalPreType,setContactModalPreType]= useState(null); // null | "client" | "trader" | "supplier"
  const [contactTypeFilter,  setContactTypeFilter]  = useState("all"); // "all" | "client" | "trader" | "supplier"

  // ── last messages for contact list previews ──
  const [lastMsgMap, setLastMsgMap] = useState({}); // { customerId: { role, content, sent, ts } }

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

  // ── load customers ──
  const loadCustomers = useCallback(async () => {
    setLoading(true);
    const { data: custs } = await supabase.from("customers").select("*, deals(*)").order("last_active", { ascending: false });
    setCustomers(custs || []);
    setLoading(false);

    // Batch-load the last message for every deal so the contact list
    // can show real previews and an unread dot — one query, not N.
    const dealIds = [];
    const dealToCustomer = {};
    (custs || []).forEach(c =>
      (c.deals || []).forEach(d => {
        dealIds.push(d.id);
        dealToCustomer[d.id] = c.id;
      })
    );
    if (!dealIds.length) return;
    const { data: msgs } = await supabase
      .from("messages")
      .select("deal_id, role, content, sent, ts")
      .in("deal_id", dealIds)
      .order("ts", { ascending: false })
      .limit(1000);
    const map = {};
    (msgs || []).forEach(msg => {
      const cid = dealToCustomer[msg.deal_id];
      if (cid && !map[cid]) map[cid] = msg; // first result = most recent (ordered desc)
    });
    setLastMsgMap(map);
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

  const activeCustomer = customers.find(c => c.id === activeCustomerId);
  const activeDeal = activeCustomer?.deals?.find(d => d.id === activeDealId);

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

  // ── customer actions ──
  async function addCustomer() {
    if (!newCustomer.name.trim()) return;
    const { data: c } = await supabase.from("customers").insert({ name: newCustomer.name.trim(), number: newCustomer.number.trim(), notes: newCustomer.notes.trim(), tier: "cold", urgent: false }).select().single();
    if (!c) return;
    const { data: d } = await supabase.from("deals").insert({ customer_id: c.id, stage: "new_inquiry" }).select().single();
    await loadCustomers();
    setActiveCustomerId(c.id); setActiveDealId(d?.id);
    setNewCustomer({ name: "", number: "", notes: "" });
    setView("detail");
  }

  async function deleteCustomer() {
    await supabase.from("customers").delete().eq("id", activeCustomerId);
    setShowDeleteConfirm(false);
    setActiveCustomerId(null); setActiveDealId(null);
    setView("list");
    await loadCustomers();
  }

  async function updateCustomer(fields) {
    await supabase.from("customers").update({ ...fields, last_active: new Date().toISOString() }).eq("id", activeCustomerId);
    await loadCustomers();
  }

  // ── deal actions ──
  async function addDeal() {
    const { data: d } = await supabase.from("deals").insert({ customer_id: activeCustomerId, brand: newDeal.brand, model: newDeal.model, value: newDeal.value ? parseFloat(newDeal.value) : null, stage: "new_inquiry" }).select().single();
    await loadCustomers();
    setActiveDealId(d?.id); setShowAddDeal(false);
    setNewDeal({ brand: "", model: "", value: "" });
  }

  async function updateDeal(fields) {
    await supabase.from("deals").update(fields).eq("id", activeDealId);
    await loadCustomers();
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
    await updateDeal(fields);
    const updatedDeals = activeCustomer.deals.map(d => d.id === activeDealId ? { ...d, ...fields } : d);
    await updateCustomer({ tier: autoTier(updatedDeals) });
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
    if (isUrgent) await updateCustomer({ urgent: true });
    await updateCustomer({ last_active: new Date().toISOString() });
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
        if (Object.keys(specUpdate).length) await updateDeal(specUpdate);
        if (parsed.suggestedStage && parsed.suggestedStage !== activeDeal?.stage)
          setPendingSuggestion({ stage: parsed.suggestedStage, reason: parsed.stageReason });
        if (parsed.urgency) await updateCustomer({ urgent: true });
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
    await updateCustomer({ last_active: new Date().toISOString() });
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
    await updateCustomer({ last_active: new Date().toISOString() });
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
    await updateCustomer({ last_active: new Date().toISOString() });
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
    if (isUrgent) await updateCustomer({ urgent: true });
    await updateCustomer({ last_active: new Date().toISOString() });

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
      if (Object.keys(specUpdate).length) await updateDeal(specUpdate);

      const { data: aiMsg } = await supabase.from("messages").insert({ deal_id: activeDealId, role: "assistant", content: parsed.reply || raw }).select().single();
      setMessages(prev => [...prev, aiMsg]);

      if (parsed.suggestedStage && parsed.suggestedStage !== activeDeal.stage) {
        setPendingSuggestion({ stage: parsed.suggestedStage, reason: parsed.stageReason });
      }
      if (parsed.urgency) await updateCustomer({ urgent: true });

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

  // ── ask claude ──
  async function sendAskMessage(msg) {
    const trimmed = (msg || "").trim();
    if (!trimmed || askLoading) return;
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setAskInput("");
    setAskMessages(prev => [...prev, { role: "owner", content: trimmed }]);
    setAskLoading(true);
    try {
      const context = await buildOwnerContext();
      const system = `You are a business analyst assistant for "Laptop for Less", a UAE laptop reselling business. The owner is asking you questions about their business. Answer accurately using only the data provided in the context above. Be concise and direct. Format numbers with AED currency. Use emojis for readability. When recommending actions, be specific.\n\n${context}`;
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
    const tier = TIERS[activeCustomer.tier] || TIERS.cold;
    const overdue = daysSince(activeCustomer.last_active) >= 1 && (activeCustomer.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
    const closedDealValue = (activeCustomer.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
    const payStatus = PAYMENT_STATUSES.find(p => p.id === activeDeal?.payment_status) || PAYMENT_STATUSES[0];

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
        {/* header */}
        <div style={{ background: "#fff", padding: "12px 14px 0", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button onClick={() => { setView("list"); setActiveCustomerId(null); setActiveDealId(null); setPendingSuggestion(null); }}
              style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 18, flexShrink: 0 }}>←</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {editingName ? (
                  <input
                    autoFocus
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onBlur={async () => {
                      if (nameInput.trim() && nameInput.trim() !== activeCustomer.name) {
                        await supabase.from('customers').update({ name: nameInput.trim() }).eq('id', activeCustomerId);
                        await loadCustomers();
                      }
                      setEditingName(false);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingName(false); }}
                    style={{ fontWeight: 800, fontSize: 16, color: "#0F172A", border: "none", borderBottom: "2px solid #6366F1", outline: "none", background: "transparent", padding: "1px 0", minWidth: 60, maxWidth: 160 }}
                  />
                ) : (
                  <span
                    onClick={() => { setEditingName(true); setNameInput(activeCustomer.name); }}
                    style={{ fontWeight: 800, fontSize: 16, color: "#0F172A", cursor: "text", borderBottom: "1px dashed transparent" }}
                    title="Tap to edit name"
                  >{activeCustomer.name}</span>
                )}
                {activeCustomer.urgent && <Badge color="#EF4444" bg="#FEF2F2" small>🔴 URGENT</Badge>}
                {activeCustomer.contact_type === "trader"   && <Badge color="#D97706" bg="#FFFBEB" small>🟡 TRADER</Badge>}
                {activeCustomer.contact_type === "supplier" && <Badge color="#2563EB" bg="#EFF6FF" small>🔵 SUPPLIER</Badge>}
                {activeCustomer.contact_type === "walkin"   && <Badge color="#6366F1" bg="#EEF2FF" small>⚡ WALK-IN</Badge>}
                {(!activeCustomer.contact_type || activeCustomer.contact_type === "client") && <Badge color={tier.color} bg={tier.bg} small>{tier.icon} {tier.label}</Badge>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                {editingNumber ? (
                  <input
                    autoFocus
                    value={numberInput}
                    onChange={e => setNumberInput(e.target.value)}
                    onBlur={async () => {
                      if (numberInput.trim() !== activeCustomer.number) {
                        await supabase.from('customers').update({ number: numberInput.trim() }).eq('id', activeCustomerId);
                        await loadCustomers();
                      }
                      setEditingNumber(false);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingNumber(false); }}
                    placeholder="Phone number"
                    style={{ fontSize: 12, color: "#6366F1", border: "none", borderBottom: "2px solid #6366F1", outline: "none", background: "transparent", padding: "1px 0", minWidth: 80, maxWidth: 160, fontWeight: 600 }}
                  />
                ) : (
                  <span
                    onClick={() => { setEditingNumber(true); setNumberInput(activeCustomer.number || ''); }}
                    style={{ fontSize: 12, color: "#6366F1", fontWeight: 600, cursor: "text" }}
                    title="Tap to edit number"
                  >
                    {activeCustomer.number ? `📱 ${activeCustomer.number}` : '+ Add number'}
                  </span>
                )}
                {activeCustomer.number && !editingNumber && (
                  <a href={`https://wa.me/${activeCustomer.number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: "#25D366", fontWeight: 700, textDecoration: "none" }}>
                    WA
                  </a>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setShowSideDrawer(true)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 14 }}>📊</button>
              <button onClick={() => setShowAddDeal(true)} style={{ padding: "6px 11px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", fontSize: 11, fontWeight: 700, color: "#6366F1", cursor: "pointer" }}>+ Deal</button>
              <button onClick={() => setShowDeleteConfirm(true)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #FEE2E2", background: "#fff", color: "#EF4444", cursor: "pointer", fontSize: 14 }}>🗑</button>
            </div>
          </div>

          {/* deal tabs */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10 }}>
            {(activeCustomer.deals || []).map((d, i) => (
              <button key={d.id} onClick={() => setActiveDealId(d.id)}
                style={{ padding: "5px 13px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer", background: d.id === activeDealId ? "#6366F1" : "#F1F5F9", color: d.id === activeDealId ? "#fff" : "#64748B", transition: "all 0.15s" }}>
                {d.brand || "Deal"} {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* ── TRADER action buttons ── */}
        {activeCustomer.contact_type === "trader" && (
          <div style={{ display: "flex", gap: 8, margin: "10px 12px 0" }}>
            {[
              { label: "💰 Buy From", ctx: `I want to buy devices from ${activeCustomer.name}. Ask what they have available and at what price.` },
              { label: "💵 Sell To",  ctx: `I want to sell devices to ${activeCustomer.name}. Mention what stock I have available.` },
            ].map(({ label, ctx }) => (
              <button key={label} onClick={() => {
                setOutreachReason("Custom message");
                setOutreachCustom(ctx);
                setOutreachMode(true);
              }} style={{
                flex: 1, padding: "9px 6px", borderRadius: 12, border: "1.5px solid #FDE68A",
                background: "#FFFBEB", color: "#D97706", fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── SUPPLIER action buttons ── */}
        {activeCustomer.contact_type === "supplier" && (
          <div style={{ display: "flex", gap: 8, margin: "10px 12px 0" }}>
            <button onClick={() => {
              const email = window.prompt("Paste the email content from " + activeCustomer.name + ":");
              if (!email?.trim()) return;
              setOutreachReason("Custom message");
              setOutreachCustom("Reply professionally to this email from the supplier: " + email.trim());
              setOutreachMode(true);
            }} style={{
              flex: 1, padding: "9px 6px", borderRadius: 12, border: "1.5px solid #FECACA",
              background: "#FEF2F2", color: "#DC2626", fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}>
              📧 Check Gmail
            </button>
            <button onClick={() => {
              setSupplierReplyCtx(""); setSupplierReplyGmail("");
              setSupplierReplyWA(""); setShowSupplierReply(true);
            }} style={{
              flex: 1, padding: "9px 6px", borderRadius: 12, border: "1.5px solid #BFDBFE",
              background: "#EFF6FF", color: "#2563EB", fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}>
              ✍️ Generate Reply
            </button>
          </div>
        )}

        {/* deal card */}
        {activeDeal && (
          <div style={{ margin: "10px 12px 0", background: "#fff", borderRadius: 18, padding: "14px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", border: "1px solid #F1F5F9" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>
                  {[activeDeal.brand, activeDeal.model].filter(Boolean).join(" ") || "Device TBD"}
                </div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                  {[activeDeal.ram, activeDeal.storage, activeDeal.screen, activeDeal.condition].filter(Boolean).join(" · ") || "Extracting specs..."}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                {activeDeal.budget && <div style={{ fontSize: 13, fontWeight: 700, color: "#6366F1" }}>AED {Number(activeDeal.budget).toLocaleString()}</div>}
                {activeDeal.value && <div style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>Sold: AED {Number(activeDeal.value).toLocaleString()}</div>}
              </div>
            </div>

            <StageBar stageId={activeDeal.stage} />

            {/* quick info pills */}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {activeDeal.activation_lock !== "unknown" && activeDeal.brand === "MacBook" && (
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: activeDeal.activation_lock === "yes" ? "#FEF2F2" : "#ECFDF5", color: activeDeal.activation_lock === "yes" ? "#EF4444" : "#10B981", fontWeight: 700 }}>
                  🔒 {activeDeal.activation_lock === "yes" ? "Locked" : "Unlocked"}
                </span>
              )}
              {activeDeal.charger !== "unknown" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F1F5F9", color: "#64748B", fontWeight: 600 }}>🔌 Charger: {activeDeal.charger}</span>}
              {activeDeal.box !== "unknown" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F1F5F9", color: "#64748B", fontWeight: 600 }}>📦 Box: {activeDeal.box}</span>}
            </div>

            {overdue && <div style={{ marginTop: 8, fontSize: 11, color: "#EF4444", fontWeight: 700 }}>⚠️ No activity for {daysSince(activeCustomer.last_active)}d — follow up!</div>}

            {/* payment status */}
            {activeDeal.stage === "closed" && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", marginBottom: 5, letterSpacing: 0.5 }}>PAYMENT</div>
                <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                  {PAYMENT_STATUSES.map(p => (
                    <button key={p.id} onClick={() => updateDeal({ payment_status: p.id })}
                      style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", background: activeDeal.payment_status === p.id ? p.color : p.bg, color: activeDeal.payment_status === p.id ? "#fff" : p.color, transition: "all 0.15s" }}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => { setReceiptPaymentMethod("Cash"); setShowReceipt(true); }}
                  style={{ width: "100%", padding: "8px", borderRadius: 10, border: "1.5px solid #6366F1", background: "#EEF2FF", color: "#6366F1", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  🧾 Generate Receipt
                </button>
              </div>
            )}

            {/* serial number */}
            <div style={{ marginTop: 10 }}>
              <input value={activeDeal.serial_number || ""} onChange={e => updateDeal({ serial_number: e.target.value })} placeholder="Serial / IMEI number (optional)"
                style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", boxSizing: "border-box", color: "#475569" }} />
            </div>

            {/* AI stage suggestion */}
            {pendingSuggestion && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
                <div style={{ fontSize: 11, color: "#6366F1", fontWeight: 700, marginBottom: 3 }}>🤖 AI Suggests</div>
                <div style={{ fontSize: 12, color: "#4338CA", marginBottom: 8 }}>{pendingSuggestion.reason}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => moveStage(pendingSuggestion.stage)}
                    style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "#6366F1", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Move → {STAGES.find(s => s.id === pendingSuggestion.stage)?.label}
                  </button>
                  <button onClick={() => setPendingSuggestion(null)}
                    style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #C7D2FE", background: "#fff", color: "#6366F1", fontSize: 11, cursor: "pointer" }}>
                    Ignore
                  </button>
                </div>
              </div>
            )}

            {/* check traders */}
            {activeDeal && activeDeal.stage !== "closed" && activeDeal.stage !== "lost" && (
              <div style={{ marginTop: 8 }}>
                <button onClick={checkTradersForDeal}
                  style={{ width: "100%", padding: "7px", borderRadius: 10, border: "1.5px solid #10B981", background: "#ECFDF5", color: "#059669", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  🏪 Check Traders for This Device
                </button>
              </div>
            )}

            {/* manual stages */}
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: "#CBD5E1", fontWeight: 700, marginBottom: 5, letterSpacing: 0.5 }}>MOVE STAGE</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {STAGES.map(s => (
                  <button key={s.id} onClick={() => moveStage(s.id)}
                    style={{ padding: "4px 10px", borderRadius: 20, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", background: s.id === activeDeal.stage ? s.color : s.bg, color: s.id === activeDeal.stage ? "#fff" : s.color, transition: "all 0.15s" }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* loss reason */}
            {activeDeal.stage === "lost" && (
              <div style={{ marginTop: 10 }}>
                <select value={activeDeal.loss_reason || ""} onChange={e => updateDeal({ loss_reason: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #FEE2E2", fontSize: 12, outline: "none", color: "#EF4444", background: "#FEF2F2" }}>
                  <option value="">Why was this lost?</option>
                  {LOSS_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            )}

            {closedDealValue > 0 && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "#ECFDF5", fontSize: 12, color: "#10B981", fontWeight: 700 }}>
                💰 Total from {activeCustomer.name}: AED {closedDealValue.toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* add deal modal */}
        {showAddDeal && (
          <div style={{ margin: "10px 12px 0", background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
            <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 12, color: "#0F172A" }}>New Deal</div>
            <select value={newDeal.brand} onChange={e => setNewDeal(p => ({ ...p, brand: e.target.value }))}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, marginBottom: 8, outline: "none" }}>
              <option value="">Select brand</option>
              {BRANDS.map(b => <option key={b}>{b}</option>)}
            </select>
            <input placeholder="Model (e.g. Air M2)" value={newDeal.model} onChange={e => setNewDeal(p => ({ ...p, model: e.target.value }))}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
            <input placeholder="Deal value in AED (if known)" value={newDeal.value} onChange={e => setNewDeal(p => ({ ...p, value: e.target.value }))} type="number"
              style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, marginBottom: 12, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addDeal} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Add Deal</button>
              <button onClick={() => setShowAddDeal(false)} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        )}

        {/* delete confirm */}
        {showDeleteConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Delete {activeCustomer.name}?</div>
              <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>This will permanently delete this customer and all their deals and messages. This cannot be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={deleteCustomer} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#EF4444", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Yes, Delete</button>
                <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── MESSAGES ── */}
        <div style={{ flex: 1, padding: "12px", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 4 }}>

          {/* Empty state */}
          {messages.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, padding: "30px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>💬</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8", marginBottom: 20 }}>No messages yet</div>
              <div style={{ display: "flex", gap: 10, width: "100%" }}>
                <button onClick={() => { setReplyMode("myself"); setDirectReplyText(""); }}
                  style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  ✏️ I'll start typing
                </button>
                <button onClick={generateOpeningMessage}
                  style={{ flex: 1, padding: "11px 8px", borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  🤖 AI opens
                </button>
              </div>
            </div>
          )}

          {/* Imported from WhatsApp banner */}
          {messages.length > 0 && messages[0]?.ts && (Date.now() - new Date(messages[0].ts).getTime()) > 3600000 && (
            <div style={{ textAlign: "center", padding: "5px 12px", borderRadius: 8, background: "#F1F5F9", fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>
              📱 Imported from WhatsApp
            </div>
          )}

          {/* Message list with inline reply buttons */}
          {(() => {
            // Compute which customer messages still need a reply
            const lastAssistantTs = messages
              .filter(m => m.role === "assistant" && m.sent && m.sent !== "NOT_SENT")
              .map(m => new Date(m.ts).getTime()).sort().pop() || 0;
            const unansweredIds = new Set(
              messages
                .filter(m => m.role === "customer" && new Date(m.ts).getTime() > lastAssistantTs)
                .map(m => m.id)
            );

            return messages.map(msg => {
              const isCustomer = msg.role === "customer";
              const isSent     = msg.sent && msg.sent !== "NOT_SENT";
              const isNotSent  = msg.sent === "NOT_SENT";
              const display    = isSent && msg.sent !== msg.content ? msg.sent : msg.content;
              const showReplyBtns = isCustomer && unansweredIds.has(msg.id) && replyingToId !== msg.id;

              return (
                <div key={msg.id}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: isCustomer ? "flex-start" : "flex-end", gap: 4 }}>
                    <div style={{ fontSize: 10, color: "#CBD5E1" }}>
                      {isCustomer ? (msg.is_voice ? "🎤 Voice Note" : `👤 ${activeCustomer.name}`) : "You"} · {timeAgo(msg.ts)}
                    </div>
                    <div style={{
                      maxWidth: "84%", padding: "10px 13px", fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-line",
                      borderRadius: isCustomer ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
                      background: isCustomer ? "#F1F5F9" : "#6366F1",
                      color:      isCustomer ? "#334155"  : "#fff",
                      border:     isCustomer ? "1px solid #E2E8F0" : "none",
                      opacity: isNotSent ? 0.45 : 1,
                    }}>
                      {display}
                    </div>
                    {isSent  && !isCustomer && <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>✓ Sent · {timeAgo(msg.ts)}</div>}
                    {isNotSent && !isCustomer && <div style={{ fontSize: 10, color: "#94A3B8" }}>Not sent</div>}
                  </div>

                  {/* Inline reply buttons — shown on each unanswered client message */}
                  {showReplyBtns && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button onClick={() => { setReplyingToId(msg.id); setReplyMode("myself"); setDirectReplyText(""); }}
                        style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        ✏️ Reply Myself
                      </button>
                      <button onClick={() => generateAIReply(msg.id)}
                        style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        🤖 AI Reply
                      </button>
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {/* AI generating spinner */}
          {generatedReplyLoading && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ padding: "10px 16px", borderRadius: "16px 4px 16px 16px", background: "#EEF2FF", border: "1px solid #C7D2FE", display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <span key={i} style={{ fontSize: 14, color: "#6366F1", animation: `pulse 1s ${d}s infinite` }}>●</span>
                ))}
                <style>{`@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* ── SUPPLIER REPLY GENERATOR MODAL ── */}
        {showSupplierReply && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
            <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>✍️ Generate Reply</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{activeCustomer.name} · Supplier</div>
                  </div>
                  <button onClick={() => setShowSupplierReply(false)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
                </div>

                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>WHAT DO YOU WANT TO SAY?</div>
                <textarea value={supplierReplyCtx} onChange={e => setSupplierReplyCtx(e.target.value)} rows={3}
                  placeholder='e.g. "Accept their lot offer, ask for invoice and shipping quote"'
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 14 }} />

                <button onClick={generateSupplierReply} disabled={supplierReplyLoading} style={{
                  width: "100%", padding: 13, borderRadius: 12, border: "none", marginBottom: 18,
                  background: supplierReplyLoading ? "#E2E8F0" : "#2563EB",
                  color: supplierReplyLoading ? "#94A3B8" : "#fff",
                  fontWeight: 800, fontSize: 14, cursor: "pointer",
                }}>
                  {supplierReplyLoading ? "⏳ Generating…" : "⚡ Generate Gmail + WhatsApp"}
                </button>

                {supplierReplyGmail && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>📧 GMAIL — FORMAL</div>
                    <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: 8 }}>
                      {supplierReplyGmail}
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(supplierReplyGmail); setCopiedSupGmail(true); setTimeout(() => setCopiedSupGmail(false), 2000); }}
                      style={{ padding: "6px 16px", borderRadius: 20, border: "none", background: copiedSupGmail ? "#ECFDF5" : "#F1F5F9", color: copiedSupGmail ? "#059669" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
                      {copiedSupGmail ? "✓ Copied!" : "📋 Copy Gmail"}
                    </button>
                  </div>
                )}

                {supplierReplyWA && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", marginBottom: 8 }}>💬 WHATSAPP — SHORT</div>
                    <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#1E293B", lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: 8 }}>
                      {supplierReplyWA}
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(supplierReplyWA); setCopiedSupWA(true); setTimeout(() => setCopiedSupWA(false), 2000); }}
                      style={{ padding: "6px 16px", borderRadius: 20, border: "none", background: copiedSupWA ? "#ECFDF5" : "#F1F5F9", color: copiedSupWA ? "#059669" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
                      {copiedSupWA ? "✓ Copied!" : "📋 Copy WhatsApp"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* edit sent overlay */}
        {editSent && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", zIndex: 50 }}>
            <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", padding: "20px 20px 32px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10, color: "#0F172A" }}>✏️ Edit Before Sending</div>
              <textarea value={editSent.text} onChange={e => setEditSent(p => ({ ...p, text: e.target.value }))} rows={5}
                style={{ width: "100%", padding: 12, borderRadius: 12, border: "1.5px solid #C7D2FE", fontSize: 13.5, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.6 }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => confirmSent(editSent.msgId, editSent.text)}
                  style={{ flex: 1, padding: 13, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  Confirm Sent →
                </button>
                <button onClick={() => setEditSent(null)}
                  style={{ padding: "13px 18px", borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 14, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── INPUT BAR — always visible ── */}
        <div style={{ padding: "10px 12px 20px", background: "#fff", borderTop: "1px solid #F1F5F9", position: "sticky", bottom: 0 }}>

          {/* AI generated reply box — shown above inputs when ready */}
          {generatedReply && !generatedReplyLoading && (
            <div style={{ marginBottom: 12, background: "#EEF2FF", borderRadius: 14, padding: 12, border: "1px solid #C7D2FE" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", letterSpacing: 0.5, marginBottom: 6 }}>🤖 SUGGESTED REPLY</div>
              {editingGenerated ? (
                <textarea value={generatedReply} onChange={e => setGeneratedReply(e.target.value)} rows={3} autoFocus
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #6366F1", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box", background: "#fff" }} />
              ) : (
                <div style={{ fontSize: 13, color: "#1E1B4B", lineHeight: 1.65, whiteSpace: "pre-line" }}>
                  {generatedReply}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <button onClick={sendAIReply}
                  style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                  ✅ Send
                </button>
                {activeCustomer?.number && (
                  <button
                    onClick={() => {
                      const text = generatedReply.trim();
                      const number = activeCustomer.number.replace(/\D/g, "");
                      window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
                    }}
                    style={{ padding: "9px 12px", borderRadius: 10, border: "none", background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    📱 WA
                  </button>
                )}
                <button onClick={() => setEditingGenerated(v => !v)}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid #C7D2FE", background: "#fff", color: "#6366F1", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  {editingGenerated ? "Done" : "✏️ Edit"}
                </button>
                <button onClick={() => { setGeneratedReply(""); setReplyingToId(null); setEditingGenerated(false); }}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  ❌ Skip
                </button>
              </div>
            </div>
          )}

          {/* ── PRIMARY ACTION BAR ── */}
          <div style={{ marginBottom: 8 }}>
            {/* Reserve — primary action for WhatsApp clients */}
            <button
              onClick={handleReserveDevice}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 12,
                border: "none",
                background: "linear-gradient(135deg, #F59E0B, #D97706)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                marginBottom: 6,
              }}
            >
              🔒 Reserve Device
            </button>
            {/* Confirm Sale — secondary action */}
            <div style={{ textAlign: "center" }}>
              <button
                onClick={handleConfirmSale}
                style={{
                  background: "none",
                  border: "none",
                  color: "#6366F1",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: "2px 8px",
                }}
              >
                ⚡ Confirm Sale instead →
              </button>
            </div>
          </div>

          {/* TOP ROW — paste client's incoming message */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
            <textarea
              value={incomingText}
              onChange={e => setIncomingText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addIncomingMessage(); } }}
              placeholder="New message from client..."
              rows={1}
              style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5, background: "#F8FAFC" }}
            />
            <button onClick={addIncomingMessage} disabled={!incomingText.trim()}
              style={{ padding: "9px 14px", height: 38, borderRadius: 10, border: "none", background: incomingText.trim() ? "#22C55E" : "#E2E8F0", color: incomingText.trim() ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 12, cursor: incomingText.trim() ? "pointer" : "not-allowed", whiteSpace: "nowrap", flexShrink: 0 }}>
              + Add
            </button>
          </div>

          {/* BOTTOM ROW — type your own outgoing message (always usable) */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              id="ownerReplyInput"
              value={directReplyText}
              onChange={e => setDirectReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDirectReply(); } }}
              placeholder="Type your message..."
              rows={2}
              style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13.5, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5 }}
            />
            <button onClick={sendDirectReply} disabled={!directReplyText.trim()}
              style={{ width: 46, height: 52, borderRadius: 12, border: "none", background: directReplyText.trim() ? "#6366F1" : "#E2E8F0", color: directReplyText.trim() ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 20, cursor: directReplyText.trim() ? "pointer" : "not-allowed", flexShrink: 0 }}>
              ↑
            </button>
            {activeCustomer?.number && directReplyText.trim() && (
              <button
                onClick={() => {
                  const text = directReplyText.trim();
                  if (!text) return;
                  const number = activeCustomer.number.replace(/\D/g, "");
                  window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank");
                }}
                style={{ width: 46, height: 52, borderRadius: 12, border: "none", background: "#25D366", color: "#fff", fontWeight: 800, fontSize: 18, cursor: "pointer", flexShrink: 0 }}
                title="Send via WhatsApp"
              >
                📱
              </button>
            )}
          </div>
        </div>
        </div>{/* end detail content wrapper */}

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
      </div>
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

        {/* stats */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            { label: "Open Deals", value: openDeals, color: "#6366F1", bg: "#EEF2FF" },
            { label: "Closed", value: closedDeals, color: "#10B981", bg: "#ECFDF5" },
            { label: "This Month", value: `AED ${revenue >= 1000 ? (revenue / 1000).toFixed(1) + "k" : revenue}`, color: "#F59E0B", bg: "#FFFBEB" },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 9, color: s.color, fontWeight: 700, opacity: 0.75, marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* search */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Search name or number..."
          style={{ width: "100%", padding: "9px 13px", borderRadius: 12, border: "1.5px solid #F1F5F9", background: "#F8FAFC", fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />

        {/* contact type filter */}
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          {[
            { key: "all",      label: "All" },
            { key: "client",   label: "🔴 Clients" },
            { key: "trader",   label: "🟡 Traders" },
            { key: "supplier", label: "🔵 Suppliers" },
            { key: "walkin",   label: "⚡ Walk-in" },
          ].map(f => (
            <button key={f.key} onClick={() => setContactTypeFilter(f.key)}
              style={{ padding: "5px 14px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: contactTypeFilter === f.key ? "#0F172A" : "#F1F5F9",
                color:      contactTypeFilter === f.key ? "#fff"    : "#64748B", transition: "all 0.15s" }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* behaviour filters */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10 }}>
          {[
            { key: "all",     label: "All" },
            { key: "urgent",  label: "🔴 Urgent" },
            { key: "overdue", label: "⏰ Overdue" },
            { key: "vip",     label: "⭐ VIP" },
            { key: "cold",    label: "❄️ Cold" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding: "5px 14px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer", background: filter === f.key ? "#6366F1" : "#F1F5F9", color: filter === f.key ? "#fff" : "#64748B", transition: "all 0.15s" }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* ── HOME / DASHBOARD TAB ── */}
      {activeTab === "home" && (() => {
        const followUpsDue = tasks.filter(t => t.days >= 1).length;
        const urgentClients = customers.filter(c => c.urgent).length;
        const overdueFollowUps = tasks.filter(t => t.days >= 1).length;
        const slowStock = stock.filter(s => s.status === "available" && daysSince(s.created_at) >= 7).length;
        const pendingPayments = customers.reduce((n, c) => n + (c.deals || []).filter(d => d.stage === "closed" && d.payment_status === "pending").length, 0);
        const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
        const reservedItems = stock.filter(s => s.status === "reserved");
        const pickupsToday  = reservedItems.filter(s => s.pickup_date && new Date(s.pickup_date).toDateString() === new Date().toDateString());
        const overduePickups = reservedItems.filter(s => s.pickup_date && new Date(s.pickup_date) < todayMidnight);
        const topFocus = [
          ...tasks.filter(t => t.days >= 3).map(t => ({ ...t, priority: 3 })),
          ...tasks.filter(t => t.days >= 1 && t.days < 3).map(t => ({ ...t, priority: 2 })),
          ...customers.filter(c => c.urgent).flatMap(c => (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost").map(d => ({ customer: c, deal: d, days: daysSince(c.last_active), type: "urgent", priority: 2 }))),
        ].sort((a, b) => b.priority - a.priority || b.days - a.days).slice(0, 3);
        const recentActivity = (() => {
          const items = [];
          [...customers].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 3).forEach(c => items.push({ icon: "👤", text: `New client: ${c.name}`, date: c.created_at }));
          [...stock].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 3).forEach(s => {
            const device = [s.brand, s.model].filter(Boolean).join(" ") || "Device";
            items.push({ icon: s.status === "sold" ? "💸" : "📦", text: `${s.status === "sold" ? "Sold" : "Added"}: ${device}`, date: s.created_at });
          });
          customers.forEach(c => (c.deals || []).forEach(d => {
            if (d.stage === "closed" && d.closed_at) items.push({ icon: "✅", text: `Deal closed: ${c.name}${d.value ? ` AED ${d.value}` : ""}`, date: d.closed_at });
          }));
          return items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 5);
        })();

        return (
          <div style={{ flex: 1, padding: isMobile ? "16px 12px 100px" : "24px 32px 40px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
            {/* Greeting */}
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>{getGreeting()} 👋</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
            </div>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
              {[
                { label: "Open Deals", value: openDeals, color: "#6366F1", bg: "#EEF2FF", icon: "📋" },
                { label: "Revenue MTD", value: (() => { const total = revenue + partsRevMTD; return `AED ${total >= 1000 ? (total/1000).toFixed(1)+"k" : total}`; })(), color: "#10B981", bg: "#ECFDF5", icon: "💰" },
                { label: "In Stock", value: stock.filter(s => s.status === "available").length, color: "#F59E0B", bg: "#FFFBEB", icon: "📦" },
                { label: "Follow Ups", value: followUpsDue, color: "#EF4444", bg: "#FEF2F2", icon: "⏰" },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 16, padding: "14px 16px" }}>
                  <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: s.color, fontWeight: 600, opacity: 0.8 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Today's sales stat */}
            {todaySales.total > 0 && (
              <div style={{ background: "#fff", borderRadius: 14, padding: "10px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 16 }}>🏷️</span>
                <span style={{ fontSize: 13, color: "#0F172A", fontWeight: 600 }}>
                  Today: <b>{todaySales.total}</b> sale{todaySales.total !== 1 ? "s" : ""}
                  {todaySales.whatsapp > 0 && <span style={{ color: "#10B981" }}> ({todaySales.whatsapp} WhatsApp</span>}
                  {todaySales.walkin > 0 && <span style={{ color: "#6366F1" }}>{todaySales.whatsapp > 0 ? " + " : " ("}{todaySales.walkin} walk-in ⚡</span>}
                  {(todaySales.whatsapp > 0 || todaySales.walkin > 0) && <span>)</span>}
                </span>
              </div>
            )}

            {/* Alerts */}
            {(urgentClients > 0 || overdueFollowUps > 0 || slowStock > 0 || pendingPayments > 0 || pickupsToday.length > 0 || overduePickups.length > 0) && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, letterSpacing: 0.5 }}>⚡ ALERTS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pickupsToday.length > 0 && <button onClick={() => { setStockFilter("reserved"); setActiveTab("stock"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FFFBEB", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#D97706", fontWeight: 700 }}>🔒 {pickupsToday.length} reservation{pickupsToday.length !== 1 ? "s" : ""} — pickup today</span><span style={{ color: "#D97706", fontSize: 13 }}>→</span></button>}
                  {overduePickups.length > 0 && <button onClick={() => { setStockFilter("reserved"); setActiveTab("stock"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FEF2F2", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#EF4444", fontWeight: 700 }}>⚠️ {overduePickups.length} reservation{overduePickups.length !== 1 ? "s" : ""} overdue — client didn't show</span><span style={{ color: "#EF4444", fontSize: 13 }}>→</span></button>}
                  {urgentClients > 0 && <button onClick={() => { setFilter("urgent"); setActiveTab("customers"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FEF2F2", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#EF4444", fontWeight: 700 }}>🔴 {urgentClients} urgent client{urgentClients !== 1 ? "s" : ""}</span><span style={{ color: "#EF4444", fontSize: 13 }}>→</span></button>}
                  {overdueFollowUps > 0 && <button onClick={() => setActiveTab("tasks")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FFFBEB", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#F59E0B", fontWeight: 700 }}>⏰ {overdueFollowUps} overdue follow up{overdueFollowUps !== 1 ? "s" : ""}</span><span style={{ color: "#F59E0B", fontSize: 13 }}>→</span></button>}
                  {slowStock > 0 && <button onClick={() => { setStockFilter("available"); setActiveTab("stock"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FEF9C3", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#CA8A04", fontWeight: 700 }}>⚠️ {slowStock} device{slowStock !== 1 ? "s" : ""} unsold 7+ days</span><span style={{ color: "#CA8A04", fontSize: 13 }}>→</span></button>}
                  {pendingPayments > 0 && <button onClick={() => { setFilter("all"); setActiveTab("customers"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#ECFDF5", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#10B981", fontWeight: 700 }}>💰 {pendingPayments} payment{pendingPayments !== 1 ? "s" : ""} pending</span><span style={{ color: "#10B981", fontSize: 13 }}>→</span></button>}
                </div>
              </div>
            )}

            {/* Sourcing Alerts */}
            {(sourcingAlerts.bidsDue.length > 0 || sourcingAlerts.inTransit > 0 || sourcingAlerts.arrived > 0 || sourcingAlerts.paymentDue > 0) && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, letterSpacing: 0.5 }}>🌍 SOURCING ALERTS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sourcingAlerts.bidsDue.length > 0 && <button onClick={() => setActiveTab("sourcing")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#FEF2F2", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#EF4444", fontWeight: 700 }}>⚠️ {sourcingAlerts.bidsDue.length} bid{sourcingAlerts.bidsDue.length !== 1 ? "s" : ""} due within 24h</span><span style={{ color: "#EF4444", fontSize: 13 }}>→</span></button>}
                  {sourcingAlerts.paymentDue > 0 && <button onClick={() => setActiveTab("sourcing")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#DBEAFE", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#3B82F6", fontWeight: 700 }}>💳 {sourcingAlerts.paymentDue} payment{sourcingAlerts.paymentDue !== 1 ? "s" : ""} pending</span><span style={{ color: "#3B82F6", fontSize: 13 }}>→</span></button>}
                  {sourcingAlerts.inTransit > 0 && <button onClick={() => setActiveTab("sourcing")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#EDE9FE", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#8B5CF6", fontWeight: 700 }}>🚚 {sourcingAlerts.inTransit} shipment{sourcingAlerts.inTransit !== 1 ? "s" : ""} in transit</span><span style={{ color: "#8B5CF6", fontSize: 13 }}>→</span></button>}
                  {sourcingAlerts.arrived > 0 && <button onClick={() => setActiveTab("sourcing")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 10, border: "none", background: "#CFFAFE", cursor: "pointer", textAlign: "left" }}><span style={{ fontSize: 13, color: "#06B6D4", fontWeight: 700 }}>📦 {sourcingAlerts.arrived} lot{sourcingAlerts.arrived !== 1 ? "s" : ""} arrived — add to stock</span><span style={{ color: "#06B6D4", fontSize: 13 }}>→</span></button>}
                </div>
              </div>
            )}

            {/* Today's focus */}
            {topFocus.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, letterSpacing: 0.5 }}>🎯 TODAY'S FOCUS</div>
                {topFocus.map((t, i) => {
                  const c = t.customer; const d = t.deal;
                  const device = [d?.brand, d?.model].filter(Boolean).join(" ") || "Open deal";
                  const stage = STAGES.find(s => s.id === d?.stage)?.label || "";
                  return (
                    <div key={i} onClick={() => { setActiveCustomerId(c.id); setActiveDealId(d?.id); setView("detail"); setPendingSuggestion(null); }}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", marginBottom: i < topFocus.length - 1 ? 6 : 0, background: "#F8FAFC", borderRadius: 12, cursor: "pointer", border: "1px solid #F1F5F9" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "#94A3B8" }}>{device} · {stage}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: t.days >= 3 ? "#EF4444" : "#F59E0B" }}>{t.days}d silent</div>
                        <span style={{ fontSize: 12, color: "#6366F1" }}>→</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Recent activity */}
            {recentActivity.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, letterSpacing: 0.5 }}>🕐 RECENT ACTIVITY</div>
                {recentActivity.map((a, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: i < recentActivity.length - 1 ? 8 : 0, marginBottom: i < recentActivity.length - 1 ? 8 : 0, borderBottom: i < recentActivity.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                    <span style={{ fontSize: 13, color: "#475569" }}>{a.icon} {a.text}</span>
                    <span style={{ fontSize: 11, color: "#CBD5E1", flexShrink: 0, marginLeft: 8 }}>{timeAgo(a.date)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick actions */}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setActiveTab("customers"); setView("add"); }}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ New Client</button>
              <button onClick={() => { setActiveTab("stock"); setShowAddStock(true); setEditingStock(null); setStockForm(EMPTY_STOCK); }}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: "none", background: "#10B981", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+ Add Stock</button>
              <button onClick={() => { setActiveTab("customers"); setSearch(""); }}
                style={{ flex: 1, padding: 12, borderRadius: 14, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🔍 Search</button>
            </div>
          </div>
        );
      })()}

      {/* ── CUSTOMERS TAB ── */}
      {activeTab === "customers" && (
        <div style={{ flex: 1, padding: isMobile ? "10px 12px 100px" : "16px 24px 40px", display: "flex", flexDirection: "column", gap: 8 }}>
          {loading && <Spinner />}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#CBD5E1" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>💼</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>{search || filter !== "all" ? "No customers match" : "No customers yet"}</div>
              <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>{!search && filter === "all" && "Tap + Add to get started"}</div>
            </div>
          )}
          {filtered.map(c => {
            const cType      = c.contact_type || "client";
            const tier       = TIERS[c.tier] || TIERS.cold;
            const openD      = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost");
            const latestDeal = openD[openD.length - 1] || (c.deals || [])[c.deals.length - 1];
            const overdue    = daysSince(c.last_active) >= 1 && openD.length > 0;
            const totalValue = (c.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
            const activityTs = c.last_activity_at || c.last_active;

            // Last message from batch-loaded map
            const lastMsg   = lastMsgMap[c.id];
            const msgText   = lastMsg ? (lastMsg.sent && lastMsg.sent !== "NOT_SENT" ? lastMsg.sent : lastMsg.content) : null;
            const isUnread  = lastMsg && lastMsg.role === "customer" && (!lastMsg.sent || lastMsg.sent === "NOT_SENT");

            // Preview: real last message → deal info fallback → notes fallback
            const preview = msgText
              ? msgText.slice(0, 40) + (msgText.length > 40 ? "…" : "")
              : latestDeal
                ? ([latestDeal.brand, latestDeal.model].filter(Boolean).join(" ") || "Device TBD") + (latestDeal.budget ? ` · AED ${Number(latestDeal.budget).toLocaleString()}` : "")
                : (c.notes?.slice(0, 40) || c.number || "No messages yet");

            const typeBadge = cType === "trader"   ? { label: "🟡 Trader",   color: "#D97706", bg: "#FFFBEB" }
                            : cType === "supplier"  ? { label: "🔵 Supplier", color: "#2563EB", bg: "#EFF6FF" }
                            : cType === "walkin"    ? { label: "⚡ Walk-in",  color: "#6366F1", bg: "#EEF2FF" }
                            : null;

            return (
              <div key={c.id} onClick={() => { setActiveCustomerId(c.id); setActiveDealId(latestDeal?.id); setView("detail"); setPendingSuggestion(null); }}
                style={{ background: "#fff", borderRadius: 18, padding: "12px 14px", border: `1.5px solid ${c.urgent ? "#FECACA" : "#F1F5F9"}`, cursor: "pointer", boxShadow: c.urgent ? "0 2px 16px rgba(239,68,68,0.08)" : "0 1px 4px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" }}>
                {c.urgent && <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: "#EF4444" }} />}

                {/* Row 1 — avatar + name + timestamp */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Avatar with green dot if unread */}
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: c.urgent ? "#FEF2F2" : cType === "trader" ? "#FFFBEB" : cType === "supplier" ? "#EFF6FF" : "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: c.urgent ? "#EF4444" : cType === "trader" ? "#D97706" : cType === "supplier" ? "#2563EB" : "#6366F1", textTransform: "uppercase" }}>
                      {c.name[0]}
                    </div>
                    {isUnread && (
                      <div style={{ position: "absolute", bottom: 1, right: 1, width: 11, height: 11, borderRadius: "50%", background: "#22C55E", border: "2px solid #fff" }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Name row + timestamp */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        {typeBadge && <span style={{ fontSize: 9, fontWeight: 700, color: typeBadge.color, background: typeBadge.bg, padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>{typeBadge.label}</span>}
                        {c.urgent && <Badge color="#EF4444" bg="#FEF2F2" small>URGENT</Badge>}
                      </div>
                      <span style={{ fontSize: 11, color: isUnread ? "#22C55E" : "#94A3B8", fontWeight: isUnread ? 700 : 400, flexShrink: 0 }}>
                        {waTsFormat(activityTs)}
                      </span>
                    </div>

                    {/* Preview line */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      {lastMsg && lastMsg.role !== "customer" && (
                        <span style={{ fontSize: 10, color: "#94A3B8", flexShrink: 0 }}>You:</span>
                      )}
                      <span style={{ fontSize: 12, color: isUnread ? "#0F172A" : "#94A3B8", fontWeight: isUnread ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {preview}
                      </span>
                      {isUnread && (
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
                      )}
                    </div>
                  </div>
                </div>

                {/* Stage bar for clients */}
                {cType === "client" && latestDeal && (
                  <div style={{ marginTop: 8, marginLeft: 54 }}>
                    <StageBar stageId={latestDeal.stage} />
                  </div>
                )}

                {/* Bottom row */}
                {(totalValue > 0 || overdue || (cType !== "client" && (c.location || c.number))) && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5, marginLeft: 54 }}>
                    {cType === "client"
                      ? <span style={{ fontSize: 10, color: "#CBD5E1" }}>{(c.deals || []).length} deal{(c.deals || []).length !== 1 ? "s" : ""}</span>
                      : <span style={{ fontSize: 10, color: "#94A3B8" }}>{c.location || c.number || ""}</span>
                    }
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {totalValue > 0 && <span style={{ fontSize: 10, color: "#10B981", fontWeight: 700 }}>AED {totalValue.toLocaleString()}</span>}
                      {overdue && <span style={{ fontSize: 9, color: "#EF4444", fontWeight: 700 }}>⚠️ Follow up</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}


      {/* ── STOCK TAB ── */}
      {activeTab === "stock" && (
        <div style={{ flex: 1, padding: isMobile ? "10px 12px 100px" : "16px 32px 40px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Devices / Parts toggle */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "devices", label: "💻 Devices" },
              { key: "parts",   label: "🔧 Parts" },
            ].map(v => (
              <button key={v.key} onClick={() => setStockView(v.key)}
                style={{ flex: 1, padding: "9px 0", borderRadius: 12, border: "none",
                         fontWeight: 700, fontSize: 13, cursor: "pointer",
                         background: stockView === v.key ? "#6366F1" : "#F1F5F9",
                         color:      stockView === v.key ? "#fff"    : "#64748B" }}>
                {v.label}
              </button>
            ))}
          </div>

          {/* ══ PARTS VIEW ══ */}
          {stockView === "parts" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>🔧 Spare Parts</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{parts.length} part{parts.length !== 1 ? "s" : ""} in inventory</div>
                </div>
                <button onClick={() => { setEditingPart(null); setPartForm(EMPTY_PART); setShowAddPart(true); }}
                  style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                  + Add Part
                </button>
              </div>

              {partsLoading && <Spinner />}

              {!partsLoading && parts.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#CBD5E1" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🔧</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8" }}>No parts yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Tap + Add Part to start tracking spare parts</div>
                </div>
              )}

              {parts.map(p => (
                <div key={p.id} style={{ background: "#fff", borderRadius: 16, padding: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 18 }}>{PART_ICONS[p.category] || "🔧"}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{p.category}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 10,
                          background: p.quantity === 0 ? "#FEF2F2" : "#ECFDF5",
                          color:      p.quantity === 0 ? "#EF4444" : "#059669",
                        }}>
                          {p.quantity === 0 ? "Out of stock" : `×${p.quantity}`}
                        </span>
                      </div>
                      {p.compatible_with && <div style={{ fontSize: 12, color: "#6366F1", fontWeight: 600 }}>🖥️ {p.compatible_with}</div>}
                      {p.specs        && <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{p.specs}</div>}
                      {p.condition    && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{p.condition}</div>}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                      {p.sell_price && <div style={{ fontSize: 14, fontWeight: 800, color: "#10B981" }}>AED {Number(p.sell_price).toLocaleString()}</div>}
                      {p.cost_price && <div style={{ fontSize: 11, color: "#94A3B8" }}>Cost: AED {Number(p.cost_price).toLocaleString()}</div>}
                      {p.sell_price && p.cost_price && (() => {
                        const prof = Number(p.sell_price) - Number(p.cost_price);
                        return <div style={{ fontSize: 11, fontWeight: 700, color: prof >= 0 ? "#10B981" : "#EF4444" }}>+AED {prof.toLocaleString()}/unit</div>;
                      })()}
                    </div>
                  </div>
                  {p.source && <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>📦 {p.source}</div>}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { setEditingPart(p); setPartForm({ category: p.category || "RAM", compatible_with: p.compatible_with || "", specs: p.specs || "", condition: p.condition || "Used", quantity: p.quantity ?? 1, cost_price: p.cost_price ?? "", sell_price: p.sell_price ?? "", source: p.source || "", notes: p.notes || "" }); setShowAddPart(true); }}
                      style={{ flex: 1, padding: "6px", borderRadius: 8, border: "1.5px solid #C7D2FE", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✏️ Edit</button>
                    <button onClick={() => { setPartSaleTarget(p); setShowPartSale(true); }}
                      disabled={p.quantity === 0}
                      style={{ flex: 1, padding: "6px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: p.quantity === 0 ? "not-allowed" : "pointer",
                               background: p.quantity === 0 ? "#F1F5F9" : "#6366F1", color: p.quantity === 0 ? "#94A3B8" : "#fff" }}>⚡ Sell</button>
                    <button onClick={() => { if (window.confirm("Delete this part?")) deletePart(p.id); }}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1.5px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🗑</button>
                  </div>
                </div>
              ))}

              {/* Add/Edit Part Modal */}
              {showAddPart && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, overflowY: "auto" }}>
                  <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 440 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <span style={{ fontSize: 16, fontWeight: 800 }}>{editingPart ? "Edit Part" : "Add Part"}</span>
                        <button onClick={() => { setShowAddPart(false); setEditingPart(null); setPartForm(EMPTY_PART); }} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
                      </div>

                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>CATEGORY</div>
                        <select value={partForm.category} onChange={e => setPartForm(f => ({ ...f, category: e.target.value }))}
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", background: "#fff" }}>
                          {PART_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>

                      {[
                        { label: "COMPATIBLE WITH",   key: "compatible_with", ph: 'e.g. "MacBook Air M2" or "Universal"' },
                        { label: "SPECS",             key: "specs",           ph: 'e.g. "8GB DDR4 3200MHz"' },
                        { label: "SUPPLIER / SOURCE", key: "source",          ph: "e.g. Electro CW, local market" },
                      ].map(({ label, key, ph }) => (
                        <div key={key} style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                          <input value={partForm[key]} onChange={e => setPartForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                        </div>
                      ))}

                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>CONDITION</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {["New", "Used", "Pulled"].map(c => (
                            <button key={c} onClick={() => setPartForm(f => ({ ...f, condition: c }))}
                              style={{ flex: 1, padding: "7px 0", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                                       background: partForm.condition === c ? "#6366F1" : "#F1F5F9",
                                       color:      partForm.condition === c ? "#fff"    : "#64748B" }}>
                              {c}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                        {[
                          { label: "QUANTITY",   key: "quantity",   type: "number", ph: "1" },
                          { label: "COST (AED)", key: "cost_price", type: "number", ph: "0" },
                          { label: "SELL (AED)", key: "sell_price", type: "number", ph: "0" },
                        ].map(({ label, key, type, ph }) => (
                          <div key={key}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
                            <input type={type} value={partForm[key]} onChange={e => setPartForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                              style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                          </div>
                        ))}
                      </div>

                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>NOTES</div>
                        <textarea value={partForm.notes} onChange={e => setPartForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                          placeholder="Any extra notes…"
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { setShowAddPart(false); setEditingPart(null); setPartForm(EMPTY_PART); }}
                          style={{ flex: 1, padding: 12, borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                        <button onClick={savePart}
                          style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                          {editingPart ? "Save Changes" : "Add Part"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══ DEVICES VIEW (existing, shown when stockView === "devices") ══ */}
          {stockView === "devices" && (<>

          {/* Stats */}
          {stock.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "Available", value: stock.filter(s => s.status === "available").length, color: "#10B981", bg: "#ECFDF5" },
                { label: "Sold", value: stock.filter(s => s.status === "sold").length, color: "#6366F1", bg: "#EEF2FF" },
                { label: "Total Items", value: stock.length, color: "#F59E0B", bg: "#FFFBEB" },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 14, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: s.color, fontWeight: 700, opacity: 0.8 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Search + Add + Import */}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={stockSearch} onChange={e => setStockSearch(e.target.value)} placeholder="🔍  Search brand, model, serial..."
              style={{ flex: 1, padding: "9px 13px", borderRadius: 12, border: "1.5px solid #F1F5F9", background: "#F8FAFC", fontSize: 13, outline: "none" }} />
            <button onClick={() => { setShowImportStock(true); setImportPreview(null); setImportStockResult(null); }}
              style={{ height: 38, padding: "0 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
              📥
            </button>
            <button onClick={() => { setEditingStock(null); setStockForm(EMPTY_STOCK); setShowAddStock(true); }}
              style={{ height: 38, padding: "0 16px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
              + Add
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              { key: "available",   label: "✅ Available" },
              { key: "reserved",    label: "🔒 Reserved", color: "#F59E0B", activeBg: "#F59E0B" },
              { key: "sold",        label: "🏷️ Sold" },
              { key: "parts_sold",  label: "🔧 Parts Sold", color: "#8B5CF6", activeBg: "#8B5CF6" },
              { key: "all",         label: "All" },
            ].map(f => (
              <button key={f.key} onClick={() => setStockFilter(f.key)}
                style={{ padding: "5px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0,
                         background: stockFilter === f.key ? (f.activeBg || "#6366F1") : "#F1F5F9",
                         color:      stockFilter === f.key ? "#fff" : (f.color || "#64748B") }}>
                {f.label}
                {f.key === "reserved" && stock.filter(s => s.status === "reserved").length > 0 && (
                  <span style={{ marginLeft: 4, background: stockFilter === "reserved" ? "rgba(255,255,255,0.3)" : "#F59E0B", color: "#fff", borderRadius: 8, padding: "0 5px", fontSize: 10 }}>
                    {stock.filter(s => s.status === "reserved").length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {stockLoading && stockFilter !== "parts_sold" && <Spinner />}

          {/* Parts sold view */}
          {stockFilter === "parts_sold" && (() => {
            if (partsSoldLoading) return <Spinner />;
            if (partsSold.length === 0) return (
              <div style={{ textAlign:"center", padding:"60px 20px", color:"#CBD5E1" }}>
                <div style={{ fontSize:36, marginBottom:8 }}>🔧</div>
                <div style={{ fontSize:14, fontWeight:700, color:"#94A3B8" }}>No parts sold yet</div>
              </div>
            );
            const totalRev  = partsSold.reduce((s, d) => s + (Number(d.value) || 0), 0);
            return (
              <>
                <div style={{ padding:"10px 16px", background:"#F5F3FF", borderRadius:12, display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:13, fontWeight:800, color:"#8B5CF6" }}>{partsSold.length} part sale{partsSold.length !== 1 ? "s" : ""}</span>
                  {totalRev > 0 && <span style={{ fontSize:12, color:"#7C3AED", fontWeight:600 }}>· Revenue AED {totalRev.toLocaleString()}</span>}
                </div>
                {partsSold.map((d, i) => (
                  <div key={d.id || i} style={{ background:"#fff", borderRadius:14, padding:"12px 14px", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#0F172A" }}>
                          🔧 {d.category ? `${d.category}${d.specs ? ` — ${d.specs}` : ""}` : d.notes || "Part sale"}
                        </div>
                        <div style={{ fontSize:11, color:"#94A3B8", marginTop:2 }}>
                          Sold to: {d.customer_name || "Walk-in"} · Qty: ×{d.quantity_sold || 1}
                          {d.compatible_with ? ` · ${d.compatible_with}` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        {d.value && <div style={{ fontSize:14, fontWeight:800, color:"#8B5CF6" }}>AED {Number(d.value).toLocaleString()}</div>}
                        <div style={{ fontSize:10, color:"#94A3B8" }}>{d.payment_method || "—"}</div>
                      </div>
                    </div>
                    {(d.sold_at || d.closed_at) && (
                      <div style={{ fontSize:11, color:"#CBD5E1" }}>
                        {new Date(d.sold_at || d.closed_at).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" })}
                      </div>
                    )}
                  </div>
                ))}
              </>
            );
          })()}

          {/* Sold summary bar */}
          {!stockLoading && stockFilter === "sold" && filteredStock.length > 0 && (() => {
            const totalRev    = filteredStock.reduce((s, i) => s + (Number(i.sold_price || i.max_price) || 0), 0);
            const totalProfit = filteredStock.reduce((s, i) => s + ((Number(i.sold_price || i.max_price) || 0) - (Number(i.cost_price) || 0)), 0);
            const avgProfit   = Math.round(totalProfit / filteredStock.length);
            return (
              <div style={{ padding: "10px 16px", background: "#EEF2FF", borderRadius: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#6366F1" }}>
                  {filteredStock.length} device{filteredStock.length !== 1 ? "s" : ""} sold
                </span>
                {totalRev > 0 && (
                  <span style={{ fontSize: 12, color: "#4338CA", fontWeight: 600 }}>
                    · Revenue AED {totalRev.toLocaleString()}
                  </span>
                )}
                {avgProfit !== 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: avgProfit >= 0 ? "#10B981" : "#EF4444" }}>
                    · Avg profit AED {avgProfit.toLocaleString()}
                  </span>
                )}
              </div>
            );
          })()}

          {/* Empty state */}
          {!stockLoading && stockFilter !== "parts_sold" && filteredStock.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>
                {stockSearch || stockFilter !== "available" ? "No items match" : "No available stock"}
              </div>
              <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>
                {!stockSearch && stockFilter === "available" && "Tap + Add to list your first item"}
              </div>
            </div>
          )}

          {/* Reserved deals — deal-centric view */}
          {stockFilter === "reserved" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {reservedDealsLoading && <Spinner />}
              {!reservedDealsLoading && reservedDeals.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px 20px" }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>No reservations</div>
                </div>
              )}
              {!reservedDealsLoading && reservedDeals.map(deal => {
                const customer = deal.customers;
                const items = deal.deal_items || [];
                const isExpanded = expandedReservedDeal === deal.id;
                const today = new Date(); today.setHours(0,0,0,0);
                const isOverdue = deal.pickup_date && new Date(deal.pickup_date) < today;
                const pickupLabel = deal.pickup_date
                  ? new Date(deal.pickup_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                  : null;
                const deviceItems = items.filter(i => i.item_type === "device");
                const partItems = items.filter(i => i.item_type === "part");
                const itemSummary = [
                  ...deviceItems.map(i => [i.brand, i.model].filter(Boolean).join(" ") || "Device"),
                  ...partItems.map(i => i.category || "Part"),
                ].join(" · ");
                return (
                  <div key={deal.id} style={{
                    background: "#fff", borderRadius: 18,
                    border: `1.5px solid ${isOverdue ? "#FCA5A5" : "#FDE68A"}`,
                    boxShadow: "0 1px 6px rgba(245,158,11,0.15)",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      padding: "12px 14px",
                      background: isOverdue ? "#FEF2F2" : "#FFFBEB",
                      borderBottom: isExpanded ? "1px solid #FDE68A" : "none",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>
                            🔒 {customer?.name || "Walk-in"}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                            {itemSummary || "No items"}
                          </div>
                          <div style={{ fontSize: 11, color: isOverdue ? "#EF4444" : "#B45309", marginTop: 3, fontWeight: 700 }}>
                            {isOverdue ? `⚠️ Overdue — pickup was ${pickupLabel}` : `Pickup: ${pickupLabel || "—"}`}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 10 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: "#6366F1" }}>
                            AED {Number(deal.value || 0).toLocaleString()}
                          </div>
                          {deal.deposit_amount > 0 && (
                            <div style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>
                              Deposit: AED {Number(deal.deposit_amount).toLocaleString()}
                            </div>
                          )}
                          {deal.balance_due > 0 && (
                            <div style={{ fontSize: 10, color: "#EF4444", fontWeight: 700 }}>
                              Balance: AED {Number(deal.balance_due).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        <button onClick={() => setExpandedReservedDeal(isExpanded ? null : deal.id)}
                          style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid #FDE68A", background: "#fff", color: "#D97706", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          {isExpanded ? "▲ Hide Items" : `▼ ${items.length} Item${items.length !== 1 ? "s" : ""}`}
                        </button>
                        <button onClick={() => {
                          setCompletingDeal(deal);
                          setCompletionPaymentMethod("Cash");
                          setShowCompleteReservation(true);
                        }}
                          style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", background: "#10B981", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          ✅ Complete
                        </button>
                        <button onClick={() => {
                          setEditReservationItem(deal);
                          setEditReservationForm({
                            agreedPrice: String(deal.value || ""),
                            pickupDate: deal.pickup_date ? deal.pickup_date.split("T")[0] : "",
                            depositAmount: String(deal.deposit_amount || ""),
                            balanceDue: String(deal.balance_due || ""),
                            notes: deal.reservation_notes || "",
                          });
                          setShowEditReservation(true);
                        }}
                          style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1.5px solid #C7D2FE", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          ✏️ Edit
                        </button>
                        <button onClick={async () => {
                          if (!window.confirm("Release all items in this reservation?")) return;
                          const deviceItems = (deal.deal_items || []).filter(i => i.item_type === "device");
                          for (const item of deviceItems) {
                            if (item.stock_id) {
                              await supabase.from("stock").update({
                                status: "available",
                                reserved_for_customer_id: null,
                                reserved_at: null,
                                pickup_date: null,
                                sold_price: null,
                              }).eq("id", item.stock_id);
                            }
                          }
                          await supabase.from("deal_items").delete().eq("deal_id", deal.id);
                          await supabase.from("deals").update({
                            stage: "device_found",
                            value: null,
                            deposit_amount: null,
                            balance_due: null,
                            pickup_date: null,
                            stock_item_id: null,
                          }).eq("id", deal.id);
                          loadReservedDeals();
                          loadStock();
                          loadCustomers();
                        }}
                          style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          🔓
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                        {items.length === 0 && (
                          <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: "12px 0" }}>No items recorded</div>
                        )}
                        {items.map((item, i) => (
                          <div key={item.id || i} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "8px 12px", borderRadius: 10,
                            background: item.item_type === "device" ? "#F8FAFC" : "#F5F3FF",
                            border: `1px solid ${item.item_type === "device" ? "#F1F5F9" : "#DDD6FE"}`,
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                                {item.item_type === "device"
                                  ? ([item.brand, item.model].filter(Boolean).join(" ") || "Device")
                                  : `🔧 ${item.category || "Part"}${item.specs ? ` · ${item.specs}` : ""}`}
                              </div>
                              {item.item_type === "device" && (
                                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                                  {[item.ram, item.ssd, item.condition].filter(Boolean).join(" · ")}
                                  {item.upgrade_ram || item.upgrade_ssd ? " · ⬆ Upgraded" : ""}
                                </div>
                              )}
                              {item.item_type === "part" && item.quantity > 1 && (
                                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>×{item.quantity}</div>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "#6366F1" }}>
                                AED {Number(item.agreed_price || 0).toLocaleString()}
                              </div>
                              <button onClick={async () => {
                                if (!window.confirm("Release this item back to stock?")) return;
                                if (item.item_type === "device" && item.stock_id) {
                                  await supabase.from("stock").update({
                                    status: "available",
                                    reserved_for_customer_id: null,
                                    reserved_at: null,
                                    pickup_date: null,
                                    sold_price: null,
                                  }).eq("id", item.stock_id);
                                }
                                await supabase.from("deal_items").delete().eq("id", item.id);
                                const remaining = items.filter(x => x.id !== item.id);
                                const newTotal = remaining.reduce((s, x) => s + (Number(x.agreed_price) || 0), 0);
                                await supabase.from("deals").update({
                                  value: newTotal || null,
                                  balance_due: Math.max(0, newTotal - (Number(deal.deposit_amount) || 0)),
                                }).eq("id", deal.id);
                                loadReservedDeals();
                                loadStock();
                              }}
                                style={{ padding: "3px 8px", borderRadius: 6, border: "1.5px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                                🔓
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Stock cards — hidden when parts_sold filter is active */}
          {stockFilter !== "parts_sold" && stockFilter !== "reserved" && filteredStock.map(item => {
            const isExpanded = expandedStockId === item.id;
            const matches    = getMatchingClients(item);
            const isAvail    = item.status === "available";
            const isReserved = item.status === "reserved";
            const reservedFor = isReserved && item.reserved_for_customer_id
              ? customers.find(c => c.id === item.reserved_for_customer_id)
              : null;
            const pickupLabel = item.pickup_date
              ? new Date(item.pickup_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
              : null;
            const today = new Date(); today.setHours(0,0,0,0);
            const isOverdue = isReserved && item.pickup_date && new Date(item.pickup_date) < today;
            return (
              <div key={item.id} style={{ background: "#fff", borderRadius: 18,
                border: `1.5px solid ${isReserved ? (isOverdue ? "#FCA5A5" : "#FDE68A") : isAvail ? "#E2E8F0" : "#F1F5F9"}`,
                boxShadow: isReserved ? "0 1px 6px rgba(245,158,11,0.15)" : "0 1px 6px rgba(0,0,0,0.05)",
                overflow: "hidden", opacity: isAvail || isReserved || stockFilter === "sold" ? 1 : 0.7 }}>
              {/* Reserved banner */}
              {isReserved && (
                <div style={{ padding: "8px 14px", background: isOverdue ? "#FEF2F2" : "#FFFBEB", borderBottom: "1px solid #FDE68A", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: isOverdue ? "#EF4444" : "#D97706" }}>
                      🔒 Reserved{reservedFor ? ` for ${reservedFor.name}` : ""}
                    </div>
                    {pickupLabel && (
                      <div style={{ fontSize: 11, color: isOverdue ? "#EF4444" : "#B45309" }}>
                        {isOverdue ? `⚠️ Pickup was ${pickupLabel} — no show` : `Pickup: ${pickupLabel}`}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={e => { e.stopPropagation(); setQuickSalePrefill({ item, name: reservedFor?.name || "", number: reservedFor?.number || "", depositPaid: 0 }); setShowQuickSale(true); }}
                      style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "#10B981", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      ✅ Complete Sale
                    </button>
                    <button onClick={e => {
                      e.stopPropagation();
                      setEditReservationItem(item);
                      setEditReservationForm({
                        agreedPrice: String(item.sold_price || item.max_price || ""),
                        pickupDate: item.pickup_date ? item.pickup_date.split("T")[0] : "",
                        depositAmount: "",
                        balanceDue: "",
                        notes: item.reservation_notes || "",
                      });
                      setShowEditReservation(true);
                    }}
                      style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid #C7D2FE", background: "#EEF2FF", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      ✏️ Edit
                    </button>
                    <button onClick={async e => { e.stopPropagation(); if (!window.confirm("Release reservation and set item back to available?")) return; await supabase.from("stock").update({ status: "available", reserved_for_customer_id: null, reserved_at: null, pickup_date: null }).eq("id", item.id); loadStock(); }}
                      style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid #FDE68A", background: "#fff", color: "#D97706", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      🔓 Release
                    </button>
                  </div>
                </div>
              )}
                {item.photo_url && (
                  <img src={item.photo_url} alt={item.model || "stock"} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                )}
                {/* Card summary row — tap to expand */}
                <div onClick={() => setExpandedStockId(isExpanded ? null : item.id)} style={{ padding: "12px 14px", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: "#0F172A" }}>
                        {[item.brand, item.model].filter(Boolean).join(" ") || "Unnamed item"}
                      </div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                        {[item.processor, item.ram, item.ssd, item.screen].filter(Boolean).join(" · ") || "No specs entered"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, alignItems: "flex-start", flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); if (!isReserved) toggleStockStatus(item); }}
                        style={{ padding: "3px 10px", borderRadius: 20, border: "none", fontSize: 10, fontWeight: 700, cursor: isReserved ? "default" : "pointer",
                                 background: isReserved ? "#FFFBEB" : isAvail ? "#ECFDF5" : "#F1F5F9",
                                 color: isReserved ? "#D97706" : isAvail ? "#10B981" : "#94A3B8" }}>
                        {isReserved ? "🔒 Reserved" : isAvail ? "✅ Available" : "🏷️ Sold"}
                      </button>
                      {isAvail && (
                        <button onClick={e => { e.stopPropagation(); openBroadcast(item); }}
                          style={{ padding: "3px 8px", borderRadius: 8, border: "none", background: "#6366F1", color: "#fff", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                          📢
                        </button>
                      )}
                      {isAvail && (
                        <button onClick={e => { e.stopPropagation(); setUpgradeTarget(item); setShowUpgrade(true); }}
                          style={{ padding: "3px 8px", borderRadius: 8, border: "1px solid #FDE68A", background: "#FFFBEB", color: "#D97706", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                          ⬆
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); if (window.confirm(`Delete ${[item.brand, item.model].filter(Boolean).join(" ") || "this item"}?`)) deleteStockItem(item.id); }}
                        style={{ padding: "3px 8px", borderRadius: 8, border: "1px solid #FEE2E2", background: "#FEF2F2", color: "#EF4444", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Prices */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                    {item.max_price && <span style={{ fontSize: 14, fontWeight: 800, color: "#6366F1" }}>AED {Number(item.max_price).toLocaleString()}</span>}
                    {item.min_price && <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, alignSelf: "center" }}>min AED {Number(item.min_price).toLocaleString()}</span>}
                    {item.cost_price && <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, alignSelf: "center" }}>cost AED {Number(item.cost_price).toLocaleString()}</span>}
                  </div>

                  {/* Badges */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {item.condition && <Badge color="#6366F1" bg="#EEF2FF" small>{item.condition}</Badge>}
                    {item.charger === "yes" && <Badge color="#10B981" bg="#ECFDF5" small>🔌 Charger</Badge>}
                    {item.box === "yes" && <Badge color="#F59E0B" bg="#FFFBEB" small>📦 Box</Badge>}
                    {item.brand === "MacBook" && item.activation_lock === "no" && <Badge color="#10B981" bg="#ECFDF5" small>🔓 Unlocked</Badge>}
                    {item.brand === "MacBook" && item.activation_lock === "yes" && <Badge color="#EF4444" bg="#FEF2F2" small>🔒 Locked</Badge>}
                    {matches.length > 0 && <Badge color="#F59E0B" bg="#FFFBEB" small>👥 {matches.length} match{matches.length !== 1 ? "es" : ""}</Badge>}
                  </div>
                </div>

                {/* Sold details panel — shown for sold items */}
                {item.status === "sold" && (() => {
                  const linkedDeal  = soldDealMap[item.id];
                  const soldPrice   = Number(item.sold_price || linkedDeal?.value || item.max_price) || 0;
                  const costPrice   = Number(item.cost_price) || 0;
                  const profit      = soldPrice - costPrice;
                  const marginPct   = soldPrice > 0 ? Math.round((profit / soldPrice) * 100) : 0;
                  const custName    = item.sold_to_customer_id
                    ? (customers.find(c => c.id === item.sold_to_customer_id)?.name || "Customer")
                    : null;
                  const soldToName  = custName || linkedDeal?.walk_in_name || "Walk-in Customer";
                  const payMethod   = linkedDeal?.payment_method || null;
                  const soldDateStr = item.sold_at
                    ? new Date(item.sold_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                    : null;
                  const rows = [
                    { label: "SOLD TO",    value: soldToName,                                         bold: false },
                    soldDateStr && { label: "SOLD DATE",  value: soldDateStr,                         bold: false },
                    soldPrice   && { label: "SOLD PRICE", value: `AED ${soldPrice.toLocaleString()}`, bold: true,  color: "#6366F1" },
                    costPrice   && { label: "COST",       value: `AED ${costPrice.toLocaleString()}`, bold: false },
                    (soldPrice && costPrice) && { label: "PROFIT", value: `AED ${profit.toLocaleString()} (${marginPct}%)`, bold: true, color: profit >= 0 ? "#10B981" : "#EF4444" },
                  ].filter(Boolean);
                  return (
                    <div style={{ borderTop: "1px solid #F1F5F9", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, background: "#FAFBFF" }}>
                      {rows.map(r => (
                        <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.4 }}>{r.label}</span>
                          <span style={{ fontSize: r.bold ? 13 : 12, fontWeight: r.bold ? 800 : 600, color: r.color || "#475569" }}>{r.value}</span>
                        </div>
                      ))}
                      {payMethod && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.4 }}>PAYMENT</span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                                         background: payMethod === "Cash" ? "#ECFDF5" : "#EFF6FF",
                                         color: payMethod === "Cash" ? "#059669" : "#2563EB" }}>
                            {payMethod}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid #F8FAFC", padding: "12px 14px" }}>
                    {/* Spec table */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", marginBottom: 10 }}>
                      {[
                        { label: "Processor", value: item.processor },
                        { label: "RAM", value: item.ram },
                        { label: "SSD", value: item.ssd },
                        { label: "Screen", value: item.screen },
                        { label: "Condition", value: item.condition },
                        { label: "Charger", value: item.charger },
                        { label: "Box", value: item.box },
                        { label: "Activation Lock", value: item.brand === "MacBook" ? item.activation_lock : null },
                        { label: "Serial No.", value: item.serial_number },
                      ].filter(f => f.value && f.value !== "unknown").map(f => (
                        <div key={f.label} style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: 10, color: "#CBD5E1", fontWeight: 700, letterSpacing: 0.3 }}>{f.label.toUpperCase()}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{f.value}</span>
                        </div>
                      ))}
                    </div>

                    {item.notes && (
                      <div style={{ padding: "8px 10px", background: "#F8FAFC", borderRadius: 8, fontSize: 12, color: "#64748B", lineHeight: 1.5, marginBottom: 10 }}>
                        {item.notes}
                      </div>
                    )}

                    {/* Matching clients */}
                    {matches.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6, letterSpacing: 0.5 }}>👥 POTENTIAL BUYERS</div>
                        {matches.map(c => {
                          const deal = (c.deals || []).find(d => d.stage !== "closed" && d.stage !== "lost");
                          return (
                            <div key={c.id}
                              onClick={() => { setActiveCustomerId(c.id); setActiveDealId(deal?.id); setView("detail"); setPendingSuggestion(null); }}
                              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", marginBottom: 4, background: "#F8FAFC", borderRadius: 10, cursor: "pointer", border: "1px solid #F1F5F9" }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{c.name}</div>
                                <div style={{ fontSize: 11, color: "#94A3B8" }}>
                                  {deal?.brand ? `${deal.brand} ${deal.model || ""}`.trim() : "Open deal"}
                                  {deal?.budget ? ` · AED ${Number(deal.budget).toLocaleString()}` : ""}
                                </div>
                              </div>
                              <span style={{ fontSize: 13, color: "#6366F1", fontWeight: 700 }}>→</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => {
                        setEditingStock(item);
                        setStockForm({ ...EMPTY_STOCK, ...item, cost_price: item.cost_price ?? "", min_price: item.min_price ?? "", max_price: item.max_price ?? "" });
                        setShowAddStock(true);
                      }}
                        style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#6366F1", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        ✏️ Edit
                      </button>
                      {isAvail && (
                        <button onClick={() => { setUpgradeTarget(item); setShowUpgrade(true); }}
                          style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #FDE68A", background: "#FFFBEB", color: "#D97706", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                          ⬆ Upgrade
                        </button>
                      )}
                      {isAvail && (
                        <button onClick={() => { setQuickSalePrefill({ item }); setShowQuickSale(true); }}
                          style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                          ⚡ Sell
                        </button>
                      )}
                      <button onClick={() => { if (window.confirm(`Delete ${[item.brand, item.model].filter(Boolean).join(" ") || "this item"}?`)) deleteStockItem(item.id); }}
                        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #FEE2E2", background: "#fff", color: "#EF4444", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>
                        🗑
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── ADD / EDIT MODAL ── */}
          {showAddStock && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto" }}>
              <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>{editingStock ? "Edit Stock Item" : "Add Stock Item"}</span>
                    <button onClick={() => { setShowAddStock(false); setEditingStock(null); setStockForm(EMPTY_STOCK); }}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Brand + Model */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>BRAND</div>
                        <select value={stockForm.brand} onChange={e => setStockForm(f => ({ ...f, brand: e.target.value }))}
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none" }}>
                          <option value="">Select</option>
                          {BRANDS.map(b => <option key={b}>{b}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 2 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>MODEL</div>
                        <input value={stockForm.model} onChange={e => setStockForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. Air M2, ThinkPad X1"
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                      </div>
                    </div>

                    {/* Processor */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>PROCESSOR</div>
                      <input value={stockForm.processor} onChange={e => setStockForm(f => ({ ...f, processor: e.target.value }))} placeholder="e.g. Apple M2, Core i7-1355U"
                        style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    </div>

                    {/* RAM + SSD */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>RAM</div>
                        <input value={stockForm.ram} onChange={e => setStockForm(f => ({ ...f, ram: e.target.value }))} placeholder="e.g. 16GB"
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>SSD</div>
                        <input value={stockForm.ssd} onChange={e => setStockForm(f => ({ ...f, ssd: e.target.value }))} placeholder="e.g. 512GB"
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                      </div>
                    </div>

                    {/* Screen + Condition */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>SCREEN SIZE</div>
                        <input value={stockForm.screen} onChange={e => setStockForm(f => ({ ...f, screen: e.target.value }))} placeholder='e.g. 13.3"'
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>CONDITION</div>
                        <select value={stockForm.condition} onChange={e => setStockForm(f => ({ ...f, condition: e.target.value }))}
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none" }}>
                          <option value="">Select</option>
                          <option>New</option><option>Like New</option><option>Used</option><option>Refurbished</option>
                        </select>
                      </div>
                    </div>

                    {/* Charger + Box */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>CHARGER</div>
                        <select value={stockForm.charger} onChange={e => setStockForm(f => ({ ...f, charger: e.target.value }))}
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none" }}>
                          <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>BOX</div>
                        <select value={stockForm.box} onChange={e => setStockForm(f => ({ ...f, box: e.target.value }))}
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none" }}>
                          <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                        </select>
                      </div>
                    </div>

                    {/* Activation lock — MacBook only */}
                    {stockForm.brand === "MacBook" && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>ACTIVATION LOCK</div>
                        <select value={stockForm.activation_lock} onChange={e => setStockForm(f => ({ ...f, activation_lock: e.target.value }))}
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none" }}>
                          <option value="unknown">Unknown</option>
                          <option value="no">No — Unlocked ✅</option>
                          <option value="yes">Yes — Locked ⚠️</option>
                        </select>
                      </div>
                    )}

                    {/* Pricing */}
                    <div style={{ background: "#F8FAFC", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 8, letterSpacing: 0.5 }}>PRICING (AED)</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {[
                          { key: "cost_price", label: "Cost" },
                          { key: "min_price", label: "Min" },
                          { key: "max_price", label: "Max / Ask" },
                        ].map(p => (
                          <div key={p.key} style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 3, fontWeight: 600 }}>{p.label}</div>
                            <input type="number" value={stockForm[p.key]} onChange={e => setStockForm(f => ({ ...f, [p.key]: e.target.value }))} placeholder="0"
                              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Serial number */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>SERIAL / IMEI</div>
                      <input value={stockForm.serial_number} onChange={e => setStockForm(f => ({ ...f, serial_number: e.target.value }))} placeholder="Optional"
                        style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    </div>

                    {/* Notes */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>NOTES</div>
                      <textarea value={stockForm.notes} onChange={e => setStockForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any details about this item..." rows={3}
                        style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>

                    {/* Photo */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6, letterSpacing: 0.5 }}>PHOTO (optional)</div>
                      {stockForm.photo_url && (
                        <div style={{ position: "relative", marginBottom: 8 }}>
                          <img src={stockForm.photo_url} alt="preview" style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 10 }} />
                          <button onClick={() => setStockForm(f => ({ ...f, photo_url: "" }))}
                            style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        </div>
                      )}
                      <input type="file" accept="image/*" ref={stockFileInputRef} style={{ display: "none" }}
                        onChange={e => e.target.files?.[0] && uploadStockPhoto(e.target.files[0])} />
                      <button onClick={() => stockFileInputRef.current?.click()} disabled={stockPhotoUploading}
                        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1.5px dashed #E2E8F0", background: "#F8FAFC", color: "#64748B", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                        {stockPhotoUploading ? "⏳ Uploading..." : stockForm.photo_url ? "📷 Change Photo" : "📷 Add Photo"}
                      </button>
                    </div>

                    {/* Save */}
                    <button onClick={saveStock} disabled={!stockForm.brand && !stockForm.model}
                      style={{ padding: 14, borderRadius: 12, border: "none", background: stockForm.brand || stockForm.model ? "#6366F1" : "#E2E8F0", color: stockForm.brand || stockForm.model ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 15, cursor: stockForm.brand || stockForm.model ? "pointer" : "not-allowed" }}>
                      {editingStock ? "Save Changes" : "Add to Stock →"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── IMPORT MODAL ── */}
          {showImportStock && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto" }}>
              <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                    <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>Import from Excel / CSV</span>
                    <button onClick={() => { setShowImportStock(false); setImportPreview(null); setImportStockResult(null); }}
                      style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
                  </div>

                  {/* Download template */}
                  <div style={{ background: "#EEF2FF", borderRadius: 12, padding: "12px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#4338CA" }}>📋 Download Template</div>
                      <div style={{ fontSize: 11, color: "#818CF8", marginTop: 2 }}>Pre-filled columns ready for Excel</div>
                    </div>
                    <button onClick={downloadStockTemplate}
                      style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                      Download
                    </button>
                  </div>

                  {/* File picker */}
                  <input type="file" accept=".xlsx,.xls,.csv" ref={importStockFileRef} style={{ display: "none" }}
                    onChange={e => { if (e.target.files?.[0]) handleStockFileSelect(e.target.files[0]); e.target.value = ""; }} />
                  <button onClick={() => importStockFileRef.current?.click()}
                    style={{ width: "100%", padding: 14, borderRadius: 12, border: "2px dashed #C7D2FE", background: "#F8FAFC", color: importPreview ? "#6366F1" : "#94A3B8", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 14 }}>
                    {importPreview ? `✅ ${importPreview.length} row${importPreview.length !== 1 ? "s" : ""} loaded — tap to change file` : "📂 Select .xlsx / .csv file"}
                  </button>

                  {/* Preview table */}
                  {importPreview && importPreview.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6, letterSpacing: 0.5 }}>
                        PREVIEW — FIRST {Math.min(5, importPreview.length)} OF {importPreview.length} ROWS
                      </div>
                      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #F1F5F9" }}>
                        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                          <thead>
                            <tr style={{ background: "#F8FAFC" }}>
                              {["Brand","Model","RAM","SSD","Condition","Max Price"].map(h => (
                                <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#94A3B8", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid #F1F5F9" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.slice(0, 5).map((row, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid #F8FAFC" }}>
                                {[row.brand, row.model, row.ram, row.ssd, row.condition, row.max_price ? `AED ${row.max_price}` : "—"].map((v, j) => (
                                  <td key={j} style={{ padding: "6px 10px", color: "#475569", whiteSpace: "nowrap" }}>{v || "—"}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {importPreview.length > 5 && (
                        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, textAlign: "center" }}>
                          + {importPreview.length - 5} more rows not shown
                        </div>
                      )}
                    </div>
                  )}

                  {/* Result */}
                  {importStockResult && (
                    <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 12, background: importStockResult.success ? "#ECFDF5" : "#FEF2F2", color: importStockResult.success ? "#10B981" : "#EF4444", fontSize: 13, fontWeight: 700 }}>
                      {importStockResult.success ? `✅ Imported ${importStockResult.count} item${importStockResult.count !== 1 ? "s" : ""} successfully!` : `❌ ${importStockResult.message}`}
                    </div>
                  )}

                  {/* Import button */}
                  <button onClick={importStockItems} disabled={!importPreview?.length || importingStock}
                    style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: importPreview?.length && !importingStock ? "#6366F1" : "#E2E8F0", color: importPreview?.length && !importingStock ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 15, cursor: importPreview?.length && !importingStock ? "pointer" : "not-allowed" }}>
                    {importingStock ? "⏳ Importing..." : importPreview?.length ? `Import ${importPreview.length} item${importPreview.length !== 1 ? "s" : ""} →` : "Select a file first"}
                  </button>
                </div>
              </div>
            </div>
          )}
          </>)}
        </div>
      )}

      {/* ── TRADERS TAB ── */}
      {activeTab === "traders" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Section toggle */}
          <div style={{ display: "flex", padding: "10px 12px 0", gap: 8, background: "#fff", borderBottom: "1px solid #F1F5F9" }}>
            {[{ key: "inventory", label: "📋 Inventory" }, { key: "traders", label: "👤 Traders" }].map(s => (
              <button key={s.key} onClick={() => setTraderSection(s.key)}
                style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", background: traderSection === s.key ? "#6366F1" : "#F1F5F9", color: traderSection === s.key ? "#fff" : "#64748B", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                {s.label}
              </button>
            ))}
          </div>

          {traderSection === "inventory" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Search + filter + import */}
              <div style={{ padding: "10px 12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={traderSearch} onChange={e => setTraderSearch(e.target.value)} placeholder="🔍 Search brand, model, specs..."
                    style={{ flex: 1, padding: "9px 13px", borderRadius: 12, border: "1.5px solid #F1F5F9", background: "#F8FAFC", fontSize: 13, outline: "none" }} />
                  <button onClick={() => setShowImportTrader(true)}
                    style={{ padding: "0 14px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
                    Import
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none" }}>
                  {[{ key: "all", label: "All" }, { key: "selling", label: "🟢 Selling" }, { key: "buying", label: "🔵 Buying" }, { key: "parts", label: "🔧 Parts" }].map(f => (
                    <button key={f.key} onClick={() => setTraderFilter(f.key)}
                      style={{ padding: "5px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0, background: traderFilter === f.key ? "#6366F1" : "#F1F5F9", color: traderFilter === f.key ? "#fff" : "#64748B" }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Find Match button */}
              <div style={{ padding: "0 12px 8px" }}>
                <button onClick={() => setShowTraderMatches(true)}
                  style={{ width: "100%", padding: 11, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                  🔍 Find Match — My Stock vs Buying Requests
                </button>
              </div>

              {/* Listings */}
              <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 100px" }}>
                {traderListingsLoading && <Spinner />}
                {!traderListingsLoading && (() => {
                  const q = traderSearch.toLowerCase();
                  const shown = traderListings.filter(t => {
                    if (traderFilter === "selling" && t.type !== "selling") return false;
                    if (traderFilter === "buying" && t.type !== "buying") return false;
                    if (traderFilter === "parts" && t.category !== "part") return false;
                    if (!q) return true;
                    return [t.brand, t.model, t.processor, t.ram, t.storage, t.part_category, t.part_compatible, t.trader_name].some(v => (v || "").toLowerCase().includes(q));
                  });
                  if (!shown.length) return <div style={{ textAlign: "center", padding: "60px 20px" }}><div style={{ fontSize: 40, marginBottom: 10 }}>🏪</div><div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>{traderListings.length ? "No listings match" : "No listings yet"}</div><div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>Tap Import to add group chat listings</div></div>;
                  return shown.map(item => {
                    const isSelling = item.type === "selling";
                    const isPart = item.category === "part";
                    const ageDays = daysSince(item.created_at);
                    const ageBadge = ageDays <= 3
                      ? { icon: "🟢", label: "Fresh", color: "#10B981", bg: "#ECFDF5" }
                      : ageDays <= 7
                      ? { icon: "🟡", label: "Recent", color: "#F59E0B", bg: "#FFFBEB" }
                      : ageDays <= 14
                      ? { icon: "🟠", label: "Getting old", color: "#F97316", bg: "#FFF7ED" }
                      : { icon: "🔴", label: "May be sold", color: "#EF4444", bg: "#FEF2F2" };
                    const device = isPart
                      ? [item.part_category, item.part_compatible, item.part_specs].filter(Boolean).join(" · ")
                      : [item.brand, item.model, item.processor, item.ram, item.storage, item.screen, item.condition].filter(Boolean).join(" · ");
                    return (
                      <div key={item.id} style={{ background: "#fff", borderRadius: 16, padding: "12px 14px", marginBottom: 8, border: `1.5px solid ${ageDays > 14 ? "#FEE2E2" : "#F1F5F9"}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Badge color={isSelling ? "#10B981" : "#6366F1"} bg={isSelling ? "#ECFDF5" : "#EEF2FF"} small>{isSelling ? "🟢 SELLING" : "🔵 BUYING"}</Badge>
                            <Badge color="#64748B" bg="#F1F5F9" small>{isPart ? "🔧 PART" : "💻 LAPTOP"}</Badge>
                            <Badge color={ageBadge.color} bg={ageBadge.bg} small>{ageBadge.icon} {ageDays}d · {ageBadge.label}</Badge>
                          </div>
                          {item.price && <span style={{ fontSize: 14, fontWeight: 800, color: "#6366F1" }}>AED {Number(item.price).toLocaleString()}</span>}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{device || "No specs"}</div>
                        {item.notes && <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 6 }}>{item.notes}</div>}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>👤 {item.trader_name || "Unknown"}{item.source_group ? ` · ${item.source_group}` : ""}</span>
                          {item.trader_number && (
                            <a href={`https://wa.me/${item.trader_number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                              style={{ padding: "4px 10px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                              WhatsApp
                            </a>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "#CBD5E1", marginTop: 4 }}>{timeAgo(item.created_at)}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {traderSection === "traders" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px 100px" }}>
              {(() => {
                const grouped = {};
                traderListings.forEach(t => {
                  const key = t.trader_name || "Unknown";
                  if (!grouped[key]) grouped[key] = { name: key, number: t.trader_number, group: t.source_group, selling: 0, buying: 0, lastDate: t.created_at };
                  if (t.type === "selling") grouped[key].selling++;
                  else grouped[key].buying++;
                  if (new Date(t.created_at) > new Date(grouped[key].lastDate)) grouped[key].lastDate = t.created_at;
                });
                const traders = Object.values(grouped).sort((a, b) => new Date(b.lastDate) - new Date(a.lastDate));
                if (!traders.length) return <div style={{ textAlign: "center", padding: "60px 20px" }}><div style={{ fontSize: 40, marginBottom: 10 }}>👤</div><div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>No traders yet</div><div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>Import a group chat to see traders</div></div>;
                return traders.map((tr, i) => (
                  <div key={i} style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 8, border: "1.5px solid #F1F5F9", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{tr.name}</div>
                        {tr.group && <div style={{ fontSize: 11, color: "#94A3B8" }}>{tr.group}</div>}
                      </div>
                      {tr.number && <a href={`https://wa.me/${tr.number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{ padding: "5px 12px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>WhatsApp</a>}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <span style={{ fontSize: 12, color: "#10B981", fontWeight: 700 }}>🟢 {tr.selling} selling</span>
                      <span style={{ fontSize: 12, color: "#6366F1", fontWeight: 700 }}>🔵 {tr.buying} buying</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#CBD5E1", marginTop: 4 }}>Last active: {timeAgo(tr.lastDate)}</div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* TRADERS: Import modal */}
      {showImportTrader && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>Import Group Chat</span>
                <button onClick={() => { setShowImportTrader(false); setTraderImportPreview(null); setTraderImportResult(null); setTraderChatText(""); }} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>SOURCE GROUP</div>
                  <select value={traderGroup} onChange={e => setTraderGroup(e.target.value)} style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none" }}>
                    <option value="">Select group...</option>
                    {["JNP Market","Computer Mall JNP","JNP WITH AFAQ","JNP COMPUTERS SHARJAH","JNP MARKET","JNP","SSD and HDD JNP","ELECTRO JNP Market MNA","Mohamed Elshayb","Other"].map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>PASTE CHAT EXPORT</div>
                  <textarea value={traderChatText} onChange={e => setTraderChatText(e.target.value)} placeholder="Paste WhatsApp group chat export here..." rows={8}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
                <button onClick={extractTraderListings} disabled={traderImportLoading || !traderChatText.trim() || !anthropicKey}
                  style={{ padding: 13, borderRadius: 12, border: "none", background: traderImportLoading || !traderChatText.trim() ? "#E2E8F0" : "#6366F1", color: traderImportLoading || !traderChatText.trim() ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                  {traderImportLoading ? "⏳ Extracting..." : "Extract Listings →"}
                </button>
                {traderImportPreview && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 8 }}>PREVIEW — {traderImportPreview.length} listings found</div>
                    <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #F1F5F9", marginBottom: 10 }}>
                      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
                        <thead><tr style={{ background: "#F8FAFC" }}>
                          {["Type","Brand","Model","Price","Trader"].map(h => <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#94A3B8", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid #F1F5F9" }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {traderImportPreview.slice(0, 5).map((r, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #F8FAFC" }}>
                              {[r.type, r.brand, r.model, r.price ? `AED ${r.price}` : "—", r.trader_name].map((v, j) => <td key={j} style={{ padding: "6px 10px", color: "#475569", whiteSpace: "nowrap" }}>{v || "—"}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {traderImportPreview.length > 5 && <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8, textAlign: "center" }}>+{traderImportPreview.length - 5} more</div>}
                    {traderImportResult && <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 8, background: traderImportResult.success ? "#ECFDF5" : "#FEF2F2", color: traderImportResult.success ? "#10B981" : "#EF4444", fontSize: 13, fontWeight: 700 }}>{traderImportResult.success ? `✅ Saved ${traderImportResult.count} listings!` : `❌ ${traderImportResult.message}`}</div>}
                    <button onClick={saveTraderListings} disabled={savingTraderListings}
                      style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: savingTraderListings ? "#E2E8F0" : "#10B981", color: savingTraderListings ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                      {savingTraderListings ? "Saving..." : `Save ${traderImportPreview.length} Listings →`}
                    </button>
                  </div>
                )}
                {!anthropicKey && <div style={{ fontSize: 12, color: "#EF4444", textAlign: "center" }}>Add Anthropic API key in Settings first</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TRADERS: Find Match modal */}
      {showTraderMatches && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>🔍 Stock vs Buyer Matches</span>
                <button onClick={() => setShowTraderMatches(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
              {(() => {
                const buyingRequests = traderListings.filter(t => t.type === "buying");
                const matches = [];
                stock.filter(s => s.status === "available").forEach(s => {
                  buyingRequests.forEach(b => {
                    const brandMatch = !s.brand || !b.brand || s.brand.toLowerCase() === b.brand.toLowerCase();
                    const priceOk = !b.price || !s.cost_price || Number(b.price) >= Number(s.cost_price);
                    if (brandMatch && priceOk) {
                      const profit = b.price && s.cost_price ? Number(b.price) - Number(s.cost_price) : null;
                      matches.push({ stock: s, buyer: b, profit });
                    }
                  });
                });
                if (!matches.length) return <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>No matches found between your stock and trader buying requests.</div>;
                return matches.map((m, i) => (
                  <div key={i} style={{ background: "#F8FAFC", borderRadius: 14, padding: 14, marginBottom: 10, border: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>
                      {m.buyer.trader_name} wants to buy {[m.stock.brand, m.stock.model].filter(Boolean).join(" ")}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>
                      Paying: AED {m.buyer.price?.toLocaleString() || "?"} · Your cost: AED {m.stock.cost_price?.toLocaleString() || "?"}
                      {m.profit != null && <span style={{ color: "#10B981", fontWeight: 700 }}> · Profit: AED {m.profit.toLocaleString()}</span>}
                    </div>
                    {m.buyer.trader_number && <a href={`https://wa.me/${m.buyer.trader_number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "5px 14px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>📱 WhatsApp {m.buyer.trader_name}</a>}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* TRADERS: Check Traders modal (from client detail) */}
      {showCheckTraders && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 60px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>🏪 Trader Listings</span>
                <button onClick={() => setShowCheckTraders(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
              </div>
              {checkTradersLoading ? <Spinner /> : checkTradersResults.length === 0
                ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>No matching selling listings found in trader inventory.</div>
                : checkTradersResults.map((t, i) => {
                  const device = [t.brand, t.model, t.processor, t.ram, t.storage, t.condition].filter(Boolean).join(" · ");
                  return (
                    <div key={i} style={{ background: "#F8FAFC", borderRadius: 14, padding: 14, marginBottom: 8, border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{device || "Unknown device"}</div>
                      {t.price && <div style={{ fontSize: 14, fontWeight: 800, color: "#6366F1", marginBottom: 4 }}>AED {Number(t.price).toLocaleString()}</div>}
                      <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>👤 {t.trader_name} {t.source_group ? `· ${t.source_group}` : ""} · {timeAgo(t.created_at)}</div>
                      {t.trader_number && <a href={`https://wa.me/${t.trader_number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", padding: "5px 14px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>📱 WhatsApp Trader</a>}
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>
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
                  await supabase.from("stock").update({
                    status: "available", reserved_for_customer_id: null, reserved_at: null, pickup_date: null, sold_price: null,
                  }).eq("id", editReservationItem.id);
                  const { data: dealData } = await supabase.from("deals")
                    .select("id").eq("stock_item_id", editReservationItem.id).single();
                  if (dealData) {
                    await supabase.from("deals").update({
                      stage: "device_found", value: null, deposit_amount: null, balance_due: null, pickup_date: null,
                    }).eq("id", dealData.id);
                  }
                  setShowEditReservation(false);
                  loadStock();
                  loadCustomers();
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
