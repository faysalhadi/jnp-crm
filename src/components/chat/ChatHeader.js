import React, { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import Badge from "../ui/Badge";
import { STAGES, TIERS, PAYMENT_STATUSES, LOSS_REASONS, BRANDS, MATCH_CATEGORIES, getMatchCategory } from "../../constants";
import { daysSince } from "../../utils/helpers";
import { useCustomers } from "../../context/CustomerContext";
import { useUI } from "../../context/UIContext";
import { useChat } from "../../context/ChatContext";
import { useChatActions } from "../../hooks/useChatActions";
import FollowUpPanel from "./FollowUpPanel";
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

  const [dealExpanded, setDealExpanded] = useState(false);
  const [showContactSheet, setShowContactSheet] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(activeCustomer?.notes || "");
  const [notesSaving, setNotesSaving] = useState(false);

  useEffect(() => {
    setNotesValue(activeCustomer?.notes || "");
  }, [activeCustomer?.id]); // eslint-disable-line

  const updateCustomer = (fields) => _updateCustomer(activeCustomerId, fields);
  const updateDeal = (fields) => _updateDeal(activeDealId, fields);
  const deleteCustomer = () => _deleteCustomer(activeCustomerId);
  const addDeal = () => _addDeal(activeCustomerId, newDeal);

  const saveNotes = async (val) => {
    setNotesSaving(true);
    await supabase.from("customers").update({ notes: val }).eq("id", activeCustomerId);
    await loadCustomers();
    setNotesSaving(false);
  };

  const tier = TIERS[activeCustomer.tier] || TIERS.cold;
  const overdue = daysSince(activeCustomer.last_active) >= 1 && (activeCustomer.deals || []).some(d => d.stage !== "closed" && d.stage !== "lost");
  const closedDealValue = (activeCustomer.deals || []).filter(d => d.stage === "closed").reduce((a, d) => a + (d.value || 0), 0);
  const initials = (activeCustomer.name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const currentStageLabel = STAGES.find(s => s.id === activeDeal?.stage)?.label || activeDeal?.stage || "";

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

      {/* TRADER ACTIONS */}
      {activeCustomer.contact_type === "trader" && (
        <div style={{ display: "flex", gap: 8, padding: "0 14px 10px" }}>
          {[
            { label: "💰 Buy From", ctx: `I want to buy devices from ${activeCustomer.name}. Ask what they have available and at what price.` },
            { label: "💵 Sell To", ctx: `I want to sell devices to ${activeCustomer.name}. Mention what stock I have available.` },
          ].map(({ label, ctx }) => (
            <button key={label} onClick={() => { setOutreachCustom(ctx); setOutreachMode(true); }}
              style={{ flex: 1, padding: "8px 6px", borderRadius: 10, border: "1px solid #FDE68A", background: "#FFFBEB", color: "#D97706", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* SUPPLIER ACTIONS */}
      {activeCustomer.contact_type === "supplier" && (
        <div style={{ display: "flex", gap: 8, padding: "0 14px 10px" }}>
          <button onClick={() => {
            const email = window.prompt("Paste the email content from " + activeCustomer.name + ":");
            if (!email?.trim()) return;
            setOutreachCustom("Reply professionally to this email from the supplier: " + email.trim());
            setOutreachMode(true);
          }} style={{ flex: 1, padding: "8px 6px", borderRadius: 10, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            📧 Check Gmail
          </button>
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
                    <button key={s.id} onClick={() => moveStage(s.id)}
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
                          console.log("Saving match_category:", e.target.value, "for deal:", activeDealId);
                          const { error } = await supabase.from("deals").update({ match_category: e.target.value }).eq("id", activeDealId);
                          console.log("Save result error:", error);
                          updateDeal({ match_category: e.target.value });
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
            <div style={{ display: "flex", borderTop: "1px solid #F1F5F9" }}>
              <button onClick={handleReserveDevice}
                style={{ flex: 1, padding: "9px 8px", border: "none", borderRight: "1px solid #F1F5F9", background: "#FFFBEB", color: "#D97706", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                🔒 Reserve
              </button>
              <button onClick={handleConfirmSale}
                style={{ flex: 1, padding: "9px 8px", border: "none", background: "#EEF2FF", color: "#6366F1", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ⚡ Confirm Sale
              </button>
            </div>
          )}
        </div>
      )}

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

      {/* Notes row — works for all contact types */}
      <div
        onClick={() => setShowNotes(v => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 14px",
          borderTop: "1px solid #F1F5F9",
          cursor: "pointer",
          background: notesValue ? "#FAFFF7" : "#fff",
        }}>
        <span style={{ fontSize: 13 }}>📝</span>
        {notesValue && !showNotes ? (
          <span style={{ fontSize: 12, color: "#475569", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {notesValue}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: "#94A3B8", flex: 1 }}>
            {showNotes ? "Notes" : "Add notes about this contact..."}
          </span>
        )}
        {notesSaving && <span style={{ fontSize: 10, color: "#10B981" }}>saving...</span>}
        <span style={{ fontSize: 11, color: "#94A3B8" }}>{showNotes ? "▲" : "▼"}</span>
      </div>

      {showNotes && (
        <div style={{ padding: "0 14px 10px", borderTop: "1px solid #F8FAFC" }}>
          <textarea
            value={notesValue}
            onChange={e => setNotesValue(e.target.value)}
            onBlur={() => saveNotes(notesValue)}
            placeholder='e.g. "Deals in bulk, prefers HP. Pays cash. WhatsApp only after 6pm."'
            rows={3}
            autoFocus
            style={{
              width: "100%",
              padding: "9px 11px",
              borderRadius: 10,
              border: "1px solid #E2E8F0",
              fontSize: 12,
              outline: "none",
              resize: "none",
              fontFamily: "inherit",
              lineHeight: 1.6,
              boxSizing: "border-box",
              color: "#334155",
              background: "#F8FAFC",
            }}
          />
        </div>
      )}
    </div>

    {showContactSheet && <ContactSheet onClose={() => setShowContactSheet(false)} />}
    </>
  );
}
