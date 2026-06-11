export const ANTHROPIC_KEY_STORAGE = "jnp_anthropic_key";

export const STAGES = [
  { id: "new_inquiry",              label: "New Inquiry",              color: "#6366F1", bg: "#EEF2FF" },
  { id: "device_found",             label: "Device Found",             color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "negotiation",              label: "Negotiation",              color: "#EC4899", bg: "#FDF2F8" },
  { id: "confirmed_pending_pickup", label: "Confirmed — Pending Pickup", color: "#F59E0B", bg: "#FFFBEB" },
  { id: "closed",                   label: "Deal Closed",              color: "#10B981", bg: "#ECFDF5" },
  { id: "lost",                     label: "Lost",                     color: "#EF4444", bg: "#FEF2F2" },
];

export const MATCH_CATEGORIES = [
  { id: "macbook_pro",   label: "MacBook Pro",           icon: "🍎" },
  { id: "macbook_air",   label: "MacBook Air",           icon: "🍏" },
  { id: "macbook_intel", label: "MacBook Intel (older)", icon: "💻" },
  { id: "premium_win",   label: "Premium Business Win",  icon: "⭐" },
  { id: "mid_win",       label: "Mid Business Win",      icon: "🖥️" },
  { id: "budget_win",    label: "Budget Windows",        icon: "💰" },
  { id: "gaming",        label: "Gaming Laptop",         icon: "🎮" },
  { id: "surface",       label: "Microsoft Surface",     icon: "🪟" },
  { id: "none",          label: "No auto-match",         icon: "🚫" },
];

export function getMatchCategory(brand, model, processor) {
  const b = (brand     || "").toLowerCase().trim();
  const m = (model     || "").toLowerCase().trim();
  const p = (processor || "").toLowerCase().trim();

  // Apple
  if (b === "apple" || b === "macbook" || m.includes("macbook")) {
    if (m.includes("pro")) return "macbook_pro";
    if (m.includes("intel") || m.includes("2019") || m.includes("a1990") || m.includes("a2159") || m.includes("a2179") || m.includes("a1932")) return "macbook_intel";
    return "macbook_air";
  }

  // Microsoft Surface
  if (b === "microsoft" || m.includes("surface")) return "surface";

  // Gaming
  const gamingModels = ["g3","g5","g7","g15","g16","omen","legion","ideapad gaming","tuf","rog","nitro","predator","scar","strix"];
  if (gamingModels.some(g => m.includes(g))) return "gaming";

  // Budget processors
  if (["celeron","pentium","atom","dual core"].some(bp => p.includes(bp))) return "budget_win";
  if (p.includes("i3")) return "budget_win";

  // Premium business — top-tier models
  const premiumModels = ["x1 carbon","x1carbon","thinkpad x1","latitude 7","latitude 9","elitebook 1","elitebook x","xps 13","xps 15","spectre","folio"];
  if (premiumModels.some(pm => m.includes(pm))) return "premium_win";

  // Mid business — mainstream business laptops
  if (["dell","hp","lenovo","asus","acer"].some(mb => b.includes(mb))) {
    const genMatch = p.match(/i[3579]-(\d{4,5})/);
    if (genMatch) {
      const num = genMatch[1];
      const gen = num.length === 4 ? parseInt(num[0]) : parseInt(num.slice(0, 2));
      return gen >= 8 ? "mid_win" : "budget_win";
    }
    if (p.includes("ryzen 5") || p.includes("ryzen 7") || p.includes("ryzen 9")) return "mid_win";
    if (p.includes("ryzen 3")) return "budget_win";
    return "mid_win";
  }

  return "none";
}

// Categories that are cross-pitchable
export function categoriesCompatible(cat1, cat2) {
  if (!cat1 || !cat2 || cat1 === "none" || cat2 === "none") return false;
  if (cat1 === cat2) return true;
  const crossPitch = [
    ["premium_win", "mid_win"],
    ["macbook_air", "macbook_intel"],
  ];
  return crossPitch.some(([a, b]) => (cat1 === a && cat2 === b) || (cat1 === b && cat2 === a));
}

export function stockMatchesCategory(stockItem, category) {
  if (!stockItem || !category || category === "none") return false;
  const itemCat = getMatchCategory(stockItem.brand, stockItem.model, stockItem.processor);
  return itemCat === category || categoriesCompatible(itemCat, category);
}

// Score match: brand+model (exact) OR category (cross-model pitch)
// 5 = Strong (brand+model), 3 = Model only, 2 = Brand only, 1 = Category match
export function scoreMatch(stockBrand, stockModel, dealBrand, dealModel, stockProcessor, dealProcessor) {
  let score = 0;

  const sb = (stockBrand     || "").toLowerCase().trim();
  const sm = (stockModel     || "").toLowerCase().trim();
  const db = (dealBrand      || "").toLowerCase().trim();
  const dm = (dealModel      || "").toLowerCase().trim();

  // Brand match
  if (db && sb && (sb.includes(db) || db.includes(sb))) score += 2;

  // Model match — 75% keyword threshold (tightened from 50%)
  if (dm && sm) {
    const keywords = dm.split(/[\s\-\/]+/).filter(w => w.length > 2);
    if (keywords.length > 0) {
      const matched = keywords.filter(w => sm.includes(w));
      if (matched.length >= Math.ceil(keywords.length * 0.75)) score += 3;
    }
  }

  // Category match — cross-model pitch (only if no brand/model match)
  if (score === 0) {
    const stockCat = getMatchCategory(stockBrand, stockModel, stockProcessor);
    const dealCat  = getMatchCategory(dealBrand,  dealModel,  dealProcessor);
    if (categoriesCompatible(stockCat, dealCat)) score = 1;
  }

  if (score >= 5) return { score, label: "Strong match",   color: "#059669", bg: "#ECFDF5", emoji: "🟢" };
  if (score === 3) return { score, label: "Model match",    color: "#D97706", bg: "#FFFBEB", emoji: "🟡" };
  if (score === 2) return { score, label: "Brand match",    color: "#6366F1", bg: "#EEF2FF", emoji: "🔵" };
  if (score === 1) return { score, label: "Category match", color: "#8B5CF6", bg: "#F5F3FF", emoji: "🟣" };
  return                  { score, label: "Loose",          color: "#94A3B8", bg: "#F8FAFC",  emoji: "⚪" };
}

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
  { icon: "🎯", label: "Today's Focus",     question: "Who should I follow up with today? List them by priority with what I should say to each one." },
  { icon: "📦", label: "Stock Summary",     question: "Give me a full summary of my current stock by brand with total count and total value." },
  { icon: "💰", label: "Best Margins",      question: "Which items in my stock have the best profit margin right now? Rank them." },
  { icon: "🔍", label: "Match Stock",       question: "Which of my current stock items match what my open clients are looking for?" },
  { icon: "❄️", label: "Cold Clients",      question: "Which clients have not replied in 3 or more days and what were they looking for? What should I say to re-engage them?" },
  { icon: "📊", label: "Revenue MTD",       question: "What is my total revenue this month? How many deals did I close and what was the average deal value?" },
  { icon: "⚠️", label: "Slow Moving",       question: "Which devices have been in stock for 7 or more days without selling? Should I drop the price on any of them?" },
  { icon: "💡", label: "Business Insight",  question: "Give me a quick business health summary. What is going well and what needs my attention right now?" },
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
  "suggestedStage": "new_inquiry|device_found|negotiation|confirmed_pending_pickup|closed|lost" or null,
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
- new_inquiry: client asked for something, actively looking for it
- device_found: matching device located, presenting to client
- negotiation: price being discussed
- confirmed_pending_pickup: deal agreed, pending collection
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

export const TRADER_CATEGORIES = [
  { id: 'macbook',  label: 'MacBook' },
  { id: 'high_gen', label: 'High Gen Windows' },
  { id: 'low_gen',  label: 'Low Gen Windows' },
  { id: 'gaming',   label: 'Gaming' },
  { id: 'screens',  label: 'Screens' },
  { id: 'ram_ssd',  label: 'RAM / SSD' },
  { id: 'parts',    label: 'Parts' },
  { id: 'mixed',    label: 'Mixed' },
];

// ── Unified stock matching ─────────────────────────────────────────────────

// Full match with scoring — used by WaitingClientsPanel, HomeTab lost deal matches
export function matchStockToClients(stockItem, waitingDeals) {
  if (!waitingDeals?.length) return [];
  return waitingDeals
    .map(deal => ({
      ...deal,
      matchScore: scoreMatch(
        stockItem.brand, stockItem.model,
        deal.brand, deal.model,
        stockItem.processor, deal.processor
      ),
    }))
    .filter(deal => {
      if (deal.matchScore.score < 1) return false;
      if (deal.budget && stockItem.max_price) {
        if (Number(stockItem.max_price) > Number(deal.budget) * 1.15) return false;
      }
      return true;
    })
    .sort((a, b) => b.matchScore.score - a.matchScore.score);
}

// Lightweight boolean — used by CustomersTab queue priority (preferences-based)
export function stockMatchesClient(stockItem, customer) {
  if (stockItem.status !== "available") return false;
  const prefs = customer.preferences || {};
  if (prefs.brands?.length) {
    if (!prefs.brands.some(b => (stockItem.brand || "").toLowerCase().includes(b.toLowerCase()))) return false;
  }
  if (prefs.budget_max && Number(stockItem.max_price) > Number(prefs.budget_max)) return false;
  return true;
}

// ── Tag System ─────────────────────────────────────────────────────────────

export const DEFAULT_TAGS = [
  // Buying Interest (blue)
  { id: "macbook",           label: "MacBook",           group: "interest",  color: "#3B82F6", bg: "#EFF6FF" },
  { id: "windows_business",  label: "Windows Business",  group: "interest",  color: "#3B82F6", bg: "#EFF6FF" },
  { id: "budget_windows",    label: "Budget Windows",    group: "interest",  color: "#3B82F6", bg: "#EFF6FF" },
  { id: "gaming",            label: "Gaming",            group: "interest",  color: "#3B82F6", bg: "#EFF6FF" },
  { id: "bulk_buyer",        label: "Bulk Buyer",        group: "interest",  color: "#3B82F6", bg: "#EFF6FF" },
  { id: "high_spec",         label: "High Spec",         group: "interest",  color: "#3B82F6", bg: "#EFF6FF" },
  { id: "any_model",         label: "Any Model",         group: "interest",  color: "#3B82F6", bg: "#EFF6FF" },
  // Business Type (purple)
  { id: "trader",            label: "Trader",            group: "business",  color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "retailer",          label: "Retailer",          group: "business",  color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "repair_shop",       label: "Repair Shop",       group: "business",  color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "corporate",         label: "Corporate",         group: "business",  color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "reseller",          label: "Reseller",          group: "business",  color: "#8B5CF6", bg: "#F5F3FF" },
  // Relationship (amber)
  { id: "vip",               label: "VIP",               group: "relation",  color: "#D97706", bg: "#FFFBEB" },
  { id: "regular",           label: "Regular",           group: "relation",  color: "#D97706", bg: "#FFFBEB" },
  { id: "new_lead",          label: "New Lead",          group: "relation",  color: "#D97706", bg: "#FFFBEB" },
  { id: "reliable",          label: "Reliable",          group: "relation",  color: "#D97706", bg: "#FFFBEB" },
  { id: "cash_only",         label: "Cash Only",         group: "relation",  color: "#D97706", bg: "#FFFBEB" },
  { id: "slow_payer",        label: "Slow Payer",        group: "relation",  color: "#EF4444", bg: "#FEF2F2" },
  { id: "price_sensitive",   label: "Price Sensitive",   group: "relation",  color: "#D97706", bg: "#FFFBEB" },
  // Location (green)
  { id: "jnp_bldg_1",        label: "JNP Bldg 1",        group: "location",  color: "#10B981", bg: "#ECFDF5" },
  { id: "jnp_bldg_2",        label: "JNP Bldg 2",        group: "location",  color: "#10B981", bg: "#ECFDF5" },
  { id: "jnp_bldg_3",        label: "JNP Bldg 3",        group: "location",  color: "#10B981", bg: "#ECFDF5" },
  { id: "computer_mall",     label: "Computer Mall",     group: "location",  color: "#10B981", bg: "#ECFDF5" },
  { id: "mega_mall",         label: "Mega Mall",         group: "location",  color: "#10B981", bg: "#ECFDF5" },
  { id: "sharjah",           label: "Sharjah",           group: "location",  color: "#10B981", bg: "#ECFDF5" },
  { id: "dubai",             label: "Dubai",             group: "location",  color: "#10B981", bg: "#ECFDF5" },
  { id: "abu_dhabi",         label: "Abu Dhabi",         group: "location",  color: "#10B981", bg: "#ECFDF5" },
  { id: "online_only",       label: "Online Only",       group: "location",  color: "#10B981", bg: "#ECFDF5" },
  // Source (grey)
  { id: "facebook",          label: "Facebook",          group: "source",    color: "#64748B", bg: "#F1F5F9" },
  { id: "whatsapp_group",    label: "WhatsApp Group",    group: "source",    color: "#64748B", bg: "#F1F5F9" },
  { id: "referral",          label: "Referral",          group: "source",    color: "#64748B", bg: "#F1F5F9" },
  { id: "walk_in",           label: "Walk-in",           group: "source",    color: "#64748B", bg: "#F1F5F9" },
];

export const TAG_GROUPS = [
  { id: "interest",  label: "Buying Interest" },
  { id: "business",  label: "Business Type" },
  { id: "relation",  label: "Relationship" },
  { id: "location",  label: "Location" },
  { id: "source",    label: "Source" },
];

export function getTag(tagId) {
  return DEFAULT_TAGS.find(t => t.id === tagId) || { id: tagId, label: tagId, group: "other", color: "#64748B", bg: "#F1F5F9" };
}
