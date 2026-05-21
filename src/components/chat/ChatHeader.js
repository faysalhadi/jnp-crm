import React from "react";
import { supabase } from "../../supabase";
import Badge from "../ui/Badge";
import StageBar from "../ui/StageBar";
import { STAGES, TIERS, PAYMENT_STATUSES, LOSS_REASONS, BRANDS } from "../../constants";
import { daysSince } from "../../utils/helpers";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import { useTraders } from "../../context/TradersContext";

export default function ChatHeader({
  editingName, setEditingName,
  nameInput, setNameInput,
  editingNumber, setEditingNumber,
  numberInput, setNumberInput,
  moveStage,
  pendingSuggestion, setPendingSuggestion,
  outreachMode, setOutreachMode,
  outreachReason, setOutreachReason,
  outreachCustom, setOutreachCustom,
  showSupplierReply, setShowSupplierReply,
  supplierReplyCtx, setSupplierReplyCtx,
  supplierReplyGmail, setSupplierReplyGmail,
  supplierReplyWA, setSupplierReplyWA,
  supplierReplyLoading, setSupplierReplyLoading,
  copiedSupGmail, setCopiedSupGmail,
  copiedSupWA, setCopiedSupWA,
  handleConfirmSale,
  handleReserveDevice,
  generateSupplierReply,
}) {
  const { setShowSideDrawer } = useUI();
  const {
    traderListings,
    setTraderSearch,
  } = useTraders();
  const {
    activeCustomer,
    activeDeal,
    activeDealId, setActiveDealId,
    activeCustomerId, setActiveCustomerId,
    setView,
    pendingSuggestion: _pendingSuggestion, setPendingSuggestion: _setPendingSuggestion,
    showAddDeal, setShowAddDeal,
    showDeleteConfirm, setShowDeleteConfirm,
    showLossReason, setShowLossReason,
    newDeal, setNewDeal,
    loadCustomers,
    updateCustomer: _updateCustomer,
    updateDeal: _updateDeal,
    deleteCustomer: _deleteCustomer,
    addDeal: _addDeal,
  } = useCustomers();

  // Bind IDs so existing call sites (no-arg pattern) work unchanged
  const updateCustomer = (fields) => _updateCustomer(activeCustomerId, fields);
  const updateDeal = (fields) => _updateDeal(activeDealId, fields);
  const deleteCustomer = () => _deleteCustomer(activeCustomerId);
  const addDeal = () => _addDeal(activeCustomerId, newDeal);

  const tier = TIERS[activeCustomer.tier] || TIERS.cold;
  const overdue = daysSince(activeCustomer.last_active) >= 1 && (activeCustomer.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
  const closedDealValue = (activeCustomer.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
  const payStatus = PAYMENT_STATUSES.find(p => p.id === activeDeal?.payment_status) || PAYMENT_STATUSES[0];

  return (
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
            {activeCustomer.contact_type === "walkin"   && <Badge color="#6366F1" bg="#EEF2FF" small>⚡ WALK-IN</Badge>}
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
          <button onClick={() => setShowSideDrawer(true)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer", fontSize: 14 }}>📊</button>
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
    </div>
  );
}
