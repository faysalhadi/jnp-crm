import React, { useState, useEffect, useCallback } from "react";
import { useUI } from "../../context/UIContext";
import GroupsTab from "./GroupsTab";
import FacebookPostingTab from "./FacebookPostingTab";
import { useAuth } from "../../context/AuthContext";
import { useStock } from "../../context/StockContext";
import { useCustomers } from "../../context/CustomerContext";
import { useSales } from "../../context/SalesContext";

const WHATSAPP_NUMBER = "+971409423162";
const BUSINESS_NAME   = "Laptop for Less";
const LOCATION        = "Sharjah, UAE";

const PLATFORMS = [
  { id: "whatsapp_status", label: "WA Status",   emoji: "📲", color: "#25D366", bg: "#F0FDF4" },
  { id: "whatsapp_groups", label: "WA Groups",   emoji: "💬", color: "#128C7E", bg: "#ECFDF5" },
  { id: "instagram",       label: "Instagram",   emoji: "📸", color: "#E1306C", bg: "#FFF0F5" },
  { id: "facebook",        label: "Facebook",    emoji: "👍", color: "#1877F2", bg: "#EFF6FF" },
  { id: "linkedin",        label: "LinkedIn",    emoji: "💼", color: "#0A66C2", bg: "#EFF6FF" },
  { id: "dubizzle",        label: "Dubizzle",    emoji: "🛒", color: "#FF6B35", bg: "#FFF5F0" },
];

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

export default function MarketingTab({ stock }) {
  const { isMobile, activeMarketingTab, setActiveMarketingTab } = useUI();
  const { anthropicKey } = useAuth();
  const { customers } = useCustomers();
  const { salesHistory } = useSales();

  // Today tab
  const [generatedPosts, setGeneratedPosts] = useState({});
  const [generating, setGenerating]         = useState({});
  const [copied, setCopied]                 = useState({});
  const [postedDates, setPostedDates]       = useState({});

  // Weekly plan
  const [weeklyPlan, setWeeklyPlan]           = useState(null);
  const [weeklyLoading, setWeeklyLoading]     = useState(false);

  // Content library
  const [library, setLibrary]                 = useState([]);
  const [libGenerating, setLibGenerating]     = useState(false);

  // Groups
  const [groupBatches, setGroupBatches]       = useState({ a: [], b: [], c: [] });
  const [addingToBatch, setAddingToBatch]     = useState(null);
  const [newGroupName, setNewGroupName]       = useState("");

  const today    = new Date();
  const todayKey = today.toISOString().split("T")[0];

  useEffect(() => {
    try { const s = localStorage.getItem("jnp_posted_dates"); if (s) setPostedDates(JSON.parse(s)); } catch {}
    try { const s = localStorage.getItem("jnp_group_batches"); if (s) setGroupBatches(JSON.parse(s)); } catch {}
    try { const s = localStorage.getItem("jnp_content_library"); if (s) setLibrary(JSON.parse(s)); } catch {}
    try { const s = localStorage.getItem("jnp_weekly_plan"); if (s) {
      const p = JSON.parse(s);
      if (p.weekKey === todayKey.slice(0, 7)) setWeeklyPlan(p);
    }} catch {}
  }, []); // eslint-disable-line

  const availableStock = (stock || []).filter(s => s.status === "available");

  function stockSummary() {
    return availableStock.slice(0, 8).map(s =>
      `${s.brand || ""} ${s.model || ""} | ${s.processor || ""} | ${s.ram || ""} | ${s.ssd || ""} | Grade ${s.condition || ""} | AED ${s.max_price || 0}`
    ).join("\n");
  }

  // ── Generate a single platform post ──────────────────────────────────────
  async function generatePost(platformId) {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    if (!availableStock.length) { alert("No available stock to feature."); return; }
    setGenerating(p => ({ ...p, [platformId]: true }));

    const platform = PLATFORMS.find(p => p.id === platformId);
    const recentSales = (salesHistory || []).slice(0, 3).map(s =>
      `${s.brand || ""} ${s.model || ""} AED ${s.sold_price || s.value || 0}`
    ).join(", ");

    const formatGuide = {
      whatsapp_status: "Short 3-5 lines. One device. Emoji. No hashtags. End with phone number.",
      whatsapp_groups: "4 different versions (Version 1/2/3/4). Each slightly different tone/opening. Feature 2-3 devices. Include price. End with phone number.",
      instagram: "Engaging caption 4-6 lines. 1 device spotlighted. Lifestyle angle. End with 8-10 relevant hashtags like #laptopsharjah #uaelaptop #laptopuae #sharjah #dubaideals",
      facebook: "2-3 paragraph post. Friendly tone. List devices with specs. End with WhatsApp number and location.",
      linkedin: "Professional tone. 2-3 short paragraphs. Focus on bulk/B2B angle. No prices — 'contact for quote'. End with: Faisal Hadi | Laptop for Less | Sharjah UAE",
      dubizzle: "Title + description format. Specific specs. Condition grade. Price. Location. Contact.",
    };

    const prompt = `Write a ${platform?.label} post for my laptop reselling business.

Business: ${BUSINESS_NAME}, ${LOCATION}
WhatsApp: ${WHATSAPP_NUMBER}
Date: ${today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}

Available Stock:
${stockSummary()}

Recent Sales (for social proof): ${recentSales || "none"}

Format guide: ${formatGuide[platformId] || "Professional, engaging post"}

Write the post now. Make it feel authentic, not corporate. Use emojis naturally.`;

    try {
      const text = await callClaude(anthropicKey, prompt);
      setGeneratedPosts(p => ({ ...p, [platformId]: text }));
    } catch {
      alert("Failed to generate. Check your API key.");
    }
    setGenerating(p => ({ ...p, [platformId]: false }));
  }

  // ── Generate full weekly plan ─────────────────────────────────────────────
  async function generateWeeklyPlan() {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setWeeklyLoading(true);

    const openDeals = customers
      .filter(c => !c.contact_type || c.contact_type === "client" || c.contact_type === "walkin")
      .flatMap(c => (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost"))
      .length;

    const topWanted = customers
      .flatMap(c => (c.deals || []).filter(d => d.stage !== "closed" && d.stage !== "lost").map(d => [d.brand, d.model].filter(Boolean).join(" ")))
      .filter(Boolean).slice(0, 5).join(", ");

    const prompt = `Create a 7-day social media content plan for my laptop reselling business.

Business: ${BUSINESS_NAME}, ${LOCATION}
Available Stock: ${availableStock.length} items
Top categories in stock: ${[...new Set(availableStock.map(s => s.brand))].slice(0, 5).join(", ")}
Open client deals: ${openDeals}
Most wanted by clients: ${topWanted || "various"}

Return JSON only:
{
  "weekKey": "${todayKey.slice(0, 7)}",
  "days": [
    {
      "day": "Monday",
      "theme": "Theme name",
      "posts": [
        {
          "platform": "whatsapp_groups",
          "time": "9:00 AM",
          "content_type": "live|evergreen",
          "caption": "pre-written caption or '[GENERATE ON DAY]' for live stock posts",
          "note": "brief instruction"
        }
      ]
    }
  ],
  "strategy": "2-3 sentence weekly strategy note"
}

Include 3-4 posts per day across platforms. Mix live stock posts (need same-day generation) with evergreen content (trust, educational, social proof — pre-written). Be specific.`;

    try {
      const raw = await callClaude(anthropicKey, prompt);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setWeeklyPlan(parsed);
      localStorage.setItem("jnp_weekly_plan", JSON.stringify(parsed));
    } catch {
      alert("Failed to generate weekly plan. Try again.");
    }
    setWeeklyLoading(false);
  }

  // ── Generate content library items ───────────────────────────────────────
  async function generateLibraryContent(type) {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setLibGenerating(true);

    const prompts = {
      trust: `Write 3 short trust/social proof posts for a UAE laptop reseller. Each 3-4 lines. Authentic tone. For WhatsApp Status. Business: ${BUSINESS_NAME}, ${LOCATION}. Return as JSON array: [{"title":"...", "content":"..."}]`,
      educational: `Write 3 educational posts about buying second-hand laptops. Topics: Grade A vs B, what to check, why refurbished. Each 4-5 lines. For Instagram/Facebook. Return as JSON array: [{"title":"...", "content":"..."}]`,
      b2b: `Write 3 B2B/wholesale posts for businesses needing laptops in UAE. Professional but approachable. LinkedIn/WhatsApp. Business: ${BUSINESS_NAME}. Phone: ${WHATSAPP_NUMBER}. Return as JSON array: [{"title":"...", "content":"..."}]`,
      faq: `Write 3 FAQ-style posts for a laptop reseller. Common questions: warranty, delivery, bulk orders. Reassuring tone. For Facebook/WhatsApp. Return as JSON array: [{"title":"...", "content":"..."}]`,
    };

    try {
      const raw = await callClaude(anthropicKey, prompts[type]);
      const clean = raw.replace(/```json|```/g, "").trim();
      const items = JSON.parse(clean);
      const tagged = items.map(i => ({ ...i, type, id: Date.now() + Math.random() }));
      const updated = [...library, ...tagged];
      setLibrary(updated);
      localStorage.setItem("jnp_content_library", JSON.stringify(updated));
    } catch {
      alert("Failed to generate. Try again.");
    }
    setLibGenerating(false);
  }

  function deleteLibraryItem(id) {
    const updated = library.filter(i => i.id !== id);
    setLibrary(updated);
    localStorage.setItem("jnp_content_library", JSON.stringify(updated));
  }

  function copyText(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(p => ({ ...p, [key]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 2000);
  }

  // ── Lead source stats ─────────────────────────────────────────────────────
  const leadStats = LEAD_SOURCES.map(src => {
    const leads  = customers.filter(c => c.lead_source === src.id).length;
    const closed = customers.filter(c => c.lead_source === src.id)
      .flatMap(c => c.deals || []).filter(d => d.stage === "closed").length;
    return { ...src, leads, closed, rate: leads > 0 ? Math.round((closed / leads) * 100) : 0 };
  }).filter(s => s.leads > 0).sort((a, b) => b.leads - a.leads);

  const totalLeads = customers.filter(c => c.lead_source).length;

  // ── Posting streak ────────────────────────────────────────────────────────
  let streak = 0;
  const check = new Date();
  if (postedDates[todayKey]) streak++;
  check.setDate(check.getDate() - 1);
  for (let i = 0; i < 30; i++) {
    const k = check.toISOString().split("T")[0];
    if (postedDates[k]) { streak++; check.setDate(check.getDate() - 1); }
    else break;
  }

  const TABS = [
    { key: "today",       label: "Today" },
    { key: "facebook",    label: "📘 Facebook" },
    { key: "weekly",      label: "Weekly Plan" },
    { key: "library",     label: "Library" },
    { key: "groups",      label: "Groups" },
    { key: "performance", label: "Performance" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#F8FAFC" }}>

      {/* Header */}
      <div style={{ background: "#fff", padding: "16px 16px 0", borderBottom: "1px solid #F1F5F9" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 14 }}>📣 Marketing</div>
        <div style={{ display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveMarketingTab(t.key)}
              style={{ padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                color:        activeMarketingTab === t.key ? "#6366F1" : "#94A3B8",
                borderBottom: activeMarketingTab === t.key ? "2px solid #6366F1" : "2px solid transparent" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 12px 100px" : "16px 24px 40px" }}>

        {/* ── TODAY TAB ── */}
        {activeMarketingTab === "today" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Streak + mark posted */}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, background: "#fff", borderRadius: 14, padding: "12px 14px", border: "1px solid #F1F5F9", textAlign: "center" }}>
                <div style={{ fontSize: 24 }}>🔥</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A" }}>{streak}</div>
                <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700 }}>DAY STREAK</div>
              </div>
              <div style={{ flex: 1, background: "#fff", borderRadius: 14, padding: "12px 14px", border: "1px solid #F1F5F9", textAlign: "center" }}>
                <div style={{ fontSize: 24 }}>📦</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#6366F1" }}>{availableStock.length}</div>
                <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700 }}>IN STOCK</div>
              </div>
              <button
                onClick={() => {
                  const updated = { ...postedDates, [todayKey]: new Date().toISOString() };
                  setPostedDates(updated);
                  localStorage.setItem("jnp_posted_dates", JSON.stringify(updated));
                }}
                disabled={!!postedDates[todayKey]}
                style={{ flex: 2, borderRadius: 14, border: "none", fontSize: 12, fontWeight: 800, cursor: postedDates[todayKey] ? "default" : "pointer",
                  background: postedDates[todayKey] ? "#ECFDF5" : "#10B981", color: postedDates[todayKey] ? "#059669" : "#fff" }}>
                {postedDates[todayKey] ? "✅ Posted Today" : "Mark Posted"}
              </button>
            </div>

            {/* Platform cards */}
            {PLATFORMS.map(platform => {
              const post = generatedPosts[platform.id];
              const isGenerating = generating[platform.id];
              const copyKey = platform.id;
              return (
                <div key={platform.id} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #F1F5F9" }}>
                  <div style={{ padding: "12px 14px", background: platform.bg, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>{platform.emoji}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: platform.color }}>{platform.label}</span>
                    </div>
                    <button onClick={() => generatePost(platform.id)} disabled={isGenerating}
                      style={{ padding: "6px 14px", borderRadius: 20, border: "none", fontSize: 11, fontWeight: 800, cursor: isGenerating ? "not-allowed" : "pointer",
                        background: isGenerating ? "#E2E8F0" : platform.color, color: isGenerating ? "#94A3B8" : "#fff" }}>
                      {isGenerating ? "⏳ Writing..." : post ? "↺ Regenerate" : "✨ Generate"}
                    </button>
                  </div>
                  {post && (
                    <div style={{ padding: "12px 14px" }}>
                      <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.7, whiteSpace: "pre-line", marginBottom: 10 }}>
                        {post}
                      </div>
                      <button onClick={() => copyText(post, copyKey)}
                        style={{ width: "100%", padding: "9px 0", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer",
                          background: copied[copyKey] ? "#ECFDF5" : "#F1F5F9", color: copied[copyKey] ? "#059669" : "#334155" }}>
                        {copied[copyKey] ? "✓ Copied!" : "📋 Copy"}
                      </button>
                    </div>
                  )}
                  {!post && !isGenerating && (
                    <div style={{ padding: "10px 14px", fontSize: 11, color: "#CBD5E1", textAlign: "center" }}>
                      Tap Generate to create a {platform.label} post from your live stock
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── WEEKLY PLAN TAB ── */}
        {activeMarketingTab === "weekly" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>📅 Weekly Content Plan</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12, lineHeight: 1.6 }}>
                Generated from your live stock and client data. Evergreen posts are pre-written. Live stock posts show a placeholder — tap Generate on the day.
              </div>
              <button onClick={generateWeeklyPlan} disabled={weeklyLoading}
                style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", fontWeight: 800, fontSize: 13, cursor: weeklyLoading ? "not-allowed" : "pointer",
                  background: weeklyLoading ? "#E2E8F0" : "#6366F1", color: weeklyLoading ? "#94A3B8" : "#fff" }}>
                {weeklyLoading ? "⏳ Generating plan..." : weeklyPlan ? "↺ Regenerate This Week" : "✨ Generate Weekly Plan"}
              </button>
            </div>

            {weeklyPlan?.strategy && (
              <div style={{ background: "#EEF2FF", borderRadius: 14, padding: "12px 14px", border: "1px solid #C7D2FE", fontSize: 12, color: "#4338CA", lineHeight: 1.6 }}>
                💡 {weeklyPlan.strategy}
              </div>
            )}

            {(weeklyPlan?.days || []).map((day, di) => (
              <div key={di} style={{ background: "#fff", borderRadius: 16, border: "1px solid #F1F5F9", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>{day.day}</span>
                  {day.theme && <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 8 }}>{day.theme}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {(day.posts || []).map((post, pi) => {
                    const pl = PLATFORMS.find(p => p.id === post.platform);
                    const isLive = post.content_type === "live";
                    const copyKey = `week-${di}-${pi}`;
                    return (
                      <div key={pi} style={{ padding: "10px 14px", borderBottom: pi < day.posts.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 14 }}>{pl?.emoji || "📱"}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: pl?.color || "#64748B" }}>{pl?.label || post.platform}</span>
                          <span style={{ fontSize: 10, color: "#CBD5E1" }}>{post.time}</span>
                          <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, fontWeight: 700,
                            background: isLive ? "#FFFBEB" : "#ECFDF5", color: isLive ? "#D97706" : "#059669" }}>
                            {isLive ? "⚡ LIVE" : "✅ READY"}
                          </span>
                        </div>
                        {post.note && <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{post.note}</div>}
                        {post.caption && post.caption !== "[GENERATE ON DAY]" && (
                          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                            <div style={{ flex: 1, fontSize: 11, color: "#475569", lineHeight: 1.6, whiteSpace: "pre-line",
                              background: "#F8FAFC", padding: "8px 10px", borderRadius: 8, maxHeight: 80, overflow: "hidden" }}>
                              {post.caption.slice(0, 200)}{post.caption.length > 200 ? "…" : ""}
                            </div>
                            <button onClick={() => copyText(post.caption, copyKey)}
                              style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 8, border: "none", background: copied[copyKey] ? "#ECFDF5" : "#F1F5F9",
                                color: copied[copyKey] ? "#059669" : "#64748B", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                              {copied[copyKey] ? "✓" : "📋"}
                            </button>
                          </div>
                        )}
                        {(post.caption === "[GENERATE ON DAY]" || isLive) && (
                          <div style={{ fontSize: 11, color: "#D97706", fontStyle: "italic", marginTop: 2 }}>
                            Generate on the day using Today tab
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── CONTENT LIBRARY TAB ── */}
        {activeMarketingTab === "library" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>📚 Evergreen Content</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>
                Content that never goes stale. Generate once, reuse forever.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { type: "trust",       label: "🏆 Trust Posts",    sub: "Social proof" },
                  { type: "educational", label: "📖 Educational",     sub: "Teach & engage" },
                  { type: "b2b",         label: "💼 B2B Posts",       sub: "Business buyers" },
                  { type: "faq",         label: "❓ FAQ Posts",       sub: "Answer objections" },
                ].map(item => (
                  <button key={item.type} onClick={() => generateLibraryContent(item.type)} disabled={libGenerating}
                    style={{ padding: "12px 10px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#F8FAFC",
                      cursor: libGenerating ? "not-allowed" : "pointer", textAlign: "left", opacity: libGenerating ? 0.6 : 1 }}>
                    <div style={{ fontSize: 16, marginBottom: 3 }}>{item.label.split(" ")[0]}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{item.label.slice(2)}</div>
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>{item.sub}</div>
                  </button>
                ))}
              </div>
              {libGenerating && <div style={{ fontSize: 12, color: "#6366F1", textAlign: "center", marginTop: 10 }}>✨ Writing content...</div>}
            </div>

            {library.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: "#CBD5E1" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📚</div>
                <div style={{ fontSize: 13, color: "#94A3B8" }}>Generate content above to build your library</div>
              </div>
            )}

            {library.map(item => (
              <div key={item.id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #F1F5F9", overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{item.title}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => copyText(item.content, `lib-${item.id}`)}
                      style={{ padding: "3px 10px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                        background: copied[`lib-${item.id}`] ? "#ECFDF5" : "#6366F1", color: copied[`lib-${item.id}`] ? "#059669" : "#fff" }}>
                      {copied[`lib-${item.id}`] ? "✓" : "Copy"}
                    </button>
                    <button onClick={() => deleteLibraryItem(item.id)}
                      style={{ padding: "3px 8px", borderRadius: 8, border: "none", background: "#FEF2F2", color: "#EF4444", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>
                      ✕
                    </button>
                  </div>
                </div>
                <div style={{ padding: "10px 12px", fontSize: 12, color: "#475569", lineHeight: 1.7, whiteSpace: "pre-line" }}>
                  {item.content}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── GROUPS TAB ── */}
        {activeMarketingTab === "groups" && (
          <GroupsTab />
        )}


        {/* ── FACEBOOK TAB ── */}
        {activeMarketingTab === "facebook" && (
          <FacebookPostingTab />
        )}

        {/* ── PERFORMANCE TAB ── */}
        {activeMarketingTab === "performance" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>📊 Lead Sources</div>
              <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 12 }}>
                Where your clients come from. Set source when adding a client.
              </div>

              {totalLeads === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "#CBD5E1" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
                  <div style={{ fontSize: 13, color: "#94A3B8" }}>No lead source data yet</div>
                  <div style={{ fontSize: 11, color: "#CBD5E1", marginTop: 4 }}>Select source when adding clients</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {leadStats.map((src, i) => {
                    const maxLeads = leadStats[0]?.leads || 1;
                    const barWidth = Math.round((src.leads / maxLeads) * 100);
                    return (
                      <div key={src.id} style={{ padding: "10px 12px", background: "#F8FAFC", borderRadius: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{src.label}</span>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "#64748B" }}>{src.leads} leads</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: src.closed > 0 ? "#10B981" : "#94A3B8" }}>
                              {src.closed} closed ({src.rate}%)
                            </span>
                          </div>
                        </div>
                        <div style={{ height: 6, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${barWidth}%`, background: "#6366F1", borderRadius: 3, transition: "width 0.5s" }} />
                        </div>
                      </div>
                    );
                  })}

                  {/* Best performer callout */}
                  {leadStats[0] && (
                    <div style={{ padding: "10px 12px", background: "#EEF2FF", borderRadius: 12, border: "1px solid #C7D2FE", marginTop: 4 }}>
                      <div style={{ fontSize: 12, color: "#4338CA", fontWeight: 700 }}>
                        💡 {leadStats[0].label} is your top source — {leadStats[0].leads} leads
                      </div>
                      {leadStats.find(s => s.rate > 0 && s !== leadStats[0]) && (
                        <div style={{ fontSize: 11, color: "#6366F1", marginTop: 3 }}>
                          Best conversion: {leadStats.sort((a, b) => b.rate - a.rate)[0].label} at {leadStats.sort((a, b) => b.rate - a.rate)[0].rate}%
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Posting consistency */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#0F172A", marginBottom: 10 }}>📅 Posting Consistency (last 14 days)</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {Array.from({ length: 14 }, (_, i) => {
                  const d = new Date(); d.setDate(d.getDate() - (13 - i));
                  const k = d.toISOString().split("T")[0];
                  const posted = !!postedDates[k];
                  const isToday = k === todayKey;
                  return (
                    <div key={k} title={d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      style={{ width: 28, height: 28, borderRadius: 6, border: isToday ? "2px solid #6366F1" : "none",
                        background: posted ? "#6366F1" : "#F1F5F9",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: posted ? "#fff" : "#CBD5E1", fontWeight: 700 }}>
                      {d.getDate()}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
                🔥 {streak} day streak · {Object.keys(postedDates).length} total days posted
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
