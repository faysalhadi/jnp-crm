import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import Badge from "../ui/Badge";
import { STAGES, TIERS, PAYMENT_STATUSES, LOSS_REASONS, BRANDS, MATCH_CATEGORIES, getMatchCategory, TRADER_CATEGORIES } from "../../constants";
import { daysSince, formatWhatsAppNumber } from "../../utils/helpers";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import { useChat } from "../../context/ChatContext";
import { useChatActions } from "../../hooks/useChatActions";
import FollowUpPanel from "./FollowUpPanel";
import ClientPreferencesPanel from "./ClientPreferencesPanel";
import BulkQuoteModal from "../modals/BulkQuoteModal";
import { useBroadcast } from "../../hooks/useBroadcast";
import ContactSheet from "./ContactSheet";

export default function ChatHeader() {
  const { setShowSideDrawer } = useUI();
  const {
    activeCustomer,
    activeDeal,
    activeDealId, setActiveDealId,
    activeCustomerId, setActiveCustomerId,
    setView,
    pendingSuggestion, setPendingSuggestion,
    showAddDeal, setShowAddDeal,
    showDeleteConfirm, setShowDeleteConfirm,
    newDeal, setNewDeal,
    loadCustomers,
    updateCustomer: _updateCustomer,
    updateDeal: _updateDeal,
    deleteCustomer: _deleteCustomer,
    addDeal: _addDeal,
    showLossReason, setShowLossReason,
  } = useCustomers();
  const {
    editingName, setEditingName,
    nameInput, setNameInput,
    editingNumber, setEditingNumber,
    numberInput, setNumberInput,
    outreachMode, setOutreachMode,
    outreachCustom, setOutreachCustom,
    showSupplierReply, setShowSupplierReply,
    supplierReplyCtx, setSupplierReplyCtx,
    supplierReplyGmail, setSupplierReplyGmail,
    supplierReplyWA, setSupplierReplyWA,
    copiedSupGmail, setCopiedSupGmail,
    copiedSupWA, setCopiedSupWA,
  } = useChat();
  const { moveStage, handleConfirmSale, handleReserveDevice, generateSupplierReply } = useChatActions();
  const { openBroadcast } = useBroadcast();

  const [dealExpanded, setDealExpanded] = useState(false);
  const [showContactSheet, setShowContactSheet] = useState(false);
  const [showBulkQuote, setShowBulkQuote] = useState(false);
  const [showDeleteDeal, setShowDeleteDeal] = useState(false);
  const [showFindStock, setShowFindStock] = useState(false);
  const [stockMatches, setStockMatches] = useState({ own: [], trader: [] });
  const [findingStock, setFindingStock] = useState(false);
  const [showEditTrader, setShowEditTrader] = useState(false);
  const [editTraderForm, setEditTraderForm] = useState({ stall_number: "", categories: [] });
  const [showQuotePrompt, setShowQuotePrompt] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [quoteSaving, setQuoteSaving] = useState(false);
  const [showLossReasonPrompt, setShowLossReasonPrompt] = useState(false);
  const [selectedLossReason, setSelectedLossReason] = useState(null);
  const [lossReasonOther, setLossReasonOther] = useState("");
  const [lossReasonSaving, setLossReasonSaving] = useState(false);

  const LOSS_REASON_OPTIONS = [
    { key: "price_too_high", label: "💸 Price too high" },
    { key: "went_elsewhere", label: "🏃 Went elsewhere" },
    { key: "no_stock", label: "📦 No matching stock" },
    { key: "no_response", label: "🔇 No response" },
    { key: "bad_timing", label: "⏰ Bad timing" },
    { key: "other", label: "✏️ Other" },
  ];

  // Watch for showLossReason from context (triggered by moveStage)
  useEffect(() => {
    if (showLossReason) {
      setSelectedLossReason(null);
      setLossReasonOther("");
      setShowLossReasonPrompt(true);
      setShowLossReason(false);
    }
  }, [showLossReason]); // eslint-disable-line

  async function saveLossReasonAndReminder(reason) {
    setLossReasonSaving(true);
    const finalReason = reason === "other" ? lossReasonOther.trim() : reason;
    if (finalReason && activeDealId) {
      await supabase.from("deals").update({ loss_reason: finalReason }).eq("id", activeDealId);
    }
    // Auto-create 14-day re-engagement reminder
    const reengageDate = new Date();
    reengageDate.setDate(reengageDate.getDate() + 14);
    reengageDate.setHours(10, 0, 0, 0);
    const dealDesc = [activeDeal?.brand, activeDeal?.model].filter(Boolean).join(" ") || "device";
    await supabase.from("reminders").insert({
      title: `Re-engage ${activeCustomer?.name} — ${dealDesc}`,
      note: `Lost deal${finalReason ? `. Reason: ${finalReason}` : ""}. Originally wanted: ${dealDesc}${activeDeal?.budget ? `, budget ~${activeDeal.budget} AED` : ""}.`,
      due_at: reengageDate.toISOString(),
      category: "reengagement",
      status: "pending",
    });
    await loadCustomers();
    setLossReasonSaving(false);
    setShowLossReasonPrompt(false);
    setSelectedLossReason(null);
    setLossReasonOther("");
  }
  const updateCustomer = (fields) => _updateCustomer(activeCustomerId, fields);
  const updateDeal = (fields) => _updateDeal(activeDealId, fields);
  const deleteCustomer = () => _deleteCustomer(activeCustomerId);
  const addDeal = () => _addDeal(activeCustomerId, newDeal);

  const tier = TIERS[activeCustomer.tier] || TIERS.cold;
  const overdue = daysSince(activeCustomer.last_active) >= 1 && (activeCustomer.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
  const closedDealValue = (activeCustomer.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
  const initials = (activeCustomer.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const currentStageLabel = STAGES.find(s => s.id === activeDeal?.stage)?.label || activeDeal?.stage || "";

  async function saveQuoteAndFollowUp(withFollowUp) {
    setQuoteSaving(true);
    if (quoteText.trim()) {
      await supabase.from("activity_log").insert({
        customer_id:   activeCustomerId,
        activity_type: "note",
        note:          "Quoted: " + quoteText.trim(),
        logged_at:     new Date().toISOString(),
      });
    }
    if (withFollowUp) {
      const due = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await supabase.from("follow_ups").insert({
        customer_id: activeCustomerId,
        due_at:      due.toISOString(),
        note:        quoteText.trim() ? "Follow up on quote: " + quoteText.trim() : "Follow up on price quote",
        status:      "pending",
      });
    }
    await supabase.from("customers")
      .update({ last_active: new Date().toISOString(), last_activity_at: new Date().toISOString() })
      .eq("id", activeCustomerId);
    await loadCustomers();
    setQuoteSaving(false);
    setShowQuotePrompt(false);
    setQuoteText("");
  }

  async function handleFindStock() {
    if (!activeDeal) return;
    setFindingStock(true);
    setShowFindStock(true);
    setStockMatches({ own: [], trader: [] });
    const brand = (activeDeal.brand || "").toLowerCase();
    const model = (activeDeal.model || "").toLowerCase();
    const budget = activeDeal.budget;
    // Search own stock
    let ownQuery = supabase.from("stock").select("*").eq("status", "available");
    if (brand) ownQuery = ownQuery.ilike("brand", "%" + brand + "%");
    const { data: ownStock } = await ownQuery;
    const filteredOwn = (ownStock || []).filter(s => {
      if (model) {
        const sm = (s.model || "").toLowerCase();
        const words = model.split(" ").filter(w => w.length > 2);
        if (words.length > 0 && !words.some(w => sm.includes(w))) return false;
      }
      if (budget && s.max_price && Number(s.max_price) > Number(budget) * 1.15) return false;
      return true;
    });
    // Search trader inventory
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    let traderQuery = supabase.from("trader_inventory").select("*")
      .eq("type", "selling").eq("status", "active").gte("created_at", thirtyDaysAgo);
    if (brand) traderQuery = traderQuery.ilike("brand", "%" + brand + "%");
    const { data: traderStock } = await traderQuery;
    const filteredTrader = (traderStock || []).filter(s => {
      if (model) {
        const sm = (s.model || "").toLowerCase();
        const words = model.split(" ").filter(w => w.length > 2);
        if (words.length > 0 && !words.some(w => sm.includes(w))) return false;
      }
      if (budget && s.price) {
        const priceAED = s.currency === "USD" ? s.price * 3.67 : s.currency === "GBP" ? s.price * 4.65 : s.price;
        if (priceAED > Number(budget) * 1.15) return false;
      }
      return true;
    });
    setStockMatches({ own: filteredOwn, trader: filteredTrader });
    setFindingStock(false);
  }

  async function deleteDeal(dealId) {
    await supabase.from("deals").delete().eq("id", dealId);
    setShowDeleteDeal(false);
    await loadCustomers();
  }

  return (
    <>
    <div style={{ background: "#fff", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 20 }}>

      {/* TOP ROW */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px 10px" }}>
        <button
          onClick={() => { setView("list"); setActiveCustomerId(null); setActiveDealId(null); setPendingSuggestion(null); }}
          style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 16, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
          ←
        </button>

        <div onClick={() => setShowContactSheet(true)} style={{ width: 36, height: 36, borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#6366F1", flexShrink: 0, cursor: "pointer" }}>
          {initials}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {editingName ? (
              <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
                onBlur={async () => {
                  if (nameInput.trim() && nameInput.trim() !== activeCustomer.name) {
                    await supabase.from('customers').update({ name: nameInput.trim() }).eq('id', activeCustomerId);
                    await loadCustomers();
                  }
                  setEditingName(false);
                }}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingName(false); }}
                style={{ fontWeight: 700, fontSize: 15, color: "#0F172A", border: "none", borderBottom: "2px solid #6366F1", outline: "none", background: "transparent", padding: "1px 0", minWidth: 60, maxWidth: 160 }}
              />
            ) : (
              <span onClick={() => { setEditingName(true); setNameInput(activeCustomer.name); }}
                style={{ fontWeight: 700, fontSize: 15, color: "#0F172A", cursor: "text" }}>
                {activeCustomer.name}
              </span>
            )}
            {activeCustomer.urgent && <Badge color="#EF4444" bg="#FEF2F2" small>🔴 URGENT</Badge>}
            {activeCustomer.contact_type === "trader"   && <Badge color="#D97706" bg="#FFFBEB" small>TRADER</Badge>}
            {activeCustomer.contact_type === "supplier" && <Badge color="#2563EB" bg="#EFF6FF" small>SUPPLIER</Badge>}
            {activeCustomer.contact_type === "walkin"   && <Badge color="#6366F1" bg="#EEF2FF" small>WALK-IN</Badge>}
            {(!activeCustomer.contact_type || activeCustomer.contact_type === "client") && (
              <Badge color={tier.color} bg={tier.bg} small>{tier.icon} {tier.label}</Badge>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            {editingNumber ? (
              <input autoFocus value={numberInput} onChange={e => setNumberInput(e.target.value)}
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
              <span onClick={() => { setEditingNumber(true); setNumberInput(activeCustomer.number || ''); }}
                style={{ fontSize: 12, color: "#6366F1", fontWeight: 600, cursor: "text" }}>
                {activeCustomer.number ? `📱 ${activeCustomer.number}` : '+ Add number'}
              </span>
            )}
            {activeCustomer.number && !editingNumber && (
              <a href={`https://wa.me/${activeCustomer.number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                style={{ fontSize: 11, color: "#25D366", fontWeight: 700, textDecoration: "none" }}>WA</a>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => setShowAddDeal(true)}
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#6366F1" }}>+</button>
          <button onClick={() => setShowSideDrawer(true)}
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>📊</button>
          {activeCustomer.contact_type === "trader" && (
            <button onClick={() => setShowEditTrader(true)}
              style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E2E8F0", background: "#EEF2FF", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", color: "#6366F1" }}>✏️</button>
          )}
          <button onClick={() => setShowDeleteConfirm(true)}
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #FEE2E2", background: "#FFF5F5", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>🗑</button>
        </div>
      </div>

      {/* DEAL TABS */}
      {(activeCustomer.deals || []).length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "0 14px 10px" }}>
          {(activeCustomer.deals || []).map((d, i) => (
            <button key={d.id} onClick={() => setActiveDealId(d.id)}
              style={{ padding: "4px 12px", borderRadius: 20, border: "none", flexShrink: 0, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: d.id === activeDealId ? "#6366F1" : "#F1F5F9",
                color: d.id === activeDealId ? "#fff" : "#64748B" }}>
              {d.brand || "Deal"} {i + 1}
            </button>
          ))}
        </div>
      )}



      {/* TRADER PROFILE INFO */}
      {activeCustomer.contact_type === "trader" && (activeCustomer.stall_number || (activeCustomer.categories || []).length > 0 || activeCustomer.number) && (
        <div style={{ padding: "8px 14px 4px", display: "flex", flexDirection: "column", gap: 6 }}>
          {activeCustomer.stall_number && (
            <div style={{ fontSize: 12, color: "#64748B" }}>📍 {activeCustomer.stall_number}</div>
          )}
          {(activeCustomer.categories || []).length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {(activeCustomer.categories || []).map(catId => {
                const cat = TRADER_CATEGORIES.find(x => x.id === catId);
                return cat ? (
                  <span key={catId} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#F1F5F9", color: "#374151" }}>
                    {cat.label}
                  </span>
                ) : null;
              })}
            </div>
          )}
          {activeCustomer.number && (
            <div style={{ display: "flex", gap: 8 }}>
              <a href={`tel:${activeCustomer.number}`}
                style={{ flex: 1, padding: "7px 0", borderRadius: 10, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#64748B", fontSize: 12, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
                📞 Call
              </a>
              <a href={`https://wa.me/${formatWhatsAppNumber(activeCustomer.number)}`}
                target="_blank" rel="noreferrer"
                style={{ flex: 1, padding: "7px 0", borderRadius: 10, border: "none", background: "#25D366", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
                💬 WhatsApp
              </a>
            </div>
          )}
        </div>
      )}

      {/* SUPPLIER ACTIONS */}
      {activeCustomer.contact_type === "supplier" && (
        <div style={{ display: "flex", gap: 8, padding: "0 14px 10px" }}>
          <button onClick={() => { setSupplierReplyCtx(""); setSupplierReplyGmail(""); setSupplierReplyWA(""); setShowSupplierReply(true); }}
            style={{ flex: 1, padding: "8px 6px", borderRadius: 10, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#2563EB", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            ✍️ Generate Reply
          </button>
        </div>
      )}

      {/* DEAL CARD — collapsible */}
      {activeDeal && (
        <div style={{ margin: "0 14px 12px", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden", background: "#fff" }}>

          {/* COLLAPSED ROW — always visible */}
          <div
            onClick={() => setDealExpanded(v => !v)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", cursor: "pointer" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 2 }}>
                {[activeDeal.brand, activeDeal.model].filter(Boolean).join(" ") || "Device TBD"}
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>
                {currentStageLabel}
                {activeDeal.budget ? ` · AED ${Number(activeDeal.budget).toLocaleString()}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {activeDeal.value && (
                <span style={{ fontSize: 11, color: "#10B981", fontWeight: 700 }}>
                  AED {Number(activeDeal.value).toLocaleString()}
                </span>
              )}
              <span style={{ fontSize: 12, color: "#94A3B8" }}>{dealExpanded ? "▲" : "▼"}</span>
            </div>
          </div>

          {/* EXPANDED CONTENT */}
          {dealExpanded && (
            <div style={{ borderTop: "1px solid #F1F5F9", padding: "12px 14px" }}>

              {/* specs */}
              {[activeDeal.ram, activeDeal.storage, activeDeal.screen, activeDeal.condition].filter(Boolean).length > 0 && (
                <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 10 }}>
                  {[activeDeal.ram, activeDeal.storage, activeDeal.screen, activeDeal.condition].filter(Boolean).join(" · ")}
                </div>
              )}

              {/* stage pills */}
              <div style={{ marginTop: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {STAGES.map(s => (
                    <button key={s.id} onClick={() => {
                          moveStage(s.id);
                          if (s.id === "negotiation" || s.id === "device_found") {
                            setQuoteText("");
                            setShowQuotePrompt(true);
                          }
                        }}
                      style={{
                        padding: "3px 10px", borderRadius: 20, border: "none",
                        fontSize: 10, fontWeight: 700, cursor: "pointer",
                        background: s.id === activeDeal.stage ? s.color : "#F1F5F9",
                        color: s.id === activeDeal.stage ? "#fff" : "#64748B",
                        transition: "all 0.15s",
                      }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeDeal.stage === "waiting" && (() => {
                const autoCategory = getMatchCategory(activeDeal.brand, activeDeal.model, activeDeal.processor || "");
                const currentCategory = activeDeal.match_category || autoCategory || "none";
                const currentCat = MATCH_CATEGORIES.find(c => c.id === currentCategory);
                return (
                  <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 6 }}>MATCH CATEGORY</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "#D97706", flex: 1 }}>
                        {currentCat?.icon} {currentCat?.label || "Not set"}
                      </span>
                      <select
                        value={currentCategory}
                        onChange={async (e) => {
                          const newCategory = e.target.value;
                          await supabase.from("deals").update({ match_category: newCategory }).eq("id", activeDealId);
                          await loadCustomers();
                        }}
                        style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #FDE68A", background: "#fff", fontSize: 11, color: "#D97706", outline: "none", cursor: "pointer" }}>
                        {MATCH_CATEGORIES.map(c => (
                          <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>
                      Auto-detected from specs. Change if needed.
                    </div>
                  </div>
                );
              })()}

              {/* info pills */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                {activeDeal.activation_lock !== "unknown" && activeDeal.brand === "MacBook" && (
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                    background: activeDeal.activation_lock === "yes" ? "#FEF2F2" : "#ECFDF5",
                    color: activeDeal.activation_lock === "yes" ? "#EF4444" : "#10B981" }}>
                    🔒 {activeDeal.activation_lock === "yes" ? "Locked" : "Unlocked"}
                  </span>
                )}
                {activeDeal.charger !== "unknown" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F1F5F9", color: "#64748B", fontWeight: 600 }}>🔌 {activeDeal.charger}</span>}
                {activeDeal.box !== "unknown" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#F1F5F9", color: "#64748B", fontWeight: 600 }}>📦 {activeDeal.box}</span>}
              </div>

              {overdue && (
                <div style={{ marginBottom: 10, fontSize: 11, color: "#EF4444", fontWeight: 700 }}>
                  ⚠️ No activity for {daysSince(activeCustomer.last_active)}d — follow up!
                </div>
              )}

              {/* payment status for closed deals */}
              {activeDeal.stage === "closed" && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", marginBottom: 5, letterSpacing: 0.5 }}>PAYMENT</div>
                  <div style={{ display: "flex", gap: 5 }}>
                    {PAYMENT_STATUSES.map(p => (
                      <button key={p.id} onClick={() => updateDeal({ payment_status: p.id })}
                        style={{ flex: 1, padding: "6px 4px", borderRadius: 8, border: "none", fontSize: 10, fontWeight: 700, cursor: "pointer",
                          background: activeDeal.payment_status === p.id ? p.color : p.bg,
                          color: activeDeal.payment_status === p.id ? "#fff" : p.color }}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* AI suggestion */}
              {pendingSuggestion && (
                <div style={{ marginBottom: 10, padding: "10px 12px", borderRadius: 12, background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
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

              {/* loss reason */}
              {activeDeal.stage === "lost" && (
                <div style={{ marginBottom: 10 }}>
                  <select value={activeDeal.loss_reason || ""} onChange={e => updateDeal({ loss_reason: e.target.value })}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #FEE2E2", fontSize: 12, outline: "none", color: "#EF4444", background: "#FEF2F2" }}>
                    <option value="">Why was this lost?</option>
                    {LOSS_REASONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              )}

              {closedDealValue > 0 && (
                <div style={{ padding: "8px 12px", borderRadius: 10, background: "#ECFDF5", fontSize: 12, color: "#10B981", fontWeight: 700 }}>
                  💰 Total from {activeCustomer.name}: AED {closedDealValue.toLocaleString()}
                </div>
              )}
            </div>
          )}

          {/* RESERVE / CONFIRM — flush bottom, always visible, smaller */}
          {activeDeal.stage !== "closed" && activeDeal.stage !== "lost" && (
            <div style={{ display: "flex", borderTop: "1px solid #F1F5F9", flexWrap: "wrap" }}>
              <button onClick={handleReserveDevice}
                style={{ flex: 1, padding: "9px 8px", border: "none", borderRight: "1px solid #F1F5F9", background: "#FFFBEB", color: "#D97706", fontSize: 12, fontWeight: 700, cursor: "pointer", minWidth: 70 }}>
                🔒 Reserve
              </button>
              <button onClick={handleConfirmSale}
                style={{ flex: 1, padding: "9px 8px", border: "none", borderRight: "1px solid #F1F5F9", background: "#EEF2FF", color: "#6366F1", fontSize: 12, fontWeight: 700, cursor: "pointer", minWidth: 70 }}>
                ⚡ Confirm
              </button>
              <button onClick={() => setShowBulkQuote(true)}
                style={{ flex: 1, padding: "9px 8px", border: "none", borderRight: "1px solid #F1F5F9", background: "#F0FDF4", color: "#059669", fontSize: 12, fontWeight: 700, cursor: "pointer", minWidth: 60 }}>
                💼 Bulk
              </button>
              <button onClick={handleFindStock}
                style={{ flex: 1, padding: "9px 8px", border: "none", borderRight: "1px solid #F1F5F9", background: "#EFF6FF", color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: "pointer", minWidth: 60 }}>
                🔍 Find
              </button>
              <button onClick={() => setShowDeleteDeal(true)}
                style={{ padding: "9px 10px", border: "none", background: "#FFF5F5", color: "#EF4444", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                🗑
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Quote Modal */}
      {showBulkQuote && <BulkQuoteModal onClose={() => setShowBulkQuote(false)} />}

      {/* Edit Trader Modal */}
      {showEditTrader && activeCustomer?.contact_type === "trader" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 400, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: 20 }}>
            <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 14 }}>Edit Trader Profile</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 4 }}>SHOP / STALL NUMBER</div>
              <input value={editTraderForm.stall_number}
                onChange={e => setEditTraderForm(f => ({ ...f, stall_number: e.target.value }))}
                placeholder="e.g. Shop 14, Block B"
                defaultValue={activeCustomer.stall_number || ""}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", letterSpacing: 0.5, marginBottom: 8 }}>STOCK CATEGORIES</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TRADER_CATEGORIES.map(cat => {
                  const selected = (editTraderForm.categories.length ? editTraderForm.categories : (activeCustomer.categories || [])).includes(cat.id);
                  return (
                    <button key={cat.id}
                      onClick={() => {
                        const curr = editTraderForm.categories.length ? editTraderForm.categories : (activeCustomer.categories || []);
                        setEditTraderForm(f => ({ ...f, categories: selected ? curr.filter(c => c !== cat.id) : [...curr, cat.id] }));
                      }}
                      style={{ padding: "6px 12px", borderRadius: 20, border: selected ? "2px solid #111" : "1.5px solid #E2E8F0",
                        background: selected ? "#111" : "#F9FAFB", color: selected ? "#fff" : "#374151",
                        fontSize: 12, cursor: "pointer", fontWeight: selected ? 700 : 400 }}>
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={async () => {
                const updates = {
                  stall_number: editTraderForm.stall_number || activeCustomer.stall_number || null,
                  categories: editTraderForm.categories.length ? editTraderForm.categories : (activeCustomer.categories || null),
                };
                await supabase.from("customers").update(updates).eq("id", activeCustomer.id);
                setShowEditTrader(false);
                setEditTraderForm({ stall_number: "", categories: [] });
                loadCustomers();
              }} style={{ flex: 2, padding: 12, borderRadius: 12, border: "none", background: "#6366F1", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                Save
              </button>
              <button onClick={() => { setShowEditTrader(false); setEditTraderForm({ stall_number: "", categories: [] }); }}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quote Prompt Modal ── */}
      {showQuotePrompt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: 36 }}>
            <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>💬 What did you quote?</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 14 }}>
              Log your quote and optionally set a 24h follow-up
            </div>
            <input
              value={quoteText}
              onChange={e => setQuoteText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveQuoteAndFollowUp(true); }}
              placeholder='e.g. "HP EliteBook 840 G8 Grade A — AED 1,750"'
              autoFocus
              style={{ width: "100%", padding: "11px 14px", borderRadius: 12, border: "1.5px solid #E2E8F0",
                fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 12 }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => saveQuoteAndFollowUp(true)} disabled={quoteSaving}
                style={{ width: "100%", padding: 13, borderRadius: 12, border: "none",
                  background: quoteSaving ? "#E2E8F0" : "#6366F1",
                  color: quoteSaving ? "#94A3B8" : "#fff",
                  fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                {quoteSaving ? "Saving..." : "✅ Log Quote + Set 24h Follow-up"}
              </button>
              <button onClick={() => saveQuoteAndFollowUp(false)} disabled={quoteSaving}
                style={{ width: "100%", padding: 13, borderRadius: 12, border: "1px solid #E2E8F0",
                  background: "#fff", color: "#64748B", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Log Quote Only
              </button>
              <button onClick={() => { setShowQuotePrompt(false); setQuoteText(""); }}
                style={{ width: "100%", padding: 10, borderRadius: 12, border: "none",
                  background: "none", color: "#CBD5E1", fontSize: 12, cursor: "pointer" }}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Loss Reason Bottom Sheet ── */}
      {showLossReasonPrompt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 500, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: 480, margin: "0 auto", borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: 40 }}>
            <div style={{ width: 36, height: 3, background: "#E2E8F0", borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>😔 Why was this lost?</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 16 }}>
              {[activeDeal?.brand, activeDeal?.model].filter(Boolean).join(" ") || "This deal"} · Helps improve future follow-ups
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {LOSS_REASON_OPTIONS.map(r => (
                <button key={r.key} onClick={() => setSelectedLossReason(r.key)}
                  style={{
                    padding: "12px 16px", borderRadius: 12, border: "none", textAlign: "left",
                    fontSize: 14, fontWeight: 600, cursor: "pointer",
                    background: selectedLossReason === r.key ? "#EEF2FF" : "#F8FAFC",
                    color: selectedLossReason === r.key ? "#6366F1" : "#374151",
                    outline: selectedLossReason === r.key ? "2px solid #6366F1" : "2px solid transparent",
                    transition: "all 0.15s",
                  }}>
                  {r.label}
                </button>
              ))}
            </div>
            {selectedLossReason === "other" && (
              <textarea
                autoFocus
                value={lossReasonOther}
                onChange={e => setLossReasonOther(e.target.value)}
                placeholder="Describe what happened..."
                rows={2}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 10,
                  border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none",
                  resize: "none", fontFamily: "inherit", lineHeight: 1.5,
                  boxSizing: "border-box", marginBottom: 14,
                }}
              />
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={() => selectedLossReason && saveLossReasonAndReminder(selectedLossReason)}
                disabled={!selectedLossReason || lossReasonSaving || (selectedLossReason === "other" && !lossReasonOther.trim())}
                style={{
                  width: "100%", padding: 13, borderRadius: 12, border: "none",
                  background: selectedLossReason ? "#6366F1" : "#E2E8F0",
                  color: selectedLossReason ? "#fff" : "#94A3B8",
                  fontWeight: 800, fontSize: 14, cursor: selectedLossReason ? "pointer" : "default",
                  opacity: lossReasonSaving ? 0.7 : 1,
                }}>
                {lossReasonSaving ? "Saving..." : "✅ Save + Set Re-engage Reminder"}
              </button>
              <button onClick={() => { setShowLossReasonPrompt(false); setSelectedLossReason(null); setLossReasonOther(""); }}
                style={{ width: "100%", padding: 10, borderRadius: 12, border: "none", background: "none", color: "#CBD5E1", fontSize: 12, cursor: "pointer" }}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Find Stock Modal ── */}
      {showFindStock && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 400, overflowY: "auto" }}>
          <div style={{ minHeight: "100%", padding: "16px 12px 40px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ background: "#fff", borderRadius: 20, padding: 20, width: "100%", maxWidth: 480 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>🔍 Find Stock</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>
                    {[activeDeal?.brand, activeDeal?.model].filter(Boolean).join(" ") || "All devices"}
                    {activeDeal?.budget ? ` · Budget AED ${Number(activeDeal.budget).toLocaleString()}` : ""}
                  </div>
                </div>
                <button onClick={() => setShowFindStock(false)}
                  style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "#F1F5F9", cursor: "pointer" }}>✕</button>
              </div>

              {findingStock && <div style={{ textAlign: "center", padding: 20, color: "#94A3B8", fontSize: 13 }}>Searching...</div>}

              {!findingStock && (
                <>
                  {/* Own stock */}
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#6366F1", letterSpacing: 0.5, marginBottom: 6 }}>
                    📦 YOUR STOCK ({stockMatches.own.length})
                  </div>
                  {stockMatches.own.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#CBD5E1", marginBottom: 14, padding: "8px 0" }}>Nothing matching in your stock</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                      {stockMatches.own.map((s, i) => (
                        <div key={i} style={{ padding: "9px 12px", borderRadius: 10, background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{s.brand} {s.model}</div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>
                            {[s.processor, s.ram, s.ssd, s.condition].filter(Boolean).join(" · ")}
                            {s.max_price ? ` · AED ${Number(s.max_price).toLocaleString()}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Trader stock */}
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#D97706", letterSpacing: 0.5, marginBottom: 6 }}>
                    🤝 TRADER INVENTORY ({stockMatches.trader.length})
                  </div>
                  {stockMatches.trader.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#CBD5E1", padding: "8px 0" }}>Nothing matching in trader listings</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {stockMatches.trader.map((s, i) => {
                        const priceAED = s.currency === "USD" ? Math.round(s.price * 3.67) : s.currency === "GBP" ? Math.round(s.price * 4.65) : s.price;
                        return (
                          <div key={i} style={{ padding: "9px 12px", borderRadius: 10, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{s.brand} {s.model}</div>
                            <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>
                              {[s.processor, s.ram, s.storage, s.condition].filter(Boolean).join(" · ")}
                              {priceAED ? ` · AED ${priceAED.toLocaleString()}` : ""}
                            </div>
                            <div style={{ fontSize: 10, color: "#D97706", marginTop: 2, fontWeight: 600 }}>
                              📦 {s.trader_name || "Trader"}
                              {s.quantity > 1 ? ` · ×${s.quantity}` : ""}
                            </div>
                            {s.trader_number && (
                              <a href={`https://wa.me/${s.trader_number.replace(/\D/g,"")}`}
                                target="_blank" rel="noreferrer"
                                style={{ display: "inline-block", marginTop: 6, padding: "4px 10px", borderRadius: 8, background: "#25D366", color: "#fff", fontSize: 10, fontWeight: 700, textDecoration: "none" }}>
                                💬 WhatsApp Trader
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {stockMatches.own.length === 0 && stockMatches.trader.length === 0 && (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "#94A3B8", fontSize: 13 }}>
                      No matching stock found anywhere.<br />
                      <span style={{ fontSize: 11 }}>Check trader imports or source a new lot.</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Deal Confirm ── */}
      {showDeleteDeal && activeDeal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Delete this deal?</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>
              "{[activeDeal.brand, activeDeal.model].filter(Boolean).join(" ") || "This deal"}" will be permanently deleted.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => deleteDeal(activeDeal.id)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#EF4444", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Yes, Delete
              </button>
              <button onClick={() => setShowDeleteDeal(false)}
                style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preferences Panel — clients only */}
      {(activeCustomer?.contact_type === "client" || !activeCustomer?.contact_type || activeCustomer?.contact_type === "walkin") && <ClientPreferencesPanel />}

      {/* Follow-up, Notes & Activity Panel */}
      <FollowUpPanel />



      {/* ADD DEAL FORM */}
      {showAddDeal && (
        <div style={{ margin: "0 14px 12px", background: "#fff", borderRadius: 14, padding: 14, border: "1px solid #E2E8F0" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "#0F172A" }}>New Deal</div>
          <select value={newDeal.brand} onChange={e => setNewDeal(p => ({ ...p, brand: e.target.value }))}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, marginBottom: 8, outline: "none" }}>
            <option value="">Select brand</option>
            {BRANDS.map(b => <option key={b}>{b}</option>)}
          </select>
          <input placeholder="Model (e.g. Air M2)" value={newDeal.model} onChange={e => setNewDeal(p => ({ ...p, model: e.target.value }))}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, marginBottom: 8, outline: "none", boxSizing: "border-box" }} />
          <input placeholder="Budget in AED (optional)" value={newDeal.value} onChange={e => setNewDeal(p => ({ ...p, value: e.target.value }))} type="number"
            style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, marginBottom: 12, outline: "none", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={addDeal} style={{ flex: 1, padding: 10, borderRadius: 10, border: "none", background: "#6366F1", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Add Deal</button>
            <button onClick={() => setShowAddDeal(false)} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#94A3B8", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {showDeleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Delete {activeCustomer.name}?</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20, lineHeight: 1.6 }}>This will permanently delete this customer and all their deals and messages.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={deleteCustomer} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#EF4444", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Yes, Delete</button>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 14, cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>

    {showContactSheet && <ContactSheet onClose={() => setShowContactSheet(false)} />}
    </>
  );
}
