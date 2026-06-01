import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useUI } from "../../context/UIContext";
import { useAuth } from "../../context/AuthContext";
import { useCustomers } from "../../context/CustomerContext";
import { useSales } from "../../context/SalesContext";
import GroupsTab from "./GroupsTab";
import FacebookPostingTab from "./FacebookPostingTab";

// ── Constants ─────────────────────────────────────────────────────────────────
const WHATSAPP_NUMBER = "+971509423162";
const CHANNEL_LINK    = "https://whatsapp.com/channel/0029Vb818z5GufIwfVtYoB0z";
const CHANNEL_NAME    = "Vertex Tech Trading | Wholesale Deals";
const FB_PAGE_LINK    = "https://www.facebook.com/share/1C3UKfNAfs/";
const FB_PAGE_NAME    = "Vertex Tech Trading";
const BUSINESS_NAME   = "Laptop for Less";
const LOCATION        = "Sharjah, UAE";

const LEAD_SOURCES = [
  { id: "instagram", label: "📸 Instagram" },
  { id: "dubizzle",  label: "🛒 Dubizzle" },
  { id: "whatsapp",  label: "💬 WhatsApp" },
  { id: "walkin",    label: "🚶 Walk-in" },
  { id: "referral",  label: "👥 Referral" },
  { id: "facebook",  label: "👍 Facebook" },
  { id: "other",     label: "🔗 Other" },
];

async function callClaude(key, prompt, system = "") {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: system || "You are a marketing assistant for a UAE laptop reseller. Write engaging, authentic posts.",
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text || "";
}

// ── Format guides per platform ────────────────────────────────────────────────
const FORMAT_GUIDES = {
  whatsapp_status:  "Short 3-5 lines. One device. Emoji. No hashtags. End with WhatsApp number.",
  whatsapp_channel: `Short punchy announcement. 4-6 lines. New arrival or deal angle. End with: 🔔 Follow: ${CHANNEL_LINK}`,
  instagram:        "Engaging caption 4-6 lines. 1 device spotlighted. Lifestyle angle. End with 8-10 hashtags: #laptopsharjah #uaelaptop #laptopuae #sharjah #dubaideals #refurbishedlaptop #gradeAlaptop",
  linkedin:         "Professional B2B tone. 2-3 short paragraphs. Bulk/business angle. No prices — 'contact for quote'. End with: Faisal Hadi | Laptop for Less | Sharjah UAE",
  dubizzle:         "Title line first. Then specs as bullet points. Condition grade. Price. Location: Sharjah. Contact: WhatsApp number.",
  fb_personal:      "First-person conversational. 5-7 lines. Personal angle ('just got this in'). 1 device. 3-4 casual emojis. No hashtags. End with personal WhatsApp CTA.",
  fb_business:      `Professional brand tone. 8-12 lines. Brand: ${FB_PAGE_NAME}. 2-3 devices with spec bullets. WhatsApp + page link + channel link. End with 12-15 hashtags: #laptopsharjah #refurbishedlaptop #uaelaptop #vertextechtrading #wholesalelaptop #gradeAlaptop #sharjah #dubaideals #businesslaptop #hplaptop #delllaptop #lenovolaptop #thinkpad #elitebook #latitude`,
};

// ── Core generate function ────────────────────────────────────────────────────
async function generatePlatformPost({ key, platformId, stockContext, strategyNotes, recentSales, today }) {
  const guide = FORMAT_GUIDES[platformId] || "Professional engaging post.";
  const strategyCtx = strategyNotes?.trim()
    ? `\nYour market strategy (always apply):\n${strategyNotes.trim()}`
    : "";

  // Platform-specific extras
  let extras = "";
  if (platformId === "fb_business") {
    extras = `\nEnd the post with:\n- WhatsApp: ${WHATSAPP_NUMBER}\n- Like our page: ${FB_PAGE_LINK}\n- Follow channel: ${CHANNEL_LINK}\n- Hashtags`;
  }
  if (platformId === "whatsapp_status" || platformId === "whatsapp_channel") {
    extras = `\nEnd with WhatsApp: ${WHATSAPP_NUMBER}`;
  }

  const prompt = `Write a ${platformId.replace(/_/g, " ")} post for my laptop reselling business.

Business: ${BUSINESS_NAME}, ${LOCATION}
WhatsApp: ${WHATSAPP_NUMBER}
Date: ${today}

${stockContext}

Recent sales (social proof): ${recentSales || "none"}
${strategyCtx}${extras}

Format: ${guide}

Write the post now. Feel authentic, not corporate.`;

  return callClaude(key, prompt);
}

// ── Shared Manual/Auto input component ───────────────────────────────────────
function StockInput({ mode, setMode, manualInput, setManualInput, stockCount }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #F1F5F9", marginBottom: 2 }}>
      {/* Mode toggle */}
      <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: "1px solid #F1F5F9", marginBottom: mode === "manual" ? 10 : 0 }}>
        <button onClick={() => setMode("auto")}
          style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
            background: mode === "auto" ? "#6366F1" : "#F8FAFC",
            color:      mode === "auto" ? "#fff"    : "#64748B" }}>
          🤖 Auto — from live stock ({stockCount})
        </button>
        <button onClick={() => setMode("manual")}
          style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
            background: mode === "manual" ? "#6366F1" : "#F8FAFC",
            color:      mode === "manual" ? "#fff"    : "#64748B" }}>
          ✍️ Manual — I'll specify
        </button>
      </div>
      {mode === "manual" && (
        <textarea
          value={manualInput}
          onChange={e => setManualInput(e.target.value)}
          placeholder={"Describe what you want to feature today...\n\nExamples:\n\"5x HP EliteBook 840 G8 Grade A AED 1,750\"\n\"MacBook Air M2 from trader, AED 3,600\"\n\"Clearing HP lot — Grade B from AED 950\""}
          rows={4}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #6366F1",
            fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.6,
            boxSizing: "border-box", color: "#334155" }}
        />
      )}
    </div>
  );
}

// ── Platform card component ───────────────────────────────────────────────────
function PlatformCard({ platformId, label, emoji, color, bg, post, generating, copied, onGenerate, onCopy, onRegenerate }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #F1F5F9" }}>
      <div style={{ padding: "10px 14px", background: bg, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{emoji}</span>
          <span style={{ fontSize: 13, fontWeight: 800, color }}>{label}</span>
        </div>
        <button onClick={post ? onRegenerate : onGenerate} disabled={generating}
          style={{ padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 800,
            cursor: generating ? "not-allowed" : "pointer",
            background: generating ? "#E2E8F0" : color,
            color: generating ? "#94A3B8" : "#fff" }}>
          {generating ? "⏳..." : post ? "↺ Regen" : "✨ Generate"}
        </button>
      </div>
      {post && (
        <div style={{ padding: "12px 14px" }}>
          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.7, whiteSpace: "pre-line",
            background: "#F8FAFC", padding: "10px 12px", borderRadius: 10, marginBottom: 8 }}>
            {post}
          </div>
          <button onClick={onCopy}
            style={{ width: "100%", padding: "9px 0", borderRadius: 10, border: "none", fontSize: 12,
              fontWeight: 800, cursor: "pointer",
              background: copied ? "#ECFDF5" : "#1877F2",
              color: copied ? "#059669" : "#fff" }}>
            {copied ? "✓ Copied!" : "📋 Copy"}
          </button>
        </div>
      )}
      {!post && !generating && (
        <div style={{ padding: "10px 14px", fontSize: 11, color: "#CBD5E1", textAlign: "center" }}>
          Tap Generate to create a {label} post
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MarketingTab({ stock }) {
  const { isMobile, activeMarketingTab, setActiveMarketingTab } = useUI();
  const { anthropicKey } = useAuth();
  const { customers } = useCustomers();
  const { salesHistory } = useSales();

  const today    = new Date();
  const todayKey = today.toISOString().split("T")[0];
  const todayStr = today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  // Shared state
  const [mode, setMode]             = useState("auto");
  const [consignmentStock, setConsignmentStock] = useState([]);
  const [manualInput, setManualInput] = useState("");
  const [strategyNotes, setStrategyNotes] = useState("");
  const [posts, setPosts]           = useState({});
  const [generating, setGenerating] = useState({});
  const [copied, setCopied]         = useState({});
  const [postedDates, setPostedDates] = useState({});
  const [postFeedback, setPostFeedback] = useState({});

  // WhatsApp Groups state (same as before)
  const [fbMode, setFbMode]         = useState("groups"); // groups | personal | business
  const [weeklyPlan, setWeeklyPlan] = useState(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [library, setLibrary]       = useState([]);
  const [libGenerating, setLibGenerating] = useState(false);

  // Load consignment stock
  useEffect(() => {
    supabase.from("consignment_items")
      .select("*, customers(name)")
      .eq("status", "available")
      .then(({ data }) => setConsignmentStock(data || []));
  }, []);

  // Load persisted state
  useEffect(() => {
    try { const s = localStorage.getItem("jnp_posted_dates");    if (s) setPostedDates(JSON.parse(s)); } catch {}
    try { const s = localStorage.getItem("jnp_content_library"); if (s) setLibrary(JSON.parse(s)); } catch {}
    try { const s = localStorage.getItem("jnp_strategy_notes");  if (s) setStrategyNotes(s); } catch {}
    try { const s = localStorage.getItem(`jnp_post_feedback_${todayKey}`); if (s) setPostFeedback(JSON.parse(s)); } catch {}
    try { const s = localStorage.getItem("jnp_weekly_plan"); if (s) {
      const p = JSON.parse(s);
      if (p.weekKey === todayKey.slice(0, 7)) setWeeklyPlan(p);
    }} catch {}
  }, []); // eslint-disable-line

  const availableStock = (stock || []).filter(s => s.status === "available");

  function stockSummary() {
    const ownedLines = availableStock.slice(0, 6).map(s =>
      `${s.brand || ""} ${s.model || ""} | ${s.processor || ""} | ${s.ram || ""} | ${s.ssd || ""} | Grade ${s.condition || ""} | AED ${s.max_price || 0}`
    );
    const consignLines = consignmentStock.slice(0, 4).map(c =>
      `${c.brand || ""} ${c.model || ""} | ${c.processor || ""} | ${c.ram || ""} | ${c.ssd || ""} | Grade ${c.condition || ""} | AED ${c.your_price || 0} [Consignment — with ${c.customers?.name || "Trader"}]`
    );
    return [...ownedLines, ...consignLines].join("\n") || "Various laptops available";
  }

  function getStockContext() {
    if (mode === "manual" && manualInput.trim()) {
      return `Devices to feature (specified by owner):\n${manualInput.trim()}`;
    }
    return `Available stock:\n${stockSummary()}`;
  }

  function getRecentSales() {
    return (salesHistory || []).slice(0, 3).map(s =>
      `${s.brand || ""} ${s.model || ""} AED ${s.sold_price || s.value || 0}`
    ).join(", ");
  }

  function getPerfHint(platformId) {
    try {
      const hist = JSON.parse(localStorage.getItem("jnp_post_feedback_history") || "{}");
      const platHist = Object.entries(hist).filter(([k]) => k.startsWith(platformId)).slice(-10).map(([, v]) => v);
      if (platHist.length < 3) return "";
      const avg = platHist.reduce((s, v) => s + (v === "many" ? 3 : v === "few" ? 1 : 0), 0) / platHist.length;
      if (avg > 2) return "\nNote: Posts here getting strong replies lately. Keep the same energy.";
      if (avg < 1) return "\nNote: Posts here getting low replies. Try a fresher hook.";
    } catch {}
    return "";
  }

  async function generate(platformId) {
    if (!anthropicKey) { alert("Add Anthropic API key in Settings first."); return; }
    if (mode === "manual" && !manualInput.trim()) { alert("Please describe what you want to feature."); return; }
    if (mode === "auto" && !availableStock.length) { alert("No available stock found."); return; }
    setGenerating(p => ({ ...p, [platformId]: true }));
    try {
      const text = await generatePlatformPost({
        key: anthropicKey,
        platformId,
        stockContext: getStockContext(),
        strategyNotes: strategyNotes + getPerfHint(platformId),
        recentSales: getRecentSales(),
        today: todayStr,
      });
      setPosts(p => ({ ...p, [platformId]: text }));
    } catch { alert("Failed to generate. Check your API key."); }
    setGenerating(p => ({ ...p, [platformId]: false }));
  }

  function copy(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(p => ({ ...p, [key]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 2000);
  }

  function saveFeedback(platformId, rating) {
    const updated = { ...postFeedback, [platformId]: rating };
    setPostFeedback(updated);
    localStorage.setItem(`jnp_post_feedback_${todayKey}`, JSON.stringify(updated));
    // Save to history
    try {
      const hist = JSON.parse(localStorage.getItem("jnp_post_feedback_history") || "{}");
      hist[`${platformId}_${todayKey}`] = rating;
      localStorage.setItem("jnp_post_feedback_history", JSON.stringify(hist));
    } catch {}
  }

  function markPosted() {
    const updated = { ...postedDates, [todayKey]: new Date().toISOString() };
    setPostedDates(updated);
    localStorage.setItem("jnp_posted_dates", JSON.stringify(updated));
  }

  let streak = 0;
  const check = new Date();
  if (postedDates[todayKey]) streak++;
  check.setDate(check.getDate() - 1);
  for (let i = 0; i < 30; i++) {
    const k = check.toISOString().split("T")[0];
    if (postedDates[k]) { streak++; check.setDate(check.getDate() - 1); } else break;
  }

  // Lead stats
  const leadStats = LEAD_SOURCES.map(src => {
    const leads  = customers.filter(c => c.lead_source === src.id).length;
    const closed = customers.filter(c => c.lead_source === src.id).flatMap(c => c.deals || []).filter(d => d.stage === "closed").length;
    return { ...src, leads, closed, rate: leads > 0 ? Math.round((closed / leads) * 100) : 0 };
  }).filter(s => s.leads > 0).sort((a, b) => b.leads - a.leads);

  const TABS = [
    { key: "whatsapp",  label: "💬 WhatsApp" },
    { key: "facebook",  label: "📘 Facebook" },
    { key: "others",    label: "📱 Others" },
    { key: "plan",      label: "📅 Plan" },
    { key: "strategy",  label: "🎯 Strategy" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#F8FAFC" }}>

      {/* Header */}
      <div style={{ background: "#fff", padding: "16px 16px 0", borderBottom: "1px solid #F1F5F9" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 14 }}>📣 Marketing</div>
        <div style={{ display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveMarketingTab(t.key)}
              style={{ padding: "10px 14px", border: "none", background: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                color:        activeMarketingTab === t.key ? "#6366F1" : "#94A3B8",
                borderBottom: activeMarketingTab === t.key ? "2px solid #6366F1" : "2px solid transparent" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 12px 100px" : "16px 24px 40px" }}>

        {/* ── WHATSAPP TAB ── */}
        {activeMarketingTab === "whatsapp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Streak */}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, background: "#fff", borderRadius: 14, padding: "12px 14px", border: "1px solid #F1F5F9", textAlign: "center" }}>
                <div style={{ fontSize: 22 }}>🔥</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>{streak}</div>
                <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700 }}>DAY STREAK</div>
              </div>
              <button onClick={markPosted} disabled={!!postedDates[todayKey]}
                style={{ flex: 2, borderRadius: 14, border: "none", fontSize: 12, fontWeight: 800,
                  cursor: postedDates[todayKey] ? "default" : "pointer",
                  background: postedDates[todayKey] ? "#ECFDF5" : "#10B981",
                  color:      postedDates[todayKey] ? "#059669" : "#fff" }}>
                {postedDates[todayKey] ? "✅ Posted Today" : "Mark Posted"}
              </button>
            </div>

            {/* Auto/Manual */}
            <StockInput mode={mode} setMode={setMode} manualInput={manualInput} setManualInput={setManualInput} stockCount={availableStock.length + consignmentStock.length} />

            {strategyNotes && (
              <div style={{ padding: "7px 12px", borderRadius: 10, background: "#EEF2FF", border: "1px solid #C7D2FE", fontSize: 11, color: "#4338CA", fontWeight: 600 }}>
                🎯 Strategy notes active — Claude applies your market knowledge
              </div>
            )}

            {/* WhatsApp Status */}
            <PlatformCard platformId="whatsapp_status" label="WhatsApp Status" emoji="📲" color="#25D366" bg="#F0FDF4"
              post={posts.whatsapp_status} generating={!!generating.whatsapp_status} copied={!!copied.whatsapp_status}
              onGenerate={() => generate("whatsapp_status")}
              onRegenerate={() => generate("whatsapp_status")}
              onCopy={() => copy(posts.whatsapp_status, "whatsapp_status")} />

            {/* WhatsApp Channel */}
            <PlatformCard platformId="whatsapp_channel" label="WA Channel" emoji="📡" color="#128C7E" bg="#ECFDF5"
              post={posts.whatsapp_channel} generating={!!generating.whatsapp_channel} copied={!!copied.whatsapp_channel}
              onGenerate={() => generate("whatsapp_channel")}
              onRegenerate={() => generate("whatsapp_channel")}
              onCopy={() => copy(posts.whatsapp_channel, "whatsapp_channel")} />

            {/* Groups section */}
            <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #F1F5F9" }}>
              <div style={{ padding: "10px 14px", background: "#ECFDF5", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 18 }}>💬</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#128C7E" }}>WhatsApp Groups (200+)</span>
              </div>
              <div style={{ padding: "10px 14px", fontSize: 11, color: "#64748B", lineHeight: 1.6 }}>
                Group posting with rotation and regional tailoring is in the 📘 Facebook section's Groups tab — which handles all 205 groups with Batch A/B/C rotation.
                <br />
                For WhatsApp-specific group posts, use the WA Groups generator below.
              </div>
              <div style={{ padding: "0 14px 14px" }}>
                <PlatformCard platformId="whatsapp_groups" label="WA Groups Post" emoji="💬" color="#128C7E" bg="#ECFDF5"
                  post={posts.whatsapp_groups} generating={!!generating.whatsapp_groups} copied={!!copied.whatsapp_groups}
                  onGenerate={() => generate("whatsapp_groups")}
                  onRegenerate={() => generate("whatsapp_groups")}
                  onCopy={() => copy(posts.whatsapp_groups, "whatsapp_groups")} />
              </div>
            </div>

          </div>
        )}

        {/* ── FACEBOOK TAB ── */}
        {activeMarketingTab === "facebook" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Sub-tab pills */}
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { key: "groups",   label: "📋 Groups",        count: "205" },
                { key: "personal", label: "👤 Personal Page",  count: null },
                { key: "business", label: "🏢 Business Page",  count: null },
              ].map(s => (
                <button key={s.key} onClick={() => setFbMode(s.key)}
                  style={{ flex: 1, padding: "8px 4px", borderRadius: 10, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                    background: fbMode === s.key ? "#1877F2" : "#F1F5F9",
                    color:      fbMode === s.key ? "#fff"    : "#64748B" }}>
                  {s.label}{s.count ? ` (${s.count})` : ""}
                </button>
              ))}
            </div>

            {/* Auto/Manual — for personal and business only */}
            {fbMode !== "groups" && (
              <>
                <StockInput mode={mode} setMode={setMode} manualInput={manualInput} setManualInput={setManualInput} stockCount={availableStock.length + consignmentStock.length} />
                {strategyNotes && (
                  <div style={{ padding: "7px 12px", borderRadius: 10, background: "#EEF2FF", border: "1px solid #C7D2FE", fontSize: 11, color: "#4338CA", fontWeight: 600 }}>
                    🎯 Strategy notes active
                  </div>
                )}
              </>
            )}

            {/* Groups — use existing FacebookPostingTab */}
            {fbMode === "groups" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Manual input for groups too */}
                <StockInput mode={mode} setMode={setMode} manualInput={manualInput} setManualInput={setManualInput} stockCount={availableStock.length + consignmentStock.length} />
                {mode === "manual" && manualInput && (
                  <div style={{ padding: "8px 12px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A", fontSize: 11, color: "#D97706", fontWeight: 600 }}>
                    ✍️ Manual mode active — group posts will feature your specified devices across all batches and regions
                  </div>
                )}
                <FacebookPostingTab manualInput={mode === "manual" ? manualInput : null} strategyNotes={strategyNotes} />
              </div>
            )}

            {/* Personal Page */}
            {fbMode === "personal" && (
              <PlatformCard platformId="fb_personal" label="Facebook Personal Page" emoji="👤" color="#1877F2" bg="#EFF6FF"
                post={posts.fb_personal} generating={!!generating.fb_personal} copied={!!copied.fb_personal}
                onGenerate={() => generate("fb_personal")}
                onRegenerate={() => generate("fb_personal")}
                onCopy={() => copy(posts.fb_personal, "fb_personal")} />
            )}

            {/* Business Page */}
            {fbMode === "business" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ padding: "10px 14px", borderRadius: 12, background: "#EFF6FF", border: "1px solid #BFDBFE", fontSize: 11, color: "#1877F2" }}>
                  💡 Business page posts include your channel link, page link, and full hashtag set automatically.
                </div>
                <PlatformCard platformId="fb_business" label="Vertex Tech Trading Page" emoji="🏢" color="#0a4fb5" bg="#EEF2FF"
                  post={posts.fb_business} generating={!!generating.fb_business} copied={!!copied.fb_business}
                  onGenerate={() => generate("fb_business")}
                  onRegenerate={() => generate("fb_business")}
                  onCopy={() => copy(posts.fb_business, "fb_business")} />
              </div>
            )}
          </div>
        )}

        {/* ── OTHERS TAB ── */}
        {activeMarketingTab === "others" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            <StockInput mode={mode} setMode={setMode} manualInput={manualInput} setManualInput={setManualInput} stockCount={availableStock.length + consignmentStock.length} />

            {strategyNotes && (
              <div style={{ padding: "7px 12px", borderRadius: 10, background: "#EEF2FF", border: "1px solid #C7D2FE", fontSize: 11, color: "#4338CA", fontWeight: 600 }}>
                🎯 Strategy notes active
              </div>
            )}

            {[
              { id: "instagram", label: "Instagram",  emoji: "📸", color: "#E1306C", bg: "#FFF0F5" },
              { id: "linkedin",  label: "LinkedIn",   emoji: "💼", color: "#0A66C2", bg: "#EFF6FF" },
              { id: "dubizzle",  label: "Dubizzle",   emoji: "🛒", color: "#FF6B35", bg: "#FFF5F0" },
            ].map(p => (
              <div key={p.id}>
                <PlatformCard platformId={p.id} label={p.label} emoji={p.emoji} color={p.color} bg={p.bg}
                  post={posts[p.id]} generating={!!generating[p.id]} copied={!!copied[p.id]}
                  onGenerate={() => generate(p.id)}
                  onRegenerate={() => generate(p.id)}
                  onCopy={() => copy(posts[p.id], p.id)} />
                {/* Feedback */}
                {posts[p.id] && (
                  <div style={{ padding: "8px 12px", background: "#F8FAFC", borderRadius: "0 0 14px 14px", border: "1px solid #F1F5F9", borderTop: "none", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>How many replies?</span>
                    {["0", "1-3", "4-10", "10+"].map(r => (
                      <button key={r} onClick={() => saveFeedback(p.id, r === "0" ? "none" : r === "1-3" ? "few" : "many")}
                        style={{ padding: "3px 8px", borderRadius: 8, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer",
                          background: postFeedback[p.id] ? "#ECFDF5" : "#F1F5F9",
                          color:      postFeedback[p.id] ? "#059669" : "#64748B" }}>
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── PLAN TAB ── */}
        {activeMarketingTab === "plan" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Weekly plan */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>📅 Weekly Content Plan</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12, lineHeight: 1.6 }}>
                Evergreen posts pre-written for the week. Live posts generate on the day.
              </div>
              <button onClick={async () => {
                if (!anthropicKey) { alert("Add API key in Settings first."); return; }
                setWeeklyLoading(true);
                const openDeals = customers.filter(c => !c.contact_type || c.contact_type === "client").flatMap(c => (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost")).length;
                const topWanted = customers.flatMap(c => (c.deals || []).filter(d => d.stage !== "closed").map(d => [d.brand, d.model].filter(Boolean).join(" "))).filter(Boolean).slice(0, 5).join(", ");
                try {
                  const raw = await callClaude(anthropicKey, `Create a 7-day social media content plan for ${BUSINESS_NAME}, ${LOCATION}. WhatsApp: ${WHATSAPP_NUMBER}. Available stock: ${availableStock.length} items. Top brands: ${[...new Set(availableStock.map(s => s.brand))].slice(0,5).join(", ")}. Open client deals: ${openDeals}. Most wanted: ${topWanted || "various"}. ${strategyNotes ? "Strategy notes: " + strategyNotes.slice(0, 200) : ""}

Return JSON only: { "weekKey": "${todayKey.slice(0,7)}", "strategy": "2-3 sentence strategy", "days": [{ "day": "Monday", "theme": "theme", "posts": [{ "platform": "whatsapp_groups", "time": "9:00 AM", "content_type": "live|evergreen", "caption": "pre-written or [GENERATE ON DAY]", "note": "brief instruction" }] }] }. 3-4 posts per day across platforms.`);
                  const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
                  setWeeklyPlan(parsed);
                  localStorage.setItem("jnp_weekly_plan", JSON.stringify(parsed));
                } catch { alert("Failed. Try again."); }
                setWeeklyLoading(false);
              }} disabled={weeklyLoading}
                style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", fontWeight: 800, fontSize: 13, cursor: "pointer",
                  background: weeklyLoading ? "#E2E8F0" : "#6366F1", color: weeklyLoading ? "#94A3B8" : "#fff" }}>
                {weeklyLoading ? "⏳ Generating..." : weeklyPlan ? "↺ Regenerate Week" : "✨ Generate Weekly Plan"}
              </button>
            </div>

            {weeklyPlan?.strategy && (
              <div style={{ padding: "10px 14px", borderRadius: 12, background: "#EEF2FF", border: "1px solid #C7D2FE", fontSize: 12, color: "#4338CA", lineHeight: 1.6 }}>
                💡 {weeklyPlan.strategy}
              </div>
            )}

            {(weeklyPlan?.days || []).map((day, di) => (
              <div key={di} style={{ background: "#fff", borderRadius: 16, border: "1px solid #F1F5F9", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>{day.day}</span>
                  {day.theme && <span style={{ fontSize: 11, color: "#94A3B8" }}>{day.theme}</span>}
                </div>
                {(day.posts || []).map((post, pi) => {
                  const isLive = post.content_type === "live";
                  const copyKey = `week-${di}-${pi}`;
                  return (
                    <div key={pi} style={{ padding: "10px 14px", borderBottom: pi < day.posts.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B" }}>{post.platform?.replace(/_/g, " ")}</span>
                        <span style={{ fontSize: 10, color: "#CBD5E1" }}>{post.time}</span>
                        <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, fontWeight: 700,
                          background: isLive ? "#FFFBEB" : "#ECFDF5", color: isLive ? "#D97706" : "#059669" }}>
                          {isLive ? "⚡ LIVE" : "✅ READY"}
                        </span>
                      </div>
                      {post.note && <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 4 }}>{post.note}</div>}
                      {post.caption && post.caption !== "[GENERATE ON DAY]" && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <div style={{ flex: 1, fontSize: 11, color: "#475569", lineHeight: 1.6, background: "#F8FAFC", padding: "8px 10px", borderRadius: 8, maxHeight: 80, overflow: "hidden" }}>
                            {post.caption.slice(0, 200)}{post.caption.length > 200 ? "…" : ""}
                          </div>
                          <button onClick={() => { navigator.clipboard.writeText(post.caption); setCopied(p => ({ ...p, [copyKey]: true })); setTimeout(() => setCopied(p => ({ ...p, [copyKey]: false })), 2000); }}
                            style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: copied[copyKey] ? "#ECFDF5" : "#F1F5F9", color: copied[copyKey] ? "#059669" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            {copied[copyKey] ? "✓" : "📋"}
                          </button>
                        </div>
                      )}
                      {isLive && <div style={{ fontSize: 11, color: "#D97706", fontStyle: "italic" }}>Generate on the day using WhatsApp or Others tab</div>}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Content library */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>📚 Content Library</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>Evergreen posts — generate once, reuse forever.</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { type: "trust",       label: "🏆 Trust Posts" },
                  { type: "educational", label: "📖 Educational" },
                  { type: "b2b",         label: "💼 B2B Posts" },
                  { type: "faq",         label: "❓ FAQ Posts" },
                ].map(item => (
                  <button key={item.type} onClick={async () => {
                    if (!anthropicKey) { alert("Add API key in Settings first."); return; }
                    setLibGenerating(true);
                    const prompts = {
                      trust:       `Write 3 short trust/social proof posts for ${BUSINESS_NAME}, ${LOCATION}. 3-4 lines each. Authentic. Return JSON array: [{"title":"...","content":"..."}]`,
                      educational: `Write 3 educational posts about buying second-hand laptops. Topics: Grade A vs B, what to check, why refurbished. 4-5 lines each. Return JSON array: [{"title":"...","content":"..."}]`,
                      b2b:         `Write 3 B2B/wholesale posts for businesses needing laptops in UAE. Professional. Phone: ${WHATSAPP_NUMBER}. Return JSON array: [{"title":"...","content":"..."}]`,
                      faq:         `Write 3 FAQ posts for ${BUSINESS_NAME}. Common questions: warranty, delivery, bulk orders. Return JSON array: [{"title":"...","content":"..."}]`,
                    };
                    try {
                      const raw = await callClaude(anthropicKey, prompts[item.type]);
                      const items = JSON.parse(raw.replace(/```json|```/g, "").trim());
                      const tagged = items.map(i => ({ ...i, type: item.type, id: Date.now() + Math.random() }));
                      const updated = [...library, ...tagged];
                      setLibrary(updated);
                      localStorage.setItem("jnp_content_library", JSON.stringify(updated));
                    } catch { alert("Failed. Try again."); }
                    setLibGenerating(false);
                  }} disabled={libGenerating}
                    style={{ padding: "12px 10px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", textAlign: "left", opacity: libGenerating ? 0.6 : 1 }}>
                    <div style={{ fontSize: 14, marginBottom: 3 }}>{item.label.split(" ")[0]}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{item.label.slice(2)}</div>
                  </button>
                ))}
              </div>
              {libGenerating && <div style={{ fontSize: 12, color: "#6366F1", textAlign: "center", marginTop: 10 }}>✨ Writing...</div>}
            </div>

            {library.map(item => (
              <div key={item.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #F1F5F9", overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{item.title}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => { navigator.clipboard.writeText(item.content); setCopied(p => ({ ...p, [`lib-${item.id}`]: true })); setTimeout(() => setCopied(p => ({ ...p, [`lib-${item.id}`]: false })), 2000); }}
                      style={{ padding: "3px 10px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                        background: copied[`lib-${item.id}`] ? "#ECFDF5" : "#6366F1", color: copied[`lib-${item.id}`] ? "#059669" : "#fff" }}>
                      {copied[`lib-${item.id}`] ? "✓" : "Copy"}
                    </button>
                    <button onClick={() => { const u = library.filter(i => i.id !== item.id); setLibrary(u); localStorage.setItem("jnp_content_library", JSON.stringify(u)); }}
                      style={{ padding: "3px 8px", borderRadius: 8, border: "none", background: "#FEF2F2", color: "#EF4444", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>✕</button>
                  </div>
                </div>
                <div style={{ padding: "10px 12px", fontSize: 12, color: "#475569", lineHeight: 1.7, whiteSpace: "pre-line" }}>{item.content}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── STRATEGY TAB ── */}
        {activeMarketingTab === "strategy" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Strategy notes */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 20, border: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>🎯 Your Market Strategy</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 14, lineHeight: 1.6 }}>
                Tell Claude what you know. Applied to every post — auto or manual.
              </div>
              <textarea
                value={strategyNotes}
                onChange={e => { setStrategyNotes(e.target.value); localStorage.setItem("jnp_strategy_notes", e.target.value); }}
                placeholder={"Write what you know about your market...\n\nExamples:\n• HP EliteBook is my fastest-selling model\n• UAE buyers respond to Grade A and Sharjah pickup\n• Pakistani traders care about price — mention bulk discount\n• Always mention JNP Market area\n• Thursday evenings get most WhatsApp replies\n• MacBook Air M2 is in highest demand\n• Export shipping available for international groups"}
                rows={10}
                style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1.5px solid #E2E8F0",
                  fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit",
                  lineHeight: 1.7, boxSizing: "border-box", color: "#334155" }}
              />
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>💡 Saved automatically. Update anytime.</div>
            </div>

            {/* Tips */}
            <div style={{ background: "#EEF2FF", borderRadius: 16, padding: 16, border: "1px solid #C7D2FE" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#4338CA", marginBottom: 8 }}>What to write here</div>
              {["Which devices sell fastest", "What your buyers care about most (price, condition, location)", "Which regions respond to which angle", "Days or times that get most replies", "Your competitive advantage (Grade A stock, fast delivery, bulk available)", "Local context (JNP Market, Sharjah pickup)"].map((tip, i) => (
                <div key={i} style={{ fontSize: 11, color: "#4338CA", padding: "4px 0", borderBottom: i < 5 ? "1px solid #C7D2FE" : "none" }}>→ {tip}</div>
              ))}
            </div>

            {/* Performance */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>📊 Lead Sources</div>
              {leadStats.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "#CBD5E1", fontSize: 12 }}>No lead source data yet. Set source when adding clients.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {leadStats.map((src, i) => (
                    <div key={src.id} style={{ padding: "10px 12px", background: "#F8FAFC", borderRadius: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{src.label}</span>
                        <div style={{ display: "flex", gap: 10 }}>
                          <span style={{ fontSize: 11, color: "#64748B" }}>{src.leads} leads</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: src.closed > 0 ? "#10B981" : "#94A3B8" }}>{src.closed} closed ({src.rate}%)</span>
                        </div>
                      </div>
                      <div style={{ height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.round((src.leads / leadStats[0].leads) * 100)}%`, background: "#6366F1", borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Posting streak calendar */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A", marginBottom: 10 }}>📅 Posting Consistency (14 days)</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {Array.from({ length: 14 }, (_, i) => {
                  const d = new Date(); d.setDate(d.getDate() - (13 - i));
                  const k = d.toISOString().split("T")[0];
                  const posted = !!postedDates[k];
                  return (
                    <div key={k} title={d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      style={{ width: 28, height: 28, borderRadius: 6, border: k === todayKey ? "2px solid #6366F1" : "none",
                        background: posted ? "#6366F1" : "#F1F5F9",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, color: posted ? "#fff" : "#CBD5E1", fontWeight: 700 }}>
                      {d.getDate()}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>🔥 {streak} day streak · {Object.keys(postedDates).length} total days posted</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
