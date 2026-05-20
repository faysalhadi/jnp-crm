import React, { useState, useEffect, useRef } from "react";
import { useUI } from "../../context/UIContext";

const WHATSAPP_NUMBER = "+971409423162";
const BUSINESS_NAME = "Laptop for Less";
const LOCATION = "Sharjah, UAE";

export default function MarketingTab({
  stock,
}) {
  const { isMobile, activeMarketingTab, setActiveMarketingTab } = useUI();
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [generatedPost, setGeneratedPost] = useState(null);
  const [copiedVersion, setCopiedVersion] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingToBatch, setAddingToBatch] = useState(null);
  const [groupBatches, setGroupBatches] = useState({ a: [], b: [], c: [] });
  const [postedDates, setPostedDates] = useState({});
  const canvasRef = useRef(null);

  useEffect(() => {
    const savedBatches = localStorage.getItem("jnp_group_batches");
    if (savedBatches) {
      try { setGroupBatches(JSON.parse(savedBatches)); } catch {}
    }
    const savedDates = localStorage.getItem("jnp_posted_dates");
    if (savedDates) {
      try { setPostedDates(JSON.parse(savedDates)); } catch {}
    }
  }, []);

  const today = new Date();
  const todayKey = today.toISOString().split("T")[0];
  const isPostedToday = !!postedDates[todayKey];

  const TEMPLATES = [
    {
      day: "Monday",
      name: "THE SHOWCASE",
      theme: "Fresh stock",
      deviceCount: 3,
      openings: [
        "Fresh stock just landed 🔥",
        "New laptops just in 💻",
        "Available now in Sharjah 📍",
        "Quality laptops ready 🎯",
      ],
      body: (devices) =>
        devices.map(d => `${d.brand} ${d.model} — ${d.condition}`).join("\n"),
      closing: `All Grade A · ${LOCATION}\n📱 ${WHATSAPP_NUMBER}`,
    },
    {
      day: "Tuesday",
      name: "THE SPOTLIGHT",
      theme: "Device of the day",
      deviceCount: 1,
      openings: [
        "Device of the day 💻",
        "Featured laptop today 🌟",
        "Today's pick 🎯",
        "Spotlight laptop ✨",
      ],
      body: (devices) => {
        const d = devices[0];
        if (!d) return "";
        return `${d.brand} ${d.model}\n${d.processor || ""}\n${d.ram} RAM · ${d.ssd} Storage\nCondition: ${d.condition}\nLimited units available`;
      },
      closing: `📱 ${WHATSAPP_NUMBER}\n📍 ${LOCATION}`,
    },
    {
      day: "Wednesday",
      name: "THE B2B POST",
      theme: "Bulk availability",
      deviceCount: 3,
      openings: [
        "Attention laptop dealers 👋",
        "Wholesale stock available 📦",
        "Bulk laptops ready 💼",
        "Dealers welcome 🤝",
      ],
      body: (devices) =>
        devices.map(d => `${d.brand} ${d.model} · ${d.condition}`).join("\n") +
        "\n\nWholesale pricing on request",
      closing: `📱 ${WHATSAPP_NUMBER}\n📍 ${LOCATION}`,
    },
    {
      day: "Thursday",
      name: "THE QUALITY POST",
      theme: "Why buy from us",
      deviceCount: 2,
      openings: [
        "Why buy from us? ✅",
        "Quality you can trust 🏆",
        "Our promise to you 🤝",
        "Trusted laptop supplier 💪",
      ],
      body: (devices) =>
        `• Direct from UK/USA suppliers\n• Grade A condition guaranteed\n• Same day pickup Sharjah\n• Bulk orders welcome\n\nCurrently available:\n` +
        devices.map(d => `${d.brand} ${d.model} · ${d.condition}`).join("\n"),
      closing: `📱 ${WHATSAPP_NUMBER}`,
    },
    {
      day: "Friday",
      name: "THE URGENCY POST",
      theme: "Last few units",
      deviceCount: 3,
      openings: [
        "Last few units remaining ⚠️",
        "Limited stock alert 🚨",
        "Almost sold out ⏰",
        "Grab them before they go 🏃",
      ],
      body: (devices) =>
        devices.map(d => `${d.brand} ${d.model} · ${d.condition}`).join("\n") +
        "\n\nDon't miss out",
      closing: `📱 ${WHATSAPP_NUMBER}\n📍 ${LOCATION}`,
    },
    {
      day: "Saturday",
      name: "SOCIAL PROOF",
      theme: "Happy customers",
      deviceCount: 2,
      openings: [
        "Another happy customer 🙏",
        "Trusted by many 🌟",
        "Customers love us ❤️",
        "Join our happy customers 😊",
      ],
      body: (devices) =>
        `Sold this week — great feedback from our customers\n\nStill available:\n` +
        devices.map(d => `${d.brand} ${d.model} · ${d.condition}`).join("\n"),
      closing: `📱 ${WHATSAPP_NUMBER}\n📍 ${LOCATION}`,
    },
    {
      day: "Sunday",
      name: "WEEKLY RECAP",
      theme: "Week summary",
      deviceCount: 3,
      openings: [
        "This week at Laptop for Less 📊",
        "Weekly stock update 📦",
        "Fresh week fresh stock 🌅",
        "New week new deals 💫",
      ],
      body: (devices) =>
        `Currently available:\n` +
        devices.map(d => `${d.brand} ${d.model} · ${d.condition}`).join("\n") +
        "\n\nNew shipment coming soon 📦",
      closing: `📱 ${WHATSAPP_NUMBER}\n📍 ${LOCATION}`,
    },
  ];

  const dayIndex = today.getDay();
  const templateIndex = dayIndex === 0 ? 6 : dayIndex - 1;
  const todayTemplate = TEMPLATES[templateIndex];

  function selectDevicesForTemplate(template) {
    const available = stock.filter(s => s.status === "available");
    if (!available.length) return [];
    if (template.name === "THE URGENCY POST") {
      return [...available]
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .slice(0, template.deviceCount);
    }
    if (template.name === "THE SPOTLIGHT") {
      return [...available]
        .sort((a, b) => {
          const mA = (Number(a.max_price) || 0) - (Number(a.cost_price) || 0);
          const mB = (Number(b.max_price) || 0) - (Number(b.cost_price) || 0);
          return mB - mA;
        })
        .slice(0, 1);
    }
    if (template.name === "THE B2B POST") {
      const seen = new Set();
      return available.filter(d => {
        const key = `${d.brand}-${d.model}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, template.deviceCount);
    }
    const seen = new Set();
    return available.filter(d => {
      const key = `${d.brand}-${d.model}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, template.deviceCount);
  }

  useEffect(() => {
    const devices = selectDevicesForTemplate(todayTemplate);
    setSelectedDevices(devices);
    generatePost(devices, todayTemplate);
  }, [stock]); // eslint-disable-line react-hooks/exhaustive-deps

  function generatePost(devices, template) {
    if (!devices.length) return;
    const versions = template.openings.map(opening => {
      const body = template.body(devices);
      return `${opening}\n\n${body}\n\n${template.closing}`;
    });
    setGeneratedPost({ versions, template, devices });
  }

  function copyVersion(version, index) {
    navigator.clipboard.writeText(version);
    setCopiedVersion(index);
    setTimeout(() => setCopiedVersion(null), 2000);
  }

  function generateImageCard() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 628;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0F172A";
    ctx.fillRect(0, 0, 1200, 628);

    ctx.fillStyle = "#6366F1";
    ctx.fillRect(0, 0, 1200, 80);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 36px Arial";
    ctx.fillText(BUSINESS_NAME.toUpperCase(), 40, 52);

    ctx.font = "24px Arial";
    ctx.textAlign = "right";
    ctx.fillText("📍 " + LOCATION, 1160, 52);
    ctx.textAlign = "left";

    ctx.fillStyle = "#94A3B8";
    ctx.font = "20px Arial";
    ctx.fillText(todayTemplate.name, 40, 110);

    const devices = selectedDevices;
    const startY = 150;
    const spacing = devices.length > 2 ? 140 : 160;

    devices.forEach((d, i) => {
      const y = startY + i * spacing;

      ctx.fillStyle = "#1E293B";
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(40, y, 1120, spacing - 15, 12);
        ctx.fill();
      } else {
        ctx.fillRect(40, y, 1120, spacing - 15);
      }

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 28px Arial";
      ctx.fillText(
        `${d.brand || ""} ${d.model || ""}`.trim() || "Device",
        70, y + 38
      );

      ctx.fillStyle = "#94A3B8";
      ctx.font = "20px Arial";
      const specs = [d.processor, d.ram, d.ssd, d.condition].filter(Boolean).join("  ·  ");
      ctx.fillText(specs, 70, y + 70);

      ctx.fillStyle = d.condition === "Grade A" ? "#10B981" : "#F59E0B";
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(70, y + 85, 100, 28, 6);
      } else {
        ctx.rect(70, y + 85, 100, 28);
      }
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 14px Arial";
      ctx.fillText(d.condition || "Grade A", 80, y + 104);
    });

    ctx.fillStyle = "#6366F1";
    ctx.fillRect(0, 548, 1200, 80);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 28px Arial";
    ctx.fillText("📱 " + WHATSAPP_NUMBER, 40, 596);

    ctx.textAlign = "right";
    ctx.font = "22px Arial";
    ctx.fillStyle = "#C7D2FE";
    ctx.fillText("Contact for pricing", 1160, 596);
    ctx.textAlign = "left";

    const link = document.createElement("a");
    link.download = `laptop-for-less-${todayKey}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function getCalendarDays() {
    const days = [];
    for (let i = -3; i <= 10; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split("T")[0];
      const dayIdx = d.getDay();
      const tIdx = dayIdx === 0 ? 6 : dayIdx - 1;
      days.push({
        date: d,
        key,
        template: TEMPLATES[tIdx],
        posted: !!postedDates[key],
        isToday: i === 0,
        isPast: i < 0,
      });
    }
    return days;
  }

  const BATCH_LABELS = {
    a: { label: "Batch A — Daily", subtitle: "Best 20 groups · Post every day", color: "#6366F1", bg: "#EEF2FF" },
    b: { label: "Batch B — 3x Week", subtitle: "Next 50 groups · Mon/Wed/Fri", color: "#D97706", bg: "#FFFBEB" },
    c: { label: "Batch C — Weekly", subtitle: "Remaining 130 groups · Rotated daily", color: "#10B981", bg: "#ECFDF5" },
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#F8FAFC" }}>

      {/* Header */}
      <div style={{ background: "#fff", padding: "16px 16px 0", borderBottom: "1px solid #F1F5F9" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 14 }}>
          📣 Marketing
        </div>
        <div style={{ display: "flex", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
          {[
            { key: "today", label: "Today's Post" },
            { key: "calendar", label: "Calendar" },
            { key: "groups", label: "Groups" },
          ].map(t => (
            <button key={t.key}
              onClick={() => setActiveMarketingTab(t.key)}
              style={{
                padding: "10px 20px", border: "none", background: "none",
                cursor: "pointer", fontSize: 13, fontWeight: 700,
                color: activeMarketingTab === t.key ? "#6366F1" : "#94A3B8",
                borderBottom: activeMarketingTab === t.key ? "2px solid #6366F1" : "2px solid transparent",
                whiteSpace: "nowrap",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 12px 100px" : "16px 24px 40px" }}>

        {/* ── TODAY'S POST TAB ── */}
        {activeMarketingTab === "today" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
                    {todayTemplate.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                    {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                  </div>
                </div>
                <div style={{
                  padding: "4px 12px", borderRadius: 20,
                  background: isPostedToday ? "#ECFDF5" : "#FEF9C3",
                  color: isPostedToday ? "#059669" : "#D97706",
                  fontSize: 11, fontWeight: 700,
                }}>
                  {isPostedToday ? "✅ Posted" : "⏳ Not posted"}
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>
                FEATURED DEVICES
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {selectedDevices.map((d, i) => (
                  <div key={d.id || i} style={{
                    padding: "8px 12px", background: "#F8FAFC",
                    borderRadius: 10, border: "1px solid #F1F5F9",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                        {d.brand} {d.model}
                      </div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>
                        {[d.processor, d.ram, d.ssd, d.condition].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "#ECFDF5", color: "#059669", fontWeight: 700 }}>
                      {d.condition || "Grade A"}
                    </span>
                  </div>
                ))}
                {selectedDevices.length === 0 && (
                  <div style={{ fontSize: 12, color: "#94A3B8", padding: "8px 0" }}>
                    No available stock found.
                  </div>
                )}
              </div>
            </div>

            <button onClick={generateImageCard}
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 14,
                border: "none", background: "#0F172A", color: "#fff",
                fontSize: 14, fontWeight: 800, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
              🖼 Download Image Card (1200×628)
            </button>

            {generatedPost && (
              <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 12 }}>
                  CAPTION VERSIONS — copy different one per batch
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {generatedPost.versions.map((version, i) => (
                    <div key={i} style={{ padding: "12px 14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#6366F1" }}>
                          Version {i + 1}
                          {i === 0 ? " — Batch A" : i === 1 ? " — Batch B" : i === 2 ? " — Batch C" : " — Extra"}
                        </span>
                        <button
                          onClick={() => copyVersion(version, i)}
                          style={{
                            padding: "4px 14px", borderRadius: 8, border: "none",
                            background: copiedVersion === i ? "#ECFDF5" : "#6366F1",
                            color: copiedVersion === i ? "#059669" : "#fff",
                            fontSize: 11, fontWeight: 700, cursor: "pointer",
                          }}>
                          {copiedVersion === i ? "✓ Copied!" : "📋 Copy"}
                        </button>
                      </div>
                      <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.7, whiteSpace: "pre-line" }}>
                        {version}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: "#EEF2FF", borderRadius: 14, padding: 14, border: "1px solid #C7D2FE" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6366F1", marginBottom: 10 }}>
                📋 TODAY'S POSTING GUIDE
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { time: "9:00 AM", action: "Version 1 → Batch A groups (20 groups)", color: "#6366F1" },
                  { time: "11:00 AM", action: "Version 2 → Batch B groups (25 groups)", color: "#D97706" },
                  { time: "2:00 PM", action: "Version 3 → Batch C groups (25 groups)", color: "#10B981" },
                  { time: "Any time", action: "Version 4 → WhatsApp Status + LinkedIn", color: "#64748B" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: item.color, flexShrink: 0, minWidth: 75 }}>
                      {item.time}
                    </span>
                    <span style={{ fontSize: 12, color: "#475569" }}>{item.action}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                const updated = { ...postedDates, [todayKey]: new Date().toISOString() };
                setPostedDates(updated);
                localStorage.setItem("jnp_posted_dates", JSON.stringify(updated));
              }}
              disabled={isPostedToday}
              style={{
                width: "100%", padding: 14, borderRadius: 14, border: "none",
                background: isPostedToday ? "#ECFDF5" : "#10B981",
                color: isPostedToday ? "#059669" : "#fff",
                fontSize: 14, fontWeight: 800,
                cursor: isPostedToday ? "default" : "pointer",
              }}>
              {isPostedToday ? "✅ Marked as Posted Today" : "✅ Mark as Posted"}
            </button>
          </div>
        )}

        {/* ── CALENDAR TAB ── */}
        {activeMarketingTab === "calendar" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(() => {
              let streak = 0;
              const check = new Date();
              check.setDate(check.getDate() - 1);
              while (true) {
                const k = check.toISOString().split("T")[0];
                if (postedDates[k]) { streak++; check.setDate(check.getDate() - 1); }
                else break;
              }
              if (postedDates[todayKey]) streak++;
              return (
                <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9", textAlign: "center" }}>
                  <div style={{ fontSize: 36 }}>🔥</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#0F172A" }}>
                    {streak} day{streak !== 1 ? "s" : ""} streak
                  </div>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
                    Keep posting every day to build your audience
                  </div>
                </div>
              );
            })()}
            {getCalendarDays().map((day) => (
              <div key={day.key} style={{
                background: "#fff", borderRadius: 14, padding: "12px 14px",
                border: day.isToday ? "2px solid #6366F1" : "1px solid #F1F5F9",
                opacity: day.isPast && !day.posted ? 0.5 : 1,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: day.isToday ? "#6366F1" : "#0F172A" }}>
                        {day.isToday ? "TODAY — " : ""}
                        {day.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                      {day.template.name} · {day.template.theme}
                    </div>
                  </div>
                  <div style={{
                    padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: day.posted ? "#ECFDF5" : day.isPast ? "#FEF2F2" : "#F8FAFC",
                    color: day.posted ? "#059669" : day.isPast ? "#EF4444" : "#94A3B8",
                  }}>
                    {day.posted ? "✅ Posted" : day.isPast ? "❌ Missed" : "⏳ Upcoming"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── GROUPS TAB ── */}
        {activeMarketingTab === "groups" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: "#EEF2FF", borderRadius: 14, padding: 14, border: "1px solid #C7D2FE" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4338CA", marginBottom: 4 }}>
                💡 How to use batches
              </div>
              <div style={{ fontSize: 12, color: "#6366F1", lineHeight: 1.6 }}>
                Add your best groups to Batch A — post there every day.
                Add good groups to Batch B — post 3x per week.
                Add the rest to Batch C — post once per week rotated.
                Use Version 1 for A, Version 2 for B, Version 3 for C.
              </div>
            </div>

            {["a", "b", "c"].map(batchKey => {
              const batch = BATCH_LABELS[batchKey];
              const groups = groupBatches[batchKey] || [];
              return (
                <div key={batchKey} style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #F1F5F9" }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: batch.color }}>
                      {batch.label}
                    </div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                      {batch.subtitle} · {groups.length} groups added
                    </div>
                  </div>

                  {groups.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                      {groups.map((name, i) => (
                        <div key={i} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "7px 10px", background: batch.bg, borderRadius: 8,
                        }}>
                          <span style={{ fontSize: 13, color: "#0F172A", fontWeight: 600 }}>
                            {name}
                          </span>
                          <button onClick={() => {
                            const updated = { ...groupBatches, [batchKey]: groups.filter((_, idx) => idx !== i) };
                            setGroupBatches(updated);
                            localStorage.setItem("jnp_group_batches", JSON.stringify(updated));
                          }}
                            style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "#FEF2F2", color: "#EF4444", fontSize: 12, cursor: "pointer", fontWeight: 700 }}>
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {addingToBatch === batchKey ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={newGroupName}
                        onChange={e => setNewGroupName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && newGroupName.trim()) {
                            const updated = { ...groupBatches, [batchKey]: [...groups, newGroupName.trim()] };
                            setGroupBatches(updated);
                            localStorage.setItem("jnp_group_batches", JSON.stringify(updated));
                            setNewGroupName("");
                            setAddingToBatch(null);
                          }
                        }}
                        placeholder="Group name..."
                        autoFocus
                        style={{
                          flex: 1, padding: "8px 12px", borderRadius: 10,
                          border: `1.5px solid ${batch.color}`, fontSize: 13, outline: "none",
                        }}
                      />
                      <button onClick={() => {
                        if (!newGroupName.trim()) return;
                        const updated = { ...groupBatches, [batchKey]: [...groups, newGroupName.trim()] };
                        setGroupBatches(updated);
                        localStorage.setItem("jnp_group_batches", JSON.stringify(updated));
                        setNewGroupName("");
                        setAddingToBatch(null);
                      }}
                        style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: batch.color, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        Add
                      </button>
                      <button onClick={() => { setAddingToBatch(null); setNewGroupName(""); }}
                        style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 13, cursor: "pointer" }}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingToBatch(batchKey)}
                      style={{
                        width: "100%", padding: "9px", borderRadius: 10,
                        border: `1.5px dashed ${batch.color}`,
                        background: batch.bg, color: batch.color,
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                      }}>
                      + Add Group to {batch.label.split(" — ")[0]}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
