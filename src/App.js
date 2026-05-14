import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import SourcingModule, { useSourcingAlerts } from "./SourcingModule";
import ContactModal from "./ContactModal";

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

const QUICK_ACTIONS = [
  { icon: "📦", label: "Stock Summary",     question: "Give me a full summary of my current stock by brand with total count and total value" },
  { icon: "💰", label: "Best Margins",      question: "Which items in my stock have the best profit margin? Rank them" },
  { icon: "⚠️", label: "Slow Moving",       question: "Which devices have been in stock for 7 or more days without selling?" },
  { icon: "🔍", label: "Match Stock",       question: "Which of my current stock items match what my open clients are looking for?" },
  { icon: "❄️", label: "Cold Clients",      question: "Which clients have not replied in 3 or more days and what were they looking for?" },
  { icon: "📊", label: "Revenue",           question: "What is my total revenue this month and how many deals did I close?" },
  { icon: "💵", label: "Stock Value",       question: "What is the total value of my current available stock at max price and at cost price?" },
  { icon: "📋", label: "Follow Ups Due",    question: "Who do I need to follow up with today and what should I say to each one?" },
];

const SOURCING_STAGES = ["Evaluating", "Bid Sent", "Won", "Paid", "Shipped", "Customs", "Arrived", "In Stock"];
const SOURCING_STAGE_COLORS = {
  "Evaluating": { fg: "#6366F1", bg: "#EEF2FF" },
  "Bid Sent":   { fg: "#F59E0B", bg: "#FFFBEB" },
  "Won":        { fg: "#10B981", bg: "#ECFDF5" },
  "Paid":       { fg: "#059669", bg: "#D1FAE5" },
  "Shipped":    { fg: "#3B82F6", bg: "#DBEAFE" },
  "Customs":    { fg: "#8B5CF6", bg: "#EDE9FE" },
  "Arrived":    { fg: "#06B6D4", bg: "#CFFAFE" },
  "In Stock":   { fg: "#10B981", bg: "#ECFDF5" },
};
const SOURCING_CHANNELS = ["Gmail", "WhatsApp", "Both"];

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

INVENTORY RULES (strict — follow exactly):
- ALWAYS check CURRENT STOCK INVENTORY before answering any availability question
- "do you have X" → search inventory, give exact answer with specs and price
- "how many X" → count matching items and list them all
- "what do you have" → summarize inventory by brand
- "under AED X" → filter inventory by max_price ≤ X and list matches
- "best for [use case]" → recommend from actual inventory only
- "compare X and Y" → use actual specs from inventory
- "charger/box included" → check the exact Charger/Box fields
- "activation lock" → check activation_lock field (MacBook only)
- Price negotiation → never go below min_price, always start at max_price
- Item NOT in stock → say "I can source that for you, what is your budget?" — never reveal it is not in stock
- Never invent specs, prices or quantities not listed in inventory

OWNER STOCK QUERIES (when owner asks about their own inventory):
- "how many X do I have" → count and list matching items
- "total stock value" → sum all max_price values
- "total cost" → sum all cost_price values
- "best margin" → calculate max_price minus cost_price, rank highest first
- "sitting X days" → compare created_at to today, list items older than X days

STAGE LOGIC:
- new_inquiry: just reached out
- requirement_noted: specs and budget captured
- searching: actively looking
- device_found: matching device located
- negotiation: price being discussed
- closed: sale confirmed
- lost: deal fell through`;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning!";
  if (h < 17) return "Good afternoon!";
  return "Good evening!";
}

const EMPTY_STOCK = { brand: "", model: "", processor: "", ram: "", ssd: "", screen: "", condition: "", charger: "", box: "", activation_lock: "unknown", cost_price: "", min_price: "", max_price: "", serial_number: "", notes: "", photo_url: "", status: "available" };

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

function buildSystemPromptFromCache(cachedStock) {
  if (!cachedStock?.length) return SYSTEM_PROMPT;
  const cap = v => v ? v.charAt(0).toUpperCase() + v.slice(1) : null;
  const lines = cachedStock.map((s, i) => {
    const parts = [
      [s.brand, s.model].filter(Boolean).join(" ") || "Unknown",
      s.processor, s.ram, s.ssd, s.screen || null, s.condition,
      s.charger ? `Charger: ${cap(s.charger)}` : null,
      s.box ? `Box: ${cap(s.box)}` : null,
      s.brand === "MacBook" && s.activation_lock && s.activation_lock !== "unknown"
        ? `Activation Lock: ${s.activation_lock === "yes" ? "Yes" : "No"}` : null,
      s.max_price
        ? `AED ${Number(s.max_price).toLocaleString()}${s.min_price ? ` (min: AED ${Number(s.min_price).toLocaleString()})` : ""}`
        : null,
    ].filter(Boolean);
    return `${i + 1}. ${parts.join(" | ")}`;
  }).join("\n");
  return SYSTEM_PROMPT + `\n\nCURRENT STOCK INVENTORY (${cachedStock.length} items available):\n${lines}`;
}

async function buildOwnerContext() {
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const age = ts => ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) : 0;

  const [{ data: allStock }, { data: allCustomers }] = await Promise.all([
    supabase.from("stock").select("*").order("created_at", { ascending: false }),
    supabase.from("customers").select("*, deals(*)").order("last_active", { ascending: false }),
  ]);
  const stocks = allStock || [];
  const custs = allCustomers || [];

  const available = stocks.filter(s => s.status === "available");
  const sold = stocks.filter(s => s.status === "sold");
  const soldValue = sold.reduce((n, s) => n + (s.max_price || 0), 0);

  const availLines = available.length
    ? available.map((s, i) => {
        const p = [[s.brand, s.model].filter(Boolean).join(" ") || "Unknown",
          s.processor, s.ram, s.ssd, s.screen, s.condition,
          s.cost_price != null ? `Cost: ${s.cost_price}` : null,
          s.min_price != null ? `Min: ${s.min_price}` : null,
          s.max_price != null ? `Max: ${s.max_price}` : null,
          `Days in stock: ${age(s.created_at)}`].filter(Boolean);
        return `${i + 1}. ${p.join(" | ")}`;
      }).join("\n")
    : "(none)";

  const openDeals = custs.reduce((n, c) => n + (c.deals||[]).filter(d => d.stage!=="closed"&&d.stage!=="lost").length, 0);
  const urgent = custs.filter(c => c.urgent).length;
  const cold = custs.filter(c => age(c.last_active)>=3 && (c.deals||[]).some(d=>d.stage!=="closed"&&d.stage!=="lost")).length;

  const stageCounts = Object.fromEntries(STAGES.map(s=>[s.id,0]));
  custs.forEach(c=>(c.deals||[]).forEach(d=>{ if(stageCounts[d.stage]!==undefined) stageCounts[d.stage]++; }));

  let monthRev = 0, closedThisMonth = 0;
  custs.forEach(c=>(c.deals||[]).forEach(d=>{
    if(d.stage==="closed"&&d.closed_at&&new Date(d.closed_at)>=new Date(monthStart)){
      monthRev += (d.value||0); closedThisMonth++;
    }
  }));

  const followUps = custs
    .filter(c => age(c.last_active)>=1 && (c.deals||[]).some(d=>d.stage!=="closed"&&d.stage!=="lost"))
    .sort((a,b) => age(b.last_active)-age(a.last_active))
    .slice(0,15)
    .map(c => {
      const d = (c.deals||[]).find(deal=>deal.stage!=="closed"&&deal.stage!=="lost");
      const device = d ? [d.brand,d.model].filter(Boolean).join(" ")||"Unknown" : "Unknown";
      const stage = STAGES.find(s=>s.id===d?.stage)?.label || d?.stage || "";
      return `- ${c.name} | ${device} | ${age(c.last_active)} days silent | ${stage}`;
    }).join("\n");

  return `OWNER DASHBOARD CONTEXT:
Date: ${dateStr}

STOCK INVENTORY:
Available (${available.length} items):
${availLines}
Total sold: ${sold.length} items | Approx. value: AED ${soldValue.toLocaleString()}

CLIENTS SUMMARY:
Total clients: ${custs.length}
Open deals: ${openDeals}
Urgent: ${urgent}
Cold (3+ days silent): ${cold}

DEALS BY STAGE:
New Inquiry: ${stageCounts["new_inquiry"]||0}
Requirement Noted: ${stageCounts["requirement_noted"]||0}
Searching: ${stageCounts["searching"]||0}
Device Found: ${stageCounts["device_found"]||0}
Negotiation: ${stageCounts["negotiation"]||0}
Closed this month: ${closedThisMonth}
Lost: ${stageCounts["lost"]||0}

REVENUE:
This month: AED ${monthRev.toLocaleString()}
Closed deals this month: ${closedThisMonth}

FOLLOW UPS DUE:
${followUps||"(none due)"}`;
}

function cleanWhatsAppText(text) {
  if (!text) return '';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if (cp === 0x202F || cp === 0x00A0) { out += ' '; continue; }
    if (cp === 0x200E || cp === 0x200F || cp === 0x000D) continue;
    out += text[i];
  }
  return out;
}


async function saveImportedMessages(dealId, rawChatText) {
  if (!dealId || !rawChatText) return 0;

  const messages = [];
  const lines = rawChatText.split('\n');
  const lineRegex = /^\[(\d{1,2}\/\d{1,2}\/\d{4}),\s*([\d:]+\s*(?:AM|PM|am|pm))\]\s*~?([^:]+):\s*(.*)/;

  const skipPhrases = [
    'omitted', 'end-to-end encrypted', 'deleted',
    'Voice call', 'No answer', 'is a contact',
    'This business is now using', 'Messages and calls are'
  ];

  let currentMsg = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Don't skip blank lines — they separate listing items inside a message
    // Only skip if we have no current message context
    if (!trimmed) continue;

    const match = trimmed.match(lineRegex);

    if (match) {
      if (currentMsg && currentMsg.content.trim()) {
        messages.push(currentMsg);
      }

      const [, date, time, rawSender, content] = match;
      const sender = rawSender.replace(/^~/, '').trim();
      const cleanContent = content.replace(/<This message was edited>/g, '').trim();

      if (!cleanContent || skipPhrases.some(p => cleanContent.includes(p))) {
        currentMsg = null;
        continue;
      }

      const [day, month, year] = date.split('/');
      let ts;
      try {
        const isPM = time.toLowerCase().includes('pm');
        const isAM = time.toLowerCase().includes('am');
        const timePart = time.replace(/\s*(am|pm)/gi, '').trim();
        const [h, m, s] = timePart.split(':');
        let hours = parseInt(h);
        if (isPM && hours !== 12) hours += 12;
        if (isAM && hours === 12) hours = 0;
        ts = new Date(`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${String(hours).padStart(2,'0')}:${m || '00'}:${s || '00'}`).toISOString();
      } catch {
        ts = new Date().toISOString();
      }

      const isOwner = sender === 'Laptop For Less' || sender === 'Laptop for Less';

      currentMsg = {
        deal_id: dealId,
        role: isOwner ? 'assistant' : 'customer',
        content: cleanContent,
        sent: isOwner ? cleanContent : null,
        is_voice: false,
        ts: ts
      };

    } else if (currentMsg) {
      if (!skipPhrases.some(p => trimmed.includes(p))) {
        currentMsg.content += '\n' + trimmed;
        if (currentMsg.sent) currentMsg.sent += '\n' + trimmed;
      }
    }
  }

  if (currentMsg && currentMsg.content.trim()) {
    messages.push(currentMsg);
  }

  const validMessages = messages.filter(m =>
    m.content &&
    m.content.length > 1 &&
    !skipPhrases.some(p => m.content.includes(p))
  );

  if (validMessages.length === 0) return 0;

  const chunkSize = 50;
  for (let i = 0; i < validMessages.length; i += chunkSize) {
    const chunk = validMessages.slice(i, i + chunkSize);
    await supabase.from('messages').insert(chunk);
  }

  console.log('Saved messages:', validMessages.length);
  return validMessages.length;
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
  const [templateCopied, setTemplateCopied] = useState(null);
  const [smartTasks, setSmartTasks] = useState(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState("");
  const [smartMsgCopied, setSmartMsgCopied] = useState({});
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
  const [askMessages, setAskMessages] = useState([]);
  const [askInput, setAskInput] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const askBottomRef = useRef(null);

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

  // ── broadcast ──
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastItem, setBroadcastItem] = useState(null);
  const [broadcastClients, setBroadcastClients] = useState([]);
  const [broadcastSelected, setBroadcastSelected] = useState(new Set());
  const [broadcastMessages, setBroadcastMessages] = useState([]);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastStep, setBroadcastStep] = useState("clients");
  const [broadcastSent, setBroadcastSent] = useState(new Set());

  // ── sourcing alerts for dashboard ──
  const sourcingAlerts = useSourcingAlerts();

  // ── global contact modal ──
  const [showContactModal,   setShowContactModal]   = useState(false);
  const [contactModalPreType,setContactModalPreType]= useState(null); // null | "client" | "trader" | "supplier"
  const [contactTypeFilter,  setContactTypeFilter]  = useState("all"); // "all" | "client" | "trader" | "supplier"

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

  useEffect(() => { if (session) loadCustomers(); }, [session, loadCustomers]);
  useEffect(() => { if (session) { loadStock(); refreshCachedStock(); } }, [session, loadStock, refreshCachedStock]);

  // Note: tasks tab cache loading is handled after tasks is defined

  // ── load messages for active deal ──
  useEffect(() => {
    if (!activeDealId) { setMessages([]); return; }
    supabase.from("messages").select("*").eq("deal_id", activeDealId).order("ts", { ascending: true })
      .then(({ data }) => setMessages(data || []));
  }, [activeDealId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => { askBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [askMessages]);

  // Auto-create a conversation deal for traders/suppliers that have none,
  // so the existing messages system (which requires deal_id) works unchanged.
  useEffect(() => {
    if (view !== "detail" || !activeCustomerId) return;
    const c = customers.find(x => x.id === activeCustomerId);
    if (!c) return;
    const cType = c.contact_type || "client";
    if (cType === "client") return;                  // clients always have deals
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

  // Load cached smart results on tasks tab open
  // ── tasks (defined here so loadCachedSmartTasks can reference it) ──
  const tasks = customers.flatMap(c =>
    (c.deals || [])
      .filter(d => d.stage !== "closed" && d.stage !== "lost")
      .map(d => ({
        customer: c, deal: d,
        days: daysSince(c.last_active),
        type: daysSince(c.last_active) >= 3 ? "overdue" : daysSince(c.last_active) >= 1 ? "followup" : "active",
      }))
  ).sort((a, b) => b.days - a.days);

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

  // ── stock ──
  useEffect(() => { if (activeTab === "stock") { loadStock(); refreshCachedStock(); } }, [activeTab, loadStock, refreshCachedStock]);

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






  // ── load cached smart tasks when tab switches (safe here - tasks is defined above) ──
  useEffect(() => {
    if (activeTab === "tasks" && tasks.length && !smartTasks) {
      loadCachedSmartTasks();
    }
  }, [activeTab]);

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
      <div style={{ minHeight: "100vh", background: "#F8FAFC", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
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

        {/* messages */}
        <div style={{ flex: 1, padding: "12px", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 4 }}>
          {/* Imported from WhatsApp banner */}
          {messages.length > 0 && messages[0]?.ts && (Date.now() - new Date(messages[0].ts).getTime()) > 3600000 && (
            <div style={{ textAlign: "center", padding: "5px 12px", borderRadius: 8, background: "#F1F5F9", fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>
              📱 Imported from WhatsApp
            </div>
          )}
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
                const systemPrompt = buildSystemPromptFromCache(cachedStock);
                const raw = await callClaude(anthropicKey, [{ role: "user", content: context }], systemPrompt);
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
              {activeTab === "customers" ? "Contacts" : activeTab === "tasks" ? "Today's Tasks" : "Templates"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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

      {/* bottom nav tabs */}
      <div style={{ display: "flex", borderTop: "1px solid #F1F5F9", background: "#fff" }}>
        {[
          { key: "home", icon: "🏠", label: "Home" },
          { key: "customers", icon: "👥", label: "Contacts" },
          { key: "tasks", icon: "📋", label: "Tasks" },
          { key: "stock", icon: "📦", label: "Stock" },
          { key: "sourcing", icon: "🌍", label: "Sourcing" },
          { key: "traders", icon: "🏪", label: "Traders" },
          { key: "templates", icon: "💬", label: "Templates" },
          { key: "ask", icon: "🤖", label: "Ask" },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ flex: 1, padding: "8px 2px 10px", border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, borderTop: `2px solid ${activeTab === t.key ? "#6366F1" : "transparent"}` }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: activeTab === t.key ? "#6366F1" : "#94A3B8" }}>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── HOME / DASHBOARD TAB ── */}
      {activeTab === "home" && (() => {
        const followUpsDue = tasks.filter(t => t.days >= 1).length;
        const urgentClients = customers.filter(c => c.urgent).length;
        const overdueFollowUps = tasks.filter(t => t.days >= 1).length;
        const slowStock = stock.filter(s => s.status === "available" && daysSince(s.created_at) >= 7).length;
        const pendingPayments = customers.reduce((n, c) => n + (c.deals || []).filter(d => d.stage === "closed" && d.payment_status === "pending").length, 0);
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
          <div style={{ flex: 1, padding: "16px 12px 100px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
            {/* Greeting */}
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>{getGreeting()} 👋</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
            </div>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Open Deals", value: openDeals, color: "#6366F1", bg: "#EEF2FF", icon: "📋" },
                { label: "Revenue MTD", value: `AED ${revenue >= 1000 ? (revenue/1000).toFixed(1)+"k" : revenue}`, color: "#10B981", bg: "#ECFDF5", icon: "💰" },
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

            {/* Alerts */}
            {(urgentClients > 0 || overdueFollowUps > 0 || slowStock > 0 || pendingPayments > 0) && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginBottom: 10, letterSpacing: 0.5 }}>⚡ ALERTS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
            const cType     = c.contact_type || "client";
            const tier      = TIERS[c.tier] || TIERS.cold;
            const openD     = (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost");
            const latestDeal= openD[openD.length - 1] || (c.deals || [])[c.deals.length - 1];
            const overdue   = daysSince(c.last_active) >= 1 && openD.length > 0;
            const totalValue= (c.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
            const activityTs= c.last_activity_at || c.last_active;
            const typeBadge = cType === "trader" ? { label: "🟡 Trader", color: "#D97706", bg: "#FFFBEB" }
                            : cType === "supplier"? { label: "🔵 Supplier", color: "#2563EB", bg: "#EFF6FF" }
                            : null;
            // preview text
            const preview   = latestDeal
              ? ([latestDeal.brand, latestDeal.model].filter(Boolean).join(" ") || "Device TBD")
                + (latestDeal.budget ? ` · AED ${Number(latestDeal.budget).toLocaleString()}` : "")
              : cType !== "client" ? (c.notes?.slice(0, 40) || "") : "";

            return (
              <div key={c.id} onClick={() => { setActiveCustomerId(c.id); setActiveDealId(latestDeal?.id); setView("detail"); setPendingSuggestion(null); }}
                style={{ background: "#fff", borderRadius: 18, padding: "12px 14px", border: `1.5px solid ${c.urgent ? "#FECACA" : "#F1F5F9"}`, cursor: "pointer", boxShadow: c.urgent ? "0 2px 16px rgba(239,68,68,0.08)" : "0 1px 4px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden" }}>
                {c.urgent && <div style={{ position: "absolute", top: 0, left: 0, width: 4, height: "100%", background: "#EF4444" }} />}

                {/* Row 1 — avatar + name + timestamp */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: c.urgent ? "#FEF2F2" : cType === "trader" ? "#FFFBEB" : cType === "supplier" ? "#EFF6FF" : "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: c.urgent ? "#EF4444" : cType === "trader" ? "#D97706" : cType === "supplier" ? "#2563EB" : "#6366F1", flexShrink: 0, textTransform: "uppercase" }}>{c.name[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                        <span style={{ fontWeight: 800, fontSize: 14, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        {typeBadge && <span style={{ fontSize: 9, fontWeight: 700, color: typeBadge.color, background: typeBadge.bg, padding: "1px 6px", borderRadius: 8, flexShrink: 0 }}>{typeBadge.label}</span>}
                        {c.urgent && <Badge color="#EF4444" bg="#FEF2F2" small>URGENT</Badge>}
                      </div>
                      <span style={{ fontSize: 10, color: "#94A3B8", flexShrink: 0 }}>{timeAgo(activityTs)}</span>
                    </div>
                    {/* preview line */}
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {preview || (c.number || "No number")}
                    </div>
                  </div>
                </div>

                {/* Row 2 — stage bar (clients only) + tier + value */}
                {cType === "client" && latestDeal && (
                  <div style={{ marginTop: 8, marginLeft: 52 }}>
                    <StageBar stageId={latestDeal.stage} />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, marginLeft: 52 }}>
                  {cType === "client" ? (
                    <span style={{ fontSize: 10, color: "#CBD5E1" }}>{(c.deals || []).length} deal{(c.deals || []).length !== 1 ? "s" : ""}</span>
                  ) : (
                    <span style={{ fontSize: 10, color: "#94A3B8" }}>{c.location || c.number || ""}</span>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {totalValue > 0 && <span style={{ fontSize: 10, color: "#10B981", fontWeight: 700 }}>AED {totalValue.toLocaleString()}</span>}
                    {overdue && <span style={{ fontSize: 9, color: "#EF4444", fontWeight: 700 }}>⚠️ Follow up</span>}
                  </div>
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
          <div style={{ display: "flex", gap: 6 }}>
            {[{ key: "available", label: "✅ Available" }, { key: "sold", label: "🏷️ Sold" }, { key: "all", label: "All" }].map(f => (
              <button key={f.key} onClick={() => setStockFilter(f.key)}
                style={{ padding: "5px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0, background: stockFilter === f.key ? "#6366F1" : "#F1F5F9", color: stockFilter === f.key ? "#fff" : "#64748B" }}>
                {f.label}
              </button>
            ))}
          </div>

          {stockLoading && <Spinner />}

          {/* Empty state */}
          {!stockLoading && filteredStock.length === 0 && (
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

          {/* Stock cards */}
          {filteredStock.map(item => {
            const isExpanded = expandedStockId === item.id;
            const matches = getMatchingClients(item);
            const isAvail = item.status === "available";
            return (
              <div key={item.id} style={{ background: "#fff", borderRadius: 18, border: `1.5px solid ${isAvail ? "#E2E8F0" : "#F1F5F9"}`, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden", opacity: isAvail ? 1 : 0.7 }}>
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
                      <button onClick={e => { e.stopPropagation(); toggleStockStatus(item); }}
                        style={{ padding: "3px 10px", borderRadius: 20, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer", background: isAvail ? "#ECFDF5" : "#F1F5F9", color: isAvail ? "#10B981" : "#94A3B8" }}>
                        {isAvail ? "✅ Available" : "🏷️ Sold"}
                      </button>
                      {isAvail && (
                        <button onClick={e => { e.stopPropagation(); openBroadcast(item); }}
                          style={{ padding: "3px 8px", borderRadius: 8, border: "none", background: "#6366F1", color: "#fff", fontSize: 10, cursor: "pointer", fontWeight: 700 }}>
                          📢
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
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => {
                        setEditingStock(item);
                        setStockForm({ ...EMPTY_STOCK, ...item, cost_price: item.cost_price ?? "", min_price: item.min_price ?? "", max_price: item.max_price ?? "" });
                        setShowAddStock(true);
                      }}
                        style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#6366F1", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => { if (window.confirm(`Delete ${[item.brand, item.model].filter(Boolean).join(" ") || "this item"}?`)) deleteStockItem(item.id); }}
                        style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #FEE2E2", background: "#fff", color: "#EF4444", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>
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

      {/* ── ASK CLAUDE TAB ── */}
      {activeTab === "ask" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

          {/* Quick action grid — shown when chat is empty */}
          {askMessages.length === 0 && (
            <div style={{ padding: "16px 12px 0", overflowY: "auto" }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A" }}>🤖 Business Assistant</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>Ask anything about your stock, clients, or revenue</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {QUICK_ACTIONS.map(a => (
                  <button key={a.label} onClick={() => sendAskMessage(a.question)} disabled={askLoading}
                    style={{ padding: "14px 10px", borderRadius: 16, border: "1.5px solid #E2E8F0", background: "#fff", cursor: "pointer", textAlign: "left", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", opacity: askLoading ? 0.5 : 1 }}>
                    <div style={{ fontSize: 22, marginBottom: 5 }}>{a.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", lineHeight: 1.3 }}>{a.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Conversation area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 4px" }}>
            {askMessages.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                <button onClick={() => setAskMessages([])}
                  style={{ padding: "4px 12px", borderRadius: 20, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                  🗑 Clear chat
                </button>
              </div>
            )}
            {askMessages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "owner" ? "flex-end" : "flex-start", marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "#CBD5E1", marginBottom: 3 }}>
                  {msg.role === "owner" ? "You" : "🤖 Claude"}
                </div>
                <div style={{
                  maxWidth: "88%", padding: "11px 14px", fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-line",
                  borderRadius: msg.role === "owner" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                  background: msg.role === "owner" ? "#DCFCE7" : "#F3E8FF",
                  color: msg.role === "owner" ? "#14532D" : "#4C1D95",
                  border: msg.role === "owner" ? "1px solid #BBF7D0" : "1px solid #DDD6FE",
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {askLoading && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 14 }}>
                <div style={{ padding: "10px 16px", borderRadius: "4px 16px 16px 16px", background: "#F3E8FF", border: "1px solid #DDD6FE", display: "flex", gap: 4, alignItems: "center" }}>
                  {[0, 0.2, 0.4].map((d, i) => (
                    <span key={i} style={{ fontSize: 14, color: "#7C3AED", animation: `pulse 1s ${d}s infinite` }}>●</span>
                  ))}
                  <style>{`@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
                </div>
              </div>
            )}
            <div ref={askBottomRef} />
          </div>

          {/* Input bar */}
          <div style={{ padding: "10px 12px 100px", background: "#fff", borderTop: "1px solid #F1F5F9" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                value={askInput}
                onChange={e => setAskInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAskMessage(askInput); } }}
                placeholder="Ask anything about your business..."
                rows={2}
                style={{ flex: 1, padding: "10px 12px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 13.5, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.5 }}
              />
              <button onClick={() => sendAskMessage(askInput)} disabled={askLoading || !askInput.trim()}
                style={{ width: 46, height: 52, borderRadius: 12, border: "none", background: askLoading || !askInput.trim() ? "#E2E8F0" : "#7C3AED", color: askLoading || !askInput.trim() ? "#94A3B8" : "#fff", fontWeight: 800, fontSize: 20, cursor: askLoading || !askInput.trim() ? "not-allowed" : "pointer", flexShrink: 0 }}>
                ↑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SOURCING TAB ── */}
      {activeTab === "sourcing" && (
        <SourcingModule anthropicKey={anthropicKey} onAddToStock={() => { loadStock(); refreshCachedStock(); }} />
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

      {/* ── Floating "+" button ── */}
      <button
        onClick={() => { setContactModalPreType(null); setShowContactModal(true); }}
        style={{
          position: "fixed", bottom: 76, right: "calc(50% - 228px)",
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

      {/* bottom tab bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#fff", borderTop: "1px solid #F1F5F9", display: "flex", zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,0.06)" }}>
        {[
          { key: "home", icon: "🏠", label: "Home" },
          { key: "customers", icon: "👥", label: "Contacts" },
          { key: "tasks", icon: "📋", label: "Tasks", badge: tasks.filter(t => t.type === "overdue").length },
          { key: "stock", icon: "📦", label: "Stock", badge: stock.filter(s => s.status === "available").length || 0 },
          { key: "sourcing", icon: "🌍", label: "Sourcing" },
          { key: "traders", icon: "🏪", label: "Traders" },
          { key: "templates", icon: "💬", label: "Templates" },
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
    </div>
  );
}
