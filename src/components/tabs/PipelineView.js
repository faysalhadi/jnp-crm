import React, { useState, useEffect, useMemo, useRef } from "react";
import { useCustomers, getClientHealth } from "../../context/CustomerContext";
import { getTag } from "../../constants";
import StageBar from "../ui/StageBar";
 
// ── Colour tokens ──────────────────────────────────────────────────────────────
const C = {
  surface:   "#FFFFFF",
  surface2:  "#F8F8FA",
  surface3:  "#EEEEF2",
  bg:        "#F3F4F6",
  border:    "#E4E4E8",
  text:      "#1A1A28",
  text2:     "#3A405A",
  text3:     "#9A99AA",
  accent:    "#4D44B5",
  accentLt:  "#EEECFA",
  green:     "#10B981",
  greenLt:   "#ECFDF5",
  greenDk:   "#065F46",
  amber:     "#F59E0B",
  amberLt:   "#FFFBEB",
  red:       "#EF4444",
  redLt:     "#FEF2F2",
  blue:      "#30A5F5",
  blueLt:    "#EFF6FF",
  purple:    "#8B5CF6",
  purpleLt:  "#F5F3FF",
};
 
// ── Helpers ────────────────────────────────────────────────────────────────────
function buildWaUrl(number) {
  if (!number) return null;
  const clean = number.replace(/\D/g, "");
  const n = clean.startsWith("0") ? "971" + clean.slice(1) : clean.startsWith("971") ? clean : "971" + clean;
  return `https://wa.me/${n}`;
}
 
function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
 
function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}
 
function fmtAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1)  return "now";
  if (mins < 60) return `${mins}m`;
  if (hrs  < 24) return `${hrs}h`;
  if (days < 7)  return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
 
function timeAgo(dt) { return fmtAgo(dt); }
 
function fmtValueShort(n) {
  if (!n) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000)    return (n / 1000).toFixed(1) + "K";
  return String(Math.round(n));
}
 
const ACTIVE_STAGES = ["new_inquiry", "device_found", "negotiation", "confirmed_pending_pickup"];
const STAGE_PROB    = { new_inquiry: 0.1, device_found: 0.35, negotiation: 0.65, confirmed_pending_pickup: 0.94 };
const STAGE_CFG = {
  new_inquiry:              { label: "New Inquiry",     short: "NEW",     emoji: "📋", dot: C.blue,   bg: C.blueLt,   text: C.blue  },
  device_found:             { label: "Device Found",    short: "FOUND",   emoji: "🔍", dot: C.amber,  bg: C.amberLt,  text: C.amber },
  negotiation:              { label: "Negotiation",     short: "NEGO",    emoji: "💬", dot: C.purple, bg: C.purpleLt, text: C.purple },
  confirmed_pending_pickup: { label: "Confirmed",       short: "CONF",    emoji: "✅", dot: C.green,  bg: C.greenLt,  text: C.green },
  closed:                   { label: "Closed",          short: "CLOSED",  emoji: "💰", dot: C.green,  bg: C.greenLt,  text: C.greenDk },
  lost:                     { label: "Lost",            short: "LOST",    emoji: "❌", dot: C.red,    bg: C.redLt,    text: C.red   },
};
 
function getStageColor(stage) {
  return STAGE_CFG[stage] || { label: stage, short: stage, emoji: "•", dot: C.text3, bg: C.surface2, text: C.text2 };
}
 
function getDaysSinceDeal(deal) {
  const d = deal.updated_at || deal.created_at;
  return d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 0;
}
 
// ── Deal Card ─────────────────────────────────────────────────────────────────
function DealCard({ deal, customer, selected, onSelect, updateDeal, onNavigate, compact }) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [moving, setMoving]       = useState(false);
 
  const sc           = getStageColor(deal.stage);
  const health       = getClientHealth(customer);
  const days         = getDaysSinceDeal(deal);
  const deviceLabel  = [deal.brand, deal.model].filter(Boolean).join(" ") || "Device TBD";
  const budget       = Number(deal.budget) || Number(deal.value) || 0;
  const isStale      = days >= 7;
  const currentIdx   = ACTIVE_STAGES.indexOf(deal.stage);
 
  async function moveStage(stageId, e) {
    e.stopPropagation();
    setMoving(true);
    setQuickOpen(false);
    await updateDeal(deal.id, { stage: stageId });
    setMoving(false);
  }
 
  return (
    <div
      onClick={() => onSelect({ deal, customer })}
      style={{
        background: selected ? C.accentLt : C.surface,
        border: `1px solid ${selected ? C.accent : C.border}`,
        borderRadius: 10,
        padding: compact ? "9px 11px" : "11px 13px",
        cursor: "pointer",
        position: "relative",
        transition: "all 0.15s",
        opacity: moving ? 0.6 : 1,
      }}>
 
      {/* Row 1: Avatar + Name + Stage badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
        <div style={{ width: compact ? 28 : 34, height: compact ? 28 : 34, borderRadius: compact ? 8 : 10, background: sc.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: compact ? 10 : 12, fontWeight: 800, color: sc.text, flexShrink: 0, letterSpacing: "-0.3px" }}>
          {getInitials(customer.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? 11 : 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: "-0.2px" }}>
            {customer.name}
          </div>
          <div style={{ fontSize: compact ? 9 : 10, color: C.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
            {deviceLabel}
          </div>
        </div>
        {/* Stage badge — click to open quick stage picker */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setQuickOpen(v => !v); }}
            style={{ padding: "2px 7px", borderRadius: 20, border: "none", background: sc.bg, color: sc.text, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {sc.short}
          </button>
          {quickOpen && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ position: "absolute", right: 0, top: 26, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: 40, overflow: "hidden", minWidth: 160 }}>
              {ACTIVE_STAGES.map((sid, i) => {
                const s = getStageColor(sid);
                const isCurrent = sid === deal.stage;
                const isPast    = i < currentIdx;
                return (
                  <button key={sid}
                    onClick={e => !isCurrent && moveStage(sid, e)}
                    style={{ width: "100%", padding: "8px 12px", border: "none", borderBottom: i < ACTIVE_STAGES.length - 1 ? `1px solid ${C.border}` : "none", background: isCurrent ? C.accentLt : C.surface, color: isCurrent ? C.accent : isPast ? C.text3 : C.text2, fontSize: 11, fontWeight: isCurrent ? 700 : 500, cursor: isCurrent ? "default" : "pointer", textAlign: "left", fontFamily: "inherit" }}>
                    {isCurrent ? "✓ " : ""}{s.label}
                  </button>
                );
              })}
              <button
                onClick={e => moveStage("lost", e)}
                style={{ width: "100%", padding: "8px 12px", border: "none", background: C.redLt, color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                Mark Lost
              </button>
            </div>
          )}
        </div>
      </div>
 
      {/* Row 2: Budget + Age */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {budget > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: C.accent, fontVariantNumeric: "tabular-nums" }}>
            AED {Number(budget).toLocaleString()}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: isStale ? C.red : C.text3, fontWeight: isStale ? 700 : 500 }}>
          {days === 0 ? "today" : `${days}d`}
        </span>
        {isStale && (
          <span style={{ fontSize: 9, background: C.redLt, color: C.red, padding: "1px 5px", borderRadius: 10, fontWeight: 700 }}>stale</span>
        )}
      </div>
 
      {/* Row 3: Health dot */}
      {!compact && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: health.color, flexShrink: 0 }} />
          <span style={{ fontSize: 9, color: C.text3, fontWeight: 600 }}>{health.label}</span>
        </div>
      )}
    </div>
  );
}
 
// ── Mini Card (closed / lost items) ───────────────────────────────────────────
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
 
// ── Funnel Bar ─────────────────────────────────────────────────────────────────
function FunnelBar({ grouped, onJump }) {
  const total = grouped.reduce((s, g) => s + g.items.length, 0);
  if (!total) return null;
  return (
    <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "8px 12px", display: "flex", gap: 4, flexShrink: 0, overflowX: "auto", scrollbarWidth: "none" }}>
      {grouped.map(g => {
        const sc  = getStageColor(g.stageId);
        const pct = total > 0 ? Math.round(g.items.length / total * 100) : 0;
        return (
          <button key={g.stageId}
            onClick={() => onJump(g.stageId)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "4px 8px", borderRadius: 8, border: "none", background: sc.bg, cursor: "pointer", flexShrink: 0, fontFamily: "inherit", transition: "all 0.15s", minWidth: 60 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: sc.text, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
              {g.items.length}
            </div>
            <div style={{ fontSize: 8, fontWeight: 700, color: sc.text, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {sc.short}
            </div>
            <div style={{ width: "100%", height: 3, borderRadius: 10, background: sc.dot, opacity: 0.5 + pct / 200 }} />
          </button>
        );
      })}
    </div>
  );
}
 
// ── Deal List ─────────────────────────────────────────────────────────────────
function DealList({ grouped, selectedDealId, onSelect, updateDeal, onNavigate, compact, sectionRefs, closedDeals, lostDeals, closedOpen, setClosedOpen }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: compact ? "10px 10px 60px" : "12px 12px 80px", scrollbarWidth: "thin" }}>
      {grouped.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.text3 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>No open deals</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Try a different filter</div>
        </div>
      )}
 
      {grouped.map(g => {
        const sc = getStageColor(g.stageId);
        return (
          <div key={g.stageId} ref={el => { sectionRefs.current[g.stageId] = el; }} style={{ marginBottom: 16 }}>
            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: sc.text }}>{sc.emoji} {sc.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: sc.text, background: sc.bg, padding: "1px 6px", borderRadius: 20 }}>{g.items.length}</span>
              <span style={{ flex: 1 }} />
              {g.totalValue > 0 && (
                <span style={{ fontSize: 10, color: C.text3, fontVariantNumeric: "tabular-nums" }}>
                  AED {fmtValueShort(g.totalValue)}
                </span>
              )}
            </div>
            {/* Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {g.items.map(({ deal, customer }) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  customer={customer}
                  selected={selectedDealId === deal.id}
                  onSelect={onSelect}
                  updateDeal={updateDeal}
                  onNavigate={onNavigate}
                  compact={compact}
                />
              ))}
            </div>
          </div>
        );
      })}
 
      {/* Closed / Lost toggle */}
      {(closedDeals.length > 0 || lostDeals.length > 0) && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setClosedOpen(v => !v)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface2, color: C.text3, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
            {closedOpen ? "▲" : "▼"}
            Closed ({closedDeals.length}) · Lost ({lostDeals.length})
          </button>
          {closedOpen && (
            <div style={{ marginTop: 8 }}>
              {closedDeals.map(({ deal, customer }) => (
                <MiniCard key={deal.id} deal={deal} customer={customer} dotColor={C.green} />
              ))}
              {lostDeals.map(({ deal, customer }) => (
                <MiniCard key={deal.id} deal={deal} customer={customer} dotColor={C.red} />
              ))}
            </div>
          )}
        </div>
      )}
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
                const isPast    = i < currentIdx;
                const isCurrent = sid === localStage;
                const isFuture  = i > currentIdx;
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
 
          {/* Notes */}
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
 
// ── DEFAULT RIGHT PANEL (no deal selected) ────────────────────────────────────
 
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
              const sc   = getStageColor(g.stageId);
              const prob = STAGE_PROB[g.stageId] || 0;
              const wVal = g.items.reduce((s, { deal }) => s + (Number(deal.budget) || Number(deal.value) || 0) * prob, 0);
              const pct  = stats.weighted > 0 ? (wVal / stats.weighted * 100) : 0;
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
 
        {/* Stage distribution */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 12 }}>Stage Distribution</div>
          {ACTIVE_STAGES.map(sid => {
            const g     = grouped.find(x => x.stageId === sid);
            const count = g ? g.items.length : 0;
            const sc    = getStageColor(sid);
            const pct   = totalOpen > 0 ? (count / totalOpen * 100) : 0;
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
            const sc          = getStageColor(deal.stage);
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
    { label: "Open deals",        value: stats.openCount,                          color: C.accent,  sub: "across " + ACTIVE_STAGES.length + " stages" },
    { label: "Gross pipeline",    value: "AED " + fmtValueShort(stats.pipeline),   color: C.accent,  sub: "all open budgets" },
    { label: "Weighted forecast", value: "AED " + fmtValueShort(stats.weighted),   color: C.accent,  sub: "by probability" },
    { label: "Win rate (30d)",    value: stats.winRate !== null ? stats.winRate + "%" : "–",  color: C.green,  sub: "closed vs lost" },
    { label: "Avg deal age",      value: stats.avgAge.toFixed(1) + "d",             color: C.text,   sub: "open deals" },
    { label: "Stale 7d+",         value: stats.stale,                               color: stats.stale > 0 ? C.red : C.text, sub: stats.stale > 0 ? "needs attention" : "all fresh" },
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
  { id: "all",         label: "All",             bg: null,        color: null },
  { id: "macbook",     label: "💻 MacBook",     bg: C.blueLt,   color: C.blue },
  { id: "windows_biz", label: "🖥 Windows Biz", bg: C.blueLt,   color: C.blue },
  { id: "gaming",      label: "🎮 Gaming",      bg: C.blueLt,   color: C.blue },
  { id: "vip",         label: "⭐ VIP",               bg: C.purpleLt, color: C.purple },
  { id: "trader",      label: "🤝 Trader",      bg: C.purpleLt, color: C.purple },
  { id: "corporate",   label: "🏢 Corporate",   bg: C.purpleLt, color: C.purple },
  { id: "jnp_bldg_1",  label: "📍 JNP Bldg 1", bg: C.greenLt,  color: C.greenDk },
  { id: "urgent",      label: "⚡ Urgent",            bg: C.amberLt,  color: C.amber },
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
              &#8597; {sortLabels[sortBy]}
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
