export const ANTHROPIC_KEY_STORAGE = "jnp_anthropic_key";

export const STAGES = [
  { id: "new_inquiry",       label: "New Inquiry",       color: "#6366F1", bg: "#EEF2FF" },
  { id: "requirement_noted", label: "Requirement Noted", color: "#F59E0B", bg: "#FFFBEB" },
  { id: "searching",         label: "Searching Device",  color: "#3B82F6", bg: "#EFF6FF" },
  { id: "device_found",      label: "Device Found",      color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "negotiation",              label: "Negotiation",              color: "#EC4899", bg: "#FDF2F8" },
  { id: "confirmed_pending_pickup", label: "Confirmed — Pending Pickup", color: "#F59E0B", bg: "#FFFBEB" },
  { id: "closed",                   label: "Deal Closed",                color: "#10B981", bg: "#ECFDF5" },
  { id: "lost",              label: "Lost",              color: "#EF4444", bg: "#FEF2F2" },
];

export const TIERS = {
  vip:     { label: "VIP",     color: "#EF4444", bg: "#FEF2F2", icon: "⭐" },
  regular: { label: "Regular", color: "#F59E0B", bg: "#FFFBEB", icon: "🟡" },
  cold:    { label: "Cold",    color: "#94A3B8", bg: "#F8FAFC", icon: "❄️" },
};

export const BRANDS = ["MacBook", "Lenovo", "Dell", "HP", "Other"];

export const LOSS_REASONS = ["Too expensive", "Bought elsewhere", "Changed mind", "No stock found", "No response", "Other"];

export const PAYMENT_STATUSES = [
  { id: "pending",  label: "Pending",  color: "#F59E0B", bg: "#FFFBEB" },
  { id: "partial",  label: "Partial",  color: "#3B82F6", bg: "#EFF6FF" },
  { id: "received", label: "Received", color: "#10B981", bg: "#ECFDF5" },
];

export const OUTREACH_REASONS = [
  "New stock arrived that matches their interest",
  "Price drop on device they wanted",
  "Following up — went cold",
  "Checking in after sale",
  "Got a great deal to share",
  "Custom message",
];

export const QUICK_ACTIONS = [
  { icon: "📦", label: "Stock Summary",     question: "Give me a full summary of my current stock by brand with total count and total value" },
  { icon: "💰", label: "Best Margins",      question: "Which items in my stock have the best profit margin? Rank them" },
  { icon: "⚠️", label: "Slow Moving",       question: "Which devices have been in stock for 7 or more days without selling?" },
  { icon: "🔍", label: "Match Stock",       question: "Which of my current stock items match what my open clients are looking for?" },
  { icon: "❄️", label: "Cold Clients",      question: "Which clients have not replied in 3 or more days and what were they looking for?" },
  { icon: "📊", label: "Revenue",           question: "What is my total revenue this month and how many deals did I close?" },
  { icon: "💵", label: "Stock Value",       question: "What is the total value of my current available stock at max price and at cost price?" },
  { icon: "📋", label: "Follow Ups Due",    question: "Who do I need to follow up with today and what should I say to each one?" },
];

export const SOURCING_STAGES = ["Evaluating", "Bid Sent", "Won", "Paid", "Shipped", "Customs", "Arrived", "In Stock"];

export const SOURCING_STAGE_COLORS = {
  "Evaluating": { fg: "#6366F1", bg: "#EEF2FF" },
  "Bid Sent":   { fg: "#F59E0B", bg: "#FFFBEB" },
  "Won":        { fg: "#10B981", bg: "#ECFDF5" },
  "Paid":       { fg: "#059669", bg: "#D1FAE5" },
  "Shipped":    { fg: "#3B82F6", bg: "#DBEAFE" },
  "Customs":    { fg: "#8B5CF6", bg: "#EDE9FE" },
  "Arrived":    { fg: "#06B6D4", bg: "#CFFAFE" },
  "In Stock":   { fg: "#10B981", bg: "#ECFDF5" },
};

export const SOURCING_CHANNELS = ["Gmail", "WhatsApp", "Both"];

export const SYSTEM_PROMPT = `You are an AI assistant for "Laptop for Less", a UAE laptop reselling business run on WhatsApp.

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
- closed: sale confirmed and completed
- lost: deal fell through`;

export const EMPTY_STOCK = { brand: "", model: "", processor: "", ram: "", ssd: "", screen: "", condition: "", charger: "", box: "", activation_lock: "unknown", cost_price: "", min_price: "", max_price: "", serial_number: "", notes: "", photo_url: "", status: "available" };

export const EMPTY_PART = {
  category: "RAM", compatible_with: "", specs: "",
  condition: "Used", quantity: 1, cost_price: "",
  sell_price: "", source: "", notes: ""
};

export const PART_CATEGORIES = [
  "RAM", "SSD", "HDD", "Screen", "Battery",
  "Charger", "Keyboard", "Trackpad", "Other"
];

export const PART_ICONS = {
  RAM: "🧠", SSD: "💾", HDD: "💿", Screen: "🖥️",
  Battery: "🔋", Charger: "🔌", Keyboard: "⌨️",
  Trackpad: "🖱️", Other: "🔧"
};
