import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { useStock } from "../../context/StockContext";
import { FACEBOOK_GROUPS } from "../../constants/facebookGroups";

const WHATSAPP = "+971409423162";
const BIZ      = "Laptop for Less";
const LOCATION = "Sharjah, UAE";

// ── Region definitions for Batch C ───────────────────────────────────────────
const REGIONS = [
  {
    id:       "uae_local",
    label:    "🇦🇪 UAE",
    color:    "#EF4444",
    bg:       "#FEF2F2",
    countries: ["UAE", "UK/UAE"],
    tone:     "UAE buyers, direct, AED prices, pickup in Sharjah, professional",
  },
  {
    id:       "pak_india",
    label:    "🇵🇰 Pakistan & India",
    color:    "#10B981",
    bg:       "#ECFDF5",
    countries: ["Pakistan", "India"],
    tone:     "Export buyers, price-forward, bulk welcome, shipping from UAE",
  },
  {
    id:       "africa",
    label:    "🌍 Africa",
    color:    "#D97706",
    bg:       "#FFFBEB",
    countries: ["Kenya", "Nigeria", "Ethiopia", "Zimbabwe", "South Africa", "East Africa", "Sudan"],
    tone:     "African buyers, affordable angle, export available, value-focused",
  },
  {
    id:       "sea_mixed",
    label:    "🌏 Asia & Global",
    color:    "#6366F1",
    bg:       "#EEF2FF",
    countries: ["Sri Lanka", "Malaysia", "Philippines", "Myanmar", "Mauritius", "Singapore", "Mixed", "Global"],
    tone:     "International buyers, export-friendly, clear specs, WhatsApp contact",
  },
];

// ── Batch A/B audience types ──────────────────────────────────────────────────
const BATCH_AUDIENCE = {
  a: { label: "UAE Retail",   tone: "UAE end buyers, Grade A quality, AED prices, Sharjah pickup. Professional and direct.",              emoji: "🇦🇪" },
  b: { label: "High Priority", tone: "Mixed international buyers (Pakistan, Kenya, Global). Price-forward, bulk welcome, export shipping.", emoji: "🌍" },
};

// ── Rotation logic ────────────────────────────────────────────────────────────
function getDayIndex() {
  const start = new Date("2025-06-01");
  const now   = new Date();
  const diff  = Math.floor((now - start) / 86400000);
  return Math.max(0, diff);
}

function getTodayBatchC() {
  const allC    = FACEBOOK_GROUPS.c || [];
  const dayIdx  = getDayIndex();
  const perDay  = 20;
  const start   = (dayIdx * perDay) % allC.length;
  const slice   = [...allC.slice(start, start + perDay), ...allC.slice(0, Math.max(0, (start + perDay) - allC.length))];

  // Split by region
  const byRegion = {};
  REGIONS.forEach(r => { byRegion[r.id] = []; });
  slice.forEach(g => {
    const region = REGIONS.find(r => r.countries.includes(g.country)) || REGIONS[3];
    byRegion[region.id].push(g);
  });
  return { slice, byRegion, dayIdx };
}

// ── Claude API call ───────────────────────────────────────────────────────────
async function callClaude(key, prompt) {
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
      max_tokens: 800,
      system: `You write Facebook group posts for ${BIZ}, ${LOCATION}. WhatsApp: ${WHATSAPP}. Write authentic, engaging posts. Return only the post text, no commentary.`,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data?.content?.[0]?.text?.trim() || "";
}

function buildStockSummary(stock) {
  const available = stock.filter(s => s.status === "available");
  return available.slice(0, 8).map(s =>
    `${s.brand || ""} ${s.model || ""} | ${s.processor || ""} | ${s.ram || ""} | ${s.ssd || ""} | Grade ${s.condition || ""} | AED ${s.max_price || 0}`
  ).join("\n") || "Various laptops available";
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FacebookPostingTab() {
  const { anthropicKey } = useAuth();
  const { stock }        = useStock();

  const todayKey              = new Date().toISOString().split("T")[0];
  const { slice: todayCGroups, byRegion, dayIdx } = getTodayBatchC();
  const cycleDay = (dayIdx % 7) + 1;

  const [captions, setCaptions]       = useState({});
  const [generating, setGenerating]   = useState(false);
  const [copied, setCopied]           = useState({});
  const [posted, setPosted]           = useState({});
  const [activeSection, setActiveSection] = useState("a");

  // Load cached captions for today
  useEffect(() => {
    try {
      const cached = localStorage.getItem(`fb_captions_${todayKey}`);
      if (cached) setCaptions(JSON.parse(cached));
    } catch {}
    try {
      const p = localStorage.getItem(`fb_posted_${todayKey}`);
      if (p) setPosted(JSON.parse(p));
    } catch {}
  }, []); // eslint-disable-line

  // Generate all captions
  const generateAll = useCallback(async () => {
    if (!anthropicKey) { alert("Add your Anthropic API key in Settings first."); return; }
    setGenerating(true);
    const stockSummary = buildStockSummary(stock);
    const today        = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const newCaptions  = {};

    // Batch A caption (UAE retail)
    try {
      newCaptions.a = await callClaude(anthropicKey,
        `Write a Facebook group post for UAE retail laptop buyers.
Date: ${today}
Stock available:\n${stockSummary}
Tone: ${BATCH_AUDIENCE.a.tone}
Format: 6-8 lines, emojis, include WhatsApp number ${WHATSAPP}, location Sharjah.`
      );
    } catch { newCaptions.a = `Fresh stock available! 🔥\n\nContact us on WhatsApp: ${WHATSAPP}\n${LOCATION}`; }

    // Batch B caption (international)
    try {
      newCaptions.b = await callClaude(anthropicKey,
        `Write a Facebook group post for international laptop buyers (Pakistan, Kenya, Global).
Date: ${today}
Stock available:\n${stockSummary}
Tone: ${BATCH_AUDIENCE.b.tone}
Format: 6-8 lines, emojis, mention export/shipping available, include WhatsApp ${WHATSAPP}.`
      );
    } catch { newCaptions.b = `Stock available for export! 📦\n\nWhatsApp: ${WHATSAPP}`; }

    // Batch C captions per region
    for (const region of REGIONS) {
      const regionGroups = byRegion[region.id] || [];
      if (regionGroups.length === 0) continue;
      try {
        newCaptions[region.id] = await callClaude(anthropicKey,
          `Write a Facebook group post for ${region.label} laptop buyers.
Date: ${today}
Stock available:\n${stockSummary}
Tone: ${region.tone}
Audience: ${regionGroups.length} groups in this region today
Format: 6-8 lines, emojis, include WhatsApp ${WHATSAPP}. Adapt language/angle for this audience.`
        );
      } catch { newCaptions[region.id] = `Stock available 🔥\n\nWhatsApp: ${WHATSAPP}`; }
    }

    setCaptions(newCaptions);
    localStorage.setItem(`fb_captions_${todayKey}`, JSON.stringify(newCaptions));
    setGenerating(false);
  }, [anthropicKey, stock, byRegion, todayKey]); // eslint-disable-line

  function copyCaption(key) {
    const text = captions[key];
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(p => ({ ...p, [key]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 2000);
  }

  function markPosted(groupUrl) {
    const updated = { ...posted, [groupUrl]: new Date().toISOString() };
    setPosted(updated);
    localStorage.setItem(`fb_posted_${todayKey}`, JSON.stringify(updated));
  }

  const captionsReady = Object.keys(captions).length > 0;
  const totalToday    = (FACEBOOK_GROUPS.a?.length || 0) + (FACEBOOK_GROUPS.b?.length || 0) + todayCGroups.length;
  const postedCount   = Object.keys(posted).length;

  const SECTIONS = [
    { key: "a",       label: `Batch A (${FACEBOOK_GROUPS.a?.length || 0})`,  time: "9:00 AM",  color: "#6366F1" },
    { key: "b",       label: `Batch B (${FACEBOOK_GROUPS.b?.length || 0})`,  time: "11:00 AM", color: "#D97706" },
    { key: "c",       label: `Batch C (${todayCGroups.length})`,             time: "2:00 PM",  color: "#10B981" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Header ── */}
      <div style={{ background: "linear-gradient(135deg, #1877F2, #0a4fb5)", borderRadius: 16, padding: 16, color: "#fff" }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>📘 Facebook Daily Posting</div>
        <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 10 }}>
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · Cycle day {cycleDay}/7
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          {[
            { label: "Groups today", val: totalToday },
            { label: "Posted",       val: postedCount },
            { label: "Remaining",    val: totalToday - postedCount },
          ].map(s => (
            <div key={s.label} style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "8px 6px", textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{s.val}</div>
              <div style={{ fontSize: 9, opacity: 0.8 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <button onClick={generateAll} disabled={generating}
          style={{ width: "100%", padding: "11px 0", borderRadius: 12, border: "none", fontWeight: 800, fontSize: 13, cursor: generating ? "not-allowed" : "pointer",
            background: generating ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.95)",
            color: generating ? "rgba(255,255,255,0.6)" : "#1877F2" }}>
          {generating ? "⏳ Generating tailored posts..." : captionsReady ? "↺ Regenerate All Posts" : "✨ Generate Today's Posts"}
        </button>
      </div>

      {!captionsReady && !generating && (
        <div style={{ textAlign: "center", padding: "28px 20px", background: "#F8FAFC", borderRadius: 14, color: "#94A3B8", fontSize: 12, lineHeight: 1.8 }}>
          Tap Generate to create tailored posts for all {totalToday} groups today.<br />
          Content is based on your live stock and audience per group type.
        </div>
      )}

      {captionsReady && (
        <>
          {/* ── Section tabs ── */}
          <div style={{ display: "flex", gap: 5 }}>
            {SECTIONS.map(s => (
              <button key={s.key} onClick={() => setActiveSection(s.key)}
                style={{ flex: 1, padding: "7px 0", borderRadius: 10, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: activeSection === s.key ? s.color : "#F1F5F9",
                  color:      activeSection === s.key ? "#fff"   : "#64748B" }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* ── Batch A ── */}
          {activeSection === "a" && (
            <BatchSection
              batch="a"
              label="Batch A — UAE Retail"
              time="9:00 AM"
              color="#6366F1"
              bg="#EEF2FF"
              groups={FACEBOOK_GROUPS.a || []}
              caption={captions.a}
              copied={copied.a}
              onCopy={() => copyCaption("a")}
              posted={posted}
              onPosted={markPosted}
              regionLabel="🇦🇪 UAE buyers — direct, price-forward"
            />
          )}

          {/* ── Batch B ── */}
          {activeSection === "b" && (
            <BatchSection
              batch="b"
              label="Batch B — High Priority"
              time="11:00 AM"
              color="#D97706"
              bg="#FFFBEB"
              groups={FACEBOOK_GROUPS.b || []}
              caption={captions.b}
              copied={copied.b}
              onCopy={() => copyCaption("b")}
              posted={posted}
              onPosted={markPosted}
              regionLabel="🌍 Mixed international — export angle"
            />
          )}

          {/* ── Batch C — by region ── */}
          {activeSection === "c" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ padding: "10px 14px", borderRadius: 12, background: "#ECFDF5", border: "1px solid #BBF7D0", fontSize: 11, color: "#059669", fontWeight: 600 }}>
                📅 Day {cycleDay}/7 of rotation — groups {((dayIdx % 7) * 20) + 1}–{Math.min(((dayIdx % 7) * 20) + 20, FACEBOOK_GROUPS.c?.length)} of {FACEBOOK_GROUPS.c?.length}
              </div>
              {REGIONS.map(region => {
                const groups = byRegion[region.id] || [];
                if (groups.length === 0) return null;
                const captionKey = region.id;
                return (
                  <BatchSection
                    key={region.id}
                    batch={region.id}
                    label={`${region.label} (${groups.length} groups)`}
                    time="2:00 PM"
                    color={region.color}
                    bg={region.bg}
                    groups={groups}
                    caption={captions[captionKey]}
                    copied={copied[captionKey]}
                    onCopy={() => copyCaption(captionKey)}
                    posted={posted}
                    onPosted={markPosted}
                    regionLabel={region.tone.split(",")[0]}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Batch section component ───────────────────────────────────────────────────
function BatchSection({ label, time, color, bg, groups, caption, copied, onCopy, posted, onPosted, regionLabel }) {
  const [expanded, setExpanded] = useState(false);
  const postedInBatch = groups.filter(g => posted[g.url]).length;

  return (
    <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #F1F5F9", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>

      {/* Header */}
      <div style={{ padding: "12px 14px", background: bg, borderBottom: `1px solid ${bg}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color }}>{label}</div>
            <div style={{ fontSize: 10, color, opacity: 0.8, marginTop: 1 }}>{time} · {regionLabel}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color, background: "rgba(255,255,255,0.6)", padding: "2px 8px", borderRadius: 20 }}>
              {postedInBatch}/{groups.length}
            </span>
            {postedInBatch === groups.length && groups.length > 0 && (
              <span style={{ fontSize: 14 }}>✅</span>
            )}
          </div>
        </div>
      </div>

      {/* Caption */}
      {caption && (
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #F1F5F9" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>TODAY'S POST</div>
          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.7, whiteSpace: "pre-line", background: "#F8FAFC", padding: "10px 12px", borderRadius: 10, marginBottom: 8 }}>
            {caption}
          </div>
          <button onClick={onCopy}
            style={{ width: "100%", padding: "9px 0", borderRadius: 10, border: "none", fontSize: 12, fontWeight: 800, cursor: "pointer",
              background: copied ? "#ECFDF5" : "#1877F2",
              color:      copied ? "#059669" : "#fff" }}>
            {copied ? "✓ Copied!" : "📋 Copy Post"}
          </button>
        </div>
      )}

      {/* Group list toggle */}
      <button onClick={() => setExpanded(v => !v)}
        style={{ width: "100%", padding: "10px 14px", border: "none", background: "#fff", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
          {expanded ? "Hide groups" : `Show ${groups.length} groups`}
        </span>
        <span style={{ fontSize: 12, color: "#94A3B8" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{ borderTop: "1px solid #F8FAFC", maxHeight: 360, overflowY: "auto" }}>
          {groups.map((g, i) => {
            const isDone = !!posted[g.url];
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                borderBottom: i < groups.length - 1 ? "1px solid #F8FAFC" : "none",
                background: isDone ? "#F0FDF4" : "#fff",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isDone ? "#059669" : "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {isDone ? "✓ " : ""}{g.name}
                  </div>
                  <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 1 }}>{g.country}</div>
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <a href={g.url} target="_blank" rel="noreferrer"
                    onClick={() => { onCopy(); setTimeout(() => onPosted(g.url), 500); }}
                    style={{ padding: "5px 10px", borderRadius: 8, background: isDone ? "#ECFDF5" : "#1877F2", color: isDone ? "#059669" : "#fff", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>
                    {isDone ? "Done" : "Open"}
                  </a>
                  {!isDone && (
                    <button onClick={() => onPosted(g.url)}
                      style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 12, cursor: "pointer" }}>
                      ✓
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
