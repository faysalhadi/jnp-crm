import React from "react";

// ── Pipeline stages ───────────────────────────────────────────────────────────
export const STAGES = [
  { id: "evaluating",  label: "Evaluating",  emoji: "🔵", color: "#6366F1", bg: "#EEF2FF" },
  { id: "bid_sent",    label: "Bid Sent",    emoji: "🟡", color: "#D97706", bg: "#FFFBEB" },
  { id: "bid_won",     label: "Bid Won",     emoji: "✅", color: "#059669", bg: "#ECFDF5" },
  { id: "payment_due", label: "Payment Due", emoji: "💳", color: "#2563EB", bg: "#DBEAFE" },
  { id: "paid",        label: "Paid",        emoji: "💰", color: "#047857", bg: "#D1FAE5" },
  { id: "in_transit",  label: "In Transit",  emoji: "🚚", color: "#7C3AED", bg: "#EDE9FE" },
  { id: "in_customs",  label: "In Customs",  emoji: "🛃", color: "#DB2777", bg: "#FCE7F3" },
  { id: "arrived",     label: "Arrived",     emoji: "📦", color: "#0891B2", bg: "#CFFAFE" },
  { id: "in_stock",    label: "In Stock",    emoji: "➡️", color: "#64748B", bg: "#F1F5F9" },
];
export const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.id, s]));

// ── The 4 milestones Claude detects ──────────────────────────────────────────
export const MILESTONES = {
  BID_ACCEPTED:      { label: "Bid Accepted",       icon: "✅", color: "#059669", bg: "#ECFDF5", nextStatus: "bid_won"     },
  PAYMENT_CONFIRMED: { label: "Payment Confirmed",  icon: "💳", color: "#2563EB", bg: "#DBEAFE", nextStatus: "paid"        },
  TRACKING_RECEIVED: { label: "Tracking Received",  icon: "🚚", color: "#7C3AED", bg: "#EDE9FE", nextStatus: "in_transit"  },
  ARRIVED:           { label: "Arrived",            icon: "📦", color: "#0891B2", bg: "#CFFAFE", nextStatus: "arrived"     },
};

// ── Constants ─────────────────────────────────────────────────────────────────
export const DEFAULT_RATE = 3.67;
export const DUTY_PCT     = 0.05;

// ── Helpers ───────────────────────────────────────────────────────────────────
export const fmtUSD = n => n ? "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";
export const fmtAED = n => (n || n === 0) ? "AED " + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "—";

export function hoursUntil(ts) {
  if (!ts) return null;
  return (new Date(ts) - Date.now()) / 3_600_000;
}
export function timeAgo(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (m < 1)    return "just now";
  if (m < 60)   return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}
export function fmtTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
}
export function calcLanded(d, rate) {
  const r   = rate || DEFAULT_RATE;
  const pur = Number(d.our_bid_usd || 0) * Number(d.units_bid || 0) * r;
  return pur + Number(d.shipping_cost_aed || 0) + pur * DUTY_PCT;
}
export function calcProfit(d, rate) {
  const landed  = Number(d.landed_cost_aed) > 0 ? Number(d.landed_cost_aed) : calcLanded(d, rate);
  const revenue = Number(d.expected_revenue_aed || 0);
  return revenue > 0 ? revenue - landed : null;
}

export async function callClaude(apiKey, prompt, system) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: system || undefined,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text || "";
}

// ── Small shared components ───────────────────────────────────────────────────
export function StageBadge({ status }) {
  const s = STAGE_MAP[status] || { label: status, color: "#64748B", bg: "#F1F5F9", emoji: "" };
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg,
                   padding: "3px 10px", borderRadius: 10, whiteSpace: "nowrap" }}>
      {s.emoji} {s.label}
    </span>
  );
}

export function MilestoneBadge({ milestone }) {
  const m = MILESTONES[milestone];
  if (!m) return null;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5,
                  marginTop: 6, padding: "4px 10px", borderRadius: 20,
                  background: m.bg, border: `1px solid ${m.color}30` }}>
      <span style={{ fontSize: 13 }}>{m.icon}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color: m.color }}>{m.label}</span>
    </div>
  );
}

// ── Row helper for financials ─────────────────────────────────────────────────
export function Row({ label, value, bold, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#64748B" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: bold ? 800 : 600, color: color || "#0F172A" }}>{value}</span>
    </div>
  );
}
