
import React, { useState, useMemo, useEffect, useRef } from "react";
import { useCustomers, getClientHealth } from "../../context/CustomerContext";
import { STAGES, getTag } from "../../constants";
 
// ── CONSTANTS ─────────────────────────────────────────────────────────────────
 
const C = {
  surface:   "#FFFFFF",
  surface2:  "#F6F4F1",
  surface3:  "#EEECE9",
  border:    "#E2DDD8",
  borderMd:  "#CCC8C2",
  text:      "#0E0D0C",
  text2:     "#524F4B",
  text3:     "#98948F",
  accent:    "#4D44B5",
  accentLt:  "#EEEDFC",
  green:     "#0A9E72",
  greenLt:   "#E0F5EE",
  greenDk:   "#076E4F",
  amber:     "#C97706",
  amberLt:   "#FEF3C7",
  red:       "#DC2626",
  redLt:     "#FEE2E2",
  blue:      "#2563EB",
  blueLt:    "#DBEAFE",
  purple:    "#7C3AED",
  purpleLt:  "#F5F3FF",
};
 
const STAGE_CFG = {
  new_inquiry:              { dot: "#6366F1", bg: "#EEF2FF", text: "#3730A3", label: "New Inquiry",    short: "Inquiry",  emoji: "📝" },
  device_found:             { dot: "#2563EB", bg: "#DBEAFE", text: "#1E40AF", label: "Device Found",   short: "Found",    emoji: "🔍" },
  negotiation:              { dot: "#7C3AED", bg: "#F5F3FF", text: "#5B21B6", label: "Negotiation",    short: "Negot.",   emoji: "💬" },
  confirmed_pending_pickup: { dot: "#0A9E72", bg: "#D1FAE5", text: "#065F46", label: "Confirmed Pickup", short: "Pickup", emoji: "📅" },
  closed:                   { dot: "#10B981", bg: "#ECFDF5", text: "#065F46", label: "Deal Closed",    short: "Closed",   emoji: "✅" },
  lost:                     { dot: "#94A3B8", bg: "#F1F5F9", text: "#64748B", label: "Lost",           short: "Lost",     emoji: "✕"  },
};
 
const STAGE_PROB = {
  new_inquiry: 0.20, device_found: 0.40, negotiation: 0.60,
  confirmed_pending_pickup: 0.90, closed: 1.0, lost: 0,
};
 
const ACTIVE_STAGES = ["new_inquiry", "device_found", "negotiation", "confirmed_pending_pickup"];
 
// ── HELPERS ───────────────────────────────────────────────────────────────────
 
function getDaysSinceDeal(deal) {
  const date = deal.updated_at || deal.created_at;
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}
 
function ageStatus(days, stage) {
  if (stage === "closed" || stage === "lost") return "closed";
  if (days <= 2) return "ok";
  if (days <= 6) return "warn";
  return "danger";
}
 
function urgencyColor(status) {
  if (status === "ok")     return "#A7F3D0";
  if (status === "warn")   return "#FDE68A";
  if (status === "danger") return "#FECACA";
  return "#E0E7FF";
}
 
function ageColor(status) {
  if (status === "warn")   return C.amber;
  if (status === "danger") return C.red;
  return C.text3;
}
 
function fmtValue(v) {
  if (!v || v === 0) return "–";
  const n = Number(v);
  if (n >= 1000) return "AED " + (n / 1000).toFixed(1) + "k";
  return "AED " + n;
}
 
function fmtValueShort(v) {
  const n = Number(v) || 0;
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}
 
function getInitials(name) {
  return (name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}
 
function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return m + "m ago";
  if (h < 24)  return h + "h ago";
  if (d === 1) return "Yesterday";
  return d + "d ago";
}
 
function getStageColor(stageId) {
  return STAGE_CFG[stageId] || STAGE_CFG.lost;
}
 
// ── DEAL CARD (shared mobile + laptop) ────────────────────────────────────────
 
function DealCard({ deal, customer, selected, onSelect, onQuickStage, quickStageOpen, updateDeal, onNavigate, compact }) {
  const days = getDaysSinceDeal(deal);
  const status = ageStatus(days, deal.stage);
  const sc = getStageColor(deal.stage);
  const budget = Number(deal.budget) || Number(deal.value) || 0;
  const deviceLabel = [deal.brand, deal.model].filter(Boolean).join(" ") || "Device TBD";
  const isPickup = deal.stage === "confirmed_pending_pickup";
  const initials = getInitials(customer.name);
 
  const cardStyle = {
    display: "flex",
    background: isPickup
      ? "linear-gradient(135deg, #fff 0%, #E0F5EE 100%)"
      : C.surface,
    border: selected
      ? `1.5px solid ${C.accent}`
      : isPickup
        ? "1.5px solid #A7F3D0"
        : `1px solid ${C.border}`,
    borderRadius: 12,
    marginBottom: 6,
    overflow: "hidden",
    cursor: "pointer",
    boxShadow: selected ? `0 0 0 3px ${C.accentLt}` : "0 1px 3px rgba(0,0,0,0.05)",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };
 
  return (
    <div>
      <div style={cardStyle} onClick={onSelect}>
        {/* Urgency strip */}
        <div style={{ width: 4, flexShrink: 0, background: urgencyColor(status) }} />
 
        <div style={{ flex: 1, padding: compact ? "8px 10px" : "9px 12px", minWidth: 0 }}>
          {/* Top row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{
              width: compact ? 30 : 34, height: compact ? 30 : 34,
              borderRadius: 9, background: sc.bg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: compact ? 10 : 11, fontWeight: 800, color: sc.text, flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {customer.name}
              </div>
              <div style={{ fontSize: 11, color: C.text2, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {deviceLabel}
              </div>
            </div>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              {budget > 0 && (
                <div style={{ fontSize: compact ? 11 : 12, fontWeight: 800, color: deal.stage === "closed" ? C.green : C.accent, fontVariantNumeric: "tabular-nums" }}>
                  AED {Number(budget).toLocaleString()}
                </div>
              )}
              <div style={{ fontSize: 10, fontWeight: 600, color: ageColor(status), marginTop: 2 }}>
                {days === 0 ? "Today" : days + "d ago"}
              </div>
            </div>
          </div>
 
          {/* Bottom row */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: sc.bg, color: sc.text, textTransform: "uppercase", letterSpacing: "0.2px" }}>
              {sc.label}
            </span>
            {status === "danger" && deal.stage !== "closed" && deal.stage !== "lost" && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: C.redLt, color: C.red }}>
                ⚠️ {days}d stale
              </span>
            )}
            {status === "warn" && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: C.amberLt, color: C.amber }}>
                ⏰ Follow up
              </span>
            )}
            {isPickup && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: C.greenLt, color: C.greenDk }}>
                📅 Pickup today
              </span>
            )}
            {days >= 14 && deal.stage === "negotiation" && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: C.purpleLt, color: C.purple }}>
                💡 {days}d in negot.
              </span>
            )}
            {/* Age bar */}
            <div style={{ flex: 1, minWidth: 30, height: 3, background: C.surface3, borderRadius: 20, overflow: "hidden" }}>
              <div style={{ height: "100%", width: Math.min(100, days * 8) + "%", background: urgencyColor(status), borderRadius: 20 }} />
            </div>
            {/* Quick stage trigger */}
            <button
              onClick={e => { e.stopPropagation(); onQuickStage(); }}
              style={{
                width: 24, height: 24, borderRadius: 7, border: `1px solid ${quickStageOpen ? C.accent : C.border}`,
                background: quickStageOpen ? C.accentLt : C.surface2,
                color: quickStageOpen ? C.accent : C.text3,
                fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
              ⚡
            </button>
          </div>
        </div>
      </div>
 
      {/* Inline quick stage picker */}
      {quickStageOpen && (
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderTop: "none",
          borderRadius: "0 0 12px 12px", marginTop: -6, marginBottom: 6,
          padding: "8px 12px 10px",
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.text3, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6 }}>
            MOVE TO STAGE
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {STAGES.filter(s => s.id !== "closed" && s.id !== "lost").map(s => {
              const isCurrent = s.id === deal.stage;
              return (
                <button key={s.id}
                  onClick={async e => {
                    e.stopPropagation();
                    await updateDeal(deal.id, { stage: s.id });
                    onQuickStage();
                  }}
                  style={{
                    padding: "4px 10px", borderRadius: 20,
                    border: isCurrent ? "none" : `1px solid ${C.border}`,
                    background: isCurrent ? C.accent : C.surface2,
                    color: isCurrent ? "#fff" : C.text2,
                    fontSize: 10, fontWeight: 700, cursor: "pointer",
                  }}>
                  {isCurrent ? "✓ " : ""}{getStageColor(s.id).label}
                </button>
              );
            })}
            <button
              onClick={async e => {
                e.stopPropagation();
                await updateDeal(deal.id, { stage: "lost" });
                onQuickStage();
              }}
              style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${C.redLt}`, background: C.redLt, color: C.red, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
              Mark Lost
            </button>
            <button
              onClick={e => { e.stopPropagation(); onNavigate(); }}
              style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${C.border}`, background: "transparent", color: C.accent, fontSize: 10, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
              Open →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
 
// ── FUNNEL BAR ────────────────────────────────────────────────────────────────
 
function FunnelBar({ grouped, onJump }) {
  const total = grouped.reduce((s, g) => s + g.items.length, 0);
  if (total === 0) return null;
  return (
    <div style={{ padding: "10px 14px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.text3, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 7 }}>
        STAGE FUNNEL — TAP TO JUMP
      </div>
      <div style={{ display: "flex", gap: 3, height: 40, borderRadius: 10, overflow: "hidden" }}>
        {grouped.map(g => {
          const sc = getStageColor(g.stageId);
          return (
            <div
              key={g.stageId}
              onClick={() => onJump(g.stageId)}
              style={{
                flex: g.items.length, minWidth: 48,
                background: sc.dot,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 2,
                cursor: "pointer", borderRadius: 8,
                transition: "filter 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.filter = "brightness(0.9)"}
              onMouseLeave={e => e.currentTarget.style.filter = ""}
            >
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{g.items.length}</div>
              <div style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: "0.3px", lineHeight: 1 }}>{sc.short}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
 
// ── DEAL LIST (shared) ────────────────────────────────────────────────────────
 
function DealList({ grouped, selectedDealId, onSelect, updateDeal, onNavigate, compact, sectionRefs, closedDeals, lostDeals, closedOpen, setClosedOpen }) {
  const [quickStageId, setQuickStageId] = useState(null);
  const allDealsCount = grouped.reduce((s, g) => s + g.items.length, 0);
 
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 40px", scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 4px 2px" }}>
        <span style={{ fontSize: 10, color: C.text3, fontWeight: 600 }}>{allDealsCount} open deal{allDealsCount !== 1 ? "s" : ""}</span>
      </div>
 
      {grouped.map(g => {
        const sc = getStageColor(g.stageId);
        return (
          <div key={g.stageId} ref={el => { if (sectionRefs) sectionRefs.current[g.stageId] = el; }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 4px 6px" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: "0.7px", flex: 1 }}>
                {sc.label}
              </div>
              <div style={{ fontSize: 10, color: C.text3, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {g.items.length} · AED {fmtValueShort(g.totalValue)}
              </div>
            </div>
 
            {g.items.map(({ deal, customer }) => (
              <DealCard
                key={deal.id}
                deal={deal}
                customer={customer}
                selected={selectedDealId === deal.id}
                onSelect={() => onSelect({ deal, customer })}
                onQuickStage={() => setQuickStageId(quickStageId === deal.id ? null : deal.id)}
                quickStageOpen={quickStageId === deal.id}
                updateDeal={updateDeal}
                onNavigate={() => onNavigate(customer, deal)}
                compact={compact}
              />
            ))}
          </div>
        );
      })}
 
      {/* Closed + Lost */}
      {(closedDeals.length > 0 || lostDeals.length > 0) && (
        <div style={{ marginTop: 4 }}>
          <button
            onClick={() => setClosedOpen(v => !v)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 4px", background: "none", border: "none", cursor: "pointer", color: C.text3, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "inherit" }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span>{closedOpen ? "▲" : "▼"} Closed &amp; Lost</span>
            <span style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 20, padding: "1px 7px", fontSize: 9, fontWeight: 700 }}>
              {closedDeals.length + lostDeals.length}
            </span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </button>
 
          {closedOpen && (
            <div>
              {closedDeals.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 4px 4px" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green }} />
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: "0.7px" }}>Closed</div>
                    <div style={{ fontSize: 10, color: C.text3, fontWeight: 600 }}>{closedDeals.length}</div>
                  </div>
                  {closedDeals.map(({ deal, customer }) => (
                    <MiniCard key={deal.id} deal={deal} customer={customer} dotColor={C.green} />
                  ))}
                </>
              )}
              {lostDeals.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 4px 4px" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.text3 }} />
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: "0.7px" }}>Lost</div>
                    <div style={{ fontSize: 10, color: C.text3, fontWeight: 600 }}>{lostDeals.length}</div>
                  </div>
                  {lostDeals.map(({ deal, customer }) => (
                    <MiniCard key={deal.id} deal={deal} customer={customer} dotColor={C.text3} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
 
function MiniCard({ deal, customer, dotColor }) {
  const deviceLabel = [deal.brand, deal.model].filter(Boolean).join(" ") || "Device TBD";
  const budget = Number(deal.budget) || Number(deal.value) || 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, marginBottom: 4, opacity: 0.6 }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customer.name}</div>
        <div style={{ fontSize: 10, color: C.text3 }}>{deviceLabel}</div>
      </div>
      {budget > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>AED {Number(budget).toLocaleString()}</div>}
    </div>
  );
}
 
// ── DEAL PREVIEW PANEL (laptop right panel) ───────────────────────────────────
 
function DealPreview({ selected, onClose, updateDeal, onNavigate, pendingFollowUpMap, allDeals }) {
  const { deal, customer } = selected;
  const sc = getStageColor(deal.stage);
  const days = getDaysSinceDeal(deal);
  const health = getClientHealth(customer);
  const fu = pendingFollowUpMap?.[customer.id];
  const budget = Number(deal.budget) || Number(deal.value) || 0;
  const deviceLabel = [deal.brand, deal.model].filter(Boolean).join(" ") || "Device TBD";
  const [localStage, setLocalStage] = useState(deal.stage);
  const [marking, setMarking] = useState(false);
 
  useEffect(() => { setLocalStage(deal.stage); }, [deal.stage]);
 
  const localSc = getStageColor(localStage);
 
  const allClientDeals = allDeals
    .filter(({ customer: c }) => c.id === customer.id)
    .sort((a, b) => new Date(b.deal.created_at) - new Date(a.deal.created_at))
    .slice(0, 5);
 
  async function moveStage(stageId) {
    setLocalStage(stageId);
    await updateDeal(deal.id, { stage: stageId });
  }
 
  async function markLost() {
    setMarking(true);
    await updateDeal(deal.id, { stage: "lost" });
    onClose();
  }
 
  const tags = customer.tags || [];
 
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, background: sc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: sc.text, flexShrink: 0 }}>
          {getInitials(customer.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: "-0.3px", marginBottom: 5 }}>{customer.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {tags.slice(0, 4).map(tagId => {
              let tagObj = null;
              try { tagObj = getTag(tagId); } catch (e) { tagObj = null; }
              if (!tagObj) return <span key={tagId} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: C.surface2, color: C.text2 }}>{tagId}</span>;
              return (
                <span key={tagId} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: tagObj.bg || C.surface2, color: tagObj.color || C.text2 }}>
                  {tagObj.label || tagId}
                </span>
              );
            })}
            {tags.length === 0 && customer.contact_type && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: C.accentLt, color: C.accent, textTransform: "capitalize" }}>
                {customer.contact_type}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "flex-start" }}>
          <button onClick={() => onNavigate(customer, deal)} style={btnStyle()}>💬 Open Chat</button>
          <button
            onClick={markLost}
            disabled={marking}
            style={btnStyle({ bg: C.redLt, color: C.red, border: C.redLt })}>
            ✕ Mark Lost
          </button>
          <button onClick={onClose} style={{ ...btnStyle(), width: 32, padding: 0, justifyContent: "center" }}>✕</button>
        </div>
      </div>
 
      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 24px", display: "flex", gap: 14, scrollbarWidth: "thin" }}>
 
        {/* Main column */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
 
          {/* Deal details */}
          <PreviewSection title="Deal Details">
            <FieldRow label="Device"  value={deviceLabel} />
            <FieldRow label="Budget"  value={budget > 0 ? `AED ${Number(budget).toLocaleString()}` : "–"} accent />
            <FieldRow label="Stage"   value={<span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: localSc.bg, color: localSc.text, textTransform: "uppercase" }}>{localSc.label}</span>} />
            <FieldRow label="In stage" value={days === 0 ? "Opened today" : `${days} day${days !== 1 ? "s" : ""}`} />
            {deal.payment_method && <FieldRow label="Payment" value={deal.payment_method} />}
            {customer.number && <FieldRow label="Contact" value={customer.number} />}
          </PreviewSection>
 
          {/* Stage mover */}
          <PreviewSection title="Move Stage">
            <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
              {ACTIVE_STAGES.map((sid, i) => {
                const s = getStageColor(sid);
                const currentIdx = ACTIVE_STAGES.indexOf(localStage);
                const isPast = i < currentIdx;
                const isCurrent = sid === localStage;
                const isFuture = i > currentIdx;
                return (
                  <React.Fragment key={sid}>
                    <button
                      onClick={() => isFuture && moveStage(sid)}
                      style={{
                        flex: 1, minWidth: 60, height: 30, borderRadius: 7, border: isCurrent ? "none" : `1.5px solid ${C.border}`,
                        background: isCurrent ? C.accent : isPast ? C.surface3 : C.surface2,
                        color: isCurrent ? "#fff" : isPast ? C.text3 : C.text3,
                        fontSize: 9, fontWeight: 700, cursor: isFuture ? "pointer" : "default",
                        textAlign: "center", fontFamily: "inherit",
                        boxShadow: isCurrent ? "0 2px 8px rgba(77,68,181,0.3)" : "none",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { if (isFuture) { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; e.currentTarget.style.background = C.accentLt; } }}
                      onMouseLeave={e => { if (isFuture) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text3; e.currentTarget.style.background = C.surface2; } }}>
                      {s.short}
                    </button>
                    {i < ACTIVE_STAGES.length - 1 && (
                      <div style={{ fontSize: 10, color: C.text3, flexShrink: 0 }}>›</div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <button onClick={markLost} style={{ marginTop: 8, background: "none", border: "none", color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
              Mark as Lost →
            </button>
          </PreviewSection>
 
          {/* Notes / activity placeholder */}
          <PreviewSection title="Notes">
            {deal.notes ? (
              <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, padding: "4px 0" }}>{deal.notes}</div>
            ) : (
              <div style={{ fontSize: 11, color: C.text3, fontStyle: "italic", padding: "8px 0" }}>
                No notes — open the chat to add activity.
              </div>
            )}
            <button onClick={() => onNavigate(customer, deal)} style={{ marginTop: 6, ...btnStyle({ color: C.accent, border: C.border }) }}>
              Open Chat →
            </button>
          </PreviewSection>
        </div>
 
        {/* Sidebar */}
        <div style={{ width: 200, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
 
          {/* Client health */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Client Health</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", borderRadius: 8, background: health.bg, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: health.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: health.color }}>{health.label}</div>
                {health.days !== null && <div style={{ fontSize: 10, color: C.text3 }}>Last deal {health.days}d ago</div>}
              </div>
            </div>
            {customer.preferences?.order_frequency_days && (
              <FieldRow label="Order freq." value={`~${customer.preferences.order_frequency_days}d`} small />
            )}
            <FieldRow label="Closed deals" value={`${(customer.deals || []).filter(d => d.stage === "closed").length}`} small />
          </div>
 
          {/* Follow-up */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>Follow-up</div>
            {fu ? (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "7px 9px", borderRadius: 8, background: C.amberLt }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>⏰</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.amber }}>
                    {new Date(fu.due_at) < new Date() ? "Overdue" : "Scheduled"}
                  </div>
                  {fu.note && <div style={{ fontSize: 10, color: C.text2, marginTop: 2 }}>{fu.note.slice(0, 60)}</div>}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: C.text3, fontStyle: "italic" }}>No follow-up set</div>
            )}
            <button onClick={() => onNavigate(customer, deal)} style={{ marginTop: 8, ...btnStyle(), width: "100%", justifyContent: "center", fontSize: 10 }}>
              + Set in chat
            </button>
          </div>
 
          {/* All deals */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>All Deals</div>
            {allClientDeals.map(({ deal: d }) => {
              const dsc = getStageColor(d.stage);
              return (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.text2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {[d.brand, d.model].filter(Boolean).join(" ") || "Deal"}
                  </div>
                  <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 10, background: dsc.bg, color: dsc.text, flexShrink: 0, textTransform: "uppercase" }}>
                    {dsc.short}
                  </span>
                </div>
              );
            })}
            {allClientDeals.length === 0 && <div style={{ fontSize: 11, color: C.text3, fontStyle: "italic" }}>No other deals</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
 
// ── DEFAULT RIGHT PANEL (no deal selected) ─────────────────────────────────────
 
function DefaultRightPanel({ stats, grouped, allDeals }) {
  const totalOpen = grouped.reduce((s, g) => s + g.items.length, 0);
 
  // Activity feed: last 10 deals by updated_at
  const recentActivity = useMemo(() => {
    return [...allDeals]
      .filter(({ deal }) => deal.updated_at || deal.created_at)
      .sort((a, b) => new Date(b.deal.updated_at || b.deal.created_at) - new Date(a.deal.updated_at || a.deal.created_at))
      .slice(0, 10);
  }, [allDeals]);
 
  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
 
      {/* Left: forecast + conversion */}
      <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 16, scrollbarWidth: "thin" }}>
 
        {/* Weighted forecast */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 4 }}>Weighted Revenue Forecast</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.accent, fontVariantNumeric: "tabular-nums", letterSpacing: "-1px", lineHeight: 1, marginBottom: 3 }}>
            AED {fmtValueShort(stats.weighted)}
          </div>
          <div style={{ fontSize: 11, color: C.text3, marginBottom: 14 }}>Probability-adjusted pipeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {grouped.map(g => {
              const sc = getStageColor(g.stageId);
              const prob = STAGE_PROB[g.stageId] || 0;
              const wVal = g.items.reduce((s, { deal }) => s + (Number(deal.budget) || Number(deal.value) || 0) * prob, 0);
              const pct = stats.weighted > 0 ? (wVal / stats.weighted * 100) : 0;
              return (
                <div key={g.stageId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.text2, width: 120, flexShrink: 0 }}>{sc.label}</div>
                  <div style={{ flex: 1, height: 6, background: C.surface3, borderRadius: 20, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: pct + "%", background: sc.dot, borderRadius: 20 }} />
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.text2, width: 64, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>AED {fmtValueShort(wVal)}</div>
                  <div style={{ fontSize: 10, color: C.text3, width: 30, textAlign: "right", flexShrink: 0 }}>{Math.round(prob * 100)}%</div>
                </div>
              );
            })}
          </div>
        </div>
 
        {/* Stage conversion */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>Stage Distribution</div>
          {ACTIVE_STAGES.map(sid => {
            const g = grouped.find(x => x.stageId === sid);
            const count = g ? g.items.length : 0;
            const sc = getStageColor(sid);
            const pct = totalOpen > 0 ? (count / totalOpen * 100) : 0;
            return (
              <div key={sid} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.text2, width: 110, flexShrink: 0 }}>{sc.label}</div>
                <div style={{ flex: 1, height: 20, background: C.surface3, borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: Math.max(pct, 4) + "%", background: sc.dot, borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{count} deal{count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: pct > 0 ? C.text2 : C.text3, width: 34, textAlign: "right", flexShrink: 0 }}>{Math.round(pct)}%</div>
              </div>
            );
          })}
        </div>
      </div>
 
      {/* Right: activity feed */}
      <div style={{ width: 270, borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ padding: "14px 14px 10px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.7px" }}>Recent Activity</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px 20px", scrollbarWidth: "thin" }}>
          {recentActivity.map(({ deal, customer }) => {
            const sc = getStageColor(deal.stage);
            const deviceLabel = [deal.brand, deal.model].filter(Boolean).join(" ") || "Deal";
            return (
              <div key={deal.id} style={{ display: "flex", gap: 9, padding: "8px 4px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: sc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0, marginTop: 1 }}>
                  {sc.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{customer.name}</div>
                  <div style={{ fontSize: 10, color: C.text2, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deviceLabel}</div>
                  <div style={{ fontSize: 9, color: C.text3, marginTop: 2, fontWeight: 600 }}>{timeAgo(deal.updated_at || deal.created_at)}</div>
                </div>
              </div>
            );
          })}
          {recentActivity.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 16px", color: C.text3, fontSize: 12 }}>No recent activity</div>
          )}
        </div>
      </div>
    </div>
  );
}
 
// ── SMALL UI HELPERS ──────────────────────────────────────────────────────────
 
function PreviewSection({ title, children }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}
 
function FieldRow({ label, value, accent, small }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: small ? 10 : 11, color: C.text3, fontWeight: 600, width: small ? 80 : 90, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: small ? 10 : 11, fontWeight: accent ? 800 : 600, color: accent ? C.accent : C.text, flex: 1 }}>{value}</div>
    </div>
  );
}
 
function btnStyle(opts = {}) {
  return {
    height: 30, padding: "0 11px", borderRadius: 8, fontSize: 11, fontWeight: 700,
    border: `1px solid ${opts.border || C.border}`,
    background: opts.bg || C.surface2,
    color: opts.color || C.text2,
    cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
    fontFamily: "inherit", transition: "all 0.15s",
  };
}
 
// ── STATS BAR ─────────────────────────────────────────────────────────────────
 
function StatBar({ stats }) {
  const items = [
    { label: "Open deals",       value: stats.openCount,                         color: C.accent,  sub: "across " + Object.values(ACTIVE_STAGES).length + " stages" },
    { label: "Gross pipeline",   value: "AED " + fmtValueShort(stats.pipeline),  color: C.accent,  sub: "all open budgets" },
    { label: "Weighted forecast",value: "AED " + fmtValueShort(stats.weighted),  color: C.accent,  sub: "by probability" },
    { label: "Win rate (30d)",   value: stats.winRate !== null ? stats.winRate + "%" : "–",        color: C.green,  sub: "closed vs lost" },
    { label: "Avg deal age",     value: stats.avgAge.toFixed(1) + "d",            color: C.text,   sub: "open deals" },
    { label: "Stale 7d+",        value: stats.stale,                              color: stats.stale > 0 ? C.red : C.text, sub: stats.stale > 0 ? "needs attention" : "all fresh" },
  ];
  return (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 18px", display: "flex", gap: 0, flexShrink: 0 }}>
      {items.map((item, i) => (
        <div key={i} style={{ padding: "10px 18px 10px 0", display: "flex", flexDirection: "column", gap: 2, borderRight: i < items.length - 1 ? `1px solid ${C.border}` : "none", marginRight: i < items.length - 1 ? 18 : 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.5px" }}>{item.label}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: item.color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px", lineHeight: 1 }}>{item.value}</div>
          <div style={{ fontSize: 10, color: C.text3, fontWeight: 500 }}>{item.sub}</div>
        </div>
      ))}
    </div>
  );
}
 
// ── TAG FILTER BAR ────────────────────────────────────────────────────────────
 
const TAG_CHIPS = [
  { id: "all",         label: "All",            bg: null,     color: null },
  { id: "macbook",     label: "💻 MacBook",     bg: C.blueLt, color: C.blue },
  { id: "windows_biz", label: "🖥 Windows Biz", bg: C.blueLt, color: C.blue },
  { id: "gaming",      label: "🎮 Gaming",      bg: C.blueLt, color: C.blue },
  { id: "vip",         label: "⭐ VIP",         bg: C.purpleLt, color: C.purple },
  { id: "trader",      label: "🤝 Trader",      bg: C.purpleLt, color: C.purple },
  { id: "corporate",   label: "🏢 Corporate",   bg: C.purpleLt, color: C.purple },
  { id: "jnp_bldg_1",  label: "📍 JNP Bldg 1", bg: C.greenLt, color: C.greenDk },
  { id: "urgent",      label: "⚡ Urgent",      bg: C.amberLt, color: C.amber },
];
 
function TagFilterBar({ active, onChange }) {
  return (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "7px 18px", display: "flex", gap: 5, alignItems: "center", flexShrink: 0, overflowX: "auto", scrollbarWidth: "none" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.text3, letterSpacing: "0.5px", textTransform: "uppercase", flexShrink: 0, marginRight: 4 }}>Filter</div>
      {TAG_CHIPS.map(chip => {
        const isActive = active === chip.id;
        return (
          <button
            key={chip.id}
            onClick={() => onChange(chip.id)}
            style={{
              padding: "4px 10px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap",
              border: isActive ? "none" : `1px solid ${chip.id === "all" ? C.border : "transparent"}`,
              background: isActive ? C.accent : (chip.bg || C.surface2),
              color: isActive ? "#fff" : (chip.color || C.text2),
              fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s",
            }}>
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
 
// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
 
export default function PipelineView() {
  const {
    customers,
    setActiveCustomerId, setActiveDealId, setView, setPendingSuggestion,
    updateDeal, pendingFollowUpMap,
  } = useCustomers();
 
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [tagFilter, setTagFilter]       = useState("all");
  const [sortBy, setSortBy]             = useState("recent");
  const [showSort, setShowSort]         = useState(false);
  const [isLaptop, setIsLaptop]         = useState(window.innerWidth >= 900);
  const [closedOpen, setClosedOpen]     = useState(false);
  const sectionRefs = useRef({});
  const sortRef = useRef(null);
 
  useEffect(() => {
    const handler = () => setIsLaptop(window.innerWidth >= 900);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
 
  // Close sort dropdown on outside click
  useEffect(() => {
    if (!showSort) return;
    const handler = (e) => { if (sortRef.current && !sortRef.current.contains(e.target)) setShowSort(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSort]);
 
  // Build flat deal list
  const allDeals = useMemo(() => {
    const deals = [];
    for (const customer of customers) {
      const ct = customer.contact_type;
      if (ct && ct !== "client" && ct !== "walkin") continue;
      for (const deal of (customer.deals || [])) {
        deals.push({ deal, customer });
      }
    }
    return deals;
  }, [customers]);
 
  // Stats
  const stats = useMemo(() => {
    const open = allDeals.filter(({ deal }) => deal.stage !== "closed" && deal.stage !== "lost");
    const now = Date.now();
    const ms30 = 30 * 86400000;
    const pipeline  = open.reduce((s, { deal }) => s + (Number(deal.budget) || Number(deal.value) || 0), 0);
    const weighted  = open.reduce((s, { deal }) => s + (Number(deal.budget) || Number(deal.value) || 0) * (STAGE_PROB[deal.stage] || 0), 0);
    const stale     = open.filter(({ deal }) => getDaysSinceDeal(deal) >= 7).length;
    const avgAge    = open.length ? open.reduce((s, { deal }) => s + getDaysSinceDeal(deal), 0) / open.length : 0;
    const recent    = allDeals.filter(({ deal }) => { const d = deal.closed_at || deal.updated_at; return d && (now - new Date(d).getTime()) <= ms30; });
    const rClosed   = recent.filter(({ deal }) => deal.stage === "closed").length;
    const rLost     = recent.filter(({ deal }) => deal.stage === "lost").length;
    const winRate   = (rClosed + rLost) > 0 ? Math.round(rClosed / (rClosed + rLost) * 100) : null;
    return { openCount: open.length, pipeline, weighted, stale, avgAge, winRate };
  }, [allDeals]);
 
  // Tag filter
  const tagFiltered = useMemo(() => {
    if (tagFilter === "all") return allDeals;
    return allDeals.filter(({ deal, customer }) => {
      const tags  = customer.tags || [];
      const brand = (deal.brand || "").toLowerCase();
      const model = (deal.model || "").toLowerCase();
      if (tagFilter === "macbook")      return brand.includes("apple") || brand.includes("macbook") || model.includes("macbook");
      if (tagFilter === "windows_biz")  return ["dell","hp","lenovo","asus","acer"].some(b => brand.includes(b));
      if (tagFilter === "gaming")       return ["gaming","omen","legion","tuf","rog","nitro","predator"].some(g => model.includes(g));
      if (tagFilter === "vip")          return tags.includes("vip");
      if (tagFilter === "trader")       return tags.includes("trader") || customer.contact_type === "trader";
      if (tagFilter === "corporate")    return tags.includes("corporate");
      if (tagFilter === "jnp_bldg_1")  return tags.includes("jnp_bldg_1");
      if (tagFilter === "urgent")       return customer.urgent || getDaysSinceDeal(deal) >= 7;
      return true;
    });
  }, [allDeals, tagFilter]);
 
  // Grouped by stage
  const grouped = useMemo(() => {
    return ACTIVE_STAGES.map(stageId => {
      const items = tagFiltered.filter(({ deal }) => deal.stage === stageId);
      const sorted = [...items].sort((a, b) => {
        if (sortBy === "budget_high") return (Number(b.deal.budget) || 0) - (Number(a.deal.budget) || 0);
        if (sortBy === "oldest")      return new Date(a.deal.updated_at || a.deal.created_at) - new Date(b.deal.updated_at || b.deal.created_at);
        return new Date(b.deal.updated_at || b.deal.created_at) - new Date(a.deal.updated_at || a.deal.created_at);
      });
      const totalValue = sorted.reduce((s, { deal }) => s + (Number(deal.budget) || Number(deal.value) || 0), 0);
      return { stageId, items: sorted, totalValue };
    }).filter(g => g.items.length > 0);
  }, [tagFiltered, sortBy]);
 
  const closedDeals = useMemo(() => tagFiltered.filter(({ deal }) => deal.stage === "closed"), [tagFiltered]);
  const lostDeals   = useMemo(() => tagFiltered.filter(({ deal }) => deal.stage === "lost"),   [tagFiltered]);
 
  function handleNavigate(customer, deal) {
    setActiveCustomerId(customer.id);
    setActiveDealId(deal.id);
    setView("detail");
    setPendingSuggestion(null);
  }
 
  function handleJump(stageId) {
    const el = sectionRefs.current[stageId];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
 
  // ── MOBILE LAYOUT ──────────────────────────────────────────────────────────
  if (!isLaptop) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F2F1EE" }}>
 
        {/* Mobile stats */}
        <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "10px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flexShrink: 0 }}>
          {[
            { label: "Open deals",  value: stats.openCount,                        color: C.accent },
            { label: "Pipeline",    value: "AED " + fmtValueShort(stats.pipeline), color: C.accent },
            { label: "Stale 7d+",  value: stats.stale,                             color: stats.stale > 0 ? C.red : C.text },
            { label: "Win rate",    value: stats.winRate !== null ? stats.winRate + "%" : "–", color: C.green },
          ].map((s, i) => (
            <div key={i} style={{ background: C.surface2, borderRadius: 10, padding: "9px 11px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.5px" }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color, marginTop: 2, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>{s.value}</div>
            </div>
          ))}
        </div>
 
        <FunnelBar grouped={grouped} onJump={handleJump} />
 
        <DealList
          grouped={grouped}
          selectedDealId={null}
          onSelect={({ deal, customer }) => handleNavigate(customer, deal)}
          updateDeal={updateDeal}
          onNavigate={handleNavigate}
          compact={false}
          sectionRefs={sectionRefs}
          closedDeals={closedDeals}
          lostDeals={lostDeals}
          closedOpen={closedOpen}
          setClosedOpen={setClosedOpen}
        />
      </div>
    );
  }
 
  // ── LAPTOP LAYOUT ──────────────────────────────────────────────────────────
  const sortLabels = { recent: "Recent", budget_high: "Budget", oldest: "Oldest" };
 
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#F2F1EE" }}>
 
      {/* Laptop topbar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, height: 50, padding: "0 18px", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>JNP</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>CRM</div>
        </div>
        <div style={{ width: 1, height: 20, background: C.border }} />
        <div style={{ fontSize: 12, color: C.text3, fontWeight: 500 }}>
          Clients › <span style={{ color: C.text2, fontWeight: 600 }}>Pipeline</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {/* Sort */}
          <div style={{ position: "relative" }} ref={sortRef}>
            <button
              onClick={() => setShowSort(v => !v)}
              style={{ height: 32, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text2, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
              ↕ {sortLabels[sortBy]}
            </button>
            {showSort && (
              <div style={{ position: "absolute", right: 0, top: 36, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 50, overflow: "hidden", minWidth: 150 }}>
                {[{ id: "recent", label: "Most recent" }, { id: "budget_high", label: "Highest budget" }, { id: "oldest", label: "Oldest first" }].map(opt => (
                  <button key={opt.id}
                    onClick={() => { setSortBy(opt.id); setShowSort(false); }}
                    style={{ width: "100%", padding: "9px 14px", border: "none", borderBottom: `1px solid ${C.border}`, background: sortBy === opt.id ? C.accentLt : C.surface, color: sortBy === opt.id ? C.accent : C.text2, fontSize: 12, fontWeight: sortBy === opt.id ? 700 : 400, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                    {sortBy === opt.id ? "✓ " : ""}{opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
 
      {/* Stats bar */}
      <StatBar stats={stats} />
 
      {/* Tag filter */}
      <TagFilterBar active={tagFilter} onChange={id => { setTagFilter(id); setSelectedDeal(null); }} />
 
      {/* Main body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
 
        {/* Left panel */}
        <div style={{ width: 390, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <FunnelBar grouped={grouped} onJump={handleJump} />
          <DealList
            grouped={grouped}
            selectedDealId={selectedDeal?.deal?.id || null}
            onSelect={(item) => setSelectedDeal(item)}
            updateDeal={updateDeal}
            onNavigate={handleNavigate}
            compact={true}
            sectionRefs={sectionRefs}
            closedDeals={closedDeals}
            lostDeals={lostDeals}
            closedOpen={closedOpen}
            setClosedOpen={setClosedOpen}
          />
        </div>
 
        {/* Right panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {selectedDeal ? (
            <DealPreview
              selected={selectedDeal}
              onClose={() => setSelectedDeal(null)}
              updateDeal={async (id, data) => {
                await updateDeal(id, data);
                setSelectedDeal(prev => prev ? { ...prev, deal: { ...prev.deal, ...data } } : null);
              }}
              onNavigate={handleNavigate}
              pendingFollowUpMap={pendingFollowUpMap}
              allDeals={allDeals}
            />
          ) : (
            <DefaultRightPanel stats={stats} grouped={grouped} allDeals={allDeals} />
          )}
        </div>
      </div>
    </div>
  );
}
