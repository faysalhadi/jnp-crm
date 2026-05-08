import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./supabase";

// ── constants ────────────────────────────────────────────────────────────────
const ANTHROPIC_KEY_STORAGE = "jnp_anthropic_key";

const STAGES = [
  { id: "new_inquiry",       label: "New Inquiry",       color: "#6366F1", bg: "#EEF2FF" },
  { id: "requirement_noted", label: "Requirement Noted", color: "#F59E0B", bg: "#FFFBEB" },
  { id: "searching",         label: "Searching Device",  color: "#3B82F6", bg: "#EFF6FF" },
  { id: "device_found",      label: "Device Found",      color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "negotiation",       label: "Negotiation",       color: "#EC4899", bg: "#FDF2F8" },
  { id: "closed",            label: "Deal Closed",       color: "#10B981", bg: "#ECFDF5" },
  { id: "lost",              label: "Lost",              color: "#EF4444", bg: "#FEF2F2" },
];

const TIERS = {
  vip:     { label: "VIP",     color: "#EF4444", bg: "#FEF2F2", icon: "⭐" },
  regular: { label: "Regular", color: "#F59E0B", bg: "#FFFBEB", icon: "🟡" },
  cold:    { label: "Cold",    color: "#94A3B8", bg: "#F8FAFC", icon: "❄️" },
};

const BRANDS = ["MacBook", "Lenovo", "Dell", "HP", "Other"];
const LOSS_REASONS = ["Too expensive", "Bought elsewhere", "Changed mind", "No stock found", "No response", "Other"];
const PAYMENT_STATUSES = [
  { id: "pending",  label: "Pending",  color: "#F59E0B", bg: "#FFFBEB" },
  { id: "partial",  label: "Partial",  color: "#3B82F6", bg: "#EFF6FF" },
  { id: "received", label: "Received", color: "#10B981", bg: "#ECFDF5" },
];

const OUTREACH_REASONS = [
  "New stock arrived that matches their interest",
  "Price drop on device they wanted",
  "Following up — went cold",
  "Checking in after sale",
  "Got a great deal to share",
  "Custom message",
];

const QUICK_TEMPLATES = [
  { category: "First Reply", icon: "👋", color: "#6366F1", bg: "#EEF2FF", templates: [
    { label: "Standard Greeting", text: "Hey! 👋 Welcome to *Laptop for Less*\n\nThanks for reaching out. To help you find the right device, could you share:\n\n1️⃣ What brand/model are you looking for?\n2️⃣ Preferred specs — RAM, storage?\n3️⃣ Your budget range (in AED)?\n4️⃣ New or used?" },
    { label: "Referral Reply", text: "Hey! 👋 Thanks for reaching out to *Laptop for Less*\n\nGlad someone referred you! We deal in quality laptops — new and used — at the best prices in UAE.\n\nWhat are you looking for and what's your budget? 🚀" },
  ]},
  { category: "Follow Up", icon: "🔁", color: "#F59E0B", bg: "#FFFBEB", templates: [
    { label: "Day 1 Nudge", text: "Hey [Name] 👋\n\nJust checking in — did you get a chance to look at the quote I sent?\n\nHappy to answer any questions or adjust based on your budget 😊\n\n— *Laptop for Less*" },
    { label: "Day 3 Nudge", text: "Hi [Name],\n\nStill interested in the [Device]? 🖥️\n\nHeads up — stock moves fast. Let me know if you'd like to proceed!\n\n— *Laptop for Less*" },
    { label: "Final Follow Up", text: "Hey [Name], last message from my side 😊\n\nIf you're still looking for a laptop, I'm here whenever you're ready. We always have fresh stock.\n\n— *Laptop for Less* 💻" },
  ]},
  { category: "Negotiation", icon: "💬", color: "#EC4899", bg: "#FDF2F8", templates: [
    { label: "Hold Price", text: "This is already our best price for this spec and condition — we price fairly from the start. What I can do is make sure you get the charger included. Want me to confirm availability? 😊" },
    { label: "Counter Offer", text: "I appreciate you being upfront! That price would be tough honestly. The closest I can go is AED [X]. If that works, we can close today 👌" },
    { label: "Justify Price", text: "I get that — budget matters. The reason this one is priced here is [reason]. If you can stretch to AED [X], I'll make it work for you 😊" },
  ]},
  { category: "Deal Closed", icon: "✅", color: "#10B981", bg: "#ECFDF5", templates: [
    { label: "Confirmation", text: "Thank you, [Name]! 🎉\n\nYour purchase is confirmed:\n📦 *Device:* [Brand + Model]\n💾 *Specs:* [RAM / Storage]\n💰 *Amount:* AED [Amount]\n📅 *Date:* [Date]\n\nReceipt coming shortly. Enjoy your new device! 💻✨" },
    { label: "Post-Sale Check", text: "Hey [Name]! Hope you're enjoying your new [Device] 💻\n\nJust checking in — everything working well?\n\n— *Laptop for Less*" },
  ]},
  { category: "Re-engage", icon: "🔄", color: "#3B82F6", bg: "#EFF6FF", templates: [
    { label: "New Stock", text: "Hey [Name]! 👋\n\nJust thought of you — we just got some fresh stock in. Still looking for a laptop? Prices are really good right now 👌\n\n— *Laptop for Less*" },
    { label: "Price Drop", text: "Hey [Name] 💡\n\nGood news — the price on [Device] has dropped!\n\nWas: AED [Old]\nNow: AED [New]\n\nInterested? 😊\n\n— *Laptop for Less*" },
  ]},
  { category: "Complaint", icon: "🛠️", color: "#EF4444", bg: "#FEF2F2", templates: [
    { label: "Acknowledge", text: "Hey [Name],\n\nI'm really sorry to hear that — this is not the experience we want for you 🙏\n\nCan you describe what's happening? A quick video or photo would help.\n\nI'll look into this right away.\n\n— *Laptop for Less*" },
    { label: "Resolution", text: "Hey [Name],\n\nThanks for your patience 🙏\n\nHere's what we've agreed:\n✅ [Resolution]\n\nThis will be done by [Date].\n\nWe appreciate your trust!\n\n— *Laptop for Less*" },
  ]},
];

const SYSTEM_PROMPT = `You are an AI assistant for "Laptop for Less", a UAE laptop reselling business run on WhatsApp.

BUSINESS:
- Location: UAE, Currency: AED
- Buys/sells new and used laptops via WhatsApp
- Brands: MacBook, Lenovo, Dell, HP
- Conditions: New, Like New, Used, Refurbished

PRICE TIERS:
- Budget: Under 1,000 AED
- Mid Range: 1,000–2,500 AED  
- Premium: 2,500–4,500 AED
- High End: 4,500–7,000 AED
- Flagship: Above 7,000 AED

YOUR JOBS:
1. Extract info from customer messages
2. Generate perfect WhatsApp replies
3. Suggest deal stage movement

ALWAYS return valid JSON only — no markdown, no explanation:
{
  "intent": "buying|selling|unknown",
  "brand": "MacBook|Lenovo|Dell|HP|Other|unknown",
  "model": "string or unknown",
  "ram": "string or unknown",
  "storage": "string or unknown",
  "screen": "string or unknown",
  "condition": "New|Like New|Used|Refurbished|unknown",
  "budget": number or null,
  "urgency": true|false,
  "activationLock": "yes|no|unknown",
  "charger": "yes|no|unknown",
  "box": "yes|no|unknown",
  "notes": "any extra context",
  "suggestedStage": "new_inquiry|requirement_noted|searching|device_found|negotiation|closed|lost",
  "stageReason": "one line reason",
  "reply": "ready to send WhatsApp reply"
}

REPLY RULES:
- Short WhatsApp style — not emails
- Friendly + professional mix
- Emojis sparingly
- Never reveal you are AI
- Hold price firm, add value instead of dropping
- Counter lowballs once with small bridge offer
- Sign off as "Laptop for Less" only when closing

NEGOTIATION RULES (STRICT):
- Always quote max_price first
- If client says "best price" or "any discount" → Hold max_price, add value (charger, condition)
- If client offers above min_price → Accept or counter slightly above their offer
- If client offers below min_price → Firm no, counter at min_price
- NEVER go below min_price under any circumstance
- NEVER reveal cost_price
- Walk away politely if client keeps pushing below min_price
- Leave door open: "If something changes I'll let you know"

STOCK CONTEXT (if provided):
- When stock details are given, use exact specs and price range in reply
- Quote max_price as asking price
- Never go below min_price in negotiation

STAGE LOGIC:
- new_inquiry: just reached out
- requirement_noted: specs and budget captured
- searching: actively looking
- device_found: matching device located
- negotiation: price being discussed
- closed: sale confirmed
- lost: deal fell through`;

// ── helpers ──────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return "—";
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function daysSince(ts) {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}
function autoTier(deals) {
  const closed = (deals || []).filter(d => d.stage === "closed").length;
  if (closed >= 3) return "vip";
  if (closed >= 1) return "regular";
  return "cold";
}
function monthRevenue(customers) {
  const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
  let total = 0;
  (customers || []).forEach(c =>
    (c.deals || []).forEach(d => {
      if (d.stage === "closed" && d.closed_at && new Date(d.closed_at) >= start)
        total += (d.value || 0);
    })
  );
  return total;
}
function getAnthropicKey() { return localStorage.getItem(ANTHROPIC_KEY_STORAGE) || ""; }
function saveAnthropicKey(k) { localStorage.setItem(ANTHROPIC_KEY_STORAGE, k); }

// ── API ───────────────────────────────────────────────────────────────────────
async function callClaude(apiKey, messages, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text || "";
}

// ── small UI ──────────────────────────────────────────────────────────────────
function Badge({ color, bg, children, small }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: small ? "1px 7px" : "3px 10px", borderRadius: 20, fontSize: small ? 10 : 11, fontWeight: 700, color, background: bg, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function StageBar({ stageId }) {
  const idx = STAGES.findIndex(s => s.id === stageId);
  const stage = STAGES[idx] || STAGES[0];
  const pct = Math.max(5, Math.round((idx / (STAGES.length - 2)) * 100));
  if (stageId === "lost") return <Badge color="#EF4444" bg="#FEF2F2" small>Lost</Badge>;
  if (stageId === "closed") return <Badge color="#10B981" bg="#ECFDF5" small>✓ Closed</Badge>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 4, background: "#E2E8F0" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: stage.color, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 10, color: stage.color, fontWeight: 700, whiteSpace: "nowrap" }}>{stage.label}</span>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <div style={{ width: 28, height: 28, border: "3px solid #E2E8F0", borderTop: "3px solid #6366F1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── constants ─────────────────────────────────────────────────────────────────
const EMPTY_STOCK = { brand: "", model: "", processor: "", ram: "", ssd: "", screen: "", condition: "Used", charger: "unknown", box: "unknown", activation_lock: "unknown", cost_price: "", min_price: "", max_price: "", serial_number: "", notes: "", photo_url: "" };

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
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const [copied, setCopied] = useState(null);
  const [editSent, setEditSent] = useState(null);
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
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState("customers"); // customers | tasks | stock | templates
  const [templateCopied, setTemplateCopied] = useState(null);
  // stock state
  const [stock, setStock] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [editStockItem, setEditStockItem] = useState(null);
  const [stockSearch, setStockSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("available");
  const [stockSoldConfirm, setStockSoldConfirm] = useState(null);
  const [soldPrice, setSoldPrice] = useState("");
  const [stockPhotoUploading, setStockPhotoUploading] = useState(false);
  const [showMatchingClients, setShowMatchingClients] = useState(null);
  const [newStock, setNewStock] = useState({ brand: "", model: "", processor: "", ram: "", ssd: "", screen: "", condition: "Used", charger: "unknown", box: "unknown", activation_lock: "unknown", cost_price: "", min_price: "", max_price: "", serial_number: "", notes: "", photo_url: "" });
  const [smartTasks, setSmartTasks] = useState(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState("");
  const [smartMsgCopied, setSmartMsgCopied] = useState({});
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── auth ──
  useEffect(() => {
    // Check localStorage directly — no API call
    const stored = localStorage.getItem('jnp_session');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.access_token) {
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
  }, []);

  useEffect(() => { if (session) loadCustomers(); }, [session, loadCustomers]);

  // Note: tasks tab cache loading is handled after tasks is defined

  // ── load messages for active deal ──
  useEffect(() => {
    if (!activeDealId) { setMessages([]); return; }
    supabase.from("messages").select("*").eq("deal_id", activeDealId).order("ts", { ascending: true })
      .then(({ data }) => setMessages(data || []));
  }, [activeDealId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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

  async function moveStage(stageId) {
    const fields = { stage: stageId };
    if (stageId === "closed") fields.closed_at = new Date().toISOString();
    await updateDeal(fields);
    // auto tier
    const updatedDeals = activeCustomer.deals.map(d => d.id === activeDealId ? { ...d, ...fields } : d);
    await updateCustomer({ tier: autoTier(updatedDeals) });
    setPendingSuggestion(null);
    if (stageId === "lost") setShowLossReason(true);
  }

  // ── message actions ──
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

      const raw = await callClaude(anthropicKey, history, SYSTEM_PROMPT);
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
      const raw = await callClaude(anthropicKey, [{ role: "user", content: context }], SYSTEM_PROMPT);
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

  // Load cached smart results on tasks tab open
  // ── tasks (defined here so loadCachedSmartTasks can reference it) ──
  const tasks = useMemo(() => customers.flatMap(c =>
    (c.deals || [])
      .filter(d => d.stage !== "closed" && d.stage !== "lost")
      .map(d => ({
        customer: c, deal: d,
        days: daysSince(c.last_active),
        type: daysSince(c.last_active) >= 3 ? "overdue" : daysSince(c.last_active) >= 1 ? "followup" : "active",
      }))
  ).sort((a, b) => b.days - a.days), [customers]);

  async function loadCachedSmartTasks() {
    if (!tasks.length) return;
    const dealIds = tasks.map(t => t.deal.id);
    const { data: cachedDeals } = await supabase
      .from("deals")
      .select("id, smart_priority, smart_reason, smart_action, smart_message")
      .in("id", dealIds)
      .not("smart_priority", "is", null);

    if (!cachedDeals?.length) return;
    const order = { urgent: 0, high: 1, medium: 2, low: 3, dead: 4 };
    const merged = cachedDeals.map(cached => {
      const task = tasks.find(t => t.deal.id === cached.id);
      return task ? {
        ...task,
        smart: {
          dealId: cached.id,
          priority: cached.smart_priority,
          priorityReason: cached.smart_reason,
          nextAction: cached.smart_action,
          suggestedMessage: cached.smart_message || "",
        }
      } : null;
    }).filter(Boolean);

    merged.sort((a, b) => (order[a.smart.priority] || 3) - (order[b.smart.priority] || 3));
    setSmartTasks(merged);
  }

  // ── smart task analysis (with caching) ──
  async function analyzeTasksWithClaude(forceAll = false) {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    if (!tasks.length) { alert("No open deals to analyze."); return; }
    setSmartLoading(true); setSmartError("");

    try {
      // Step 1: Load cached results from Supabase for all deals
      const dealIds = tasks.map(t => t.deal.id);
      const { data: cachedDeals } = await supabase
        .from("deals")
        .select("id, smart_priority, smart_reason, smart_action, smart_message, smart_analysed_at")
        .in("id", dealIds);

      const cachedMap = {};
      (cachedDeals || []).forEach(d => { cachedMap[d.id] = d; });

      // Step 2: Figure out which deals need re-analysis
      // A deal needs analysis if:
      // - forceAll is true (user clicked Re-analyse)
      // - never been analysed before
      // - has new messages since last analysis
      const dealsToAnalyze = [];
      const dealsWithCache = [];

      for (const task of tasks) {
        const { deal: d, customer: c } = task;
        const cached = cachedMap[d.id];
        const lastAnalysed = cached?.smart_analysed_at ? new Date(cached.smart_analysed_at) : null;
        const lastActive = c.last_active ? new Date(c.last_active) : null;
        const hasNewMessages = !lastAnalysed || (lastActive && lastActive > lastAnalysed);
        const hasCachedResult = cached?.smart_priority;

        if (forceAll || !hasCachedResult || hasNewMessages) {
          dealsToAnalyze.push(task);
        } else {
          dealsWithCache.push({
            ...task,
            smart: {
              dealId: d.id,
              priority: cached.smart_priority,
              priorityReason: cached.smart_reason,
              nextAction: cached.smart_action,
              suggestedMessage: cached.smart_message || "",
            }
          });
        }
      }

      // Step 3: Show cached results immediately while analysing new ones
      const order = { urgent: 0, high: 1, medium: 2, low: 3, dead: 4 };
      if (dealsWithCache.length && dealsToAnalyze.length) {
        const combined = [...dealsWithCache].sort((a, b) => (order[a.smart.priority] || 3) - (order[b.smart.priority] || 3));
        setSmartTasks(combined);
      }

      // Step 4: Analyse only new/changed deals
      if (dealsToAnalyze.length > 0) {
        const dealContexts = await Promise.all(dealsToAnalyze.map(async ({ customer: c, deal: d }) => {
          const { data: msgs } = await supabase
            .from("messages")
            .select("role, content, sent, ts")
            .eq("deal_id", d.id)
            .order("ts", { ascending: false })
            .limit(8);

          const lastMessages = (msgs || []).map(m => {
            const text = m.sent && m.sent !== "NOT_SENT" ? m.sent : m.content;
            return `${m.role === "customer" ? c.name : "You"}: ${text.slice(0, 200)}`;
          }).reverse().join("\n");

          return {
            id: d.id,
            name: c.name,
            number: c.number || "",
            device: [d.brand, d.model].filter(Boolean).join(" ") || "Unknown device",
            budget: d.budget ? `AED ${d.budget}` : "Unknown",
            stage: d.stage,
            daysSilent: daysSince(c.last_active),
            lastMessages: lastMessages || "No messages yet",
          };
        }));

        const prompt = `You are analyzing open sales deals for "Laptop for Less", a UAE laptop reselling business.

For each deal, analyze the conversation and return your assessment.

Return ONLY a JSON array — no markdown, no explanation:
[
  {
    "dealId": "deal id here",
    "priority": "urgent" | "high" | "medium" | "low" | "dead",
    "priorityReason": "one sentence why",
    "nextAction": "exact action to take",
    "suggestedMessage": "ready to send WhatsApp message or empty string if no message needed"
  }
]

Priority:
- urgent: action TODAY — payment pending, confirmed buyer, hot lead
- high: follow up within 24hrs — interested but quiet
- medium: follow up in 2-3 days — lukewarm
- low: follow up next week — early stage or said they'll come back
- dead: likely lost — no response after multiple attempts

Deals:
${JSON.stringify(dealContexts, null, 2)}`;

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, messages: [{ role: "user", content: prompt }] })
        });
        const data = await res.json();
        const raw = data?.content?.[0]?.text || "[]";
        const clean = raw.replace(/```json|```/g, "").trim();
        let results;
        try { results = JSON.parse(clean); } catch { throw new Error("Could not parse AI response"); }

        // Step 5: Save results to Supabase
        await Promise.all(results.map(r =>
          supabase.from("deals").update({
            smart_priority: r.priority,
            smart_reason: r.priorityReason,
            smart_action: r.nextAction,
            smart_message: r.suggestedMessage || "",
            smart_analysed_at: new Date().toISOString(),
          }).eq("id", r.dealId)
        ));

        // Step 6: Merge new results with cached ones
        const newResults = results.map(r => {
          const task = dealsToAnalyze.find(t => t.deal.id === r.dealId);
          return task ? { ...task, smart: r } : null;
        }).filter(Boolean);

        const allResults = [...dealsWithCache, ...newResults];
        allResults.sort((a, b) => (order[a.smart.priority] || 3) - (order[b.smart.priority] || 3));
        setSmartTasks(allResults);

        // Reload customers to get updated deal data
        await loadCustomers();
      } else {
        // All from cache — just sort and show
        dealsWithCache.sort((a, b) => (order[a.smart.priority] || 3) - (order[b.smart.priority] || 3));
        setSmartTasks(dealsWithCache);
      }

    } catch (e) {
      setSmartError("Analysis failed. Please try again.");
    }
    setSmartLoading(false);
  }

  // ── load stock ──
  const loadStock = useCallback(async () => {
    setStockLoading(true);
    const { data } = await supabase.from("stock").select("*").order("created_at", { ascending: false });
    setStock(data || []);
    setStockLoading(false);
  }, []);

  useEffect(() => { if (session) loadStock(); }, [session, loadStock]);

  useEffect(() => {
    if (activeTab === "stock" && session) loadStock();
  }, [activeTab]);



  // ── stock functions ──
  async function saveStock() {
    const item = editStockItem || newStock;
    if (!item.brand) return;
    const payload = {
      brand: item.brand, model: item.model, processor: item.processor,
      ram: item.ram, ssd: item.ssd, screen: item.screen,
      condition: item.condition, charger: item.charger, box: item.box,
      activation_lock: item.activation_lock,
      cost_price: item.cost_price ? parseFloat(item.cost_price) : null,
      min_price: item.min_price ? parseFloat(item.min_price) : null,
      max_price: item.max_price ? parseFloat(item.max_price) : null,
      serial_number: item.serial_number, notes: item.notes, photo_url: item.photo_url,
    };
    if (editStockItem?.id) {
      await supabase.from("stock").update(payload).eq("id", editStockItem.id);
    } else {
      await supabase.from("stock").insert({ ...payload, status: "available" });
    }
    await loadStock();
    setShowAddStock(false); setEditStockItem(null); setNewStock(EMPTY_STOCK);
  }

  async function markSold(item) {
    const price = soldPrice ? parseFloat(soldPrice) : item.max_price;
    await supabase.from("stock").update({ status: "sold", sold_price: price, sold_at: new Date().toISOString() }).eq("id", item.id);
    await loadStock();
    setStockSoldConfirm(null); setSoldPrice("");
  }

  async function deleteStock(id) {
    await supabase.from("stock").delete().eq("id", id);
    await loadStock();
  }

  async function uploadPhoto(file, itemSetter) {
    if (!file) return;
    setStockPhotoUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("device-photos").upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from("device-photos").getPublicUrl(path);
      itemSetter(prev => ({ ...prev, photo_url: data.publicUrl }));
    }
    setStockPhotoUploading(false);
  }

  function findMatchingClients(stockItem) {
    const matches = [];
    customers.forEach(c => {
      (c.deals || []).forEach(d => {
        if (d.stage === "closed" || d.stage === "lost") return;
        const brandMatch = !d.brand || d.brand.toLowerCase() === stockItem.brand.toLowerCase();
        const budgetMatch = !d.budget || !stockItem.min_price || d.budget >= stockItem.min_price;
        if (brandMatch && budgetMatch) {
          matches.push({ customer: c, deal: d });
        }
      });
    });
    return matches;
  }


  // ── load cached smart tasks when tab switches (safe here - tasks is defined above) ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === "tasks" && tasks.length && !smartTasks) {
      loadCachedSmartTasks();
    }
  }, [activeTab]);

  // ── import whatsapp chat ──
  async function importWhatsAppChat() {
    if (!importText.trim() || !anthropicKey) return;
    setImporting(true); setImportResult(null);

    const prompt = `You are analyzing a WhatsApp chat export for a laptop reselling business in UAE called "Laptop for Less".

Extract ALL customer/contact information from this chat. For each unique person (excluding the business owner):

Return ONLY a JSON array like this:
[
  {
    "name": "contact name or display name",
    "number": "phone number if visible or empty string",
    "intent": "buying or selling or unknown",
    "brand": "MacBook or Lenovo or Dell or HP or Other or unknown",
    "model": "specific model or empty string",
    "ram": "e.g. 8GB or empty",
    "storage": "e.g. 256GB or empty",
    "condition": "New or Like New or Used or Refurbished or unknown",
    "budget": null or number,
    "urgent": false or true,
    "notes": "any relevant context from the conversation",
    "stage": "new_inquiry or requirement_noted or negotiation or closed or lost"
  }
]

Rules:
- Skip forwarded messages, news, memes
- Skip the business owner's messages
- Only include people who are clearly buying or selling laptops
- If someone appears multiple times, merge into one entry
- Return empty array [] if no relevant contacts found
- Return ONLY the JSON array, nothing else

WhatsApp Chat:
${importText.slice(0, 8000)}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      const raw = data?.content?.[0]?.text || "[]";
      const clean = raw.replace(/\`\`\`json|\`\`\`/g, "").trim();
      let contacts;
      try { contacts = JSON.parse(clean); } catch { contacts = []; }

      if (!contacts.length) {
        setImportResult({ success: false, message: "No relevant contacts found in this chat." });
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
        await supabase.from("deals").insert({
          customer_id: customer.id,
          brand: c.brand !== "unknown" ? c.brand : "",
          model: c.model || "", ram: c.ram || "", storage: c.storage || "",
          condition: c.condition !== "unknown" ? c.condition : "",
          budget: c.budget || null, stage: c.stage || "new_inquiry",
        });
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

  // ── computed ──
  const openDeals = customers.reduce((a, c) => a + (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost").length, 0);
  const closedDeals = customers.reduce((a, c) => a + (c.deals || []).filter(d => d.stage === "closed").length, 0);
  const revenue = monthRevenue(customers);

  const filtered = customers
    .filter(c => {
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
      return new Date(b.last_active) - new Date(a.last_active);
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
          <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>📥 IMPORT WHATSAPP CHAT</div>
          <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10, lineHeight: 1.5 }}>
            Paste your WhatsApp chat export — Claude will extract all customers automatically.
          </div>
          <textarea
            value={importText}
            onChange={e => setImportText(e.target.value)}
            placeholder="Paste WhatsApp chat text here...&#10;&#10;How to export: WhatsApp → Open chat → ⋮ → More → Export chat → Without media → Copy text"
            rows={6}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 10, lineHeight: 1.5 }}
          />
          {importResult && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: importResult.success ? "#ECFDF5" : "#FEF2F2", color: importResult.success ? "#10B981" : "#EF4444", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
              {importResult.message}
            </div>
          )}
          <button onClick={importWhatsAppChat} disabled={importing || !importText.trim() || !anthropicKey}
            style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: importing || !importText.trim() || !anthropicKey ? "#E2E8F0" : "#6366F1", color: importing || !importText.trim() || !anthropicKey ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 13, cursor: importing || !importText.trim() || !anthropicKey ? "not-allowed" : "pointer" }}>
            {importing ? "⏳ Importing..." : "Import Customers →"}
          </button>
          {!anthropicKey && <div style={{ fontSize: 11, color: "#EF4444", marginTop: 6, textAlign: "center" }}>Add Anthropic API key above first</div>}
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
      <div style={{ minHeight: "100vh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        {/* header */}
        <div style={{ background: "#fff", padding: "12px 14px 0", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <button onClick={() => { setView("list"); setActiveCustomerId(null); setActiveDealId(null); setPendingSuggestion(null); }}
              style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 18, flexShrink: 0 }}>←</button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, fontSize: 16, color: "#0F172A" }}>{activeCustomer.name}</span>
                {activeCustomer.urgent && <Badge color="#EF4444" bg="#FEF2F2" small>🔴 URGENT</Badge>}
                <Badge color={tier.color} bg={tier.bg} small>{tier.icon} {tier.label}</Badge>
              </div>
              {activeCustomer.number && (
                <a href={`https://wa.me/${activeCustomer.number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: "#6366F1", textDecoration: "none", fontWeight: 600 }}>
                  📱 {activeCustomer.number}
                </a>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
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
                <div style={{ display: "flex", gap: 5 }}>
                  {PAYMENT_STATUSES.map(p => (
                    <button key={p.id} onClick={() => updateDeal({ payment_status: p.id })}
                      style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", background: activeDeal.payment_status === p.id ? p.color : p.bg, color: activeDeal.payment_status === p.id ? "#fff" : p.color, transition: "all 0.15s" }}>
                      {p.label}
                    </button>
                  ))}
                </div>
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

        {/* messages */}
        <div style={{ flex: 1, padding: "12px", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 4 }}>
          {messages.length === 0 && !outreachMode && (
            <div style={{ textAlign: "center", padding: "24px 20px", color: "#CBD5E1" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#94A3B8" }}>No messages yet</div>
              <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 2 }}>Paste their message or start the conversation</div>
            </div>
          )}

          {messages.map((msg) => {
            const isCustomer = msg.role === "customer";
            const isSent = msg.sent && msg.sent !== "NOT_SENT";
            const isNotSent = msg.sent === "NOT_SENT";
            const displayContent = isSent && msg.sent !== msg.content ? msg.sent : msg.content;

            return (
              <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isCustomer ? "flex-start" : "flex-end", gap: 4 }}>
                <div style={{ fontSize: 10, color: "#CBD5E1" }}>
                  {isCustomer ? (msg.is_voice ? "🎤 Voice Note" : `👤 ${activeCustomer.name}`) : "🤖 Suggested"} · {timeAgo(msg.ts)}
                </div>
                <div style={{
                  maxWidth: "84%", padding: "10px 13px", fontSize: 13.5, lineHeight: 1.7, whiteSpace: "pre-line",
                  borderRadius: isCustomer ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
                  background: isCustomer ? "#F1F5F9" : "#EEF2FF",
                  color: isCustomer ? "#334155" : "#1E1B4B",
                  border: isCustomer ? "1px solid #E2E8F0" : "1px solid #C7D2FE",
                  opacity: isNotSent ? 0.45 : 1,
                }}>
                  {isSent && msg.sent !== msg.content && (
                    <div style={{ fontSize: 10, color: "#6366F1", marginBottom: 4, fontWeight: 700 }}>✏️ You edited:</div>
                  )}
                  {displayContent}
                </div>

                {!isCustomer && !msg.sent && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button onClick={() => { copyMsg(msg.content, msg.id); confirmSent(msg.id, msg.content); }}
                      style={{ padding: "5px 11px", borderRadius: 8, border: "none", background: copied === msg.id ? "#10B981" : "#6366F1", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      {copied === msg.id ? "✓ Sent!" : "✅ Send As Is"}
                    </button>
                    <button onClick={() => setEditSent({ msgId: msg.id, text: msg.content })}
                      style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid #C7D2FE", background: "#fff", color: "#6366F1", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      ✏️ Edit
                    </button>
                    <button onClick={() => markNotSent(msg.id)}
                      style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 11, cursor: "pointer" }}>
                      ❌ Didn't Send
                    </button>
                  </div>
                )}
                {isSent && !isCustomer && <div style={{ fontSize: 10, color: "#10B981", fontWeight: 600 }}>✓ Sent · {timeAgo(msg.ts)}</div>}
                {isNotSent && !isCustomer && <div style={{ fontSize: 10, color: "#94A3B8" }}>Not sent</div>}
              </div>
            );
          })}

          {msgLoading && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ padding: "10px 16px", borderRadius: "16px 4px 16px 16px", background: "#EEF2FF", border: "1px solid #C7D2FE", display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 0.2, 0.4].map((d, i) => (
                  <span key={i} style={{ fontSize: 14, color: "#6366F1", animation: `pulse 1s ${d}s infinite` }}>●</span>
                ))}
                <style>{`@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
              </div>
            </div>
          )}

          {/* outreach mode */}
          {outreachMode && (
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#0F172A", marginBottom: 10 }}>👋 Why are you reaching out?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {OUTREACH_REASONS.map(r => (
                  <button key={r} onClick={() => setOutreachReason(r)}
                    style={{ padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${outreachReason === r ? "#6366F1" : "#E2E8F0"}`, background: outreachReason === r ? "#EEF2FF" : "#fff", color: outreachReason === r ? "#6366F1" : "#475569", fontSize: 12, fontWeight: outreachReason === r ? 700 : 500, cursor: "pointer", textAlign: "left" }}>
                    {r}
                  </button>
                ))}
              </div>
              {outreachReason === "Custom message" && (
                <textarea value={outreachCustom} onChange={e => setOutreachCustom(e.target.value)} placeholder="Describe what you want to say..." rows={2}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 8 }} />
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={generateOutreach} disabled={!outreachReason || msgLoading}
                  style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: outreachReason ? "#6366F1" : "#E2E8F0", color: outreachReason ? "#fff" : "#94A3B8", fontWeight: 700, fontSize: 13, cursor: outreachReason ? "pointer" : "not-allowed" }}>
                  Generate Message
                </button>
                <button onClick={() => { setOutreachMode(false); setOutreachReason(""); }}
                  style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 13, cursor: "pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

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

        {/* input bar */}
        <div style={{ padding: "10px 12px 20px", background: "#fff", borderTop: "1px solid #F1F5F9", position: "sticky", bottom: 0 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button onClick={() => { setOutreachMode(!outreachMode); }}
              style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: `1.5px solid ${outreachMode ? "#6366F1" : "#E2E8F0"}`, background: outreachMode ? "#EEF2FF" : "#fff", color: outreachMode ? "#6366F1" : "#94A3B8", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              👋 I'm Reaching Out
            </button>
            <button onClick={async () => {
              if (!anthropicKey) { alert("Add API key in Settings first."); return; }
              setMsgLoading(true);
              const lastMsg = messages[messages.length - 1];
              const context = `Generate a follow-up WhatsApp message for ${activeCustomer.name}. They were interested in ${activeDeal?.brand || "a laptop"} ${activeDeal?.model || ""}. Budget: ${activeDeal?.budget ? "AED " + activeDeal.budget : "unknown"}. Last stage: ${STAGES.find(s => s.id === activeDeal?.stage)?.label}. Days since last contact: ${daysSince(activeCustomer.last_active)}. Return JSON with only a "reply" field.`;
              try {
                const raw = await callClaude(anthropicKey, [{ role: "user", content: context }], SYSTEM_PROMPT);
                const clean = raw.replace(/```json|```/g, "").trim();
                let parsed; try { parsed = JSON.parse(clean); } catch { parsed = { reply: raw }; }
                const { data: aiMsg } = await supabase.from("messages").insert({ deal_id: activeDealId, role: "assistant", content: parsed.reply || raw }).select().single();
                setMessages(prev => [...prev, aiMsg]);
              } catch { alert("Error. Check API key."); }
              setMsgLoading(false);
            }}
              style={{ flex: 1, padding: "7px 10px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              🔁 Follow Up
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea value={msgInput} onChange={e => setMsgInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Paste ${activeCustomer.name}'s message... (or "Voice note: ...")`}
              rows={2} style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13.5, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5 }} />
            <button onClick={sendMessage} disabled={msgLoading || !msgInput.trim()}
              style={{ width: 46, height: 52, borderRadius: 12, border: "none", background: msgLoading || !msgInput.trim() ? "#E2E8F0" : "#6366F1", color: msgLoading || !msgInput.trim() ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 20, cursor: msgLoading || !msgInput.trim() ? "not-allowed" : "pointer", flexShrink: 0 }}>
              ↑
            </button>
          </div>
        </div>
      </div>
    );
  }

  // list view
  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
      {/* top bar */}
      <div style={{ background: "#fff", padding: "16px 14px 0", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, letterSpacing: 1.5 }}>LAPTOP FOR LESS</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: -0.5 }}>
              {activeTab === "customers" ? "Client CRM" : activeTab === "tasks" ? "Today's Tasks" : activeTab === "stock" ? "My Stock" : "Templates"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setView("settings")} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>⚙️</button>
            {activeTab === "customers" && <button onClick={() => setView("add")} style={{ height: 36, padding: "0 16px", borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>+ Add</button>}
            {activeTab === "stock" && <button onClick={() => { setNewStock(EMPTY_STOCK); setShowAddStock(true); }} style={{ height: 36, padding: "0 16px", borderRadius: 10, border: "none", background: "#10B981", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>+ Add</button>}
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

        {/* filters */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 10 }}>
          {[
            { key: "all", label: "All" },
            { key: "urgent", label: "🔴 Urgent" },
            { key: "overdue", label: "⏰ Overdue" },
            { key: "vip", label: "⭐ VIP" },
            { key: "cold", label: "❄️ Cold" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding: "5px 14px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer", background: filter === f.key ? "#6366F1" : "#F1F5F9", color: filter === f.key ? "#fff" : "#64748B", transition: "all 0.15s" }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* bottom nav tabs */}
      <div style={{ display: "flex", borderTop: "1px solid #F1F5F9", background: "#fff" }}>
        {[
          { key: "customers", icon: "👥", label: "Clients" },
          { key: "tasks", icon: "📋", label: "Tasks" },
          { key: "calculator", icon: "🧮", label: "Calc" },
          { key: "templates", icon: "💬", label: "Templates" },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ flex: 1, padding: "8px 4px 10px", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, borderTop: `2px solid ${activeTab === t.key ? "#6366F1" : "transparent"}` }}>
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: activeTab === t.key ? "#6366F1" : "#94A3B8" }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── CUSTOMERS TAB ── */}
      {activeTab === "customers" && (
        <div style={{ flex: 1, padding: "10px 12px 100px", display: "flex", flexDirection: "column", gap: 8 }}>
          {loading && <Spinner />}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#CBD5E1" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>💼</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>{search || filter !== "all" ? "No customers match" : "No customers yet"}</div>
              <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>{!search && filter === "all" && "Tap + Add to get started"}</div>
            </div>
          )}
          {filtered.map(c => {
            const tier = TIERS[c.tier] || TIERS.cold;
            const openD = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost");
            const latestDeal = openD[openD.length - 1] || (c.deals || [])[c.deals.length - 1];
            const overdue = daysSince(c.last_active) >= 1 && openD.length > 0;
            const totalValue = (c.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
            return (
              <div key={c.id} onClick={() => { setActiveCustomerId(c.id); setActiveDealId(latestDeal?.id); setView("detail"); setPendingSuggestion(null); }}
                style={{ background: "#fff", borderRadius: 18, padding: "14px 16px", border: `1.5px solid ${c.urgent ? "#FECACA" : "#F1F5F9"}`, cursor: "pointer", boxShadow: c.urgent ? "0 2px 16px rgba(239,68,68,0.08)" : "0 1px 4px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" }}>
                {c.urgent && <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: "#EF4444" }} />}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: c.urgent ? "#FEF2F2" : "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: c.urgent ? "#EF4444" : "#6366F1", flexShrink: 0, textTransform: "uppercase" }}>{c.name[0]}</div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 800, fontSize: 15, color: "#0F172A" }}>{c.name}</span>
                        {c.urgent && <Badge color="#EF4444" bg="#FEF2F2" small>URGENT</Badge>}
                      </div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{c.number || "No number"} · {timeAgo(c.last_active)}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <Badge color={tier.color} bg={tier.bg} small>{tier.icon} {tier.label}</Badge>
                    {totalValue > 0 && <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>AED {totalValue.toLocaleString()}</span>}
                  </div>
                </div>
                {latestDeal && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: "#475569", fontWeight: 600, marginBottom: 4 }}>
                      {[latestDeal.brand, latestDeal.model].filter(Boolean).join(" ") || "Device TBD"}
                      {latestDeal.budget ? ` · AED ${Number(latestDeal.budget).toLocaleString()}` : ""}
                    </div>
                    <StageBar stageId={latestDeal.stage} />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#CBD5E1" }}>{(c.deals || []).length} deal{(c.deals || []).length !== 1 ? "s" : ""}</span>
                  {overdue && <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 700 }}>⚠️ Follow up needed</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── TASKS TAB ── */}
      {activeTab === "tasks" && (
        <div style={{ flex: 1, padding: "10px 12px 100px", display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Smart Analysis Button */}
          <div style={{ background: "linear-gradient(135deg, #EEF2FF, #F5F3FF)", borderRadius: 16, padding: 16, border: "1.5px solid #C7D2FE" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: smartTasks ? 10 : 0 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#4338CA" }}>🤖 Smart Analysis</div>
                <div style={{ fontSize: 11, color: "#818CF8", marginTop: 2 }}>Claude reads every conversation and ranks by real priority</div>
              </div>
              <button onClick={analyzeTasksWithClaude} disabled={smartLoading || !tasks.length}
                style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: smartLoading ? "#C7D2FE" : "#6366F1", color: "#fff", fontSize: 12, fontWeight: 800, cursor: smartLoading || !tasks.length ? "not-allowed" : "pointer", flexShrink: 0, minWidth: 80 }}>
                {smartLoading ? "Analysing..." : smartTasks ? "Re-analyse" : "Analyse →"}
              </button>
            </div>
            {smartLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "8px 12px", background: "#fff", borderRadius: 10 }}>
                <div style={{ width: 16, height: 16, border: "2px solid #C7D2FE", borderTop: "2px solid #6366F1", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                <span style={{ fontSize: 12, color: "#6366F1" }}>Reading all conversations...</span>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}
            {smartError && <div style={{ fontSize: 12, color: "#EF4444", marginTop: 8, fontWeight: 600 }}>{smartError}</div>}
            {smartTasks && (
              <div style={{ fontSize: 11, color: "#6366F1", fontWeight: 700, marginTop: 4 }}>
                ✓ Analysed {smartTasks.length} deals · {smartTasks.filter(t => t.smart.priority === "urgent").length} urgent · {smartTasks.filter(t => t.smart.priority === "dead").length} dead leads
              </div>
            )}
          </div>

          {tasks.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#94A3B8" }}>All caught up!</div>
              <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>No open deals need attention</div>
            </div>
          )}

          {/* Smart Tasks View */}
          {smartTasks && smartTasks.map(({ customer: c, deal: d, smart }) => {
            const PRIORITY_STYLES = {
              urgent: { color: "#EF4444", bg: "#FEF2F2", border: "#FECACA", icon: "🔴", label: "URGENT" },
              high:   { color: "#F59E0B", bg: "#FFFBEB", border: "#FDE68A", icon: "🟠", label: "HIGH" },
              medium: { color: "#6366F1", bg: "#EEF2FF", border: "#C7D2FE", icon: "🟡", label: "MEDIUM" },
              low:    { color: "#10B981", bg: "#ECFDF5", border: "#A7F3D0", icon: "🟢", label: "LOW" },
              dead:   { color: "#94A3B8", bg: "#F8FAFC", border: "#E2E8F0", icon: "⚪", label: "DEAD LEAD" },
            };
            const ps = PRIORITY_STYLES[smart.priority] || PRIORITY_STYLES.medium;
            const isMsgCopied = smartMsgCopied[d.id];
            return (
              <div key={d.id} style={{ background: "#fff", borderRadius: 16, border: `1.5px solid ${ps.border}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                {/* Header */}
                <div style={{ padding: "10px 14px", background: ps.bg, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                  onClick={() => { setActiveCustomerId(c.id); setActiveDealId(d.id); setView("detail"); setPendingSuggestion(null); }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: ps.color, textTransform: "uppercase", border: `1.5px solid ${ps.border}` }}>{c.name[0]}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: "#0F172A" }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{[d.brand, d.model].filter(Boolean).join(" ") || "Device TBD"}</div>
                    </div>
                  </div>
                  <Badge color={ps.color} bg={ps.bg} small>{ps.icon} {ps.label}</Badge>
                </div>

                {/* AI Insight */}
                <div style={{ padding: "10px 14px", borderBottom: "1px solid #F8FAFC" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4, letterSpacing: 0.5 }}>🤖 AI SAYS</div>
                  <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginBottom: 4 }}>{smart.priorityReason}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: ps.color }}>→ {smart.nextAction}</div>
                </div>

                {/* Suggested Message */}
                {smart.suggestedMessage && (
                  <div style={{ padding: "10px 14px", background: "#F8FAFC" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6, letterSpacing: 0.5 }}>💬 SUGGESTED MESSAGE</div>
                    <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.6, whiteSpace: "pre-line", marginBottom: 8, padding: "8px 10px", background: "#fff", borderRadius: 8, border: "1px solid #E2E8F0", borderLeft: `3px solid ${ps.color}` }}>
                      {smart.suggestedMessage}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { navigator.clipboard.writeText(smart.suggestedMessage); setSmartMsgCopied(p => ({...p, [d.id]: true})); setTimeout(() => setSmartMsgCopied(p => ({...p, [d.id]: false})), 2000); }}
                        style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: isMsgCopied ? "#10B981" : "#6366F1", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        {isMsgCopied ? "✓ Copied!" : "📋 Copy Message"}
                      </button>
                      {c.number && (
                        <a href={`https://wa.me/${c.number.replace(/\D/g,"")}?text=${encodeURIComponent(smart.suggestedMessage)}`}
                          target="_blank" rel="noreferrer"
                          style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", background: "#25D366", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", textDecoration: "none", textAlign: "center" }}>
                          📱 Open WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* No message — just WhatsApp link */}
                {!smart.suggestedMessage && c.number && (
                  <div style={{ padding: "8px 14px" }}>
                    <a href={`https://wa.me/${c.number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                      style={{ display: "block", textAlign: "center", padding: "7px", borderRadius: 8, background: "#F1F5F9", color: "#6366F1", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
                      Open WhatsApp →
                    </a>
                  </div>
                )}
              </div>
            );
          })}

          {/* Simple Tasks View (when no smart analysis yet) */}
          {!smartTasks && tasks.map(({ customer: c, deal: d, days, type }) => (
            <div key={d.id} onClick={() => { setActiveCustomerId(c.id); setActiveDealId(d.id); setView("detail"); setPendingSuggestion(null); }}
              style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", border: `1.5px solid ${type === "overdue" ? "#FECACA" : type === "followup" ? "#FDE68A" : "#F1F5F9"}`, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: type === "overdue" ? "#FEF2F2" : type === "followup" ? "#FFFBEB" : "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: type === "overdue" ? "#EF4444" : type === "followup" ? "#F59E0B" : "#6366F1", textTransform: "uppercase" }}>{c.name[0]}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>{[d.brand, d.model].filter(Boolean).join(" ") || "Device TBD"}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: type === "overdue" ? "#EF4444" : type === "followup" ? "#F59E0B" : "#10B981" }}>
                    {type === "overdue" ? `🔴 ${days}d overdue` : type === "followup" ? `🟡 Follow up` : "🟢 Active"}
                  </div>
                  {c.number && (
                    <a href={`https://wa.me/${c.number.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: 11, color: "#6366F1", fontWeight: 700, textDecoration: "none" }}>
                      Open WhatsApp →
                    </a>
                  )}
                </div>
              </div>
              <StageBar stageId={d.stage} />
              {d.budget && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>Budget: AED {Number(d.budget).toLocaleString()}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── STOCK TAB ── */}
      {activeTab === "stock" && (
        <div style={{ flex: 1, padding: "10px 12px 100px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Stock filter pills */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "available", label: `🟢 Available (${stock.filter(s => s.status === "available").length})` },
              { key: "sold", label: `✅ Sold (${stock.filter(s => s.status === "sold").length})` },
              { key: "all", label: "All" },
            ].map(f => (
              <button key={f.key} onClick={() => setStockFilter(f.key)}
                style={{ padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", background: stockFilter === f.key ? "#10B981" : "#F1F5F9", color: stockFilter === f.key ? "#fff" : "#64748B", flexShrink: 0 }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <input value={stockSearch} onChange={e => setStockSearch(e.target.value)} placeholder="🔍  Search stock..."
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #F1F5F9", background: "#F8FAFC", fontSize: 13, outline: "none", boxSizing: "border-box" }} />

          {/* Stats bar */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { label: "In Stock", value: stock.filter(s => s.status === "available").length, color: "#10B981", bg: "#ECFDF5" },
              { label: "Sold", value: stock.filter(s => s.status === "sold").length, color: "#6366F1", bg: "#EEF2FF" },
              { label: "Revenue", value: `AED ${stock.filter(s => s.status === "sold").reduce((a, s) => a + (s.sold_price || 0), 0).toLocaleString()}`, color: "#F59E0B", bg: "#FFFBEB" },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 12, padding: "8px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 9, color: s.color, fontWeight: 700, opacity: 0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {stockLoading && <Spinner />}

          {/* Stock items */}
          {stock
            .filter(s => stockFilter === "all" ? true : s.status === stockFilter)
            .filter(s => !stockSearch || [s.brand, s.model, s.processor, s.ram, s.ssd].join(" ").toLowerCase().includes(stockSearch.toLowerCase()))
            .map(item => {
              const matches = findMatchingClients(item);
              const profit = item.sold_price && item.cost_price ? item.sold_price - item.cost_price : null;
              return (
                <div key={item.id} style={{ background: "#fff", borderRadius: 18, overflow: "hidden", border: `1.5px solid ${item.status === "sold" ? "#E2E8F0" : "#D1FAE5"}`, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", opacity: item.status === "sold" ? 0.75 : 1 }}>
                  
                  {/* Photo + Header */}
                  <div style={{ display: "flex", gap: 12, padding: "14px 14px 10px" }}>
                    {item.photo_url ? (
                      <img src={item.photo_url} alt="device" style={{ width: 70, height: 70, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 70, height: 70, borderRadius: 10, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, flexShrink: 0 }}>💻</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: "#0F172A" }}>{item.brand} {item.model}</div>
                          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                            {[item.processor, item.ram, item.ssd, item.screen].filter(Boolean).join(" · ")}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                            {item.condition}
                            {item.charger === "yes" && " · Charger ✅"}
                            {item.box === "yes" && " · Box ✅"}
                            {item.brand === "MacBook" && item.activation_lock === "no" && " · Unlocked ✅"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          {item.status === "available" ? (
                            <>
                              <div style={{ fontSize: 15, fontWeight: 800, color: "#10B981" }}>AED {Number(item.max_price || 0).toLocaleString()}</div>
                              {item.min_price && <div style={{ fontSize: 10, color: "#94A3B8" }}>Min: AED {Number(item.min_price).toLocaleString()}</div>}
                            </>
                          ) : (
                            <>
                              <div style={{ fontSize: 14, fontWeight: 800, color: "#6366F1" }}>Sold AED {Number(item.sold_price || 0).toLocaleString()}</div>
                              {profit !== null && <div style={{ fontSize: 11, color: profit >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>Profit: AED {profit.toLocaleString()}</div>}
                            </>
                          )}
                        </div>
                      </div>
                      {item.notes && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4, fontStyle: "italic" }}>{item.notes}</div>}
                    </div>
                  </div>

                  {/* Matching clients */}
                  {item.status === "available" && matches.length > 0 && (
                    <div style={{ margin: "0 14px 10px", padding: "8px 10px", background: "#EEF2FF", borderRadius: 10, cursor: "pointer" }}
                      onClick={() => setShowMatchingClients(showMatchingClients === item.id ? null : item.id)}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#6366F1" }}>🎯 {matches.length} matching client{matches.length !== 1 ? "s" : ""} — tap to see</div>
                      {showMatchingClients === item.id && (
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                          {matches.map(({ customer: c, deal: d }) => (
                            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "#fff", borderRadius: 8 }}>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{c.name}</div>
                                <div style={{ fontSize: 10, color: "#94A3B8" }}>{d.budget ? `Budget: AED ${Number(d.budget).toLocaleString()}` : "Budget unknown"} · {STAGES.find(s => s.id === d.stage)?.label}</div>
                              </div>
                              {c.number && (
                                <a href={`https://wa.me/${c.number.replace(/[^0-9]/g,"")}`} target="_blank" rel="noreferrer"
                                  style={{ padding: "4px 10px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 10, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>
                                  WhatsApp
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {item.status === "available" && (
                    <div style={{ display: "flex", gap: 6, padding: "0 14px 14px" }}>
                      <button onClick={() => setStockSoldConfirm(item)}
                        style={{ flex: 2, padding: "8px", borderRadius: 10, border: "none", background: "#10B981", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        ✅ Mark Sold
                      </button>
                      <button onClick={() => { setEditStockItem({ ...item }); setShowAddStock(true); }}
                        style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#6366F1", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Edit
                      </button>
                      <button onClick={() => deleteStock(item.id)}
                        style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #FEE2E2", background: "#fff", color: "#EF4444", fontSize: 12, cursor: "pointer" }}>
                        🗑
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

          {stock.filter(s => stockFilter === "all" ? true : s.status === stockFilter).length === 0 && !stockLoading && (
            <div style={{ textAlign: "center", padding: "50px 20px" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#94A3B8" }}>No stock yet</div>
              <div style={{ fontSize: 12, color: "#CBD5E1", marginTop: 4 }}>Tap + Add to add your first device</div>
            </div>
          )}
        </div>
      )}

      {/* ── ADD/EDIT STOCK MODAL ── */}
      {showAddStock && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", padding: "20px 20px 40px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: "#0F172A" }}>{editStockItem ? "Edit Device" : "Add to Stock"}</div>
              <button onClick={() => { setShowAddStock(false); setEditStockItem(null); }} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>

            {/* Photo upload */}
            <div style={{ marginBottom: 14, textAlign: "center" }}>
              {(editStockItem?.photo_url || newStock.photo_url) ? (
                <div style={{ position: "relative", display: "inline-block" }}>
                  <img src={editStockItem?.photo_url || newStock.photo_url} alt="device" style={{ width: 120, height: 120, borderRadius: 14, objectFit: "cover" }} />
                  <button onClick={() => editStockItem ? setEditStockItem(p => ({ ...p, photo_url: "" })) : setNewStock(p => ({ ...p, photo_url: "" }))}
                    style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: "50%", border: "none", background: "#EF4444", color: "#fff", fontSize: 12, cursor: "pointer" }}>✕</button>
                </div>
              ) : (
                <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "16px", background: "#F8FAFC", borderRadius: 14, border: "1.5px dashed #CBD5E1", cursor: "pointer" }}>
                  <span style={{ fontSize: 28 }}>📸</span>
                  <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>{stockPhotoUploading ? "Uploading..." : "Add photo (optional)"}</span>
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => uploadPhoto(e.target.files[0], editStockItem ? setEditStockItem : setNewStock)} />
                </label>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Brand */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>BRAND *</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {BRANDS.map(b => {
                    const cur = editStockItem || newStock;
                    const setter = editStockItem ? setEditStockItem : setNewStock;
                    return (
                      <button key={b} onClick={() => setter(p => ({ ...p, brand: b }))}
                        style={{ padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", background: cur.brand === b ? "#6366F1" : "#F1F5F9", color: cur.brand === b ? "#fff" : "#64748B" }}>
                        {b}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text fields */}
              {[
                { label: "MODEL", key: "model", placeholder: "e.g. Air M2, ThinkPad X1" },
                { label: "PROCESSOR / CORE", key: "processor", placeholder: "e.g. M2, i5 12th Gen, Ryzen 5" },
                { label: "RAM", key: "ram", placeholder: "e.g. 8GB, 16GB" },
                { label: "SSD / STORAGE", key: "ssd", placeholder: "e.g. 256GB, 512GB, 1TB" },
                { label: 'SCREEN SIZE', key: 'screen', placeholder: 'e.g. 13", 14", 15.6"' },
                { label: "SERIAL NUMBER (optional)", key: "serial_number", placeholder: "Device serial number" },
                { label: "NOTES (optional)", key: "notes", placeholder: "e.g. Minor scratch on lid" },
              ].map(f => {
                const cur = editStockItem || newStock;
                const setter = editStockItem ? setEditStockItem : setNewStock;
                return (
                  <div key={f.key}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>{f.label}</div>
                    <input value={cur[f.key] || ""} onChange={e => setter(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                );
              })}

              {/* Condition */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>CONDITION</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["New", "Like New", "Used", "Refurbished"].map(c => {
                    const cur = editStockItem || newStock;
                    const setter = editStockItem ? setEditStockItem : setNewStock;
                    return (
                      <button key={c} onClick={() => setter(p => ({ ...p, condition: c }))}
                        style={{ padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", background: cur.condition === c ? "#6366F1" : "#F1F5F9", color: cur.condition === c ? "#fff" : "#64748B" }}>
                        {c}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Toggle fields */}
              {[
                { label: "CHARGER INCLUDED", key: "charger" },
                { label: "BOX INCLUDED", key: "box" },
              ].map(f => {
                const cur = editStockItem || newStock;
                const setter = editStockItem ? setEditStockItem : setNewStock;
                return (
                  <div key={f.key}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>{f.label}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {["yes", "no", "unknown"].map(v => (
                        <button key={v} onClick={() => setter(p => ({ ...p, [f.key]: v }))}
                          style={{ flex: 1, padding: "7px", borderRadius: 10, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", background: cur[f.key] === v ? "#6366F1" : "#F1F5F9", color: cur[f.key] === v ? "#fff" : "#64748B", textTransform: "capitalize" }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* MacBook Activation Lock */}
              {(editStockItem?.brand === "MacBook" || newStock.brand === "MacBook") && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 4 }}>ACTIVATION LOCK</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["yes", "no", "unknown"].map(v => {
                      const cur = editStockItem || newStock;
                      const setter = editStockItem ? setEditStockItem : setNewStock;
                      return (
                        <button key={v} onClick={() => setter(p => ({ ...p, activation_lock: v }))}
                          style={{ flex: 1, padding: "7px", borderRadius: 10, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", background: cur.activation_lock === v ? (v === "yes" ? "#EF4444" : "#6366F1") : "#F1F5F9", color: cur.activation_lock === v ? "#fff" : "#64748B", textTransform: "capitalize" }}>
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Price range */}
              <div style={{ background: "#F8FAFC", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 8 }}>💰 PRICE RANGE (AED)</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { label: "Cost Price", key: "cost_price", placeholder: "2800" },
                    { label: "Min Price", key: "min_price", placeholder: "3100" },
                    { label: "Max Price", key: "max_price", placeholder: "3400" },
                  ].map(f => {
                    const cur = editStockItem || newStock;
                    const setter = editStockItem ? setEditStockItem : setNewStock;
                    return (
                      <div key={f.key} style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#94A3B8", marginBottom: 3 }}>{f.label}</div>
                        <input value={cur[f.key] || ""} onChange={e => setter(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} type="number"
                          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box", fontWeight: 700 }} />
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const cur = editStockItem || newStock;
                  const cost = parseFloat(cur.cost_price);
                  const min = parseFloat(cur.min_price);
                  const max = parseFloat(cur.max_price);
                  if (cost && max) {
                    const margin = Math.round(((max - cost) / cost) * 100);
                    return <div style={{ fontSize: 11, color: "#10B981", fontWeight: 700, marginTop: 6 }}>Margin at max price: {margin}% (AED {(max - cost).toLocaleString()} profit)</div>;
                  }
                  return null;
                })()}
              </div>

              <button onClick={saveStock} disabled={!(editStockItem?.brand || newStock.brand)}
                style={{ padding: 14, borderRadius: 12, border: "none", background: (editStockItem?.brand || newStock.brand) ? "#10B981" : "#E2E8F0", color: (editStockItem?.brand || newStock.brand) ? "#fff" : "#94A3B8", fontWeight: 800, fontSize: 15, cursor: (editStockItem?.brand || newStock.brand) ? "pointer" : "not-allowed" }}>
                {editStockItem ? "Save Changes" : "Add to Stock →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MARK SOLD MODAL ── */}
      {stockSoldConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%" }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#0F172A", marginBottom: 4 }}>Mark as Sold</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>{stockSoldConfirm.brand} {stockSoldConfirm.model}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", marginBottom: 6 }}>SOLD FOR (AED)</div>
            <input value={soldPrice} onChange={e => setSoldPrice(e.target.value)} placeholder={`Default: AED ${stockSoldConfirm.max_price || ""}`} type="number"
              style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 14, fontWeight: 700 }} />
            {stockSoldConfirm.min_price && soldPrice && parseFloat(soldPrice) < parseFloat(stockSoldConfirm.min_price) && (
              <div style={{ padding: "8px 10px", borderRadius: 8, background: "#FEF2F2", color: "#EF4444", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                ⚠️ Below minimum price (AED {stockSoldConfirm.min_price})
              </div>
            )}
            {stockSoldConfirm.cost_price && soldPrice && (
              <div style={{ padding: "8px 10px", borderRadius: 8, background: "#ECFDF5", color: "#10B981", fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                Profit: AED {(parseFloat(soldPrice) - parseFloat(stockSoldConfirm.cost_price)).toLocaleString()}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => markSold(stockSoldConfirm)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#10B981", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Confirm Sold ✅
              </button>
              <button onClick={() => { setStockSoldConfirm(null); setSoldPrice(""); }}
                style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TEMPLATES TAB ── */}
      {activeTab === "templates" && (
        <div style={{ flex: 1, padding: "10px 12px 100px", display: "flex", flexDirection: "column", gap: 12 }}>
          {QUICK_TEMPLATES.map(section => (
            <div key={section.category} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ padding: "10px 14px", background: section.bg, display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${section.bg}` }}>
                <span style={{ fontSize: 16 }}>{section.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: section.color }}>{section.category}</span>
              </div>
              {section.templates.map((t, i) => {
                const tid = `${section.category}-${i}`;
                return (
                  <div key={i} style={{ padding: "12px 14px", borderBottom: i < section.templates.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{t.label}</span>
                      <button onClick={() => { navigator.clipboard.writeText(t.text); setTemplateCopied(tid); setTimeout(() => setTemplateCopied(null), 2000); }}
                        style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: templateCopied === tid ? "#10B981" : section.color, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                        {templateCopied === tid ? "✓ Copied!" : "Copy"}
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.5, whiteSpace: "pre-line", background: "#F8FAFC", padding: "8px 10px", borderRadius: 8, borderLeft: `3px solid ${section.color}` }}>
                      {t.text.slice(0, 120)}{t.text.length > 120 ? "..." : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* bottom tab bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "1px solid #F1F5F9", display: "flex", zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}>
        {[
          { key: "customers", icon: "👥", label: "Clients" },
          { key: "tasks", icon: "📋", label: "Tasks", badge: tasks.filter(t => t.type === "overdue").length },
          { key: "stock", icon: "📦", label: "Stock", badge: stock.filter(s => s.status === "available").length },
          { key: "templates", icon: "💬", label: "Templates" },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ flex: 1, padding: "10px 4px 14px", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}>
            {t.badge > 0 && (
              <div style={{ position: "absolute", top: 6, right: "25%", width: 16, height: 16, borderRadius: "50%", background: "#EF4444", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.badge}</div>
            )}
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: activeTab === t.key ? "#6366F1" : "#94A3B8" }}>{t.label}</span>
            {activeTab === t.key && <div style={{ position: "absolute", bottom: 0, width: 32, height: 3, background: "#6366F1", borderRadius: "3px 3px 0 0" }} />}
          </button>
        ))}
      </div>
    </div>
  );
}
